import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FathomClient } from "./lib/fathom-client";
import { formatTranscript } from "./lib/formatters";
import type { Env, Props, State } from "./types";

export class FathomMCP extends McpAgent<Env, State, Props> {
  server = new McpServer({
    name: "Fathom AI",
    version: "1.0.0",
  });

  async init() {
    // Create a Fathom client scoped to this user's access token
    const accessToken = this.props?.upstreamAccessToken;
    if (!accessToken) {
      // Register a single tool that explains the auth issue
      this.server.registerTool(
        "status",
        { description: "Check authentication status" },
        async () => ({
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Please reconnect via Claude Desktop Settings > Connectors.",
            },
          ],
        })
      );
      return;
    }

    const fathom = new FathomClient(accessToken);

    // --- Meetings ---
    this.server.registerTool(
      "list_meetings",
      {
        description:
          "List meetings recorded by or shared with the authenticated user. " +
          "Supports pagination and filtering by domain, date range, recorder, and team.",
        inputSchema: {
          cursor: z
            .string()
            .optional()
            .describe("Pagination cursor from a previous response"),
          calendar_invitees_domains: z
            .array(z.string())
            .optional()
            .describe("Company domains to filter by (exact match)"),
          calendar_invitees_domains_type: z
            .enum(["all", "only_internal", "one_or_more_external"])
            .optional()
            .describe("Filter by internal/external meeting type"),
          created_after: z
            .string()
            .optional()
            .describe("ISO 8601 timestamp — only meetings created after this"),
          created_before: z
            .string()
            .optional()
            .describe(
              "ISO 8601 timestamp — only meetings created before this"
            ),
          recorded_by: z
            .array(z.string())
            .optional()
            .describe("Emails of users who recorded the meetings"),
          teams: z
            .array(z.string())
            .optional()
            .describe("Team names to filter by"),
          include_action_items: z
            .boolean()
            .optional()
            .default(false)
            .describe("Include action items for each meeting"),
          include_crm_matches: z
            .boolean()
            .optional()
            .default(false)
            .describe("Include CRM matches for each meeting"),
          // NOTE: include_summary and include_transcript intentionally omitted
          // — unavailable for OAuth apps. Use get_summary/get_transcript instead.
        },
      },
      async (params) => {
        const result = await fathom.listMeetings(params);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );

    // --- Recordings ---
    this.server.registerTool(
      "get_summary",
      {
        description:
          "Get the AI-generated summary for a specific meeting recording.",
        inputSchema: {
          recording_id: z.number().describe("Meeting recording ID"),
        },
      },
      async ({ recording_id }) => {
        const result = await fathom.getSummary(recording_id);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );

    this.server.registerTool(
      "get_transcript",
      {
        description:
          "Get the full transcript for a specific meeting recording, " +
          "including speaker names and timestamps. " +
          "Long transcripts are paginated (200 segments per page).",
        inputSchema: {
          recording_id: z.number().describe("Meeting recording ID"),
          page: z
            .number()
            .optional()
            .default(1)
            .describe("Page number for long transcripts (200 segments per page)"),
        },
      },
      async ({ recording_id, page }) => {
        const result = await fathom.getTranscript(recording_id);
        return {
          content: [
            { type: "text" as const, text: formatTranscript(result, { page }) },
          ],
        };
      }
    );

    // --- Teams ---
    this.server.registerTool(
      "list_teams",
      {
        description: "List all teams accessible to the authenticated user.",
        inputSchema: {
          cursor: z
            .string()
            .optional()
            .describe("Pagination cursor from a previous response"),
        },
      },
      async (params) => {
        const result = await fathom.listTeams(params);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );

    this.server.registerTool(
      "list_team_members",
      {
        description:
          "List team members accessible to the authenticated user, " +
          "optionally filtered by team name.",
        inputSchema: {
          cursor: z
            .string()
            .optional()
            .describe("Pagination cursor from a previous response"),
          team: z
            .string()
            .optional()
            .describe("Team name to filter members by"),
        },
      },
      async (params) => {
        const result = await fathom.listTeamMembers(params);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );

    // --- Webhooks ---
    this.server.registerTool(
      "create_webhook",
      {
        description:
          "Create a new webhook for receiving meeting notifications. " +
          "At least one include flag must be true.",
        inputSchema: {
          destination_url: z
            .string()
            .url()
            .describe("URL where webhook events will be delivered"),
          triggered_for: z
            .array(
              z.enum([
                "my_recordings",
                "shared_external_recordings",
                "my_shared_with_team_recordings",
                "shared_team_recordings",
              ])
            )
            .describe("Recording types that trigger this webhook"),
          include_action_items: z.boolean().default(false),
          include_crm_matches: z.boolean().default(false),
          include_summary: z.boolean().default(false),
          include_transcript: z.boolean().default(false),
        },
      },
      async (params) => {
        if (
          !params.include_action_items &&
          !params.include_crm_matches &&
          !params.include_summary &&
          !params.include_transcript
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: At least one include flag (include_action_items, include_crm_matches, include_summary, include_transcript) must be true.",
              },
            ],
            isError: true,
          };
        }
        const result = await fathom.createWebhook(params);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );

    this.server.registerTool(
      "delete_webhook",
      {
        description: "Delete a webhook by its ID.",
        inputSchema: {
          webhook_id: z.string().describe("Webhook ID to delete"),
        },
      },
      async ({ webhook_id }) => {
        await fathom.deleteWebhook(webhook_id);
        return {
          content: [
            { type: "text" as const, text: "Webhook deleted successfully." },
          ],
        };
      }
    );

    // --- Resources ---
    this.server.resource("fathom-api-info", "fathom://api/info", async () => ({
      contents: [
        {
          uri: "fathom://api/info",
          text: `# Fathom AI MCP Server

Connected via OAuth. Your Fathom account data is accessible through the tools below.

## Available Tools

### Meetings
- **list_meetings** — List meetings with filtering by domain, date range, recorder, team
- **get_summary** — Get the AI-generated summary for a recording
- **get_transcript** — Get the full transcript for a recording

### Teams
- **list_teams** — List all accessible teams
- **list_team_members** — List team members, optionally filtered by team

### Webhooks
- **create_webhook** — Create a webhook for meeting notifications
- **delete_webhook** — Remove a webhook

## API Details
- Base URL: https://api.fathom.ai/external/v1
- Auth: OAuth 2.0 Bearer token (managed automatically)
- Rate limit: 60 requests per 60-second window`,
        },
      ],
    }));

    this.server.resource(
      "fathom-rate-limits",
      "fathom://api/rate-limits",
      async () => ({
        contents: [
          {
            uri: "fathom://api/rate-limits",
            text: `# Fathom API Rate Limits

Global rate limit: 60 API calls per 60-second window

Rate-limited responses return HTTP 429 with headers:
- RateLimit-Limit: Maximum requests allowed
- RateLimit-Remaining: Remaining requests in current window
- RateLimit-Reset: Seconds until window resets

The MCP server handles rate limiting automatically with exponential backoff (up to 3 retries).`,
          },
        ],
      })
    );
  }
}
