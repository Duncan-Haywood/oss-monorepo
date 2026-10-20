// Rotating-shift schedule engine: Pitman, 4-on-4-off, 3-on-3-off, DuPont,
// 24/48 and 48/96. Pure functions, no I/O, no network.
// Cycle letters: D = shift starting at the day start time, N = shift starting
// at the night start time, - = off.

const rotate = (s, n) => s.slice(n % s.length) + s.slice(0, n % s.length);
const toNight = (s) => s.replaceAll("D", "N");

const pitmanDay = "DD--DDD--DD---";
const fourOn = "DDDD----";
const threeOn = "DDD---";
const dupont = "NNNN---DDD-NNN---DDDD-------";

export const PATTERNS = {
  pitman: {
    name: "2-2-3 (Pitman)", hours: 12, needsNight: true,
    blurb: "Work 2, off 2, work 3, off 2, work 2, off 3. Every other weekend off, never more than 3 shifts in a row.",
    crews: [["A", pitmanDay], ["B", rotate(pitmanDay, 7)], ["C", toNight(pitmanDay)], ["D", toNight(rotate(pitmanDay, 7))]],
  },
  "4on4off": {
    name: "4-on-4-off", hours: 12, needsNight: true,
    blurb: "Four 12-hour shifts, four days off. Simple to explain, long stretches on and off.",
    crews: [["A", fourOn], ["B", rotate(fourOn, 4)], ["C", toNight(fourOn)], ["D", toNight(rotate(fourOn, 4))]],
  },
  "3on3off": {
    name: "3-on-3-off", hours: 12, needsNight: true,
    blurb: "Three 12-hour shifts, three days off. Shorter blocks than 4-on-4-off, weekends rotate every 2 weeks.",
    crews: [["A", threeOn], ["B", rotate(threeOn, 3)], ["C", toNight(threeOn)], ["D", toNight(rotate(threeOn, 3))]],
  },
  dupont: {
    name: "DuPont (4-crew, 28-day)", hours: 12, needsNight: true,
    blurb: "4 nights, 3 off, 3 days, 1 off, 3 nights, 3 off, 4 days, then 7 days off. Averages 42 hours a week.",
    crews: [["A", dupont], ["B", rotate(dupont, 7)], ["C", rotate(dupont, 14)], ["D", rotate(dupont, 21)]],
  },
  "24-48": {
    name: "24 on / 48 off", hours: 24, needsNight: false,
    blurb: "One 24-hour shift, then two days off, three platoons. Common in fire services.",
    crews: [["A", "D--"], ["B", "-D-"], ["C", "--D"]],
  },
  "48-96": {
    name: "48 on / 96 off", hours: 24, needsNight: false,
    blurb: "Two consecutive 24-hour shifts, then four days off, three platoons.",
    crews: [["A", "DD----"], ["B", "--DD--"], ["C", "----DD"]],
  },
};

export const PATTERN_KEYS = Object.keys(PATTERNS);

function pattern(key) {
  const p = PATTERNS[key];
  if (!p) throw new Error(`Unknown pattern "${key}". Choose one of: ${PATTERN_KEYS.join(", ")}`);
  return p;
}

function crewIndex(p, crew) {
  if (typeof crew === "number") {
    if (!p.crews[crew]) throw new Error(`Pattern ${p.name} has ${p.crews.length} crews`);
    return crew;
  }
  const i = p.crews.findIndex(([n]) => n.toLowerCase() === String(crew).toLowerCase());
  if (i < 0) throw new Error(`Unknown crew "${crew}" for ${p.name}; use ${p.crews.map(([n]) => n).join(", ")}`);
  return i;
}

// ---- dates (UTC arithmetic, so DST never moves a day) ----
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) throw new Error(`Date must be YYYY-MM-DD, got "${s}"`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error(`Not a real date: ${s}`);
  return t;
}
const DAY = 86400000;
export const formatDate = (t) => new Date(t).toISOString().slice(0, 10);
const mod = (a, n) => ((a % n) + n) % n;

/** Shift letter for a date. `anchor` is the date on which the crew is at cycle day 1. */
export function shiftOn(key, crew, anchor, date) {
  const p = pattern(key);
  const cycle = p.crews[crewIndex(p, crew)][1];
  return cycle[mod(Math.round((parseDate(date) - parseDate(anchor)) / DAY), cycle.length)];
}

/** `count` consecutive days starting at `from`. */
export function buildDays(key, crew, anchor, from, count) {
  const p = pattern(key);
  const cycle = p.crews[crewIndex(p, crew)][1];
  const a = parseDate(anchor), f = parseDate(from);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = f + i * DAY;
    const pos = mod(Math.round((t - a) / DAY), cycle.length);
    out.push({ date: formatDate(t), dow: new Date(t).getUTCDay(), pos: pos + 1, shift: cycle[pos] });
  }
  return out;
}

/** Does every day have exactly one day shift (and one night shift if the pattern needs it)? */
export function coverage(key) {
  const p = pattern(key);
  const L = p.crews[0][1].length;
  const gaps = [];
  for (let d = 0; d < L; d++) {
    const day = p.crews.filter(([, c]) => c[d] === "D").length;
    const night = p.crews.filter(([, c]) => c[d] === "N").length;
    if (day !== 1) gaps.push({ day: d + 1, shift: "D", crews: day });
    if (p.needsNight && night !== 1) gaps.push({ day: d + 1, shift: "N", crews: night });
  }
  return { ok: gaps.length === 0, cycleDays: L, gaps };
}

