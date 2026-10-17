// FLSA regular-rate overtime audit. Pure functions, no I/O.
// Regular rate = total includable remuneration for the workweek / total hours worked.
// Overtime premium owed = premiumFactor x regular rate x hours over the threshold (the
// "half-time" method for an hourly employee whose straight time is already paid for
// every hour, including the overtime hours).

export const RULE_PRESETS = {
  federal: {
    label: "Federal FLSA (29 U.S.C. 207, 29 CFR part 778)",
    fields: { otThresholdHours: 40, premiumFactor: 0.5, lookbackYears: 2, willfulYears: 3, liquidatedMultiplier: 1 },
  },
  custom: {
    label: "Custom (type your state's numbers)",
    fields: { otThresholdHours: 40, premiumFactor: 0.5, lookbackYears: 2, willfulYears: 3, liquidatedMultiplier: 1 },
  },
};

const num = (v, d = 0) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return d;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function fieldsToRules(f) {
  const d = RULE_PRESETS.federal.fields;
  const g = (k) => num(f[k], d[k]);
  return {
    otThreshold: g("otThresholdHours"), premiumFactor: g("premiumFactor"),
    lookbackYears: g("lookbackYears"), willfulYears: g("willfulYears"),
    liquidatedMultiplier: Math.max(1, g("liquidatedMultiplier")),
  };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const strict = (s) => {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return { blank: true };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n } : { bad: true };
};

// Name, week, hours, rate, bonus, other included pay, excluded pay, OT premium paid
export function parsePayroll(text) {
  const rows = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^name\s*,/i.test(line)) return;
    const p = line.split(",").map((x) => x.trim());
    const fail = (why) => errors.push(`Line ${i + 1}: ${why}: "${line}"`);
    if (!p[0] || !p[1]) return fail('expected "Name, week, hours, rate, bonus, other included pay, excluded pay, overtime premium paid"');
    const hours = strict(p[2]), rate = strict(p[3]);
    if (hours.bad || hours.blank || !(hours.value > 0)) return fail("hours worked must be a number above zero");
    if (rate.bad || rate.blank) return fail("hourly rate must be a number");
    const money = {};
    for (const [k, idx, label] of [["bonus", 4, "bonus"], ["other", 5, "other included pay"], ["excluded", 6, "excluded pay"], ["otPaid", 7, "overtime premium paid"]]) {
      const v = strict(p[idx]);
      if (v.bad) return fail(`${label} must be a dollar amount, or blank`);
      money[k] = v.blank ? null : v.value;
    }
    rows.push({ name: p[0], week: p[1], hours: hours.value, rate: rate.value, ...money, line: i + 1 });
  });
  return { rows, errors };
}

export function analyze({ text, rules }) {
  const { rows, errors } = parsePayroll(text);
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.name}|${r.week}`;
    const g = groups.get(key) || { name: r.name, week: r.week, hours: 0, straight: 0, bonus: 0, other: 0, excluded: 0, otPaid: null };
    g.hours += r.hours; g.straight += r.hours * r.rate;
    g.bonus += r.bonus ?? 0; g.other += r.other ?? 0; g.excluded += r.excluded ?? 0;
    if (r.otPaid != null) g.otPaid = (g.otPaid ?? 0) + r.otPaid;
    groups.set(key, g);
  }
  const weeks = [...groups.values()].map((g) => {
    const includable = g.straight + g.bonus + g.other;
    const regularRate = includable / g.hours;
    const baseRate = g.straight / g.hours;
    const otHours = Math.max(0, g.hours - rules.otThreshold);
    const owed = round2(rules.premiumFactor * regularRate * otHours);
    const assumed = g.otPaid == null;
    const paid = assumed ? round2(rules.premiumFactor * baseRate * otHours) : round2(g.otPaid);
    const backPay = round2(Math.max(0, owed - paid));
    return {
      name: g.name, week: g.week, hours: round2(g.hours), baseRate: round2(baseRate), includable: round2(includable),
      excluded: round2(g.excluded), regularRate: Math.round(regularRate * 10000) / 10000,
      otHours: round2(otHours), owed, paid, paidAssumed: assumed, backPay,
    };
  });
  const byName = new Map();
  for (const w of weeks) {
    const e = byName.get(w.name) || { name: w.name, weeks: 0, otWeeks: 0, owed: 0, paid: 0, backPay: 0 };
    e.weeks++; if (w.otHours > 0) e.otWeeks++;
    e.owed = round2(e.owed + w.owed); e.paid = round2(e.paid + w.paid); e.backPay = round2(e.backPay + w.backPay);
    byName.set(w.name, e);
  }
  const employees = [...byName.values()].sort((a, b) => b.backPay - a.backPay || a.name.localeCompare(b.name));
  const backPay = round2(weeks.reduce((a, w) => a + w.backPay, 0));
  const owed = round2(weeks.reduce((a, w) => a + w.owed, 0));
  const paid = round2(weeks.reduce((a, w) => a + w.paid, 0));
  const distinctWeeks = new Set(weeks.map((w) => w.week)).size;
  const avgWeekly = distinctWeeks ? backPay / distinctWeeks : 0;
  const m = rules.liquidatedMultiplier;
  const project = (years) => round2(avgWeekly * 52 * years * m);
  return {
    errors, weeks, employees, backPay, owed, paid,
    rowCount: rows.length, weekCount: weeks.length, distinctWeeks,
    shortWeeks: weeks.filter((w) => w.backPay > 0).length,
    avgWeekly: round2(avgWeekly),
    exposure: distinctWeeks ? { normal: project(rules.lookbackYears), willful: project(rules.willfulYears), multiplier: m } : null,
  };
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(r) {
  const rows = [["employee", "week", "hours", "base_rate", "includable_pay", "regular_rate", "ot_hours", "premium_owed", "premium_paid", "paid_is_assumed", "back_pay"]];
  for (const w of r.weeks) rows.push([w.name, w.week, w.hours, w.baseRate.toFixed(2), w.includable.toFixed(2), w.regularRate.toFixed(4), w.otHours, w.owed.toFixed(2), w.paid.toFixed(2), w.paidAssumed ? "yes" : "no", w.backPay.toFixed(2)]);
  rows.push(["TOTAL", "", "", "", "", "", "", r.owed.toFixed(2), r.paid.toFixed(2), "", r.backPay.toFixed(2)]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function toText(r) {
  const out = [`FLSA regular-rate audit: ${r.weekCount} employee-weeks, ${r.shortWeeks} short-paid, back pay $${r.backPay.toFixed(2)}.`];
  if (r.exposure) out.push(`Projected exposure at this average pace: $${r.exposure.normal.toFixed(2)} (normal lookback), $${r.exposure.willful.toFixed(2)} (willful). Not legal advice; verify.`);
  out.push("");
  for (const w of r.weeks) out.push(`${w.week}  ${w.name}  ${w.hours}h  regular rate $${w.regularRate.toFixed(4)} (base $${w.baseRate.toFixed(2)})  OT ${w.otHours}h  owed $${w.owed.toFixed(2)}  paid $${w.paid.toFixed(2)}${w.paidAssumed ? " (assumed at base rate)" : ""}  back pay $${w.backPay.toFixed(2)}`);
  if (!r.weeks.length) out.push("No rows.");
  return out.join("\n") + "\n";
}
