// Zero-dependency, deterministic cron/timezone-drift engine. Everything here
// is pure computation over `Intl`/`Date` -- Node ships full ICU (has since
// Node 13), so no tzdata package is needed for either the CLI or the browser
// build. This module never touches the filesystem or the network.
//
// Two distinct failure modes are computed, both real and both invisible from
// reading the cron expression alone:
//
// 1. **DST-skipped / DST-ambiguous occurrences.** A cron schedule that names
//    a wall-clock time in an IANA timezone (e.g. "run at 02:30
//    America/New_York") can, twice a year, name a local time that either
//    does not exist (spring-forward: clocks jump 02:00 -> 03:00, so 02:30
//    never happens) or happens twice (fall-back: 01:00-01:59 occurs twice).
//    Cron implementations do not agree on what to do then -- some skip the
//    run, some fire once, some fire twice -- so the honest answer is "this
//    occurrence is not what it looks like," not a guess at which scheduler
//    you run.
// 2. **Fixed-UTC-offset drift.** Many schedulers (GitHub Actions' own
//    `schedule:` cron among them; its docs say so directly) always
//    interpret the expression in UTC, with no timezone field at all. A
//    single UTC cron expression cannot hit the same *local* wall-clock time
//    year-round in any zone that observes DST -- it is exactly right for
//    half the year and off by the DST offset (almost always one hour) for
//    the other half. This computes both UTC times a fixed local target
//    actually needs, so the drift is a number instead of a surprise.

const CRON_FIELD_BOUNDS = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["dom", 1, 31],
  ["month", 1, 12],
  ["dow", 0, 7], // 0 and 7 both mean Sunday, the traditional cron convention
];

