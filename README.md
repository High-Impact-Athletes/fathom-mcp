# Fathom MCP Server

A remote [MCP](https://modelcontextprotocol.io) server on Cloudflare Workers that connects Claude Desktop to the [Fathom AI](https://fathom.video) meeting platform via OAuth.

Users add a URL, authenticate with Fathom, and immediately access their meeting data — no API keys, no config files.

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

---

## Self-hosting (for developers)

Everything below is for deploying your own instance of this server.

### Prerequisites

1. **Register an OAuth app with Fathom** at [fathom.video](https://fathom.video) (under Developer settings)
   - Get your `FATHOM_CLIENT_ID` and `FATHOM_CLIENT_SECRET`
   - Add redirect URIs:
     - Production: `https://<your-worker>.workers.dev/callback/fathom`
     - Local dev: `http://localhost:8787/callback/fathom`
2. **Cloudflare account** with Workers enabled (free tier is sufficient)

### Setup

```bash
# Install dependencies
npm install

# Copy and fill in your credentials
cp .dev.vars.example .dev.vars
```

Generate a cookie encryption key and edit `.dev.vars` with your credentials:

```bash
# Generate a random encryption key
openssl rand -hex 32
```

Then fill in `.dev.vars`:

```
FATHOM_CLIENT_ID=your_client_id
FATHOM_CLIENT_SECRET=your_client_secret
COOKIE_ENCRYPTION_KEY=your_generated_hex_key
```

### Deploy

```bash
# Create KV namespace
npx wrangler kv namespace create "OAUTH_KV"
# Copy the returned ID into wrangler.jsonc → kv_namespaces → id

# Set production secrets (you'll be prompted to paste each value)
npx wrangler secret put FATHOM_CLIENT_ID
npx wrangler secret put FATHOM_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY

# Deploy
npm run deploy
```

### Local Development

> Most people won't need this — just deploy and use the hosted version.

```bash
npm run dev
```

This starts `wrangler dev` with local Durable Object and KV emulation. Requires the `.dev.vars` file from the Setup step above.

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

The worker acts as an OAuth proxy: it authenticates users via Fathom's OAuth flow, securely stores their access/refresh tokens, and uses them to call the Fathom API on each tool invocation. Token refresh is handled automatically.

## OAuth Note

The Fathom API restricts `include_summary` and `include_transcript` on the `/meetings` endpoint for OAuth apps. This server uses the dedicated `/recordings/{id}/summary` and `/recordings/{id}/transcript` endpoints instead, which work with OAuth Bearer tokens.

## License

Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Built by [High Impact Athletes](https://highimpactathletes.org).
