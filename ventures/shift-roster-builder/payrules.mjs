// Pay rules for the timesheet (2026-11-15 later): overtime, double time, meal-period flags and punch rounding read from
// the clocked stretches, then an estimate of gross pay at each person's wage. No Node built-ins (Node server and
// Cloudflare Worker alike).
//
// The rule sets, each from the text it names (checked 2026-11-15; read the README section "Overtime, meal periods and
// rounding" before relying on them):
//   federal    FLSA, 29 U.S.C. 207(a)(1): 1.5x for hours over 40 in the workweek. No daily overtime, no meal-period duty.
//   california Labor Code 510(a): 1.5x over 8 in a workday and over 40 in the workweek, 2x over 12 in a workday; on the
//              seventh consecutive day worked in one workweek, 1.5x for the first 8 hours and 2x after 8. Labor Code 512(a):
//              a 30-minute meal period before the end of the fifth hour worked (waivable by mutual consent when the work
//              period is no more than 6 hours), a second before the end of the tenth (waivable when no more than 12 and the
//              first was not waived); Labor Code 226.7: one extra hour at the regular rate for a workday with a missed meal
//              period.
//   alaska     AS 23.10.060: 1.5x over 8 in a day and over 40 in a week (employers with 4 or more employees).
//   colorado   COMPS Order #39, Rule 4.1.1: 1.5x over 40 in the workweek, over 12 in a workday, or over 12 consecutive
//              hours, whichever pays more. Rule 5.1 (meal period over 5 hours) carries no premium and is shown as a note.
//   nevada     NRS 608.018(1): 1.5x over 8 in a workday and over 40 in a week for anyone paid less than 1.5x the minimum
//              wage of NRS 608.250 ($12.00, DOL state table, read 2026-11-15; MIN_WAGE overrides), unless by mutual
//              agreement they work a scheduled four 10-hour days (NV_FOUR_TENS=1); 608.018(2): over 40 only at or above it.
//              NRS 608.0126: the workday is the 24 hours from when the employee begins work, not the calendar day.
//              NRS 608.019(1): a 30-minute meal period in any continuous 8 hours; a break under 30 minutes does not
//              interrupt the continuous period. No premium is set in that section, so it is a flag.
//   Meal-period states (MEAL_RULES below): overtime as federal (the DOL state minimum-wage table, read 2026-11-15, lists
//              general daily overtime only for Alaska, California, Colorado and Nevada among the states), except Kentucky's
//              seventh-day rule (that table: 1.5x for hours on the seventh day when all seven days of the workweek are
//              worked; not when the employee is not permitted over 40 in the week, read here as applying when the week
//              passes 40), plus each state's premium-pay notes from that table (`ot`), plus that state's meal-period standard from the
//              U.S. Department of Labor's "Minimum Length of Meal Period Required under State Law" table (revised
//              2023-01-01, read 2026-11-15), as flags with no premium (the table lists premium pay only for California
//              and Puerto Rico).
// Daily and weekly overtime never count the same hour twice: weekly overtime is the regular (not daily-overtime) hours
// past 40, which for a 1.5x-only rule equals "whichever is greater", max(daily overtime, weekly excess).
//
// The regular rate is the weighted average of straight-time pay over hours worked (29 CFR 778.115), so a person paid
// different rates for different stretches gets overtime at the blend; with one wage it is that wage. Bonuses,
// commissions, tips, shift differentials and on-call pay are not in the regular rate here: add them by hand.
//
// Rounding (29 CFR 785.48(b)): each punch to the nearest 5, 6 or 15 minutes is presumed lawful if it averages out, so the
// result shows each person's net minutes gained or lost by rounding: a total that leans one way for weeks is the
// warning sign. California's Supreme Court held meal-period punches may not be rounded (Donohue v. AMN Services, 2021),
// so under the california rules this module refuses to round at all.

