// Minimal RFC 5545 (iCalendar) writer: CRLF line endings, 75-octet folding, TEXT escaping,
// all-day (VALUE=DATE) or UTC timed events, DISPLAY alarms. Pure, no dependencies.

export interface IcsAlarm {
  /** Fire this many days before the event start. */
  daysBefore: number;
  description: string;
}

export interface IcsEvent {
  /** Globally unique and stable across feed refreshes, e.g. "deadline-app_x@host". */
  uid: string;
  summary: string;
  /** Plain text (escaped on output). */
  description?: string;
  url?: string;
  start: Date;
  /** All-day event on start's UTC calendar date. */
  allDay: boolean;
  /** Timed events only (default 30). */
  durationMinutes?: number;
  alarm?: IcsAlarm;
}

export interface IcsCalendar {
  prodId: string;
  name?: string;
  /** Suggested client refresh interval (RFC 7986 REFRESH-INTERVAL + X-PUBLISHED-TTL). */
  refreshMinutes?: number;
  /** DTSTAMP for every event (when this object was generated). */
  dtstamp: Date;
  events: IcsEvent[];
}

const CRLF = "\r\n";
const MAX_OCTETS = 75;
const encoder = new TextEncoder();

/** Escape a TEXT value: backslash, semicolon, comma, newlines; drop other control characters. */
export function escapeText(value: string): string {
  return (
    value
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n")
      // CONTROL characters other than HTAB are not allowed in TEXT (RFC 5545 §3.3.11).
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
  );
}

/**
 * Fold a content line so no physical line exceeds 75 octets (excluding CRLF). Continuation lines
 * start with one space (which counts toward the 75). Never splits a UTF-8 multi-byte character.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_OCTETS) return line;
  const out: string[] = [];
  let current = "";
  let octets = 0;
  let limit = MAX_OCTETS;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (octets + n > limit) {
      out.push(current);
      current = " ";
      octets = 1;
      limit = MAX_OCTETS;
    }
    current += ch;
    octets += n;
  }
  out.push(current);
  return out.join(CRLF);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 20261201T170000Z */
export function formatUtcDateTime(d: Date): string {
  return `${formatDateValue(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** 20261201 (the UTC calendar date). */
export function formatDateValue(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/**
 * Deadlines stored without a time of day: UTC midnight, or 23:59 UTC (how the Grants.gov importer
 * stores a bare date: end of that day). Anything else is a real timestamp.
 */
export function isDateOnly(d: Date): boolean {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  return (h === 0 && m === 0 && s === 0) || (h === 23 && m === 59);
}

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

function eventLines(e: IcsEvent, dtstamp: Date): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(e.uid)}`,
    `DTSTAMP:${formatUtcDateTime(dtstamp)}`,
  ];
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDateValue(e.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateValue(addDays(e.start, 1))}`);
  } else {
    const end = new Date(e.start.getTime() + (e.durationMinutes ?? 30) * 60_000);
    lines.push(`DTSTART:${formatUtcDateTime(e.start)}`);
    lines.push(`DTEND:${formatUtcDateTime(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  // URI values are not TEXT-escaped; ours are built from ids, but never let a line break through.
  if (e.url) lines.push(`URL:${e.url.replace(/[\r\n]/g, "")}`);
  // Deadlines are reminders, not meetings: don't mark people busy.
  lines.push("TRANSP:TRANSPARENT");
  if (e.alarm) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(e.alarm.description)}`,
      `TRIGGER:-P${Math.max(0, Math.trunc(e.alarm.daysBefore))}D`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

/** Serialize a calendar. Output uses CRLF everywhere, including after the last line. */
export function buildIcs(cal: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${escapeText(cal.prodId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (cal.name) {
    lines.push(`NAME:${escapeText(cal.name)}`, `X-WR-CALNAME:${escapeText(cal.name)}`);
  }
  if (cal.refreshMinutes) {
    lines.push(
      `REFRESH-INTERVAL;VALUE=DURATION:PT${cal.refreshMinutes}M`,
      `X-PUBLISHED-TTL:PT${cal.refreshMinutes}M`,
    );
  }
  for (const e of cal.events) lines.push(...eventLines(e, cal.dtstamp));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
