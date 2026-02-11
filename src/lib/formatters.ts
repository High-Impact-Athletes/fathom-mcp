import type {
  TranscriptResponse,
  TranscriptEntry,
  SummaryResponse,
  MeetingsListResponse,
} from "../types";

const ENTRIES_PER_PAGE = 200;

/**
 * Strip leading "00:" and leading zeros from a Fathom timestamp.
 * "00:00:13" → "0:13", "01:02:03" → "1:02:03"
 */
function compactTimestamp(ts: string): string {
  // Remove "HH:" prefix when hours are 00
  const cleaned = ts.replace(/^00:/, "");
  // Strip leading zero from remaining hours/minutes: "01:02" → "1:02"
  return cleaned.replace(/^0(\d)/, "$1");
}

/**
 * Build a short alias map from full display names.
 * Uses first name only; disambiguates duplicates with last initial.
 * e.g. "Kevin Rassool" + "Kevin Smith" → { "Kevin Rassool": "Kevin R.", "Kevin Smith": "Kevin S." }
 */
function buildSpeakerAliases(
  entries: TranscriptEntry[]
): Map<string, string> {
  const seen = new Map<string, string[]>(); // firstName → [fullName, ...]

  for (const entry of entries) {
    const fullName = entry.speaker.display_name;
    const firstName = fullName.split(" ")[0];
    if (!seen.has(firstName)) {
      seen.set(firstName, []);
    }
    const list = seen.get(firstName)!;
    if (!list.includes(fullName)) {
      list.push(fullName);
    }
  }

  const aliases = new Map<string, string>();
  for (const [firstName, fullNames] of seen) {
    if (fullNames.length === 1) {
      aliases.set(fullNames[0], firstName);
    } else {
      // Disambiguate: use first name + last initial
      for (const fullName of fullNames) {
        const parts = fullName.split(" ");
        const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
        aliases.set(fullName, `${firstName}${lastInitial}`);
      }
    }
  }

  return aliases;
}

/**
 * Merge consecutive same-speaker entries into blocks.
 */
function mergeEntries(
  entries: TranscriptEntry[]
): { speaker: string; timestamp: string; text: string }[] {
  const aliases = buildSpeakerAliases(entries);
  const merged: { speaker: string; timestamp: string; text: string }[] = [];

  for (const entry of entries) {
    const alias = aliases.get(entry.speaker.display_name) ?? entry.speaker.display_name;
    const last = merged[merged.length - 1];

    if (last && last.speaker === alias) {
      last.text += " " + entry.text;
    } else {
      merged.push({
        speaker: alias,
        timestamp: compactTimestamp(entry.timestamp),
        text: entry.text,
      });
    }
  }

  return merged;
}

export interface TranscriptOptions {
  page?: number;
}

/**
 * Transform a raw Fathom transcript response into compact plain text.
 * Merges consecutive same-speaker entries, uses short aliases, compact timestamps.
 * Paginates at 200 merged entries per page.
 */
export function formatTranscript(
  data: TranscriptResponse,
  options?: TranscriptOptions
): string {
  const entries = data.transcript;
  if (!entries || entries.length === 0) {
    return "No transcript available.";
  }

  const merged = mergeEntries(entries);
  const totalPages = Math.ceil(merged.length / ENTRIES_PER_PAGE);
  const page = Math.max(1, Math.min(options?.page ?? 1, totalPages));
  const start = (page - 1) * ENTRIES_PER_PAGE;
  const pageEntries = merged.slice(start, start + ENTRIES_PER_PAGE);

  // Speaker legend
  const aliases = buildSpeakerAliases(entries);
  const legend = Array.from(aliases.entries())
    .map(([full, short]) => `  ${short} = ${full}`)
    .join("\n");

  const lines: string[] = [];

  if (totalPages > 1) {
    lines.push(`# Transcript (page ${page}/${totalPages}, ${merged.length} segments)\n`);
  } else {
    lines.push(`# Transcript (${merged.length} segments)\n`);
  }

  lines.push("## Speakers");
  lines.push(legend);
  lines.push("");

  for (const entry of pageEntries) {
    lines.push(`[${entry.timestamp}] ${entry.speaker}: ${entry.text}`);
  }

  if (totalPages > 1 && page < totalPages) {
    lines.push(`\n---\nPage ${page} of ${totalPages}. Call get_transcript with page=${page + 1} for next page.`);
  }

  return lines.join("\n");
}

/**
 * Extract the markdown summary directly instead of wrapping the whole JSON.
 */
export function formatSummary(data: SummaryResponse): string {
  if (data.summary?.markdown_formatted) {
    return data.summary.markdown_formatted;
  }
  // Fallback: if the structure is unexpected, return a compact JSON version
  return JSON.stringify(data, null, 2);
}

/**
 * Format a meetings list into compact plain text.
 */
export function formatMeetingsList(data: MeetingsListResponse): string {
  const meetings = data.meetings;
  if (!meetings || meetings.length === 0) {
    return "No meetings found.";
  }

  const lines: string[] = [`# Meetings (${meetings.length} results)\n`];

  for (const m of meetings) {
    lines.push(`- "${m.title}" (ID: ${m.id})`);

    const details: string[] = [];

    // Date
    if (m.created_at) {
      details.push(`Date: ${m.created_at.slice(0, 10)}`);
    }

    // Duration
    if (m.duration_in_seconds) {
      const mins = Math.round(m.duration_in_seconds / 60);
      details.push(`Duration: ${mins}m`);
    }

    // Recorded by
    if (m.recorded_by?.display_name) {
      details.push(`Recorded by: ${m.recorded_by.display_name}`);
    }

    if (details.length > 0) {
      lines.push(`  ${details.join(" | ")}`);
    }

    // Attendees
    if (m.calendar_invitees && m.calendar_invitees.length > 0) {
      const names = m.calendar_invitees.map((a) => a.display_name).join(", ");
      lines.push(`  Attendees: ${names}`);
    }
  }

  if (data.has_more && data.cursor) {
    lines.push(`\n---\nMore meetings available. Call list_meetings with cursor="${data.cursor}" for next page.`);
  }

  return lines.join("\n");
}
