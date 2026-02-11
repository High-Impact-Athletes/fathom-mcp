import {
  FATHOM_API_BASE,
  type TranscriptResponse,
} from "../types";

/**
 * Lightweight Fathom API client using Workers' built-in fetch.
 * Each instance is scoped to a single user's access token.
 */
export class FathomClient {
  constructor(private accessToken: string) {}

  private async request<T>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, string | string[] | boolean | undefined>;
      body?: unknown;
    }
  ): Promise<T> {
    const url = new URL(`${FATHOM_API_BASE}${path}`);

    // Build query parameters
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === false) continue;
        if (value === true) {
          url.searchParams.set(key, "true");
        } else if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(key, v);
          }
        } else {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };

    let lastError: Error | null = null;

    // Retry up to 3 times for rate limits
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });

      if (response.status === 429) {
        const resetAfter = response.headers.get("RateLimit-Reset");
        const waitMs = resetAfter
          ? parseInt(resetAfter, 10) * 1000
          : 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        lastError = new Error(
          `Rate limited (attempt ${attempt + 1}/3). Reset in ${resetAfter ?? "unknown"}s`
        );
        continue;
      }

      if (response.status === 204) {
        return { success: true } as T;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Fathom API ${method} ${path} returned ${response.status}: ${text}`
        );
      }

      return (await response.json()) as T;
    }

    throw lastError ?? new Error("Fathom API request failed after retries");
  }

  // --- Meetings ---

  async listMeetings(params: {
    cursor?: string;
    calendar_invitees_domains?: string[];
    calendar_invitees_domains_type?: string;
    created_after?: string;
    created_before?: string;
    recorded_by?: string[];
    teams?: string[];
    include_action_items?: boolean;
    include_crm_matches?: boolean;
  }) {
    // Build query params — arrays need the [] suffix for Fathom's API
    const qp: Record<string, string | string[] | boolean | undefined> = {
      cursor: params.cursor,
      "calendar_invitees_domains[]": params.calendar_invitees_domains,
      calendar_invitees_domains_type: params.calendar_invitees_domains_type,
      created_after: params.created_after,
      created_before: params.created_before,
      "recorded_by[]": params.recorded_by,
      "teams[]": params.teams,
      include_action_items: params.include_action_items,
      include_crm_matches: params.include_crm_matches,
      // NOTE: include_summary and include_transcript intentionally omitted
      // — unavailable for OAuth apps
    };

    return this.request<unknown>("GET", "/meetings", { params: qp });
  }

  // --- Recordings ---

  async getSummary(recordingId: number) {
    return this.request<unknown>("GET", `/recordings/${recordingId}/summary`);
  }

  async getTranscript(recordingId: number) {
    return this.request<TranscriptResponse>(
      "GET",
      `/recordings/${recordingId}/transcript`
    );
  }

  // --- Teams ---

  async listTeams(params: { cursor?: string }) {
    return this.request<unknown>("GET", "/teams", {
      params: { cursor: params.cursor },
    });
  }

  async listTeamMembers(params: { cursor?: string; team?: string }) {
    return this.request<unknown>("GET", "/team_members", {
      params: { cursor: params.cursor, team: params.team },
    });
  }

  // --- Webhooks ---

  async createWebhook(params: {
    destination_url: string;
    triggered_for: string[];
    include_action_items: boolean;
    include_crm_matches: boolean;
    include_summary: boolean;
    include_transcript: boolean;
  }) {
    return this.request<unknown>("POST", "/webhooks", { body: params });
  }

  async deleteWebhook(webhookId: string) {
    return this.request<unknown>("DELETE", `/webhooks/${webhookId}`);
  }
}
