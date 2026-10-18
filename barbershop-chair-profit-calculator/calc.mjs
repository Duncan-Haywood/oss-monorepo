// Barbershop chair profit. Pure arithmetic over what an independent barbershop owner types in: three services (haircut or fade, beard trim or line-up,
// premium combo) with a weekly booking count, price, chair minutes and supplies each, a no-show rate, the shop rent and equipment one chair has to carry,
// pomade-style retail attach, and the pay options for the chair: the owner cuts, an employed barber on commission, or a renter paying booth rent by the week.
// Tips are ignored on purpose: they belong to whoever earned them and are not shop revenue.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const SERVICES = [
  { id: "cut", label: "Haircut or fade" },
  { id: "beard", label: "Beard trim or line-up" },
  { id: "combo", label: "Premium combo (cut, beard, hot towel)" },
];

const NUMERIC = [
  "cutQty", "cutPrice", "cutMin", "cutMat", "beardQty", "beardPrice", "beardMin", "beardMat", "comboQty", "comboPrice", "comboMin", "comboMat",
  "noShowPct", "chairHoursPerWeek", "ownerRate", "commissionPct", "payrollPct", "boothRentWeek",
  "rentPerMonth", "equipmentCost", "equipmentYears", "otherFixedMonth", "retailAttachPct", "retailPrice", "retailCost", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    cutQty: f("cutQty"), cutPrice: f("cutPrice", 40), cutMin: f("cutMin", 40), cutMat: f("cutMat", 2.5),
    beardQty: f("beardQty"), beardPrice: f("beardPrice", 20), beardMin: f("beardMin", 20), beardMat: f("beardMat", 1.5),
    comboQty: f("comboQty"), comboPrice: f("comboPrice", 65), comboMin: f("comboMin", 60), comboMat: f("comboMat", 4.5),
    noShowPct: f("noShowPct", 8), chairHoursPerWeek: f("chairHoursPerWeek", 40), ownerRate: f("ownerRate", 25),
    commissionPct: f("commissionPct", 45), payrollPct: f("payrollPct", 8), boothRentWeek: f("boothRentWeek", 275),
    rentPerMonth: f("rentPerMonth"), equipmentCost: f("equipmentCost"), equipmentYears: f("equipmentYears", 6), otherFixedMonth: f("otherFixedMonth"),
    retailAttachPct: f("retailAttachPct"), retailPrice: f("retailPrice", 22), retailCost: f("retailCost", 10), targetMarginPct: f("targetMarginPct", 35),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["cutQty", "beardQty", "comboQty"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number of appointments per week.` };
  if (v.cutQty + v.beardQty + v.comboQty < 1) return { error: "Enter how many appointments you book on this chair in a typical week." };
  if (v.cutQty + v.beardQty + v.comboQty > 500) return { error: "That is far more than one chair can book in a week: check the quantities." };
  if (v.noShowPct > 90) return { error: "No-show rate is a percent of booked appointments: keep it at or below 90." };
  if (v.commissionPct >= 100) return { error: "Barber commission is a percent of the service price: keep it below 100." };
  if (v.retailAttachPct > 100) return { error: "Retail attach is the percent of completed services that also buy a product: keep it at or below 100." };
  if (v.equipmentYears < 0.5) return { error: "The equipment must be spread over at least half a year." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the price." };
  if (v.payrollPct > 50) return { error: "Payroll tax and extras on commission is a percent of the commission: keep it at or below 50." };
  if (effCommission(v) + v.targetMarginPct >= 100) return { error: "Commission and target margin together must stay below 100 percent of the price, or no price can reach the target when a barber is employed." };
  if (v.chairHoursPerWeek <= 0 || v.chairHoursPerWeek > 168) return { error: "Chair hours per week must be above 0 and at most 168." };
  return { v };
}

const effCommission = (v) => v.commissionPct * (1 + v.payrollPct / 100); // commission plus the employer's payroll tax and extras, as a percent of the service price
const retailMargin = (v) => (v.retailAttachPct / 100) * (v.retailPrice - v.retailCost); // extra margin per completed service

export function fixedCosts(v) {
  const rent = (v.rentPerMonth * 12) / 52;
  const equipment = v.equipmentCost / v.equipmentYears / 52;
  const other = (v.otherFixedMonth * 12) / 52;
  return { rent: round2(rent), equipment: round2(equipment), other: round2(other), total: round2(rent + equipment + other), totalRaw: rent + equipment + other };
}

function totals(v, scale = 1) {
  const keep = 1 - v.noShowPct / 100;
  let booked = 0, completed = 0, serviceRevenue = 0, supplies = 0, bookedMinutes = 0, noShowRevenue = 0, noShowLoss = 0;
  const rm = retailMargin(v);
  for (const s of SERVICES) {
    const q = Math.round(v[s.id + "Qty"] * scale), price = v[s.id + "Price"], mat = v[s.id + "Mat"], min = v[s.id + "Min"];
    booked += q;
    completed += q * keep;
    serviceRevenue += q * keep * price;
    supplies += q * keep * mat;
    bookedMinutes += q * min;
    noShowRevenue += q * (1 - keep) * price;
    noShowLoss += q * (1 - keep) * (price - mat + rm);
  }
  const retail = completed * rm;
  const retailRevenue = completed * (v.retailAttachPct / 100) * v.retailPrice;
  return { booked, completed, serviceRevenue, supplies, bookedHours: bookedMinutes / 60, retail, retailRevenue, noShowRevenue, noShowLoss };
}

// One service with the owner standing at the chair, and the same service with an employed barber on commission.
export function serviceLine(v, s) {
  const keep = 1 - v.noShowPct / 100;
  const price = v[s.id + "Price"], min = v[s.id + "Min"], mat = v[s.id + "Mat"], qty = v[s.id + "Qty"];
  const t = totals(v);
  const fixedShare = t.completed > 0 ? fixedCosts(v).totalRaw / t.completed : 0; // weekly fixed cost spread over completed services
  const labor = ((min / 60) * v.ownerRate) / keep; // the owner stands at the chair for the whole slot, so no-shows load the cost onto the ones who come
  const cost = labor + mat + fixedShare;
  const profit = price - cost;
  const rm = retailMargin(v);
  const empCost = (effCommission(v) / 100) * price + mat + fixedShare;
  return {
    id: s.id, label: s.label, qty, price, min, mat,
    labor: round2(labor), fixedShare: round2(fixedShare), cost: round2(cost), profit: round2(profit), marginPct: price > 0 ? round1((profit / price) * 100) : 0,
    retailPerCut: round2(rm),
    perChairHour: min > 0 ? round2((keep * (price - mat + rm)) / (min / 60)) : 0, // expected take per booked chair hour, before fixed cost and before anyone is paid
    targetPrice: round2(cost / (1 - v.targetMarginPct / 100)),
    employProfit: round2(price - empCost),
    employTargetPrice: round2((mat + fixedShare) / (1 - effCommission(v) / 100 - v.targetMarginPct / 100)),
  };
}

// The same chair run three ways, per week. "Net" is what the shop keeps after fixed cost and before the owner draws anything for their own time.
export function chairModes(v, scale = 1) {
  const t = totals(v, scale);
  const fixed = fixedCosts(v).totalRaw;
  const ownerNet = t.serviceRevenue - t.supplies + t.retail - fixed;
  const ownerPay = t.bookedHours * v.ownerRate;
  const employBeforeFixed = t.serviceRevenue * (1 - effCommission(v) / 100) - t.supplies + t.retail;
  const employNet = employBeforeFixed - fixed;
  const rentNet = v.boothRentWeek - fixed; // a renter buys their own supplies and keeps their own retail
  // Booth rent at which renting the chair pays the same as employing a barber on the current commission, and the commission at which employing pays the same as the current booth rent.
  const equalRent = employBeforeFixed;
  const equalCommission = t.serviceRevenue > 0 ? ((1 - (v.boothRentWeek + t.supplies - t.retail) / t.serviceRevenue) * 100) / (1 + v.payrollPct / 100) : null;
  return {
    t, fixed,
    owner: { net: ownerNet, ownerPay, afterPay: ownerNet - ownerPay },
    employ: { net: employNet, commission: t.serviceRevenue * (effCommission(v) / 100) },
    rent: { net: rentNet },
    equalRent, equalCommission,
  };
}

// Completed services per week at which a chair covers its fixed cost, at the current service mix.
export function breakEven(v) {
  const t = totals(v);
  if (t.completed <= 0) return { owner: null, employ: null };
  const keep = 1 - v.noShowPct / 100;
  const rm = retailMargin(v);
  const avgPrice = t.serviceRevenue / t.completed, avgMat = t.supplies / t.completed, avgBookedMin = (t.bookedHours * 60) / t.booked;
  const fixed = fixedCosts(v).totalRaw;
  const ownerContribution = avgPrice - avgMat + rm - ((avgBookedMin / 60) * v.ownerRate) / keep;
  const employContribution = avgPrice * (1 - effCommission(v) / 100) - avgMat + rm;
  const calc = (contribution) => (contribution > 0 ? { completed: round1(fixed / contribution), booked: round1(fixed / contribution / keep), contribution: round2(contribution) } : null);
  return { owner: calc(ownerContribution), employ: calc(employContribution) };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const lines = SERVICES.map((s) => serviceLine(v, s));
  const m = chairModes(v);
  const be = breakEven(v);
  const fixed = fixedCosts(v);
  const utilizationPct = round1((m.t.bookedHours / v.chairHoursPerWeek) * 100);
  const season = {
    lines, fixed, booked: m.t.booked, completed: round1(m.t.completed), revenue: round2(m.t.serviceRevenue + m.t.retailRevenue), serviceRevenue: round2(m.t.serviceRevenue),
    retail: round2(m.t.retail), bookedHours: round1(m.t.bookedHours), utilizationPct,
    ownerNet: round2(m.owner.net), ownerAfterPay: round2(m.owner.afterPay), profitPerCut: m.t.completed > 0 ? round2(m.owner.afterPay / m.t.completed) : 0,
    profitPerChairHour: round2(m.owner.net / v.chairHoursPerWeek), profitPerChairHourAfterPay: round2(m.owner.afterPay / v.chairHoursPerWeek),
    noShowCost: round2(m.t.noShowLoss), noShowRevenue: round2(m.t.noShowRevenue), noShowCostYear: round2(m.t.noShowLoss * 52),
    employNet: round2(m.employ.net), rentNet: round2(m.rent.net), equalRent: round2(m.equalRent), equalCommission: m.equalCommission === null ? null : round1(m.equalCommission),
    breakEven: be,
  };
  const advice = [];
  advice.push(`Owner-operated chair, per week: ${season.booked} booked, ${season.completed} completed, ${usd(season.revenue)} of revenue including retail, ${usd(season.ownerNet)} after supplies, rent and equipment, and ${usd(season.ownerAfterPay)} after paying your own ${season.bookedHours} chair hours at ${usd(v.ownerRate)}.`);
  advice.push(`That is ${usd(season.profitPerCut)} per completed cut after your own pay and fixed cost, and ${usd(season.profitPerChairHour)} per chair hour before your pay (${usd(season.profitPerChairHourAfterPay)} after).`);
  const best = [...lines].sort((a, b) => b.perChairHour - a.perChairHour)[0];
  const worst = [...lines].sort((a, b) => a.perChairHour - b.perChairHour)[0];
  if (best.id !== worst.id) advice.push(`Per booked chair hour, before fixed cost and your pay: ${lines.map((l) => `${l.label.toLowerCase()} ${usd(l.perChairHour)}`).join(", ")}. The ${best.label.toLowerCase()} fills the chair best and the ${worst.label.toLowerCase()} worst.`);
  for (const l of lines.filter((x) => x.qty > 0)) {
    if (l.price < l.targetPrice) advice.push(`${l.label} at ${usd(l.price)} earns ${l.marginPct}% once your time, supplies and its share of rent are counted. For a ${v.targetMarginPct}% margin it would need ${usd(l.targetPrice)}.`);
  }
  if (v.noShowPct > 0) advice.push(`No-shows: ${v.noShowPct}% of ${season.booked} booked slots empties about ${round1(season.booked - m.t.completed)} slots a week and costs ${usd(season.noShowCost)} a week in lost margin (about ${usd(season.noShowCostYear)} a year). A deposit or a reminder text that halves them is worth about ${usd(season.noShowCostYear / 2)} a year.`);
  if (be.owner) advice.push(`Break-even for the chair with you cutting: about ${be.owner.completed} completed services a week (${be.owner.booked} booked at your no-show rate), against ${season.completed} planned.${season.completed >= be.owner.completed ? "" : " You plan fewer than that."}`);
  else advice.push("With you cutting, each service earns less than your own hourly pay and supplies, so more bookings do not cover the rent. Raise a price first.");
  advice.push(`Same chair, three ways, per week after rent and equipment: you cutting ${usd(season.ownerNet)} (${usd(season.ownerAfterPay)} after your pay), an employed barber at ${v.commissionPct}% commission plus ${v.payrollPct}% payroll extras ${usd(season.employNet)}, a renter at ${usd(v.boothRentWeek)} booth rent ${usd(season.rentNet)}.`);
  if (m.equalCommission !== null) advice.push(`Renting out the chair pays the same as employing a barber at ${v.commissionPct}% when booth rent is ${usd(season.equalRent)} a week; equivalently, a ${usd(v.boothRentWeek)} booth rent matches a commission of about ${season.equalCommission}% on these bookings. ${v.boothRentWeek >= m.equalRent ? "Renting is the better deal at your booth rent." : "Employing is the better deal at your booth rent."} An employed barber puts the bookings and the no-shows on you, a renter puts them on the renter.`);
  if (utilizationPct > 100) advice.push(`The bookings need ${season.bookedHours} chair hours against ${v.chairHoursPerWeek} available (${utilizationPct}%). One chair cannot take that many appointments.`);
  else advice.push(`The bookings use ${season.bookedHours} of ${v.chairHoursPerWeek} chair hours (${utilizationPct}%). Empty hours still carry the rent, so the cheapest extra profit is usually filling them before raising prices.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = chairModes(v, s);
    return {
      pct: Math.round(s * 100), booked: r.t.booked, hours: round1(r.t.bookedHours), utilizationPct: round1((r.t.bookedHours / v.chairHoursPerWeek) * 100),
      owner: round2(r.owner.afterPay), employ: round2(r.employ.net), rent: round2(r.rent.net),
    };
  });
  return { error: null, input: v, season, table, advice };
}

export function sampleInput() {
  return {
    cutQty: "30", cutPrice: "40", cutMin: "40", cutMat: "2.5", beardQty: "8", beardPrice: "20", beardMin: "20", beardMat: "1.5", comboQty: "10", comboPrice: "65", comboMin: "60", comboMat: "4.5",
    noShowPct: "8", chairHoursPerWeek: "40", ownerRate: "25", commissionPct: "45", payrollPct: "8", boothRentWeek: "275",
    rentPerMonth: "650", equipmentCost: "1800", equipmentYears: "6", otherFixedMonth: "120", retailAttachPct: "15", retailPrice: "22", retailCost: "10", targetMarginPct: "35",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...NUMERIC];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "volume_pct,booked_per_week,chair_hours,utilization_pct,owner_cuts_after_pay,employ_barber,rent_chair";
  return [head, ...result.table.map((r) => [r.pct, r.booked, r.hours, r.utilizationPct, r.owner, r.employ, r.rent].join(","))].join("\n");
}