// Meal-period standards, as the DOL table words them, turned into checks on clocked stretches. A break is a clock-out
// gap of at least `len` minutes. `over`/`atLeast`: the check applies when a work period's worked minutes exceed `over`
// (or reach `atLeast`). `from`/`by`: the break must start at least `from` and at most `by` minutes of clock time after
// the period's first clock-in. `endGap`: the break must end at least that long before the period's last clock-out.
// `run: true`: no continuous run (stretches joined across gaps shorter than `len`) may exceed `over` / reach `atLeast`.
// Where the table's words leave a window open ("between 3rd and 5th hour"), the window is read on the wide side, so a
// flag means the punches plainly miss it. `also` is a note shown when the check applies, for what punches cannot show.
export const MEAL_RULES = {
  washington: { name: "Washington", checks: [{ over: 300, len: 30, from: 120, by: 300, say: "no 30-min meal break between 2 and 5 h after the start (work period over 5 h)" }],
    also: "a second 30 min is owed before or during overtime for 3 or more hours past the regular workday (not checked)" },
  oregon: { name: "Oregon", ot: "mills, factories, manufacturing and nonfarm canneries, driers and packing plants owe overtime after 10 h a day (not applied)", checks: [{ atLeast: 360, len: 30, from: 60, by: 300, upTo: 420, say: "no 30-min meal break in the 2nd to 5th hour (work period 6 to 7 h)" },
    { atLeast: 360, len: 30, from: 120, by: 360, above: 420, say: "no 30-min meal break in the 3rd to 6th hour (work period over 7 h)" }],
    also: "a paid 20-min or on-duty meal period can comply where the employer shows industry practice or that the work prevents relief; the DOL table covers 6 to 8 h periods, longer ones are checked for the first break only" },
  nevada: { name: "Nevada", checks: [{ run: true, atLeast: 480, len: 30, say: "8 continuous hours with no 30-min meal period (NRS 608.019)" }],
    also: "paid rest periods of 10 min per 4 h are owed and are not punched (NRS 608.019(2)); not owed where only one person is employed at the place" },
  connecticut: { name: "Connecticut", ot: "restaurants and hotel restaurants owe 1.5x the minimum rate on the 7th consecutive day (not applied)", checks: [{ atLeast: 450, len: 30, from: 120, endGap: 120, say: "no 30-min meal break after the first 2 h and before the last 2 h (7.5 h or more)" }],
    also: "exemptions include employers giving 30 or more minutes of paid breaks in each 7.5 h, and fewer than 5 on a shift by regulation" },
  delaware: { name: "Delaware", checks: [{ atLeast: 450, len: 30, from: 120, endGap: 120, say: "no 30-min meal break after the first 2 h and before the last 2 h (7.5 h or more)" }],
    also: "exemptions include fewer than 5 employees on a shift and written agreements providing otherwise" },
  illinois: { name: "Illinois", checks: [{ atLeast: 450, len: 20, by: 300, say: "no 20-min meal break starting within 5 h of the start (7.5 h or more)" }] },
  kentucky: { name: "Kentucky", checks: [{ over: 300, len: 30, from: 120, by: 300, say: "no 30-min meal break between the 3rd and 5th hour" }],
    also: "a shorter period is allowed under special conditions" },  // seventh-day overtime: payWeek
  maine: { name: "Maine", checks: [{ run: true, over: 360, len: 30, say: "over 6 consecutive hours with no 30-min break" }],
    also: "not required with fewer than 3 on duty whose work allows frequent paid breaks" },
  massachusetts: { name: "Massachusetts", checks: [{ run: true, over: 360, len: 30, say: "over 6 hours with no 30-min meal break" }] },
  minnesota: { name: "Minnesota", ot: "the state's own overtime line is 48 h a week; overtime here is the federal 40, which covers most employers", checks: [{ run: true, atLeast: 480, len: 1, say: "8 consecutive hours with no clock-out to eat (sufficient time is required; an on-the-clock meal also complies)" }] },
  "new-hampshire": { name: "New Hampshire", checks: [{ run: true, over: 300, len: 30, say: "over 5 consecutive hours with no 30-min break (fine if they may eat while working)" }] },
  "rhode-island": { name: "Rhode Island", ot: "retail and some other businesses owe 1.5x for Sunday and holiday work under separate laws (not applied)", checks: [{ atLeast: 360, len: 20, below: 480, say: "no 20-min mealtime in a 6 h shift" }, { atLeast: 480, len: 30, say: "no 30-min mealtime in an 8 h shift" }],
    also: "not required at a licensed health care facility or with fewer than 3 on the shift" },
  tennessee: { name: "Tennessee", checks: [{ atLeast: 360, len: 30, from: 60, say: "no 30-min meal break after the first hour (6 consecutive hours or more)" }],
    also: "tipped food and beverage staff may waive it in writing" },
  "west-virginia": { name: "West Virginia", checks: [{ atLeast: 360, len: 20, say: "no 20-min meal break in 6 h or more (fine if they may eat while working)" }] },
};
const ABBR = { fed: "federal", us: "federal", ca: "california", ak: "alaska", co: "colorado", nv: "nevada", wa: "washington", or: "oregon", ct: "connecticut", de: "delaware", il: "illinois", ky: "kentucky", me: "maine", ma: "massachusetts", mn: "minnesota", nh: "new-hampshire", ri: "rhode-island", tn: "tennessee", wv: "west-virginia" };
export const PAY_RULES = ["federal", "california", "alaska", "colorado", ...Object.keys(MEAL_RULES)];
export const NV_MIN_WAGE = 12; // NRS 608.250 rate as the DOL state minimum-wage table gives it, read 2026-11-15
export const ROUND_STEPS = [0, 5, 6, 15];
export const PERIOD_GAP_MIN = 120; // a gap of 2 h or more starts a new work period (a split shift); shorter is a break