/** Parses one cron field (a wildcard, a step, a range, a list, or a combination) into a Set of allowed ints in [min,max]. */
export function parseCronField(raw, min, max) {
  const values = new Set();
  for (const part of String(raw).split(",")) {
    const stepMatch = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))$/.exec(part);
    const base = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    if (!step || step < 1) throw new Error(`invalid step in cron field "${raw}"`);
    let lo, hi;
    if (base === "*") {
      lo = min;
      hi = max;
    } else {
      const rangeMatch = /^(\d+)-(\d+)$/.exec(base);
      if (rangeMatch) {
        lo = parseInt(rangeMatch[1], 10);
        hi = parseInt(rangeMatch[2], 10);
      } else if (/^\d+$/.test(base)) {
        lo = hi = parseInt(base, 10);
      } else {
        throw new Error(`unparseable cron field segment "${part}" in "${raw}"`);
      }
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`cron field segment "${part}" out of range [${min},${max}]`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

// Standard crontab names (case-insensitive), per the traditional Vixie-cron
// convention: three-letter month and weekday abbreviations only -- no full
// names ("January"), which no mainstream cron implementation accepts either.
const MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DOW_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * Replaces every letter run in a cron field with its numeric value from
 * `names` (case-insensitive), leaving digits, `*`, `,`, `-`, and `/`
 * untouched -- so "JAN-MAR" becomes "1-3" and "MON,WED,FRI" becomes
 * "1,3,5" before the shared numeric parser ever sees them. An unrecognized
 * name throws immediately, naming the bad token rather than the whole field,
 * so "JAX" doesn't silently fall through to `parseCronField`'s generic
 * "unparseable" error with nothing pointing at which word was wrong.
 */
function substituteCronNames(raw, names) {
  return raw.replace(/[A-Za-z]+/g, (token) => {
    const value = names[token.toLowerCase()];
    if (value === undefined) {
      const allowed = Object.keys(names).map((n) => n.toUpperCase()).join(", ");
      throw new Error(`unrecognized name "${token}" in cron field "${raw}" (expected one of ${allowed})`);
    }
    return String(value);
  });
}

/**
 * Parses a standard 5-field cron expression ("minute hour dom month dow").
 * The month and day-of-week fields accept the standard three-letter names
 * (JAN-DEC, SUN-SAT), case-insensitively, anywhere a number is allowed --
 * singly, in a list, or as a range endpoint ("MON-FRI", "JAN,JUL") -- by
 * substituting each name for its number before the shared numeric field
 * parser runs, so every existing numeric rule (lists, ranges, steps, the
 * dom/dow OR rule) applies identically to named and numeric input. Minute,
 * hour, and day-of-month remain numeric only, matching every real cron
 * implementation. Step-with-named-range ("JAN-DEC/2") and dow 7-as-Sunday
 * work the same as their numeric equivalents; a name spelled outside the
 * three-letter set (a typo, a full month name) throws naming the bad token.
 */
const CRON_MACROS = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export function parseCronExpression(expr) {
  const trimmed = String(expr).trim();
  if (trimmed.startsWith("@")) {
    const expanded = CRON_MACROS[trimmed.toLowerCase()];
    if (!expanded) {
      throw new Error(`unknown cron macro "${trimmed}" (supported: ${Object.keys(CRON_MACROS).join(", ")}; @reboot has no time to check)`);
    }
    expr = expanded;
  }
  // "?" (Quartz/Spring "no specific value") in dom or dow means the same as "*" here.
  const fields = String(expr).trim().split(/\s+/).map((f, i) => ((i === 2 || i === 4) && f === "?" ? "*" : f));
  if (fields.length !== 5) {
    throw new Error(`expected 5 whitespace-separated fields (minute hour dom month dow), got ${fields.length}: "${expr}"`);
  }
  const parsed = {};
  CRON_FIELD_BOUNDS.forEach(([name, min, max], i) => {
    let field = fields[i];
    if (name === "month") field = substituteCronNames(field, MONTH_NAMES);
    else if (name === "dow") field = substituteCronNames(field, DOW_NAMES);
    parsed[name] = parseCronField(field, min, max);
    parsed[`${name}IsWildcard`] = fields[i].trim() === "*";
  });
  // Normalize dow 7 -> 0 (both mean Sunday) so downstream matching only checks one value.
  if (parsed.dow.has(7)) {
    parsed.dow.delete(7);
    parsed.dow.add(0);
  }
  return parsed;
}

/**
 * Standard (Vixie) cron day-matching rule: if *both* day-of-month and
 * day-of-week are restricted (neither is "*"), a date matches if it satisfies
 * *either* one (OR), not both (AND). If only one is restricted, that one
 * alone decides. This is the single most common cron misreading, and getting
 * it right (and stating it) is worth more here than in a schedule that just
 * runs the field intersection.
 */
function dayMatches(fields, day, dow) {
  const domRestricted = !fields.domIsWildcard;
  const dowRestricted = !fields.dowIsWildcard;
  if (domRestricted && dowRestricted) return fields.dom.has(day) || fields.dow.has(dow);
  if (domRestricted) return fields.dom.has(day);
  if (dowRestricted) return fields.dow.has(dow);
  return true;
}

/** Reads y/mo/d/h/mi/s for a UTC instant as displayed in `timeZone`. Never ambiguous: a UTC instant is always a single point in time. */
export function formatLocalParts(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some locales' h23 formats midnight as "24"
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    weekday: WEEKDAY[get("weekday")],
  };
}

/** The IANA zone's UTC offset, in minutes, that applies *at* this UTC instant. Well-defined for any instant -- offset lookup never has the local-wall-clock ambiguity. */
export function tzOffsetMinutesAt(utcMs, timeZone) {
  const p = formatLocalParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Throws if `timeZone` is not a timezone name `Intl` recognizes. */
export function assertValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new Error(`"${timeZone}" is not a recognized IANA timezone name (e.g. "America/New_York", "Europe/London", "UTC")`);
  }
}

