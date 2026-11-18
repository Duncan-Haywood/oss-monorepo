/**
 * Launch cash-flow planner for a small clothing line: how much money is out
 * of your account, and for how long, between paying the factory's deposit and
 * the stock selling through.
 *
 * Weekly model (an assumption, not your data). Week 0 is the day the order
 * is placed:
 *  - week 0: factory deposit (a share of the factory price) goes out; units
 *    sold as pre-orders are paid in (net of fees and VAT, as typed);
 *  - production weeks later: the factory balance and freight go out;
 *  - on arrival (production + freight weeks): duty and other landing costs go
 *    out and selling starts at a steady weekly rate until the stock is gone;
 *  - each sale lands `payoutWeeks` later, less a returns share.
 * It shows the lowest point of the account, the funding you need to cover it,
 * the week the money is back, and the same line with sales at half the rate,
 * because a new brand usually sells slower than hoped.
 */
const round2 = v => Math.round(v * 100) / 100;

const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

function run(p, rateScale) {
  const weeks = [];
  const arrive = p.productionWeeks + p.freightWeeks;
  const rate = p.weeklySales * rateScale;
  const open = p.units - p.preorders;
  const inflow = new Map();
  const add = (w, v) => inflow.set(w, (inflow.get(w) ?? 0) + v);
  add(p.payoutWeeks, p.preorders * p.netPerUnit);
  let sold = 0, sellOutWeek = null, w = arrive;
  while (sold < open && w <= 520) {
    const q = Math.min(rate, open - sold);
    sold += q;
    add(w + p.payoutWeeks, q * p.netPerUnit * (1 - p.returnsPct / 100));
    if (sold >= open - 1e-9) sellOutWeek = w;
    w += 1;
  }
  const factory = p.units * p.factoryPerUnit;
  const outflow = new Map();
  const spend = (wk, v) => outflow.set(wk, (outflow.get(wk) ?? 0) + v);
  spend(0, factory * p.depositPct / 100);
  spend(p.productionWeeks, factory * (1 - p.depositPct / 100) + p.freight);
  spend(arrive, (factory + p.freight) * p.dutyPct / 100 + p.units * p.otherPerUnit);
  const last = Math.max(w + p.payoutWeeks, arrive, ...inflow.keys(), ...outflow.keys());
  let bal = p.openingCash, min = bal, minWeek = 0, payback = null, cum = 0, peakOut = 0;
  for (let k = 0; k <= last; k++) {
    const i = inflow.get(k) ?? 0, o = outflow.get(k) ?? 0;
    bal += i - o; cum += i - o;
    peakOut = Math.min(peakOut, cum);
    if (bal < min) { min = bal; minWeek = k; }
    if (payback === null && k >= arrive && cum >= 0) payback = k;
    weeks.push({ week: k, in: round2(i), out: round2(o), balance: round2(bal) });
  }
  return { weeks, lowest: round2(min), lowestWeek: minWeek, peakOutlay: round2(-peakOut), paybackWeek: payback, sellOutWeek, profit: round2(cum), unsold: round2(Math.max(0, open - sold)) };
}

/**
 * @param {{units:number, factoryPerUnit:number, depositPct?:number, productionWeeks:number, freightWeeks:number, freight?:number,
 *   dutyPct?:number, otherPerUnit?:number, netPerUnit:number, preorders?:number, weeklySales:number, returnsPct?:number,
 *   payoutWeeks?:number, openingCash?:number}} o
 */
export function launchCash(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the order size, factory price, timings and what you net per piece." };
  try {
    const p = {
      units: num(o.units, "Pieces ordered", 1, 1e6),
      factoryPerUnit: num(o.factoryPerUnit, "Factory price per piece", 0, 1e5),
      depositPct: num(o.depositPct ?? 30, "Deposit %", 0, 100),
      productionWeeks: Math.round(num(o.productionWeeks, "Production weeks", 0, 52)),
      freightWeeks: Math.round(num(o.freightWeeks, "Freight weeks", 0, 26)),
      freight: num(o.freight ?? 0, "Freight cost", 0, 1e8),
      dutyPct: num(o.dutyPct ?? 0, "Duty %", 0, 100),
      otherPerUnit: num(o.otherPerUnit ?? 0, "Other landing cost per piece", 0, 1e5),
      netPerUnit: num(o.netPerUnit, "Money you keep per piece sold (after VAT and fees)", 0, 1e6),
      preorders: num(o.preorders ?? 0, "Pre-orders", 0, 1e6),
      weeklySales: num(o.weeklySales, "Sold per week", 0.01, 1e6),
      returnsPct: num(o.returnsPct ?? 0, "Returns %", 0, 100),
      payoutWeeks: Math.round(num(o.payoutWeeks ?? 0, "Payout delay (weeks)", 0, 12)),
      openingCash: num(o.openingCash ?? 0, "Cash in the account now", -1e9, 1e9),
    };
    if (p.preorders > p.units) throw new Error("Pre-orders cannot be more than the pieces ordered.");
    const base = run(p, 1), slow = run(p, 0.5);
    const notes = [];
    if (base.lowest < 0) notes.push(`The account goes ${Math.abs(base.lowest)} below zero in week ${base.lowestWeek}: you need that much extra cash (a loan, savings, more pre-orders or a smaller deposit) or a smaller first order.`);
    else notes.push(`Cash stays at or above ${base.lowest} (lowest in week ${base.lowestWeek}).`);
    if (base.paybackWeek === null) notes.push("The order does not earn back its cost at these numbers.");
    if (slow.paybackWeek === null || slow.paybackWeek - (base.paybackWeek ?? 0) > 12) notes.push(`If it sells at half the rate, the money is back ${slow.paybackWeek === null ? "never inside ten years" : "in week " + slow.paybackWeek}, not ${base.paybackWeek === null ? "at all" : "week " + base.paybackWeek}: plan the cash for the slow case.`);
    if (p.depositPct >= 50) notes.push("A deposit of half or more is common with small factories, but ask for 30% and the balance against a photo of the finished goods before shipping.");
    if (p.netPerUnit * (1 - p.returnsPct / 100) < p.factoryPerUnit) notes.push("You keep less per piece than the factory charges before duty and freight: no sell-through rate pays this back.");
    notes.push("Duty, VAT on import and freight are often due in cash before the goods are released; check the real invoice dates with your forwarder.");
    return { ok: true, arrivalWeek: p.productionWeeks + p.freightWeeks, factoryTotal: round2(p.units * p.factoryPerUnit), deposit: round2(p.units * p.factoryPerUnit * p.depositPct / 100), base, slow, notes };
  } catch (e) {
    return { error: e.message };
  }
}
