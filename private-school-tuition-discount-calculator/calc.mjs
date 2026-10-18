// Net tuition revenue for an independent school. A school's sticker price is
// not what it collects: financial aid is a discount, and the discount rate
// (aid / gross tuition) is the number boards watch. This engine takes the
// sticker price, the students in each aid band with the average award, and the
// school's costs, and answers what a business office actually has to decide:
//   - what is net tuition revenue and the discount rate?
//   - is one more student at a given award worth more than an empty seat?
//   - how many students does the school need to cover its fixed costs?
//   - what does a sticker increase really add, if aid is held in dollars or
//     grows with tuition, and a few families leave over the price?
//   - what increase closes a budget gap?

export const MAX_BANDS = 8;
export const SCENARIO_PCTS = [0, 2, 4, 6, 8];

export function validateInput(i) {
  const e = [];
  const pos = (v) => Number.isFinite(v) && v > 0;
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  if (!pos(i.sticker) || i.sticker > 1e6) e.push("Enter the sticker tuition per student as a number above zero.");
  if (!nonneg(i.fixedCosts)) e.push("Fixed costs must be zero or more.");
  if (!nonneg(i.variableCost)) e.push("Cost per additional student must be zero or more.");
  if (!(Number.isFinite(i.capacity) && i.capacity >= 1)) e.push("Enter the seats the school can hold, at least 1.");
  if (!(nonneg(i.lossPer1Pct) && i.lossPer1Pct <= 10)) e.push("Students lost per 1% increase must be between 0 and 10 percent.");
  if (!Number.isFinite(i.targetSurplus)) e.push("Target surplus must be a number (zero or negative is fine).");
  if (!Array.isArray(i.bands) || i.bands.length < 1) e.push("Add at least one student group.");
  else if (i.bands.length > MAX_BANDS) e.push(`This tool takes up to ${MAX_BANDS} student groups.`);
  else {
    let total = 0;
    i.bands.forEach((b, k) => {
      if (!(Number.isFinite(b.students) && b.students >= 0)) e.push(`Group ${k + 1}: students must be zero or more.`);
      else total += b.students;
      if (!nonneg(b.aid)) e.push(`Group ${k + 1}: the average award must be zero or more.`);
      else if (pos(i.sticker) && b.aid > i.sticker) e.push(`Group ${k + 1}: the average award cannot be more than the sticker price.`);
    });
    if (e.length === 0 && total <= 0) e.push("Enter at least one student.");
    if (e.length === 0 && total > i.capacity) e.push("You enrol more students than the school has seats; raise the seat count or lower a group.");
  }
  return e;
}

function totals(sticker, bands, factor, aidScale) {
  let students = 0, gross = 0, aid = 0;
  for (const b of bands) {
    const n = b.students * factor;
    students += n;
    gross += n * sticker;
    aid += n * Math.min(sticker, b.aid * aidScale);
  }
  return { students, gross, aid, net: gross - aid };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const base = totals(i.sticker, i.bands, 1, 1);
  const N = base.students;
  const discountRate = base.aid / base.gross;
  const netPerStudent = base.net / N;
  const variable = N * i.variableCost;
  const contribution = base.net - variable;
  const surplus = contribution - i.fixedCosts;

  const groups = i.bands.map((b, k) => ({
    index: k + 1, label: b.label || `Group ${k + 1}`, students: b.students, aid: b.aid,
    aidPct: b.aid / i.sticker, net: i.sticker - b.aid, contribution: i.sticker - b.aid - i.variableCost,
    shareOfAid: base.aid > 0 ? (b.students * b.aid) / base.aid : 0,
    shareOfStudents: b.students / N,
  }));
  const fullPay = i.bands.filter((b) => b.aid === 0).reduce((s, b) => s + b.students, 0);

  // Students needed to cover fixed costs if the aid mix stays the same.
  const unitContribution = netPerStudent - i.variableCost;
  const breakEvenStudents = unitContribution > 0 ? i.fixedCosts / unitContribution : null;

  // Largest award at which one more student still adds money.
  const maxProfitableAward = i.sticker - i.variableCost;
  const emptySeats = i.capacity - N;

  const scenarios = [];
  for (const pct of SCENARIO_PCTS) {
    const sticker = i.sticker * (1 + pct / 100);
    const factor = Math.max(0, 1 - (i.lossPer1Pct * pct) / 100);
    for (const policy of ["hold", "scale"]) {
      const t = totals(sticker, i.bands, factor, policy === "scale" ? 1 + pct / 100 : 1);
      const sur = t.net - t.students * i.variableCost - i.fixedCosts;
      scenarios.push({
        pct, policy, sticker, students: t.students, lost: N - t.students, gross: t.gross, aid: t.aid, net: t.net,
        discountRate: t.gross > 0 ? t.aid / t.gross : 0, surplus: sur, change: sur - surplus,
      });
    }
  }
  // Increase needed to hit the target surplus: aid held in dollars, nobody leaves.
  // Each student's net rises by sticker * p, so p = gap / gross at the current price.
  const gap = i.targetSurplus - surplus;
  const neededPctHold = gap <= 0 ? 0 : (gap / base.gross) * 100;

  return {
    ok: true, input: i, students: N, gross: base.gross, aid: base.aid, net: base.net, discountRate, netPerStudent,
    variableCost: variable, contribution, surplus, fullPay, fullPayShare: fullPay / N, equivalentFullPay: base.net / i.sticker,
    groups, breakEvenStudents, breakEvenSharePct: breakEvenStudents === null ? null : (breakEvenStudents / i.capacity) * 100,
    maxProfitableAward, emptySeats, scenarios, gap, neededPctHold, notes: buildNotes(i, base, { discountRate, surplus, breakEvenStudents, emptySeats, N, neededPctHold }),
  };
}