/**
 * Resolves a local wall-clock time (year/month/day/hour/minute, no seconds)
 * in `timeZone` to the real UTC instant(s) it names.
 *
 * A single fixed-point offset guess only ever explores one side of a DST
 * transition -- it correctly finds the (only) instant for a normal time or
 * the absence of one for a skipped time, but for an *ambiguous* fall-back
 * time it converges to whichever of the two valid offsets its own starting
 * guess happened to land on, silently missing the other one. So this
 * instead samples the real offset a full day on each side of the target
 * (safely outside the transition itself, since DST transitions are never
 * less than a day apart in any real IANA zone) and tries converting the
 * target under *both* offsets, keeping whichever reproduce it. That
 * correctly yields zero matches for "skipped", one for "normal" (both sides
 * agree), and two for "ambiguous".
 */
export function resolveLocalTime(year, month, day, hour, minute, timeZone) {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const offsetBefore = tzOffsetMinutesAt(naiveUtc - dayMs, timeZone);
  const offsetAfter = tzOffsetMinutesAt(naiveUtc + dayMs, timeZone);

  const target = { year, month, day, hour, minute };
  const reproduces = (ms) => {
    const p = formatLocalParts(ms, timeZone);
    return p.year === target.year && p.month === target.month && p.day === target.day && p.hour === target.hour && p.minute === target.minute;
  };

  const valid = [];
  for (const offset of [offsetBefore, offsetAfter]) {
    const cand = naiveUtc - offset * 60000;
    if (reproduces(cand)) valid.push(cand);
  }
  const unique = [...new Set(valid)].sort((a, b) => a - b);

  if (unique.length === 0) return { kind: "skipped", instants: [] };
  if (unique.length === 1) return { kind: "normal", instants: unique };
  return { kind: "ambiguous", instants: unique };
}

const DAYS_IN_MONTH = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Walks forward from `from` (a UTC instant) computing occurrences of
 * `cronExpr` interpreted as *local wall-clock time* in `timeZone`, until
 * `count` normal (non-skipped) occurrences are found or `maxDays` is
 * exhausted (default ~2 years -- enough for any realistic cadence down to
 * daily; a schedule sparser than that should raise its own lookahead).
 *
 * Returns `{ occurrences, flagged }`. `occurrences` are real run instants
 * (kind "normal" or the first-of-two instant for "ambiguous", since most
 * schedulers fire something there). `flagged` carries every skipped or
 * ambiguous occurrence encountered along the way, in order, so the caller
 * can render both.
 */