// A PAY_RULES value to its rule set: names in any case, spaces or underscores for hyphens, two-letter codes.
export function normRules(v) {
  const key = String(v || "federal").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return PAY_RULES.includes(key) ? key : (Object.hasOwn(ABBR, key) ? ABBR[key] : "federal");
}

export function readPayEnv(env = {}) {
  const raw = String(env.PAY_RULES || "federal").trim().toLowerCase();
  const key = raw.replace(/[\s_]+/g, "-");
  const rules = normRules(raw);
  const notes = [];
  if (rules === "federal" && !["federal", "fed", "us", ""].includes(key)) notes.push(`PAY_RULES "${raw}" is not one of ${PAY_RULES.join(", ")}; using federal.`);
  let minWage = NV_MIN_WAGE;
  if (env.MIN_WAGE != null && String(env.MIN_WAGE).trim() !== "") {
    const m = Number(env.MIN_WAGE);
    if (Number.isFinite(m) && m > 0) minWage = m; else notes.push(`MIN_WAGE "${env.MIN_WAGE}" is not a number; using $${NV_MIN_WAGE.toFixed(2)}.`);
  }
  const fourTens = /^(1|true|yes)$/i.test(String(env.NV_FOUR_TENS || "").trim());
  let roundMin = Number(env.PUNCH_ROUND_MIN || 0);
  if (!ROUND_STEPS.includes(roundMin)) { notes.push(`PUNCH_ROUND_MIN must be 0, 5, 6 or 15; not rounding.`); roundMin = 0; }
  if (roundMin && rules === "california") { notes.push("Punches are not rounded under the California rules (meal-period punches may not be rounded: Donohue v. AMN Services, 2021)."); roundMin = 0; }
  return { rules, roundMin, notes, minWage, fourTens };
}

const roundTo = (m, step) => (step ? Math.round(m / step) * step : m);

// Split [a, b) in week minutes (Monday 00:00 = 0, the site's wall clock) at each midnight: [{ day, min }].
function byDay(a, b) {
  const out = [];
  for (let s = a; s < b;) { const d = Math.floor(s / 1440), e = Math.min(b, (d + 1) * 1440); out.push({ day: d, min: e - s }); s = e; }
  return out;
}

// Stretches with gaps under PERIOD_GAP_MIN form one work period; returns [{ spans: [{a,b}], worked }].
function periods(spans) {
  const out = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.a - last.spans[last.spans.length - 1].b < PERIOD_GAP_MIN) { last.spans.push(s); last.worked += s.b - s.a; }
    else out.push({ spans: [s], worked: s.b - s.a });
  }
  return out;
}

// California meal periods for one work period: whether a 30-minute break began by the end of the 5th (and 10th) hour.
function mealCheck(period) {
  const W = period.worked, flags = [];
  let cum = 0, first = null, second = null;
  for (let i = 0; i < period.spans.length; i++) {
    cum += period.spans[i].b - period.spans[i].a;
    const next = period.spans[i + 1];
    if (!next || next.a - period.spans[i].b < 30) continue;
    if (first == null) { if (cum <= 300) first = cum; }
    else if (second == null && cum <= 600) second = cum;
  }
  let premium = false;
  if (W > 300 && first == null) {
    if (W <= 360) flags.push("no meal break (fine only with a signed waiver: work period under 6 h)");
    else { flags.push("no 30-min meal break by the end of the 5th hour"); premium = true; }
  }
  if (W > 600 && second == null) {
    if (W <= 720 && first != null) flags.push("no second meal break (fine only with a signed waiver: under 12 h, first taken)");
    else { flags.push("no second 30-min meal break by the end of the 10th hour"); premium = true; }
  }
  return { flags, premium };
}