function runs(cycle, isOn) {
  const L = cycle.length;
  const doubled = cycle + cycle;
  let best = 0, cur = 0;
  for (const ch of doubled) {
    if (isOn(ch)) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return Math.min(best, L);
}

/** Facts about one crew over a full repeat of the cycle. */
export function stats(key, crew = 0) {
  const p = pattern(key);
  const cycle = p.crews[crewIndex(p, crew)][1];
  const L = cycle.length;
  const on = [...cycle].filter((c) => c !== "-").length;
  const nights = [...cycle].filter((c) => c === "N").length;
  // A whole number of weeks AND cycles: L weeks = 7L days.
  const span = 7 * L;
  const seq = Array.from({ length: span }, (_, i) => (cycle[i % L] === "-" ? 0 : p.hours));
  let maxWeek = 0;
  for (let i = 0; i < span; i++) {
    let s = 0;
    for (let j = 0; j < 7; j++) s += seq[(i + j) % span];
    maxWeek = Math.max(maxWeek, s);
  }
  // Weeks run Mon..Sun from a Monday; day index 5,6 are Sat,Sun. Because every
  // alignment of the cycle against the week is visited over 7L days, the count is
  // independent of the start date.
  let weekendsOff = 0;
  for (let w = 0; w < L; w++) if (seq[7 * w + 5] === 0 && seq[7 * w + 6] === 0) weekendsOff++;
  const hoursPerWeek = (on * p.hours * 7) / L;
  return {
    pattern: p.name, crew: p.crews[crewIndex(p, crew)][0], cycleDays: L, shiftsPerCycle: on,
    shiftHours: p.hours,
    hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
    maxHoursIn7Days: maxWeek,
    daysOffPerYear: Math.round(((L - on) / L) * 365),
    shiftsPerYear: Math.round((on / L) * 365),
    fullWeekendsOffPerYear: Math.round((weekendsOff / L) * 52),
    longestRun: runs(cycle, (c) => c !== "-"),
    longestBreak: runs(cycle, (c) => c === "-"),
    nightShare: on ? Math.round((nights / on) * 100) : 0,
  };
}

export function compare(crew = 0) {
  return PATTERN_KEYS.map((k) => ({ key: k, ...stats(k, Math.min(crew, pattern(k).crews.length - 1)) }));
}

/**
 * Which crew/cycle position fits what you remember working? `observations` is
 * [{date, shift: "D"|"N"|"-"}]. Returns each distinct schedule that agrees with all
 * of them, as {crew, anchor} where anchor is the date that crew is on cycle day 1.
 * Several answers means the observations do not yet pin the schedule down.
 */
export function fitSchedule(key, observations) {
  const p = pattern(key);
  if (!observations.length) throw new Error("Give at least one date you know you worked or were off");
  const obs = observations.map((o) => ({ t: parseDate(o.date), shift: o.shift }));
  const first = obs.reduce((a, b) => (b.t < a.t ? b : a));
  const seen = new Set();
  const matches = [];
  p.crews.forEach(([name, cycle], ci) => {
    const L = cycle.length;
    for (let pos = 0; pos < L; pos++) {
      // pos = cycle index (0-based) on the earliest observation date
      const ok = obs.every((o) => cycle[mod(pos + Math.round((o.t - first.t) / DAY), L)] === o.shift);
      if (!ok) continue;
      const sig = [...Array(L)].map((_, i) => cycle[mod(pos + i, L)]).join("");
      if (seen.has(sig)) continue;
      seen.add(sig);
      matches.push({ crew: name, crewIndex: ci, anchor: formatDate(first.t - pos * DAY) });
    }
  });
  return matches;
}

// ---- calendar export ----
const pad = (n) => String(n).padStart(2, "0");
const icsStamp = (t, h, m) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(h)}${pad(m)}00`;
};
function parseClock(s, label) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`${label} must be HH:MM, got "${s}"`);
  return [+m[1], +m[2]];
}
function fold(line) {
  // RFC 5545: lines are folded at 75 octets; all of ours are ASCII.
  const out = [];
  let rest = line;
  while (rest.length > 75) { out.push(rest.slice(0, 75)); rest = " " + rest.slice(75); }
  out.push(rest);
  return out.join("\r\n");
}

/**
 * RFC 5545 calendar with one event per shift, in floating local time (so it lands at
 * the same wall-clock hour whatever the daylight-saving date). `now` is injected so the
 * output is reproducible.
 */
export function toIcs(days, { patternKey, crewName, dayStart = "07:00", nightStart = "19:00", now = new Date() } = {}) {
  const p = pattern(patternKey);
  const [dh, dm] = parseClock(dayStart, "Day start");
  const [nh, nm] = parseClock(nightStart, "Night start");
  const stamp = icsStamp(now.getTime(), now.getUTCHours(), now.getUTCMinutes()) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-rotation-schedule-generator//EN", "CALSCALE:GREGORIAN"];
  for (const d of days) {
    if (d.shift === "-") continue;
    const [h, m] = d.shift === "D" ? [dh, dm] : [nh, nm];
    const t = parseDate(d.date);
    const startMs = t + (h * 60 + m) * 60000;
    const endMs = startMs + p.hours * 3600000;
    const s = new Date(startMs), e = new Date(endMs);
    const fmt = (x) => icsStamp(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()), x.getUTCHours(), x.getUTCMinutes());
    const label = d.shift === "D" ? "Day shift" : "Night shift";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.date}-${d.shift}-${patternKey}-${crewName}@shift-rotation-schedule-generator`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(s)}`,
      `DTEND:${fmt(e)}`,
      fold(`SUMMARY:${label} (${p.name}, crew ${crewName})`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Plain-text month-by-month grid for terminals and emails. */
export function renderText(days) {
  const lines = [];
  for (const d of days) lines.push(`${d.date} ${DOW[d.dow]}  ${d.shift === "-" ? "off" : d.shift === "D" ? "DAY" : "NIGHT"}`);
  return lines.join("\n");
}
