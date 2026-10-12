// California meal and rest break premium-pay auditor. Pure functions, no I/O.
// Times are wall-clock minutes (UTC arithmetic on the typed date), so daylight
// saving shifts are ignored on purpose; the page says so.

export const RULE_PRESETS = {
  california: {
    label: "California (Labor Code 226.7, IWC wage orders, Brinker)",
    fields: {
      mealAfterHours: 5, mealMaxStartHours: 5, mealMinutes: 30, mealWaiverMaxHours: 6,
      meal2AfterHours: 10, meal2MaxStartHours: 10, meal2WaiverMaxHours: 12,
      restFirstAfterHours: 3.5, restIntervalHours: 4, restMajorFractionHours: 2,
      mealPremiumHours: 1, restPremiumHours: 1,
    },
  },
  custom: {
    label: "Custom (type your state's numbers)",
    fields: {
      mealAfterHours: 5, mealMaxStartHours: 5, mealMinutes: 30, mealWaiverMaxHours: 6,
      meal2AfterHours: 10, meal2MaxStartHours: 10, meal2WaiverMaxHours: 12,
      restFirstAfterHours: 3.5, restIntervalHours: 4, restMajorFractionHours: 2,
      mealPremiumHours: 1, restPremiumHours: 1,
    },
  },
};

const num = (v, d = 0) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function fieldsToRules(f) {
  const d = RULE_PRESETS.california.fields;
  const g = (k) => num(f[k], d[k]);
  return {
    mealAfter: g("mealAfterHours") * 60, mealMaxStart: g("mealMaxStartHours") * 60, mealMinutes: g("mealMinutes"),
    mealWaiverMax: g("mealWaiverMaxHours") * 60,
    meal2After: g("meal2AfterHours") * 60, meal2MaxStart: g("meal2MaxStartHours") * 60, meal2WaiverMax: g("meal2WaiverMaxHours") * 60,
    restFirstAfter: g("restFirstAfterHours") * 60, restInterval: Math.max(1, g("restIntervalHours")) * 60,
    restMajorFraction: g("restMajorFractionHours") * 60,
    mealPremiumHours: g("mealPremiumHours"), restPremiumHours: g("restPremiumHours"),
  };
}

const parseClock = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};

export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return t.getTime() / 86400000;
}