// Breaks inside one work period: [{ start, end, len }] in clock minutes after the period's first clock-in.
function gapsOf(period) {
  const t0 = period.spans[0].a, out = [];
  for (let i = 0; i + 1 < period.spans.length; i++) {
    const a = period.spans[i].b, b = period.spans[i + 1].a;
    if (b > a) out.push({ start: a - t0, end: b - t0, len: b - a });
  }
  return out;
}
// Continuous runs: stretches joined across gaps shorter than `len`; returns each run's worked minutes.
function runsOf(period, len) {
  const out = [];
  let cur = 0;
  period.spans.forEach((s, i) => {
    if (i > 0 && s.a - period.spans[i - 1].b >= len) { out.push(cur); cur = 0; }
    cur += s.b - s.a;
  });
  out.push(cur);
  return out;
}
const applies = (c, W) => (c.over == null || W > c.over) && (c.atLeast == null || W >= c.atLeast)
  && (c.below == null || W < c.below) && (c.upTo == null || W <= c.upTo) && (c.above == null || W > c.above);
// One state's meal-period checks (MEAL_RULES) on one work period: the flags it raises and whether any check applied.
export function stateMealCheck(period, spec) {
  const flags = [];
  let applied = false;
  const W = period.worked, span = period.spans[period.spans.length - 1].b - period.spans[0].a;
  for (const c of spec.checks) {
    if (c.run) {
      const runs = runsOf(period, c.len);
      if (runs.some((r) => applies(c, r))) { applied = true; flags.push(c.say); }
      else if (applies(c, W)) applied = true;
      continue;
    }
    if (!applies(c, W)) continue;
    applied = true;
    const ok = gapsOf(period).some((g) => g.len >= c.len && (c.from == null || g.start >= c.from) && (c.by == null || g.start <= c.by)
      && (c.endGap == null || g.end <= span - c.endGap));
    if (!ok) flags.push(c.say);
  }
  return { flags, applied };
}

// Nevada workdays (NRS 608.0126): 24 hours from when the employee begins work. Returns minutes worked in each.
export function rollingWorkdays(spans) {
  const out = [];
  let start = null;
  for (const s of spans) {
    let a = s.a;
    while (a < s.b) {
      if (start == null || a >= start + 1440) { start = a; out.push(0); }
      const e = Math.min(s.b, start + 1440);
      out[out.length - 1] += e - a;
      a = e;
    }
  }
  return out;
}

