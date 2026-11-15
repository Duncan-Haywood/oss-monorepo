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

export const PAY_RULES = ["federal", "california", "alaska", "colorado"];
export const ROUND_STEPS = [0, 5, 6, 15];
export const PERIOD_GAP_MIN = 120; // a gap of 2 h or more starts a new work period (a split shift); shorter is a break

export function readPayEnv(env = {}) {
  const raw = String(env.PAY_RULES || "federal").trim().toLowerCase();
  const rules = PAY_RULES.includes(raw) ? raw : "federal";
  const notes = [];
  if (raw && raw !== rules) notes.push(`PAY_RULES "${raw}" is not one of ${PAY_RULES.join(", ")}; using federal.`);
  let roundMin = Number(env.PUNCH_ROUND_MIN || 0);
  if (!ROUND_STEPS.includes(roundMin)) { notes.push(`PUNCH_ROUND_MIN must be 0, 5, 6 or 15; not rounding.`); roundMin = 0; }
  if (roundMin && rules === "california") { notes.push("Punches are not rounded under the California rules (meal-period punches may not be rounded: Donohue v. AMN Services, 2021)."); roundMin = 0; }
  return { rules, roundMin, notes };
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

// One person's week. `stretches` are closed clocked stretches [{ a, b, rate? }] in week minutes; `wage` is the hourly
// rate for a stretch with none. Returns hours by pay class, the regular rate, an estimated gross and the flags.
export function payWeek(stretches, { rules = "federal", roundMin = 0, wage = null } = {}) {
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
