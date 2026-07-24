import type { LeadHours } from "./types";

/**
 * Strict, best-effort-free parser from a lead's free-text hours fields
 * (LeadHours.weekday / .weekend — operator-typed or CSV-imported prose, see
 * demo-catalog.ts for the real shape of this data: "Mon–Fri 7am–3pm", "Sat
 * emergency on-call", "Mon–Fri by appointment", "Sat 9am–4pm · Closed
 * Sun–Mon") to schema.org OpeningHoursSpecification entries for
 * leadLocalBusinessJsonLd (src/lib/seo.ts).
 *
 * Deliberately strict-match-or-omit, never a fuzzy guess: publishing a wrong
 * open/close time into a real customer's Google Knowledge Panel is a worse
 * outcome than publishing no hours at all (today's behavior). A segment that
 * doesn't match the supported "<Day>[–<Day>] <time>–<time>" shape (or a
 * middot-joined list of such segments) is silently dropped, not guessed at.
 */

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayAbbrev = (typeof DAY_ORDER)[number];

const DAY_SCHEMA_URL: Record<DayAbbrev, string> = {
  Mon: "https://schema.org/Monday",
  Tue: "https://schema.org/Tuesday",
  Wed: "https://schema.org/Wednesday",
  Thu: "https://schema.org/Thursday",
  Fri: "https://schema.org/Friday",
  Sat: "https://schema.org/Saturday",
  Sun: "https://schema.org/Sunday",
};

const DAY_PATTERN = "Mon|Tue|Wed|Thu|Fri|Sat|Sun";
const TIME_PATTERN = "\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)";
const SEGMENT_REGEX = new RegExp(
  `^(${DAY_PATTERN})(?:\\s?[-–]\\s?(${DAY_PATTERN}))?\\s+(${TIME_PATTERN})\\s?[-–]\\s?(${TIME_PATTERN})$`,
  "i",
);

export interface OpeningHoursSpecification {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

/**
 * Normalizes a regex-captured day token (matched case-insensitively, so it
 * may arrive as "mon", "MON", or "Mon") to the canonical Title-Case form used
 * as the DAY_ORDER/DAY_SCHEMA_URL lookup key.
 */
function normalizeDayAbbrev(token: string): DayAbbrev {
  return (token[0].toUpperCase() + token.slice(1).toLowerCase()) as DayAbbrev;
}

function expandDayRange(start: DayAbbrev, end: DayAbbrev): DayAbbrev[] {
  const startIndex = DAY_ORDER.indexOf(start);
  const endIndex = DAY_ORDER.indexOf(end);
  const days: DayAbbrev[] = [];
  let i = startIndex;
  // Bounded by DAY_ORDER.length so a same-day or wrap-around range (e.g.
  // "Fri–Mon") still terminates after at most one full week.
  for (let steps = 0; steps < DAY_ORDER.length; steps += 1) {
    days.push(DAY_ORDER[i]);
    if (i === endIndex) break;
    i = (i + 1) % DAY_ORDER.length;
  }
  return days;
}

/** Converts "7am" / "3:30pm" / "12am" to 24-hour "HH:MM", or null if the token isn't a supported time format. */
function to24Hour(token: string): string | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)$/i.exec(token.trim());
  if (!match) return null;
  const hour12 = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const meridiem = match[3].toLowerCase();
  const hour24 = meridiem === "am" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Parses one "·"-delimited clause (e.g. "Mon–Fri 7am–3pm"). Returns null when the clause isn't a supported day+time-range shape. */
export function parseOpeningHoursSegment(segment: string): OpeningHoursSpecification | null {
  const match = SEGMENT_REGEX.exec(segment.trim());
  if (!match) return null;
  const [, startDay, endDay, opensRaw, closesRaw] = match;
  const opens = to24Hour(opensRaw);
  const closes = to24Hour(closesRaw);
  if (!opens || !closes) return null;
  const days = expandDayRange(
    normalizeDayAbbrev(startDay),
    normalizeDayAbbrev(endDay ?? startDay),
  );
  return {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: days.map((day) => DAY_SCHEMA_URL[day]),
    opens,
    closes,
  };
}

/** Parses every "·"-delimited segment of a single LeadHours.weekday/.weekend string, dropping unparseable segments. */
function parseHoursField(field: string): OpeningHoursSpecification[] {
  return field
    .split("·")
    .map((segment) => parseOpeningHoursSegment(segment))
    .filter((spec): spec is OpeningHoursSpecification => spec !== null);
}

/**
 * schema.org OpeningHoursSpecification[] for a lead's hours, or undefined
 * when neither weekday nor weekend contains a recognizable segment (e.g.
 * "by appointment", "emergency on-call") — property omitted entirely rather
 * than publishing a guess.
 */
export function leadOpeningHoursSpecification(
  hours: LeadHours,
): OpeningHoursSpecification[] | undefined {
  const specs = [...parseHoursField(hours.weekday), ...parseHoursField(hours.weekend)];
  return specs.length > 0 ? specs : undefined;
}
