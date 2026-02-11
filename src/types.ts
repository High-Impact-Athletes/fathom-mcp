import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  FATHOM_CLIENT_ID: string;
  FATHOM_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

/** Props stored in the MCP OAuth access token — available via this.props in McpAgent */
export interface Props extends Record<string, unknown> {
  userId: string;
  upstreamAccessToken: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface State {}

/** Response from Fathom's POST /oauth2/token endpoint */
export interface FathomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";
export const FATHOM_OAUTH_AUTHORIZE = "https://fathom.video/external/v1/oauth2/authorize";
export const FATHOM_OAUTH_TOKEN = "https://fathom.video/external/v1/oauth2/token";
