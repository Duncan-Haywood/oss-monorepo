// The affirmation and self-assessment due dates as an iCalendar file (RFC 5545), so the affirming
// official gets the reminder in their own calendar 60 and 7 days ahead without the app sending email.
// Pure: the Worker serves it from GET /api/orgs/:orgId/affirmations/calendar.ics.
//
// Each due date is an all-day event with a UID that stays the same for the same organization, level
// and kind of deadline, so importing a newer file moves the event instead of adding a second one
// (calendars that honour UID on import; others add a copy, which the page says).

import { type AffirmationSchedule, addDays, DUE_SOON_DAYS } from "./affirmation";

/** Days before each due date a calendar alarm fires: the dashboard's amber window, then a week. */
export const CALENDAR_ALARM_DAYS = [DUE_SOON_DAYS, 7] as const;

const PLANNING_NOTE =
  "A planning aid computed from the affirmations recorded in the CMMC Workspace, not a determination of your CMMC status. The workspace does not submit anything to SPRS: the affirming official does.";

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped in TEXT values. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const utf8 = new TextEncoder();

/**
 * RFC 5545 §3.1: a content line longer than 75 octets is folded with CRLF and one space. Splits
 * between characters, never inside a UTF-8 sequence.
 */
export function foldLine(line: string): string {
  if (utf8.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // The first line holds 75 octets; continuation lines hold 74 after their leading space.
  let limit = 75;
  for (const ch of line) {
    const n = utf8.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const icsDate = (iso: string) => iso.replace(/-/g, "");

/** A UTC timestamp in the basic format DTSTAMP wants: 20261125T143000Z. */
const icsStamp = (d: Date) => `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;

/** UID parts are ids and fixed keys; anything else is dropped so the UID stays a plain token. */
const uidPart = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

export interface CalendarInput {
  orgId: string;
  orgName: string;
  schedules: readonly AffirmationSchedule[];
  now: Date;
}

/** The calendar file's text, CRLF line endings. An organization with nothing recorded gets no events. */
export function renderAffirmationCalendar({
  orgId,
  orgName,
  schedules,
  now,
}: CalendarInput): string {
  const stamp = icsStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CMMC Workspace//Affirmation due dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`CMMC due dates: ${orgName}`)}`,
  ];
  for (const schedule of schedules) {
    for (const d of schedule.deadlines) {
      const summary = `CMMC Level ${schedule.level}: ${d.label}`;
      const description = `${d.basis}\n\n${PLANNING_NOTE}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:cmmc-${uidPart(orgId)}-l${schedule.level}-${uidPart(d.key)}@cmmc-workspace`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(d.due)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(d.due, 1))}`,
        `SUMMARY:${escapeText(summary)}`,
        `DESCRIPTION:${escapeText(description)}`,
        "TRANSP:TRANSPARENT",
      );
      for (const days of CALENDAR_ALARM_DAYS) {
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `TRIGGER;RELATED=START:-P${days}D`,
          `DESCRIPTION:${escapeText(`${summary}: due in ${days} days (${d.due})`)}`,
          "END:VALARM",
        );
      }
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** GET/POST/DELETE /api/orgs/:orgId/affirmations/calendar-feed (admins). */
export interface CalendarFeedStatus {
  on: boolean;
  createdAt: string | null;
  createdByName: string | null;
  lastFetchedAt: string | null;
  /** The https link, only in the answer to the POST that made it: the server keeps only its hash. */
  url: string | null;
}

/** The secret's prefix, so a leaked link is recognisable in a log or a secret scanner. */
export const CALENDAR_TOKEN_PREFIX = "cmcal_";

/** A well-formed token: the prefix and 43 base64url characters (32 random bytes). */
export const isCalendarToken = (s: string) =>
  new RegExp(`^${CALENDAR_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`).test(s);

/** The same link for calendar apps that open webcal:// (Apple Calendar, Outlook desktop). */
export const webcalUrl = (httpsUrl: string) => httpsUrl.replace(/^https?:\/\//, "webcal://");
