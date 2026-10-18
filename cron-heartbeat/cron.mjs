// Five-field cron parsing and the "is this job late?" decision, shared by the
// browser tool and the self-hosted server. Pure functions, no I/O. UTC unless a
// schedule names an IANA zone (`tz`): the host timezone is never consulted, because
// a monitor that silently depends on it pages you at 3am twice a year.

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "dom", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "dow", min: 0, max: 7 },
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MACROS = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *",
};

function toNumber(token, idx) {
  const lower = token.toLowerCase();
  if (idx === 3 && MONTHS.includes(lower)) return MONTHS.indexOf(lower) + 1;
  if (idx === 4 && DAYS.includes(lower)) return DAYS.indexOf(lower);
  if (!/^\d+$/.test(token)) throw new Error(`"${token}" is not a number in the ${FIELDS[idx].name} field`);
  return Number(token);
}

function parseField(text, idx) {
  const { min, max, name } = FIELDS[idx];
  const values = new Set();
  for (const part of text.split(",")) {
    if (part === "") throw new Error(`empty item in the ${name} field`);
    const [range, stepText, extra] = part.split("/");
    if (extra !== undefined) throw new Error(`too many "/" in the ${name} field`);
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) throw new Error(`bad step "${stepText}" in the ${name} field`);
      step = Number(stepText);
    }
    let lo, hi;
    if (range === "*") { lo = min; hi = idx === 4 ? 6 : max; }
    else if (range.includes("-")) {
      const [a, b, more] = range.split("-");
      if (more !== undefined) throw new Error(`bad range "${range}" in the ${name} field`);
      lo = toNumber(a, idx); hi = toNumber(b, idx);
    } else {
      lo = toNumber(range, idx);
      hi = stepText !== undefined ? (idx === 4 ? 6 : max) : lo;
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`${range} is outside ${min}-${max} in the ${name} field`);
    for (let v = lo; v <= hi; v += step) values.add(idx === 4 && v === 7 ? 0 : v);
  }
  return values;
}

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Throws on an unknown IANA zone name; returns the name. */
export function checkTimezone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) throw new Error("timezone must be an IANA name such as Europe/London");
  try { formatter(tz); } catch { throw new Error(`unknown timezone "${tz}": use an IANA name such as Europe/London`); }
  return tz;
}

/** Wall-clock fields of an instant (ms) in `tz`. */
export function localParts(ms, tz) {
  const o = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { month: Number(o.month), day: Number(o.day), hour: Number(o.hour), minute: Number(o.minute), dow: DAYS.indexOf(o.weekday.toLowerCase()), key: `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}` };
}

export function parseCron(expression, tz) {
  if (typeof expression !== "string") throw new Error("cron expression must be text");
  let text = expression.trim().replace(/\s+/g, " ");
  if (MACROS[text.toLowerCase()]) text = MACROS[text.toLowerCase()];
  if (text.startsWith("@")) throw new Error(`unsupported macro ${text} (@reboot cannot be scheduled)`);
  const parts = text.split(" ");
  if (parts.length !== 5) throw new Error(`expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}`);
  const sets = parts.map((p, i) => parseField(p, i));
  return {
    minute: sets[0], hour: sets[1], dom: sets[2], month: sets[3], dow: sets[4],
    domStar: parts[2].startsWith("*"), dowStar: parts[4].startsWith("*"),
    text,
    tz: tz && tz.toUpperCase() !== "UTC" ? checkTimezone(tz) : null,
  };
}

function matches(c, d) {
  if (!c.minute.has(d.getUTCMinutes()) || !c.hour.has(d.getUTCHours()) || !c.month.has(d.getUTCMonth() + 1)) return false;
  const domOk = c.dom.has(d.getUTCDate());
  const dowOk = c.dow.has(d.getUTCDay());
  // Vixie cron: when both day fields are restricted, either one may match.
  if (!c.domStar && !c.dowStar) return domOk || dowOk;
  return domOk && dowOk;
}

function dayOk(c, p) {
  return (!c.domStar && !c.dowStar) ? (c.dom.has(p.day) || c.dow.has(p.dow)) : (c.dom.has(p.day) && c.dow.has(p.dow));
}

// Zoned search. Steps by instants and reads the wall clock, so DST needs no special
// casing in the stepping. Two DST rules, same as Vixie cron:
//  - fall back: a wall time that happens twice counts once (the job runs once);
//  - spring forward: a wall time that does not exist is skipped that day.
function nextRunZoned(c, after) {
  let t = Math.floor(after / 60000) * 60000 + 60000;
  const limit = after + 5 * 366 * 86400000;
  while (t <= limit) {
    const p = localParts(t, c.tz);
    if (!c.month.has(p.month) || !dayOk(c, p)) { t += Math.max(30, (24 - p.hour) * 60 - p.minute - 30) * 60000; continue; }
    if (!c.hour.has(p.hour)) { t += (60 - p.minute) * 60000; continue; }
    if (!c.minute.has(p.minute)) { t += 60000; continue; }
    const repeat = [30, 60, 120].some((m) => localParts(t - m * 60000, c.tz).key === p.key);
    if (!repeat) return new Date(t);
    t += 60000;
  }
  return null;
}

