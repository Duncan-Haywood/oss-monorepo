// Kids' birthday party package profit check. A trampoline park, bounce gym, play cafe or
// family entertainment center sells a party package for a set number of children, but the
// party costs more than the food: two or three host hours including setup and cleanup, per-child
// food and goodie costs, supplies, card fees, the open-play revenue the room or floor would
// have earned during the party, and a share of the yearly rent, insurance and utilities.
// This reports true profit per party, margin, profit per room hour, price per child, the
// lowest package price that earns a target margin, and break-even parties a year. A second
// mode compares two packages (for example a basic and a deluxe).
//
//   roomHours   = partyHours + setupHours
//   labor       = hosts * roomHours * wage * (1 + burden)
//   food, goods = kids * foodPerKid, kids * goodsPerKid
//   displaced   = partyHours * displacedPerHour          (open-play margin given up)
//   fixedShare  = annualFixed / partiesPerYear
//   costs       = labor + food + goods + supplies + processing + displaced + fixedShare
//   processing  = processPct * price
//   profit      = price - costs
//   minPrice    = (costs - processing) / (1 - processPct - targetMargin)   (exact)

export const JOB_KEYS = ["price", "kids", "partyHours", "setupHours", "hosts", "foodPerKid", "goodsPerKid"];

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!pos(i.price, 50000)) e.push("Package price must be above $0 and at most $50,000.");
  if (!(Number.isFinite(i.kids) && i.kids >= 1 && i.kids <= 500)) e.push("Children in the package must be between 1 and 500.");
  if (!pos(i.partyHours, 24)) e.push("Party length in hours must be above 0 and at most 24.");
  if (!nonneg(i.setupHours, 24)) e.push("Setup and cleanup hours must be between 0 and 24.");
  if (!(Number.isFinite(i.hosts) && i.hosts >= 0 && i.hosts <= 50)) e.push("Party hosts must be between 0 and 50.");
  if (!pos(i.wage, 500)) e.push("Host hourly pay must be above $0 and at most $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!nonneg(i.foodPerKid, 500)) e.push("Food and drink per child must be between $0 and $500.");
  if (!nonneg(i.goodsPerKid, 500)) e.push("Goodie bag, socks or favors per child must be between $0 and $500.");
  if (!nonneg(i.supplies, 10000)) e.push("Party supplies per party must be between $0 and $10,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card fees must be between 0% and 15%.");
  if (!nonneg(i.displacedPerHour, 10000)) e.push("Open-play margin given up per party hour must be between $0 and $10,000.");
  if (!nonneg(i.annualFixed, 5000000)) e.push("Yearly rent, insurance and utilities must be between $0 and $5,000,000.");
  if (!(Number.isFinite(i.partiesPerYear) && i.partiesPerYear >= 1 && i.partiesPerYear <= 20000)) e.push("Parties per year must be between 1 and 20,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (e.length === 0 && i.processPct + i.targetMargin >= 100) e.push("Card fees plus target margin must be under 100%.");
  return e;
}

function figures(i) {
  const p = i.processPct / 100;
  const m = i.targetMargin / 100;
  const revenue = i.price;
  const roomHours = i.partyHours + i.setupHours;
  const labor = i.hosts * roomHours * i.wage * (1 + i.burdenPct / 100);
  const food = i.kids * i.foodPerKid;
  const goods = i.kids * i.goodsPerKid;
  const processing = p * revenue;
  const displaced = i.partyHours * i.displacedPerHour;
  const fixedShare = i.annualFixed / i.partiesPerYear;
  const costs = labor + food + goods + i.supplies + processing + displaced + fixedShare;
  const profit = revenue - costs;
  const margin = profit / revenue;
  const minPrice = (costs - processing) / (1 - p - m);
  const contribution = revenue - (costs - fixedShare);
  const breakevenParties = contribution > 0 ? i.annualFixed / contribution : null;
  return {
    revenue, roomHours, labor, food, goods, supplies: i.supplies, processing, displaced, fixedShare, costs,
    profit, margin, profitPerRoomHour: profit / roomHours, pricePerKid: revenue / i.kids, costPerKid: costs / i.kids,
    minPrice, minPricePerKid: minPrice / i.kids, minGap: revenue - minPrice, meets: margin >= m - 1e-12,
    contribution, breakevenParties, annualProfit: profit * i.partiesPerYear,
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const f = figures(input);
  return { ok: true, input, ...f, notes: buildNotes(input, f) };
}

function buildNotes(i, f) {
  const n = [];
  if (f.profit < 0) n.push(`This party loses ${cents(-f.profit)}. At ${cents(f.revenue)} it does not cover hosts, food and the share of rent it uses.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. The package needs to be priced at ${cents(f.minPrice)}, which is ${cents(-f.minGap)} more.`);
  if (i.setupHours > 0 && f.roomHours > 0) n.push(`Setup and cleanup are ${((i.setupHours / f.roomHours) * 100).toFixed(0)}% of the room time and hosts are paid for it, but nobody is billed for it.`);
  if (f.displaced > 0) n.push(`Open-play margin given up during the party is ${cents(f.displaced)}, ${((f.displaced / f.costs) * 100).toFixed(0)}% of this party's cost.`);
  if (f.breakevenParties === null) n.push("Each party earns nothing above its direct costs, so the yearly rent and insurance are never covered at this price.");
  return n;
}

export function compareJobs(input, altOverrides) {
  const a = solve(input);
  if (!a.ok) return { ok: false, errors: a.errors };
  const alt = { ...input };
  for (const k of JOB_KEYS) if (altOverrides && altOverrides[k] !== undefined) alt[k] = altOverrides[k];
  const b = solve(alt);
  if (!b.ok) return { ok: false, errors: b.errors.map((x) => `Package B: ${x}`) };
  const pick = (x, y) => (y > x + 0.005 ? "B" : x > y + 0.005 ? "A" : "tie");
  const byJob = pick(a.profit, b.profit);
  const byHour = pick(a.profitPerRoomHour, b.profitPerRoomHour);
  const notes = [];
  if (byJob === "tie") notes.push("The two packages make the same profit per party.");
  else {
    const w = byJob === "A" ? a : b;
    const l = byJob === "A" ? b : a;
    notes.push(`Package ${byJob} makes ${money(w.profit - l.profit)} more per party (${money(w.profit)} against ${money(l.profit)}).`);
  }
  if (byHour !== byJob && byHour !== "tie" && byJob !== "tie") notes.push(`Package ${byHour} earns more per room hour. If Saturday slots are the limit, Package ${byHour} fills the room better even though Package ${byJob} makes more by itself.`);
  return { ok: true, a, b, winnerJob: byJob, winnerHour: byHour, profitDifference: b.profit - a.profit, notes };
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    price: 449, kids: 12, partyHours: 2, setupHours: 1, hosts: 2, wage: 16, burdenPct: 10,
    foodPerKid: 4.5, goodsPerKid: 1.5, supplies: 18, processPct: 3, displacedPerHour: 30,
    annualFixed: 60000, partiesPerYear: 420, targetMargin: 25,
  };
}

export function sampleJob() {
  return { price: 319, kids: 8, partyHours: 1.25, setupHours: 1, hosts: 1, foodPerKid: 3.5, goodsPerKid: 1 };
}

export function resultText(r) {
  const lines = [
    `Party package profit check: price ${cents(r.input.price)} for ${r.input.kids} children, ${r.roomHours} room hours`,
    `Costs ${cents(r.costs)} (hosts ${cents(r.labor)}, food ${cents(r.food)}, goodies ${cents(r.goods)}, open play given up ${cents(r.displaced)})`,
    `True profit ${cents(r.profit)} per party, margin ${pct(r.margin)}, ${cents(r.profitPerRoomHour)} per room hour`,
    `Lowest package price for a ${r.input.targetMargin}% margin: ${cents(r.minPrice)} (${cents(r.minPricePerKid)} per child)`,
    `Break-even parties a year: ${r.breakevenParties === null ? "n/a" : r.breakevenParties.toFixed(0)}; profit at ${r.input.partiesPerYear} parties: ${money(r.annualProfit)} a year`,
    "Arithmetic on the numbers entered, not tax, legal, insurance or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["revenue", r.revenue], ["room_hours", r.roomHours], ["host_pay", r.labor], ["food", r.food], ["goodies", r.goods], ["supplies", r.supplies],
    ["card_fees", r.processing], ["open_play_given_up", r.displaced], ["yearly_overhead_share", r.fixedShare], ["total_costs", r.costs],
    ["profit_per_party", r.profit], ["margin", r.margin], ["profit_per_room_hour", r.profitPerRoomHour],
    ["minimum_price", r.minPrice], ["minimum_price_per_child", r.minPricePerKid],
    ["breakeven_parties_per_year", r.breakevenParties === null ? "" : r.breakevenParties], ["annual_profit", r.annualProfit],
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "kids-birthday-party-package-profit-calculator";
export function serializeState(input, job) { return JSON.stringify({ app: APP, version: 1, input, job: job || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved party scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, job: d.job && typeof d.job === "object" ? d.job : null };
}
