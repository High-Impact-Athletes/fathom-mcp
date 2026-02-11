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

// --- Fathom API response types ---

export interface TranscriptSpeaker {
  display_name: string;
  matched_calendar_invitee_email?: string;
}

export interface TranscriptEntry {
  speaker: TranscriptSpeaker;
  text: string;
  timestamp: string;
}

export interface TranscriptResponse {
  transcript: TranscriptEntry[];
}

export interface SummaryResponse {
  summary: {
    markdown_formatted: string;
    [key: string]: unknown;
  };
}

export interface MeetingAttendee {
  display_name: string;
  email?: string;
}

export interface MeetingItem {
  id: number;
  title: string;
  created_at: string;
  duration_in_seconds?: number;
  recorded_by?: {
    display_name: string;
    email?: string;
  };
  calendar_invitees?: MeetingAttendee[];
  [key: string]: unknown;
}

export interface MeetingsListResponse {
  meetings: MeetingItem[];
  has_more: boolean;
  cursor?: string;
}

export const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";
export const FATHOM_OAUTH_AUTHORIZE = "https://fathom.video/external/v1/oauth2/authorize";
export const FATHOM_OAUTH_TOKEN = "https://fathom.video/external/v1/oauth2/token";