export function fmtMin(minutes) {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const clock = (abs) => {
  const m = ((abs % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// "12:45-13:10" -> {start, end} as offsets from midnight of the shift's date,
// moved forward a day if it falls before the clock-in (overnight shifts).
function parseMeal(spec, inMin) {
  const s = String(spec ?? "").trim();
  if (!s || /^(none|no|-|missed)$/i.test(s)) return { none: true };
  const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(s);
  if (!m) return { bad: true };
  let a = parseClock(m[1]), b = parseClock(m[2]);
  if (a == null || b == null) return { bad: true };
  if (a < inMin) a += 1440;
  if (b <= a) b += 1440;
  return { start: a, end: b };
}

export function parseTimecards(text) {
  const shifts = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^name\s*,/i.test(line)) return;
    const p = line.split(",").map((x) => x.trim());
    const day = parseDay(p[1] ?? "");
    const inMin = parseClock(p[2] ?? "");
    let outMin = parseClock(p[3] ?? "");
    const fail = (why) => errors.push(`Line ${i + 1}: ${why}: "${line}"`);
    if (!p[0] || day == null || inMin == null || outMin == null) return fail('expected "Name, 2026-10-20, 08:00, 16:30, 12:45-13:10, , 2, 20"');
    if (outMin <= inMin) outMin += 1440;
    const meal1 = parseMeal(p[4], inMin);
    const meal2 = parseMeal(p[5], inMin);
    if (meal1.bad || meal2.bad) return fail("meal period must look like 12:45-13:10, or be blank for none");
    let rest = null;
    if (p[6] !== undefined && p[6] !== "") {
      rest = Number(p[6]);
      if (!Number.isInteger(rest) || rest < 0) return fail("rest breaks taken must be a whole number, or blank if not recorded");
    }
    let rate = null;
    if (p[7]) { rate = num(p[7], NaN); if (!Number.isFinite(rate)) return fail(`"${p[7]}" is not an hourly rate`); }
    const flags = (p[8] ?? "").toLowerCase();
    if ((!meal1.none && meal1.start >= outMin) || (!meal2.none && meal2.start >= outMin)) return fail("meal period is outside the shift");
    shifts.push({
      name: p[0], day, inMin, outMin, rate, rest,
      meal1: meal1.none ? null : meal1, meal2: meal2.none ? null : meal2,
      waive1: /waive1|waiver|waived/.test(flags), waive2: /waive2|waiver|waived/.test(flags),
      line: i + 1,
    });
  });
  return { shifts, errors };
}

// Rest breaks owed for `work` minutes of work: 10 minutes per interval or major fraction.
export function restOwed(work, r) {
  if (work < r.restFirstAfter) return 0;
  return Math.max(1, Math.ceil((work - r.restMajorFraction) / r.restInterval));
}

function auditShift(s, r) {
  const out = [];
  const m1 = s.meal1 ? s.meal1.end - s.meal1.start : 0;
  const m2 = s.meal2 ? s.meal2.end - s.meal2.start : 0;
  const span = s.outMin - s.inMin;
  const work = span - m1 - m2;
  const date = fmtDate(s.day);
  const add = (kind, premiumType, text) => out.push({ name: s.name, date, kind, premiumType, text, line: s.line });

  if (work > r.mealAfter) {
    if (!s.meal1) {
      if (s.waive1 && work <= r.mealWaiverMax) add("waived", null, `First meal waived on a ${fmtMin(work)} shift (waiver allowed up to ${fmtMin(r.mealWaiverMax)}). Keep the signed waiver.`);
      else add("meal-missed", "meal", `No first meal recorded on a ${fmtMin(work)} shift. A meal had to start by ${clock(s.inMin + r.mealMaxStart)}.`);
    } else {
      const elapsed = s.meal1.start - s.inMin;
      const len = s.meal1.end - s.meal1.start;
      if (len < r.mealMinutes) add("meal-short", "meal", `First meal ${clock(s.meal1.start)}-${clock(s.meal1.end)} was ${len} minutes, under the ${r.mealMinutes} minutes required.`);
      if (elapsed > r.mealMaxStart) add("meal-late", "meal", `First meal began ${fmtMin(elapsed)} after clock-in at ${clock(s.meal1.start)}; it had to begin by ${clock(s.inMin + r.mealMaxStart)}.`);
    }
  }
  if (work > r.meal2After) {
    if (!s.meal2) {
      if (s.waive2 && s.meal1 && work <= r.meal2WaiverMax) add("waived", null, `Second meal waived on a ${fmtMin(work)} shift (allowed up to ${fmtMin(r.meal2WaiverMax)} when the first meal was taken). Keep the signed waiver.`);
      else add("meal-missed", "meal", `No second meal recorded on a ${fmtMin(work)} shift. One is required after ${fmtMin(r.meal2After)} of work.`);
    } else {
      const elapsed = s.meal2.start - s.inMin - m1;
      const len = s.meal2.end - s.meal2.start;
      if (len < r.mealMinutes) add("meal-short", "meal", `Second meal ${clock(s.meal2.start)}-${clock(s.meal2.end)} was ${len} minutes, under ${r.mealMinutes}.`);
      if (elapsed > r.meal2MaxStart) add("meal-late", "meal", `Second meal began after ${fmtMin(elapsed)} of work; it had to begin by ${fmtMin(r.meal2MaxStart)}.`);
    }
  }
  const owed = restOwed(work, r);
  if (owed > 0) {
    if (s.rest == null) add("rest-unrecorded", null, `${owed} rest break${owed > 1 ? "s" : ""} owed on a ${fmtMin(work)} shift; none recorded either way, so no premium is counted.`);
    else if (s.rest < owed) add("rest-short", "rest", `${s.rest} of ${owed} rest breaks taken on a ${fmtMin(work)} shift.`);
  }
  return { findings: out, work, owed };
}

const fmtDate = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

export function analyze({ text, rules, defaultRate }) {
  const { shifts, errors } = parseTimecards(text);
  const dr = num(defaultRate, 0);
  const findings = [];
  const days = new Map(); // "name|date" -> rollup
  let violating = 0;
  for (const s of shifts) {
    const { findings: f } = auditShift(s, rules);
    const rate = s.rate ?? dr;
    const key = `${s.name}|${s.day}`;
    if (!days.has(key)) days.set(key, { name: s.name, date: fmtDate(s.day), meal: 0, rest: 0, mealRate: 0, restRate: 0, issues: [] });
    const d = days.get(key);
    let bad = false;
    for (const x of f) {
      findings.push(x);
      if (x.premiumType === "meal") { bad = true; if (!d.meal) { d.meal = 1; d.mealRate = rate; } }
      if (x.premiumType === "rest") { bad = true; if (!d.rest) { d.rest = 1; d.restRate = rate; } }
      if (x.premiumType) d.issues.push(x.kind);
    }
    if (bad) violating++;
  }
  const rollup = [...days.values()].map((d) => ({
    ...d,
    mealPremium: round2(d.meal * rules.mealPremiumHours * d.mealRate),
    restPremium: round2(d.rest * rules.restPremiumHours * d.restRate),
  })).map((d) => ({ ...d, premium: round2(d.mealPremium + d.restPremium) }));
  const owedDays = rollup.filter((d) => d.premium > 0 || d.meal || d.rest);
  const total = round2(rollup.reduce((a, d) => a + d.premium, 0));
  const byEmployee = new Map();
  for (const d of rollup) {
    const e = byEmployee.get(d.name) || { name: d.name, days: 0, premiumDays: 0, premium: 0 };
    e.days++; if (d.meal || d.rest) e.premiumDays++; e.premium = round2(e.premium + d.premium);
    byEmployee.set(d.name, e);
  }
  const dayNums = shifts.map((s) => s.day);
  const spanDays = dayNums.length ? Math.max(...dayNums) - Math.min(...dayNums) + 1 : 0;
  return {
    errors, findings, rollup: owedDays, total,
    shiftCount: shifts.length, violatingShifts: violating,
    violationRate: shifts.length ? violating / shifts.length : 0,
    workdays: rollup.length, premiumDays: owedDays.length,
    employees: [...byEmployee.values()].sort((a, b) => b.premium - a.premium || a.name.localeCompare(b.name)),
    spanDays,
    annualized: spanDays >= 7 ? round2((total * 365) / spanDays) : null,
  };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(r) {
  const rows = [["employee", "date", "meal_premium", "rest_premium", "total_premium", "issues"]];
  for (const d of r.rollup) rows.push([d.name, d.date, d.mealPremium.toFixed(2), d.restPremium.toFixed(2), d.premium.toFixed(2), [...new Set(d.issues)].join("; ")]);
  rows.push(["TOTAL", "", "", "", r.total.toFixed(2), ""]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function toText(r) {
  const out = [`Meal and rest break audit: ${r.shiftCount} shifts, ${r.premiumDays} workdays owed premium, $${r.total.toFixed(2)} total.`, ""];
  for (const f of r.findings) out.push(`${f.date}  ${f.name}  [${f.kind}]  ${f.text}`);
  if (!r.findings.length) out.push("No issues found under these numbers.");
  return out.join("\n") + "\n";
}
