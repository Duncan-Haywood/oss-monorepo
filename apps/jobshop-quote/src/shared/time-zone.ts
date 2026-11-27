// The shop's time zone (shop_settings.time_zone): an IANA name such as "America/Chicago", or null
// for UTC. It decides calendar edges a shop reads as its own: which month a quote decided at 7 pm on
// 31 October in Chicago belongs to (October, not November as the UTC calendar says), and the date in
// the win/loss CSV, the date printed on a quote and its valid-until day, the dates the app's pages
// print (quote log, RFQs, "Sent", part history, invites), and which day the daily expiry job and the day-before reminder count as "today" for that shop. Instants stay stored and
// sent as UTC; only the calendar reading changes.
//
// Both the Worker (workerd) and browsers carry the full ICU time-zone data, so Intl is the only
// source: no zone table of our own to go stale.

export const UTC = "UTC";

/** True when Intl knows this IANA zone name (case as Intl reports it is not required). */
export function isTimeZone(name: string): boolean {
  if (!name || name.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The zone's canonical spelling ("america/chicago" -> "America/Chicago"); null when unknown. */
export function canonicalTimeZone(name: string): string | null {
  const trimmed = name.trim();
  if (!isTimeZone(trimmed)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
}

/** The zone a report reads its calendar in: the shop's when set and known, else UTC. */
export function effectiveTimeZone(name: string | null | undefined): string {
  return name && isTimeZone(name) ? name : UTC;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** "2026-10-31" for the instant `ms` as a wall calendar in `timeZone`. */
export function zonedDate(ms: number, timeZone: string): string {
  const parts = formatter(effectiveTimeZone(timeZone)).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}

/**
 * The day the instant `at` falls on in the shop's own calendar (shop_settings.time_zone; UTC when
 * unset). A quote sent at 7 pm in Chicago is dated that day, not the next one as the UTC calendar
 * has it, and its valid-until day counts from there.
 */
export const shopDay = (at: Date | number, timeZone: string | null | undefined) =>
  zonedDate(typeof at === "number" ? at : at.getTime(), effectiveTimeZone(timeZone));

/**
 * The shop's day for an ISO instant the API sent ("2026-11-01T00:30:00Z" in Chicago -> "2026-10-31"),
 * for dates the app's pages print (quote log, "Sent", part history, invites). "" when missing or
 * unparseable, so a page prints nothing rather than "Invalid Date".
 */
export function isoShopDay(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? shopDay(t, timeZone) : "";
}

/** The calendar day `n` days after `day` ("2026-10-31", 1 -> "2026-11-01"); `n` may be negative. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Every IANA zone this runtime knows, for a picker; [] where Intl.supportedValuesOf is missing. */
export function knownTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  try {
    return intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
  } catch {
    return [];
  }
}