/** The first scheduled minute strictly after `after` (a Date), or null within 5 years. */
export function nextRun(cron, after, tz) {
  const c = typeof cron === "string" ? parseCron(cron, tz) : cron;
  if (c.tz) return nextRunZoned(c, after.getTime());
  const d = new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000);
  const limit = after.getTime() + 5 * 366 * 86400000;
  while (d.getTime() <= limit) {
    if (!c.month.has(d.getUTCMonth() + 1)) { d.setUTCMonth(d.getUTCMonth() + 1, 1); d.setUTCHours(0, 0, 0, 0); continue; }
    const dayOk = (!c.domStar && !c.dowStar) ? (c.dom.has(d.getUTCDate()) || c.dow.has(d.getUTCDay()))
      : (c.dom.has(d.getUTCDate()) && c.dow.has(d.getUTCDay()));
    if (!dayOk) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); continue; }
    if (!c.hour.has(d.getUTCHours())) { d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0); continue; }
    if (!c.minute.has(d.getUTCMinutes())) { d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0); continue; }
    if (matches(c, d)) return new Date(d.getTime());
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}

export function nextRuns(cron, after, count = 5, tz) {
  const c = typeof cron === "string" ? parseCron(cron, tz) : cron;
  const out = [];
  let cursor = after;
  while (out.length < count) {
    const n = nextRun(c, cursor);
    if (!n) break;
    out.push(n);
    cursor = n;
  }
  return out;
}

/** Typical gap between runs in seconds (median of the next 8 gaps). */
export function typicalIntervalSeconds(cron, from, tz) {
  const runs = nextRuns(cron, from, 9, tz);
  if (runs.length < 2) return null;
  const gaps = runs.slice(1).map((r, i) => (r - runs[i]) / 1000).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** Largest gap among the next 12 runs: the longest silence that is still healthy. */
export function longestGapSeconds(cron, from, tz) {
  const runs = nextRuns(cron, from, 13, tz);
  if (runs.length < 2) return null;
  return Math.max(...runs.slice(1).map((r, i) => (r - runs[i]) / 1000));
}

/** A grace period that tolerates normal jitter without hiding a missed run: 10% of the interval, 1 min to 1 h. */
export function suggestGraceSeconds(cron, from, tz) {
  const gap = typicalIntervalSeconds(cron, from, tz);
  if (gap === null) return 300;
  return Math.max(60, Math.min(3600, Math.round(gap * 0.1 / 60) * 60 || 60));
}

/**
 * Decide a check's state at `now`.
 * check: { schedule?: cron text, tz?: IANA zone, periodSeconds?: number, graceSeconds, lastPing?: ms, lastStart?: ms, lastFail?: ms, createdAt: ms, paused?: bool }
 * Returns { state: "new"|"up"|"late"|"down"|"running"|"failed"|"paused", dueAt: ms|null, reason }.
 */
export function evaluate(check, now) {
  const grace = (check.graceSeconds ?? 300) * 1000;
  if (check.paused) return { state: "paused", dueAt: null, reason: "paused" };
  if (check.lastFail && check.lastFail >= (check.lastPing ?? 0)) {
    return { state: "failed", dueAt: null, reason: "the job reported a failure" };
  }
  const base = check.lastPing ?? check.createdAt;
  let dueAt;
  if (check.schedule) {
    dueAt = nextRun(check.schedule, new Date(base), check.tz)?.getTime() ?? null;
  } else if (check.periodSeconds) {
    dueAt = base + check.periodSeconds * 1000;
  } else {
    return { state: "new", dueAt: null, reason: "no schedule or period set" };
  }
  if (dueAt === null) return { state: "new", dueAt: null, reason: "schedule never fires" };
  if (check.lastStart && check.lastStart > (check.lastPing ?? 0) && now <= dueAt + grace) {
    return { state: "running", dueAt, reason: "started, not finished" };
  }
  if (now <= dueAt) return { state: check.lastPing ? "up" : "new", dueAt, reason: "waiting for the next run" };
  if (now <= dueAt + grace) return { state: "late", dueAt, reason: "past due, inside the grace period" };
  return { state: "down", dueAt, reason: `no ping ${Math.round((now - dueAt) / 1000)}s after it was due` };
}

export function formatDuration(seconds) {
  const s = Math.round(seconds);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 129600) return `${Math.round(s / 3600 * 10) / 10} h`;
  return `${Math.round(s / 86400 * 10) / 10} days`;
}
