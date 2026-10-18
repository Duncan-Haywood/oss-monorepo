// Driving school car profit. Pure arithmetic over what an independent driving-school owner types in: three offers (a standard in-car lesson, a long block lesson,
// a road-test package) with a weekly booking count, price, car minutes and fuel-and-wear each, a late-cancellation rate, the office rent and the car one vehicle has to carry,
// a road-test car hire add-on, and the ways to run the car: the owner instructs, an employed instructor paid a share of each lesson, or a car leased weekly to an independent instructor.
// Tips are ignored on purpose: they belong to whoever earned them and are not school revenue.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const SERVICES = [
  { id: "lesson", label: "Standard in-car lesson" },
  { id: "block", label: "Long block lesson" },
  { id: "test", label: "Road-test package" },
];

const NUMERIC = [
  "lessonQty", "lessonPrice", "lessonMin", "lessonMat", "blockQty", "blockPrice", "blockMin", "blockMat", "testQty", "testPrice", "testMin", "testMat",
  "noShowPct", "carHoursPerWeek", "ownerRate", "instructorPayPct", "payrollPct", "carLeaseWeek",
  "officeRentPerMonth", "carCost", "carYears", "otherFixedMonth", "addonAttachPct", "addonPrice", "addonCost", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    lessonQty: f("lessonQty"), lessonPrice: f("lessonPrice", 65), lessonMin: f("lessonMin", 60), lessonMat: f("lessonMat", 6),
    blockQty: f("blockQty"), blockPrice: f("blockPrice", 120), blockMin: f("blockMin", 120), blockMat: f("blockMat", 11),
    testQty: f("testQty"), testPrice: f("testPrice", 150), testMin: f("testMin", 90), testMat: f("testMat", 9),
    noShowPct: f("noShowPct", 10), carHoursPerWeek: f("carHoursPerWeek", 36), ownerRate: f("ownerRate", 30),
    instructorPayPct: f("instructorPayPct", 40), payrollPct: f("payrollPct", 10), carLeaseWeek: f("carLeaseWeek", 450),
    officeRentPerMonth: f("officeRentPerMonth"), carCost: f("carCost"), carYears: f("carYears", 5), otherFixedMonth: f("otherFixedMonth"),
    addonAttachPct: f("addonAttachPct"), addonPrice: f("addonPrice", 75), addonCost: f("addonCost", 8), targetMarginPct: f("targetMarginPct", 35),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["lessonQty", "blockQty", "testQty"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number of appointments per week.` };
  if (v.lessonQty + v.blockQty + v.testQty < 1) return { error: "Enter how many lessons you book on this car in a typical week." };
  if (v.lessonQty + v.blockQty + v.testQty > 500) return { error: "That is far more than one car can book in a week: check the quantities." };
  if (v.noShowPct > 90) return { error: "No-show rate is a percent of booked appointments: keep it at or below 90." };
  if (v.instructorPayPct >= 100) return { error: "Instructor pay is a percent of the lesson price: keep it below 100." };
  if (v.addonAttachPct > 100) return { error: "Road-test car hire attach is the percent of completed lessons that also hire the car for the test: keep it at or below 100." };
  if (v.carYears < 0.5) return { error: "The car must be spread over at least half a year." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the price." };
  if (v.payrollPct > 50) return { error: "Payroll tax and extras on instructor pay is a percent of that pay: keep it at or below 50." };
  if (effPay(v) + v.targetMarginPct >= 100) return { error: "Instructor pay and target margin together must stay below 100 percent of the price, or no price can reach the target when an instructor is employed." };
  if (v.carHoursPerWeek <= 0 || v.carHoursPerWeek > 168) return { error: "Car hours per week must be above 0 and at most 168." };
  return { v };
}

const effPay = (v) => v.instructorPayPct * (1 + v.payrollPct / 100); // instructor pay plus the employer's payroll tax and extras, as a percent of the service price
const addonMargin = (v) => (v.addonAttachPct / 100) * (v.addonPrice - v.addonCost); // extra margin per completed service

export function fixedCosts(v) {
  const rent = (v.officeRentPerMonth * 12) / 52;
  const car = v.carCost / v.carYears / 52;
  const other = (v.otherFixedMonth * 12) / 52;
  return { rent: round2(rent), car: round2(car), other: round2(other), total: round2(rent + car + other), totalRaw: rent + car + other };
}

function totals(v, scale = 1) {
  const keep = 1 - v.noShowPct / 100;
  let booked = 0, completed = 0, serviceRevenue = 0, fuelWear = 0, bookedMinutes = 0, noShowRevenue = 0, noShowLoss = 0;
  const rm = addonMargin(v);
  for (const s of SERVICES) {
    const q = Math.round(v[s.id + "Qty"] * scale), price = v[s.id + "Price"], mat = v[s.id + "Mat"], min = v[s.id + "Min"];
    booked += q;
    completed += q * keep;
    serviceRevenue += q * keep * price;
    fuelWear += q * keep * mat;
    bookedMinutes += q * min;
    noShowRevenue += q * (1 - keep) * price;
    noShowLoss += q * (1 - keep) * (price - mat + rm);
  }
  const addon = completed * rm;
  const addonRevenue = completed * (v.addonAttachPct / 100) * v.addonPrice;
  return { booked, completed, serviceRevenue, fuelWear, bookedHours: bookedMinutes / 60, addon, addonRevenue, noShowRevenue, noShowLoss };
}

// One service with the owner standing at the car, and the same service with an employed instructor on instructor pay.
export function serviceLine(v, s) {
  const keep = 1 - v.noShowPct / 100;
  const price = v[s.id + "Price"], min = v[s.id + "Min"], mat = v[s.id + "Mat"], qty = v[s.id + "Qty"];
  const t = totals(v);
  const fixedShare = t.completed > 0 ? fixedCosts(v).totalRaw / t.completed : 0; // weekly fixed cost spread over completed services
  const labor = ((min / 60) * v.ownerRate) / keep; // the owner stands at the car for the whole slot, so no-shows load the cost onto the ones who come
  const cost = labor + mat + fixedShare;
  const profit = price - cost;
  const rm = addonMargin(v);
  const empCost = (effPay(v) / 100) * price + mat + fixedShare;
  return {
    id: s.id, label: s.label, qty, price, min, mat,
    labor: round2(labor), fixedShare: round2(fixedShare), cost: round2(cost), profit: round2(profit), marginPct: price > 0 ? round1((profit / price) * 100) : 0,
    addonPerLesson: round2(rm),
    perCarHour: min > 0 ? round2((keep * (price - mat + rm)) / (min / 60)) : 0, // expected take per booked car hour, before fixed cost and before anyone is paid
    targetPrice: round2(cost / (1 - v.targetMarginPct / 100)),
    employProfit: round2(price - empCost),
    employTargetPrice: round2((mat + fixedShare) / (1 - effPay(v) / 100 - v.targetMarginPct / 100)),
  };
}

// The same car run three ways, per week. "Net" is what the school keeps after fixed cost and before the owner draws anything for their own time.
export function carModes(v, scale = 1) {
  const t = totals(v, scale);
  const fixed = fixedCosts(v).totalRaw;
  const ownerNet = t.serviceRevenue - t.fuelWear + t.addon - fixed;
  const ownerPay = t.bookedHours * v.ownerRate;
  const employBeforeFixed = t.serviceRevenue * (1 - effPay(v) / 100) - t.fuelWear + t.addon;
  const employNet = employBeforeFixed - fixed;
  const rentNet = v.carLeaseWeek - fixed; // an independent instructor buys their own fuel and wear and keeps their own addon
  // Car lease at which leasing the car pays the same as employing an instructor on the current instructor pay, and the instructor pay at which employing pays the same as the current car lease.
  const equalRent = employBeforeFixed;
  const equalPay = t.serviceRevenue > 0 ? ((1 - (v.carLeaseWeek + t.fuelWear - t.addon) / t.serviceRevenue) * 100) / (1 + v.payrollPct / 100) : null;
  return {
    t, fixed,
    owner: { net: ownerNet, ownerPay, afterPay: ownerNet - ownerPay },
    employ: { net: employNet, pay: t.serviceRevenue * (effPay(v) / 100) },
    rent: { net: rentNet },
    equalRent, equalPay,
  };
}

// Completed services per week at which a car covers its fixed cost, at the current service mix.
export function breakEven(v) {
  const t = totals(v);
  if (t.completed <= 0) return { owner: null, employ: null };
  const keep = 1 - v.noShowPct / 100;
  const rm = addonMargin(v);
  const avgPrice = t.serviceRevenue / t.completed, avgMat = t.fuelWear / t.completed, avgBookedMin = (t.bookedHours * 60) / t.booked;
  const fixed = fixedCosts(v).totalRaw;
  const ownerContribution = avgPrice - avgMat + rm - ((avgBookedMin / 60) * v.ownerRate) / keep;
  const employContribution = avgPrice * (1 - effPay(v) / 100) - avgMat + rm;
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
  const m = carModes(v);
  const be = breakEven(v);
  const fixed = fixedCosts(v);
  const utilizationPct = round1((m.t.bookedHours / v.carHoursPerWeek) * 100);
  const season = {
    lines, fixed, booked: m.t.booked, completed: round1(m.t.completed), revenue: round2(m.t.serviceRevenue + m.t.addonRevenue), serviceRevenue: round2(m.t.serviceRevenue),
    addon: round2(m.t.addon), bookedHours: round1(m.t.bookedHours), utilizationPct,
    ownerNet: round2(m.owner.net), ownerAfterPay: round2(m.owner.afterPay), profitPerLesson: m.t.completed > 0 ? round2(m.owner.afterPay / m.t.completed) : 0,
    profitPerCarHour: round2(m.owner.net / v.carHoursPerWeek), profitPerCarHourAfterPay: round2(m.owner.afterPay / v.carHoursPerWeek),
    noShowCost: round2(m.t.noShowLoss), noShowRevenue: round2(m.t.noShowRevenue), noShowCostYear: round2(m.t.noShowLoss * 52),
    employNet: round2(m.employ.net), rentNet: round2(m.rent.net), equalRent: round2(m.equalRent), equalPay: m.equalPay === null ? null : round1(m.equalPay),
    breakEven: be,
  };
  const advice = [];
  advice.push(`Owner-instructed car, per week: ${season.booked} booked, ${season.completed} completed, ${usd(season.revenue)} of revenue including road-test car hire, ${usd(season.ownerNet)} after fuel and wear, office rent and car cost, and ${usd(season.ownerAfterPay)} after paying your own ${season.bookedHours} car hours at ${usd(v.ownerRate)}.`);
  advice.push(`That is ${usd(season.profitPerLesson)} per completed lesson after your own pay and fixed cost, and ${usd(season.profitPerCarHour)} per car hour before your pay (${usd(season.profitPerCarHourAfterPay)} after).`);
  const best = [...lines].sort((a, b) => b.perCarHour - a.perCarHour)[0];
  const worst = [...lines].sort((a, b) => a.perCarHour - b.perCarHour)[0];
  if (best.id !== worst.id) advice.push(`Per booked car hour, before fixed cost and your pay: ${lines.map((l) => `${l.label.toLowerCase()} ${usd(l.perCarHour)}`).join(", ")}. The ${best.label.toLowerCase()} fills the car best and the ${worst.label.toLowerCase()} worst.`);
  for (const l of lines.filter((x) => x.qty > 0)) {
    if (l.price < l.targetPrice) advice.push(`${l.label} at ${usd(l.price)} earns ${l.marginPct}% once your time, fuel and wear and its share of office rent and car cost are counted. For a ${v.targetMarginPct}% margin it would need ${usd(l.targetPrice)}.`);
  }
  if (v.noShowPct > 0) advice.push(`No-shows: ${v.noShowPct}% of ${season.booked} booked slots empties about ${round1(season.booked - m.t.completed)} slots a week and costs ${usd(season.noShowCost)} a week in lost margin (about ${usd(season.noShowCostYear)} a year). A deposit or a reminder text that halves them is worth about ${usd(season.noShowCostYear / 2)} a year.`);
  if (be.owner) advice.push(`Break-even for the car with you instructing: about ${be.owner.completed} completed services a week (${be.owner.booked} booked at your no-show rate), against ${season.completed} planned.${season.completed >= be.owner.completed ? "" : " You plan fewer than that."}`);
  else advice.push("With you instructing, each service earns less than your own hourly pay and fuelWear, so more bookings do not cover the rent. Raise a price first.");
  advice.push(`Same car, three ways, per week after office rent and car cost: you instructing ${usd(season.ownerNet)} (${usd(season.ownerAfterPay)} after your pay), an employed instructor at ${v.instructorPayPct}% of the lesson price plus ${v.payrollPct}% payroll extras ${usd(season.employNet)}, an independent instructor at ${usd(v.carLeaseWeek)} car lease ${usd(season.rentNet)}.`);
  if (m.equalPay !== null) {
    const matches = season.equalPay >= 0 && season.equalPay <= 100 ? `; equivalently, a ${usd(v.carLeaseWeek)} car lease matches an instructor pay of about ${season.equalPay}% of the lesson price on these bookings` : season.equalPay > 100 ? `; at these bookings no instructor pay share below 100% is worth as little as a ${usd(v.carLeaseWeek)} lease` : `; at these bookings even paying an instructor nothing nets less than a ${usd(v.carLeaseWeek)} lease`;
    advice.push(`Leasing out the car pays the same as employing an instructor at ${v.instructorPayPct}% when the car lease is ${usd(season.equalRent)} a week${matches}. ${v.carLeaseWeek >= m.equalRent ? "Leasing is the better deal at your car lease." : "Employing is the better deal at your car lease."} An employed instructor puts the bookings and the cancellations on you, an independent instructor carries them.`);
  }
  if (utilizationPct > 100) advice.push(`The bookings need ${season.bookedHours} car hours against ${v.carHoursPerWeek} available (${utilizationPct}%). One car cannot take that many appointments.`);
  else advice.push(`The bookings use ${season.bookedHours} of ${v.carHoursPerWeek} car hours (${utilizationPct}%). Empty hours still carry the rent, so the cheapest extra profit is usually filling them before raising prices.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = carModes(v, s);
    return {
      pct: Math.round(s * 100), booked: r.t.booked, hours: round1(r.t.bookedHours), utilizationPct: round1((r.t.bookedHours / v.carHoursPerWeek) * 100),
      owner: round2(r.owner.afterPay), employ: round2(r.employ.net), rent: round2(r.rent.net),
    };
  });
  return { error: null, input: v, season, table, advice };
}

export function sampleInput() {
  return {
    lessonQty: "20", lessonPrice: "65", lessonMin: "60", lessonMat: "6", blockQty: "4", blockPrice: "120", blockMin: "120", blockMat: "11", testQty: "3", testPrice: "150", testMin: "90", testMat: "9",
    noShowPct: "10", carHoursPerWeek: "36", ownerRate: "30", instructorPayPct: "40", payrollPct: "10", carLeaseWeek: "450",
    officeRentPerMonth: "400", carCost: "14000", carYears: "5", otherFixedMonth: "450", addonAttachPct: "10", addonPrice: "75", addonCost: "8", targetMarginPct: "35",
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
  const head = "volume_pct,booked_per_week,car_hours,utilization_pct,owner_instructs_after_pay,employ_instructor,lease_car";
  return [head, ...result.table.map((r) => [r.pct, r.booked, r.hours, r.utilizationPct, r.owner, r.employ, r.rent].join(","))].join("\n");
}