function buildNotes(i, base, r) {
  const n = [];
  if (r.surplus < i.targetSurplus) n.push(`Tuition after aid falls ${money(i.targetSurplus - r.surplus)} short of your target. Holding aid in dollars and keeping every family, the sticker price would have to rise about ${r.neededPctHold.toFixed(1)}%.`);
  else n.push(`Tuition after aid meets your target by ${money(r.surplus - i.targetSurplus)}.`);
  if (r.breakEvenStudents === null) n.push("Each additional student costs more than they pay at this aid mix, so enrolment alone cannot cover fixed costs.");
  else if (r.breakEvenStudents > i.capacity) n.push("Even full, the school would not cover its fixed costs at this aid mix.");
  if (r.emptySeats > 0.5) n.push(`${Math.round(r.emptySeats)} seats are empty. A student with an award up to ${money(i.sticker - i.variableCost)} still adds money, because fixed costs are paid whether the seat is filled or not.`);
  if (r.discountRate > 0.4) n.push("A discount rate this high is worth a second look at who is receiving aid and how much.");
  return n;
}

export function money(x) {
  const r = Math.round(x);
  const s = Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (r < 0 ? "-$" : "$") + s;
}
export const pctText = (x, d = 1) => (x * 100).toFixed(d) + "%";

export function sampleInput() {
  return {
    sticker: 24000, fixedCosts: 4300000, variableCost: 2500, capacity: 320, lossPer1Pct: 0.2, targetSurplus: 150000,
    bands: [
      { label: "Full pay", students: 130, aid: 0 },
      { label: "Light aid", students: 60, aid: 6000 },
      { label: "Moderate aid", students: 50, aid: 12000 },
      { label: "Heavy aid", students: 40, aid: 18000 },
      { label: "Near-full aid", students: 20, aid: 22000 },
    ],
  };
}

export function resultText(r) {
  const L = [
    `Net tuition: ${r.students} students at ${money(r.input.sticker)} sticker`,
    `Gross ${money(r.gross)}, aid ${money(r.aid)}, net ${money(r.net)}; discount rate ${pctText(r.discountRate)}; net per student ${money(r.netPerStudent)}`,
    `After per-student costs and ${money(r.input.fixedCosts)} fixed costs: ${money(r.surplus)}`,
    r.breakEvenStudents === null ? "Break-even enrolment: not reachable at this aid mix" : `Break-even enrolment at this mix: ${Math.ceil(r.breakEvenStudents)} students`,
  ];
  for (const s of r.scenarios.filter((x) => x.pct > 0)) L.push(`Sticker +${s.pct}% (aid ${s.policy === "hold" ? "held" : "scaled"}): ${money(s.surplus)} (${s.change >= 0 ? "+" : ""}${money(s.change)}), discount ${pctText(s.discountRate)}`);
  L.push("Arithmetic on the numbers entered, not financial advice.");
  return L.join("\n");
}

export function resultCsv(r) {
  const f = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : `"${String(v).replace(/"/g, '""')}"`);
  const out = ["group,students,avg_award,award_pct_of_sticker,net_per_student,contribution_per_student"];
  for (const g of r.groups) out.push([g.label, g.students, g.aid, g.aidPct, g.net, g.contribution].map(f).join(","));
  out.push("", "sticker_increase_pct,aid_policy,students,gross,aid,net,discount_rate,surplus,change_vs_today");
  for (const s of r.scenarios) out.push([s.pct, s.policy, s.students, s.gross, s.aid, s.net, s.discountRate, s.surplus, s.change].map(f).join(","));
  return out.join("\n");
}

export function serializeState(input) { return JSON.stringify({ app: "private-school-tuition-discount-calculator", version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "private-school-tuition-discount-calculator" || !d.input) return { error: "That file is not a saved tuition scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
