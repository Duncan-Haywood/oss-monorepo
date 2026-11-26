// Calendar feeds (OWNER: calendar): DTOs for /api/orgs/:orgId/calendar/* and the one-click
// "subscribe" links for Google, Outlook and Apple calendars. Pure: shared by the Worker and the SPA.

export const CALENDAR_SCOPES = ["org", "mine"] as const;
/** "org": the whole organization's dates. "mine": applications I created + reviews waiting. */
export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

/** A feed token as listed by the API. The secret (and its hash) is never returned after creation. */
export interface CalendarTokenDto {
  id: string;
  scope: CalendarScope;
  userId: string;
  /** Name of the member who created it (admins see everyone's feeds). */
  userName: string | null;
  /** True when the caller created this feed. */
  mine: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** POST /calendar/tokens response: the only time the secret URL is shown. */
export interface CreatedCalendarTokenDto {
  token: CalendarTokenDto;
  /** https://…/api/calendar/<token>.ics */
  url: string;
  /** Same feed with the webcal:// scheme (Apple Calendar, Outlook desktop). */
  webcalUrl: string;
}

export interface CalendarSettingsDto {
  /** Show requested / award amounts in event titles. Off by default. */
  includeAmounts: boolean;
}

/** `https://host/x.ics` -> `webcal://host/x.ics` (http feeds keep working for local dev). */
export function toWebcal(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//i, "webcal://");
}

/**
 * One-click subscribe links. Formats (checked Nov 2026; neither is formally documented):
 * - Google: `https://calendar.google.com/calendar/r?cid=<webcal URL, encoded>` (cid must be webcal://)
 * - Outlook.com: `https://outlook.live.com/calendar/0/addfromweb?url=<feed URL, encoded>`
 * - Microsoft 365 (work/school): same path on outlook.office.com
 * - Apple Calendar / iOS / macOS: open the webcal:// URL directly
 */
export function calendarSubscribeLinks(feedUrl: string) {
  const webcal = toWebcal(feedUrl);
  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}`,
    office365: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}`,
    apple: webcal,
  };
}