export function nextRuns(cronExpr, timeZone, { from = new Date(), count = 10, maxDays = 800 } = {}) {
  assertValidTimeZone(timeZone);
  const fields = parseCronExpression(cronExpr);
  const start = formatLocalParts(from.getTime(), timeZone);

  const occurrences = [];
  const flagged = [];
  let year = start.year;
  let month = start.month;
  let day = start.day;
  let scannedDays = 0;

  while (occurrences.length < count && scannedDays < maxDays) {
    if (!fields.monthIsWildcard && !fields.month.has(month)) {
      // Skip whole months quickly when month is restricted and this one isn't in it.
      day = DAYS_IN_MONTH(year, month) + 1;
    } else {
      const dow = formatLocalParts(Date.UTC(year, month - 1, day, 12), "UTC").weekday;
      if (fields.month.has(month) && dayMatches(fields, day, dow)) {
        const minutes = [...fields.minute].sort((a, b) => a - b);
        const hours = [...fields.hour].sort((a, b) => a - b);
        for (const h of hours) {
          for (const mi of minutes) {
            // Only consider times at/after `from` on the first scanned day.
            if (year === start.year && month === start.month && day === start.day) {
              if (h < start.hour || (h === start.hour && mi < start.minute)) continue;
            }
            const resolved = resolveLocalTime(year, month, day, h, mi, timeZone);
            const occurrence = { year, month, day, hour: h, minute: mi, ...resolved };
            if (resolved.kind === "normal") {
              occurrences.push({ utc: resolved.instants[0], local: occurrence });
            } else {
              flagged.push({ local: occurrence, kind: resolved.kind, instants: resolved.instants });
              if (resolved.kind === "ambiguous") occurrences.push({ utc: resolved.instants[0], local: occurrence, ambiguous: true });
            }
            if (occurrences.length >= count) break;
          }
          if (occurrences.length >= count) break;
        }
      }
    }
    scannedDays += 1;
    day += 1;
    if (day > DAYS_IN_MONTH(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return { occurrences: occurrences.slice(0, count), flagged, exhausted: occurrences.length < count };
}

/**
 * Finds every UTC-offset change `timeZone` observes across `year`, sampled
 * once per day at UTC noon (a UTC instant, never ambiguous, so this needs
 * none of `resolveLocalTime`'s care). Returns segments in chronological
 * order: `[{ startMonth, startDay, offsetMinutes }, ...]`. A zone with no
 * DST returns exactly one segment covering the whole year.
 */
export function findOffsetSegments(timeZone, year) {
  assertValidTimeZone(timeZone);
  const segments = [];
  let prevOffset = null;
  const days = DAYS_IN_MONTH(year, 12) === 31 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
  for (let doy = 0; doy < days; doy += 1) {
    const ms = Date.UTC(year, 0, 1, 12, 0, 0) + doy * 86400000;
    const offset = tzOffsetMinutesAt(ms, timeZone);
    if (offset !== prevOffset) {
      const p = formatLocalParts(ms, timeZone);
      segments.push({ startMonth: p.month, startDay: p.day, offsetMinutes: offset });
      prevOffset = offset;
    }
  }
  return segments;
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

function wrapMinutesOfDay(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60, dayShift: Math.floor(totalMinutes / 1440) };
}

/**
 * The fixed-UTC-offset drift report: for a target local wall-clock
 * `hour:minute` in `timeZone`, what UTC hour:minute does a scheduler that
 * only understands UTC (GitHub Actions' `schedule:` cron among them) need,
 * per DST segment of `year` -- and by how much would a single fixed choice
 * drift for the segments it does not cover.
 */
export function utcOffsetDrift(hour, minute, timeZone, year = new Date().getUTCFullYear()) {
  const segments = findOffsetSegments(timeZone, year);
  const targetMinutesOfDay = hour * 60 + minute;
  const rows = segments.map((seg) => {
    const utc = wrapMinutesOfDay(targetMinutesOfDay - seg.offsetMinutes);
    return { ...seg, utcHour: utc.hour, utcMinute: utc.minute, utcDayShift: utc.dayShift };
  });
  const distinctUtcClockTimes = new Set(rows.map((r) => `${r.utcHour}:${r.utcMinute}:${r.utcDayShift}`));
  const driftMinutes = rows.length > 1
    ? Math.max(...rows.map((r) => r.offsetMinutes)) - Math.min(...rows.map((r) => r.offsetMinutes))
    : 0;
  return {
    observesDst: rows.length > 1,
    segments: rows,
    driftMinutes: Math.abs(driftMinutes),
    singleUtcCronSuffices: distinctUtcClockTimes.size <= 1,
  };
}

export function summarizeRuns({ occurrences, flagged }) {
  if (occurrences.length === 0 && flagged.length === 0) {
    return { status: "never-fires", text: "0 runs found in the search window -- this expression never fires (for example, day 31 of a 30-day month, or Feb 30), so there is nothing to check." };
  }
  const skipped = flagged.filter((f) => f.kind === "skipped").length;
  const ambiguous = flagged.filter((f) => f.kind === "ambiguous").length;
  if (skipped === 0 && ambiguous === 0) {
    return { status: "clean", text: `${occurrences.length} upcoming run(s) computed -- none fall in a DST gap or overlap.` };
  }
  const parts = [];
  if (skipped > 0) parts.push(`${skipped} occurrence(s) fall in a spring-forward gap (the local time never happens)`);
  if (ambiguous > 0) parts.push(`${ambiguous} occurrence(s) fall in a fall-back overlap (the local time happens twice)`);
  return { status: "dst-risk", text: parts.join("; ") + "." };
}

export { formatOffset };
