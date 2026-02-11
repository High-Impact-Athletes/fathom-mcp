import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { FathomHandler } from "./auth/fathom-handler";
import { FathomMCP } from "./fathom-mcp";
import type { Env, FathomTokenResponse } from "./types";
import { FATHOM_OAUTH_TOKEN } from "./types";

// Wrap Hono app as ExportedHandler so OAuthProvider accepts it
const defaultHandler = {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) =>
    FathomHandler.fetch(request, env as Env, ctx),
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Landing page
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        "Fathom MCP Server\n\nConnect via Claude Desktop: Settings > Connectors > Add this URL's /mcp path",
        { headers: { "Content-Type": "text/plain" } }
      );
    }

    return new OAuthProvider({
      apiHandlers: {
        "/mcp": FathomMCP.serve("/mcp"),
      },
      defaultHandler,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      scopesSupported: ["public_api"],

      // When the MCP client exchanges its auth code or refreshes a token,
      // this callback synchronises with the upstream Fathom tokens.
      tokenExchangeCallback: async (options) => {
        if (options.grantType === "authorization_code") {
          // Fathom tokens were already exchanged in /callback/fathom and
          // stored in props via completeAuthorization. Pass them through.
          return {
            accessTokenProps: {
              userId: options.props.userId as string,
              upstreamAccessToken: options.props.upstreamAccessToken as string,
            },
            newProps: {
              userId: options.props.userId as string,
              upstreamRefreshToken: options.props.upstreamRefreshToken as string,
            },
            accessTokenTTL: 3600,
          };
        }

        if (options.grantType === "refresh_token") {
          // Refresh the upstream Fathom token
          const upstreamRefreshToken = options.props
            .upstreamRefreshToken as string;

          try {
            const response = await fetch(FATHOM_OAUTH_TOKEN, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: upstreamRefreshToken,
                client_id: env.FATHOM_CLIENT_ID,
                client_secret: env.FATHOM_CLIENT_SECRET,
              }),
            });

            if (!response.ok) {
              console.error(
                `Fathom token refresh failed: ${response.status}`,
                await response.text().catch(() => "")
              );
              // Return existing props — the access token may still work
              return {
                accessTokenProps: {
                  userId: options.props.userId as string,
                  upstreamAccessToken: options.props
                    .upstreamAccessToken as string,
                },
                newProps: {
                  userId: options.props.userId as string,
                  upstreamRefreshToken,
                },
              };
            }

            const tokens: FathomTokenResponse = await response.json();

            return {
              accessTokenProps: {
                userId: options.props.userId as string,
                upstreamAccessToken: tokens.access_token,
              },
              newProps: {
                userId: options.props.userId as string,
                upstreamRefreshToken:
                  tokens.refresh_token || upstreamRefreshToken,
              },
              accessTokenTTL: tokens.expires_in,
            };
          } catch (err) {
            console.error("Fathom token refresh error:", err);
            return {
              accessTokenProps: {
                userId: options.props.userId as string,
                upstreamAccessToken: options.props
                  .upstreamAccessToken as string,
              },
              newProps: {
                userId: options.props.userId as string,
                upstreamRefreshToken,
              },
            };
          }
        }
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// Re-export the Durable Object class so Wrangler can find it
export { FathomMCP } from "./fathom-mcp";
