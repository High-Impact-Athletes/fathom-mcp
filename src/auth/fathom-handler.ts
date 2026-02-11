import { Hono } from "hono";
import type { Env, FathomTokenResponse } from "../types";
import { FATHOM_OAUTH_AUTHORIZE, FATHOM_OAUTH_TOKEN } from "../types";

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

/**
 * GET /authorize
 * Parse the MCP OAuth request from Claude Desktop, then redirect to Fathom's
 * OAuth consent screen. We encode the original MCP OAuth request in `state`
 * so we can resume it after the user approves on Fathom.
 */
app.get("/authorize", async (c) => {
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  // Encode the MCP OAuth request info so we can retrieve it in the callback
  const state = btoa(JSON.stringify(oauthReq));

  const callbackUrl = new URL("/callback/fathom", c.req.url).href;

  const authorizeUrl = new URL(FATHOM_OAUTH_AUTHORIZE);
  authorizeUrl.searchParams.set("client_id", c.env.FATHOM_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "public_api");
  authorizeUrl.searchParams.set("state", state);

  return c.redirect(authorizeUrl.toString());
});

/**
 * GET /callback/fathom
 * Fathom redirects here after the user approves. We:
 * 1. Exchange the auth code for Fathom access + refresh tokens
 * 2. Extract a userId from the Fathom token (use the access token hash)
 * 3. Complete the MCP OAuth flow — issue our own token to Claude Desktop
 */
app.get("/callback/fathom", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.text(`Fathom OAuth error: ${error}`, 400);
  }

  if (!code || !stateParam) {
    return c.text("Missing code or state parameter", 400);
  }

  // Decode the original MCP OAuth request
  let oauthReq;
  try {
    oauthReq = JSON.parse(atob(stateParam));
  } catch {
    return c.text("Invalid state parameter", 400);
  }

  // Exchange auth code for Fathom tokens
  const callbackUrl = new URL("/callback/fathom", c.req.url).href;

  const tokenResponse = await fetch(FATHOM_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: c.env.FATHOM_CLIENT_ID,
      client_secret: c.env.FATHOM_CLIENT_SECRET,
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => "");
    return c.text(
      `Failed to exchange Fathom auth code: ${tokenResponse.status} ${text}`,
      500
    );
  }

  const tokens: FathomTokenResponse = await tokenResponse.json();

  // Derive a stable userId from the access token (first 16 chars of hash)
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(tokens.access_token)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const userId = hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Complete the MCP OAuth authorization — store Fathom tokens in grant props
  // so they're available in tokenExchangeCallback and via this.props in McpAgent
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: `fathom_${userId}`,
    metadata: {},
    scope: oauthReq.scope,
    props: {
      userId: `fathom_${userId}`,
      upstreamAccessToken: tokens.access_token,
      upstreamRefreshToken: tokens.refresh_token,
    },
  });

  return c.redirect(redirectTo);
});

export const FathomHandler = app;