// One person's week. `stretches` are closed clocked stretches [{ a, b, rate? }] in week minutes; `wage` is the hourly
// rate for a stretch with none. Returns hours by pay class, the regular rate, an estimated gross and the flags.
export function payWeek(stretches, { rules = "federal", roundMin = 0, wage = null, minWage = NV_MIN_WAGE, fourTens = false } = {}) {
  rules = normRules(rules);
  const step = rules === "california" ? 0 : (ROUND_STEPS.includes(roundMin) ? roundMin : 0);
  const spans = [];
  let roundNet = 0;
  for (const s of [...stretches].sort((x, y) => x.a - y.a)) {
    const a = roundTo(s.a, step), b = roundTo(s.b, step);
    roundNet += (b - a) - (s.b - s.a);
    if (b > a) spans.push({ a, b, rate: s.rate ?? wage });
  }
  const day = new Array(7).fill(0);
  let straight = 0, priced = 0, total = 0;
  for (const s of spans) {
    for (const p of byDay(s.a, s.b)) if (p.day >= 0 && p.day < 7) day[p.day] += p.min; // a stretch past Sunday midnight stays in this week's total below
    total += s.b - s.a;
    if (s.rate != null && Number.isFinite(Number(s.rate))) { straight += (s.b - s.a) / 60 * Number(s.rate); priced += s.b - s.a; }
  }
  // Minutes past Sunday midnight (a Sunday night close) count as Sunday's: the week's workday ends at its own midnight,
  // but a punch pair belongs to the week its clock-in falls in, as the timesheet does.
  const past = total - day.reduce((t, x) => t + x, 0);
  if (past > 0) day[6] += past;
  let ot = 0, dt = 0;
  const per = periods(spans), flags = [], notes = [];
  if (rules === "california") {
    const seventh = day.every((m) => m > 0);
    day.forEach((m, d) => {
      if (seventh && d === 6) { ot += Math.min(m, 480); dt += Math.max(0, m - 480); return; }
      ot += Math.max(0, Math.min(m, 720) - 480); dt += Math.max(0, m - 720);
    });
    const regular = total - ot - dt;
    ot += Math.max(0, regular - 2400);
    if (seventh) notes.push("worked all seven days: the seventh day's first 8 h at 1.5x, the rest at 2x");
  } else if (rules === "alaska") {
    const daily = day.reduce((t, m) => t + Math.max(0, m - 480), 0);
    ot = Math.max(daily, total - 2400);
  } else if (rules === "colorado") {
    const daily = day.reduce((t, m) => t + Math.max(0, m - 720), 0);
    const consec = per.reduce((t, p) => t + Math.max(0, p.worked - 720), 0);
    ot = Math.max(daily, consec, total - 2400);
    if (per.some((p) => p.worked > 300)) notes.push("work periods over 5 h are owed a 30-min meal period (COMPS Rule 5.1; paid if not duty-free)");
  } else if (rules === "nevada") {
    const rates = spans.map((s) => s.rate).filter((r) => r != null && Number.isFinite(Number(r))).map(Number);
    const line = 1.5 * minWage;
    const known = rates.length === spans.length && spans.length > 0;
    const blend = known ? spans.reduce((t, s) => t + (s.b - s.a) * Number(s.rate), 0) / Math.max(1, total) : null;
    const dailyOwed = !fourTens && (blend == null || blend < line);
    const daily = dailyOwed ? rollingWorkdays(spans).reduce((t, m) => t + Math.max(0, m - 480), 0) : 0;
    ot = Math.max(daily, total - 2400);
    if (fourTens) notes.push("NV_FOUR_TENS: a mutually agreed four 10-hour days, so no daily overtime (NRS 608.018(1)(b))");
    else if (blend == null && total > 0) notes.push(`no wage, so daily overtime is counted as if paid under $${line.toFixed(2)} (1.5x the $${minWage.toFixed(2)} minimum)`);
    else if (blend != null && blend >= line) notes.push(`paid $${line.toFixed(2)} or more (1.5x the $${minWage.toFixed(2)} minimum): weekly overtime only (NRS 608.018(2))`);
  } else if (rules === "kentucky" && day.every((m) => m > 0) && total > 2400) {
    ot = day[6] + Math.max(0, total - day[6] - 2400); // the seventh day at 1.5x, then regular hours past 40
    notes.push("worked all seven days in a week over 40 h: the seventh day's hours at 1.5x (Kentucky)");
  } else {
    ot = Math.max(0, total - 2400);
  }
  let mealPremiumDays = 0;
  if (rules === "california") {
    const premDays = new Set();
    for (const p of per) {
      const m = mealCheck(p);
      const d = Math.floor(p.spans[0].a / 1440);
      for (const f of m.flags) flags.push(`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Math.min(6, Math.max(0, d))]}: ${f}`);
      if (m.premium) premDays.add(d);
    }
    mealPremiumDays = premDays.size; // Labor Code 226.7: one extra hour per workday, however many meal periods were missed
  } else if (Object.hasOwn(MEAL_RULES, rules)) {
    const spec = MEAL_RULES[rules];
    let any = false;
    for (const p of per) {
      const m = stateMealCheck(p, spec);
      any = any || m.applied;
      const d = Math.floor(p.spans[0].a / 1440);
      for (const f of m.flags) flags.push(`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Math.min(6, Math.max(0, d))]}: ${f}`);
    }
    if (any && spec.also) notes.push(`${spec.name}: ${spec.also}`);
    if (total > 0 && spec.ot) notes.push(`${spec.name}: ${spec.ot}`);
  }
  const H = (m) => m / 60;
  const allPriced = total > 0 && priced === total;
  const rr = allPriced ? straight / H(total) : null;
  const gross = rr == null ? null : straight + 0.5 * rr * H(ot) + 1.0 * rr * H(dt) + rr * mealPremiumDays;
  if (total > 0 && !allPriced) notes.push("no wage for some hours, so no pay estimate");
  return {
    rules, roundMin: step, roundNetMin: roundNet,
    hours: H(total), regularH: H(total - ot - dt), overtimeH: H(ot), doubleH: H(dt), mealPremiumDays,
    regularRate: rr, straightPay: allPriced ? straight : null, gross, flags, notes,
  };
}

// The pay rows for a timesheet (timeclock.mjs `timesheet`): one per person, from their closed stretches.
export function payForTimesheet(ts, wages, opts = {}) {
  return ts.people.map((p) => {
    const w = wages.has(p.name) ? wages.get(p.name) : null;
    return { name: p.name, ...payWeek(p.rows.filter((r) => !r.open).map((r) => ({ a: r.a, b: r.b })), { ...opts, wage: w }) };
  });
}
