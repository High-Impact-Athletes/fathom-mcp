# Fathom MCP Server

A remote [MCP](https://modelcontextprotocol.io) server on Cloudflare Workers that connects Claude Desktop to the [Fathom AI](https://fathom.video) meeting platform via OAuth.

Users add a URL, authenticate with Fathom, and immediately access their meeting data — no API keys, no config files.

## User Experience

1. Open Claude Desktop > **Settings > Connectors**
2. Add: `https://<your-worker>.workers.dev/mcp`
3. Click **Connect** — redirected to Fathom's OAuth consent screen
4. Click **Allow**
5. Done. All tools work immediately.

Token refresh is automatic. Users never re-authenticate unless they revoke access.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_meetings` | List meetings with filtering by domain, date range, recorder, team |
| `get_summary` | Get the AI-generated summary for a recording |
| `get_transcript` | Get the full transcript for a recording |
| `list_teams` | List all accessible teams |
| `list_team_members` | List team members, optionally filtered by team |
| `create_webhook` | Create a webhook for meeting notifications |
| `delete_webhook` | Delete a webhook by ID |

## Prerequisites

1. **Register an OAuth app with Fathom** at [developers.fathom.ai/oauth](https://developers.fathom.ai/oauth)
   - Get `FATHOM_CLIENT_ID` and `FATHOM_CLIENT_SECRET`
   - Set redirect URI to `https://<your-worker>.workers.dev/callback/fathom`
2. **Cloudflare account** with Workers enabled (free tier is sufficient)

## Setup

```bash
# Install dependencies
npm install

# Copy and fill in your credentials
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your Fathom OAuth credentials and a cookie encryption key:

```
FATHOM_CLIENT_ID=your_client_id
FATHOM_CLIENT_SECRET=your_client_secret
COOKIE_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

## Local Development

```bash
npm run dev
```

This starts `wrangler dev` with local Durable Object and KV emulation.

## Deploy

```bash
# Create KV namespace
npx wrangler kv namespace create "OAUTH_KV"
# Copy the ID into wrangler.jsonc

# Set secrets
npx wrangler secret put FATHOM_CLIENT_ID
npx wrangler secret put FATHOM_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY

# Deploy
npm run deploy
```

## Architecture

```
Claude Desktop
    |  (Streamable HTTP + MCP OAuth 2.1)
    v
Cloudflare Worker
    ├── OAuthProvider (Fathom as upstream IdP)
    ├── McpAgent Durable Object (MCP tools)
    └── KV: OAUTH_KV (session state)
    |
    |  (HTTPS + Bearer token)
    v
Fathom API (api.fathom.ai/external/v1)
```

The worker acts as an OAuth proxy: it authenticates users via Fathom's OAuth flow, stores their access/refresh tokens in the MCP grant props, and uses them to call the Fathom API on each tool invocation. Token refresh is handled automatically via `tokenExchangeCallback`.

## OAuth Note

The Fathom API restricts `include_summary` and `include_transcript` on the `/meetings` endpoint for OAuth apps. This server uses the dedicated `/recordings/{id}/summary` and `/recordings/{id}/transcript` endpoints instead, which work with OAuth Bearer tokens.

## License

Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Built by [High Impact Athletes](https://highimpactathletes.org).
