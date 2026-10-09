// Five-field cron parsing and the "is this job late?" decision, shared by the
// browser tool and the self-hosted server. Pure functions, no I/O, UTC only:
// a monitor that silently depends on the host timezone pages you at 3am twice
// a year.

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

export function parseCron(expression) {
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

/** The first scheduled minute strictly after `after` (a Date), or null within 5 years. */
export function nextRun(cron, after) {
  const c = typeof cron === "string" ? parseCron(cron) : cron;
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

export function nextRuns(cron, after, count = 5) {
  const c = typeof cron === "string" ? parseCron(cron) : cron;
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
export function typicalIntervalSeconds(cron, from) {
  const runs = nextRuns(cron, from, 9);
  if (runs.length < 2) return null;
  const gaps = runs.slice(1).map((r, i) => (r - runs[i]) / 1000).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** Largest gap among the next 12 runs: the longest silence that is still healthy. */
export function longestGapSeconds(cron, from) {
  const runs = nextRuns(cron, from, 13);
  if (runs.length < 2) return null;
  return Math.max(...runs.slice(1).map((r, i) => (r - runs[i]) / 1000));
}

/** A grace period that tolerates normal jitter without hiding a missed run: 10% of the interval, 1 min to 1 h. */
export function suggestGraceSeconds(cron, from) {
  const gap = typicalIntervalSeconds(cron, from);
  if (gap === null) return 300;
  return Math.max(60, Math.min(3600, Math.round(gap * 0.1 / 60) * 60 || 60));
}

/**
 * Decide a check's state at `now`.
 * check: { schedule?: cron text, periodSeconds?: number, graceSeconds, lastPing?: ms, lastStart?: ms, lastFail?: ms, createdAt: ms, paused?: bool }
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
    dueAt = nextRun(check.schedule, new Date(base))?.getTime() ?? null;
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
