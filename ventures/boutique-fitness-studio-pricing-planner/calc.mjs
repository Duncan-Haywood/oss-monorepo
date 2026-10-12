// Boutique fitness studio pricing planner: pure functions, no dependencies, nothing leaves the browser.
// Three ways to buy a class (an unlimited membership, a class pack, a drop-in) share one timetable. A seat is nearly free
// until the room is full, so the useful questions are what each plan really earns per visit, how full the room is,
// how many members the studio needs to cover instructors and rent, and what the unlimited price should be.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  classesPerWeek: 30, capacity: 14, instructorPay: 55,
  rentMonth: 6200, otherFixedMonth: 1800, marketingMonth: 900, feePct: 3,
  unlMembers: 95, unlPrice: 159, unlVisits: 9,
  packsSold: 40, packPrice: 190, packSize: 10, packBreakagePct: 12,
  dropIns: 160, dropPrice: 26,
  priceSensitivity: 0.9,
};

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const pct = (p) => Math.min(100, safe(p)) / 100;
const WEEKS_PER_MONTH = 52 / 12;

// One month at the numbers typed. The unlimited fee is paid whether or not a seat is free, so a full room never reduces
// it (members turned away would eventually leave; that is not modelled). Pack and drop-in revenue are scaled by the
// share of wanted visits the room could seat.
export function studio(o, over = {}) {
  const p = { ...o, ...over };
  const classes = safe(p.classesPerWeek) * WEEKS_PER_MONTH;
  const seats = classes * safe(p.capacity);
  const unlVisits = safe(p.unlMembers) * safe(p.unlVisits);
  const packVisits = safe(p.packsSold) * safe(p.packSize) * (1 - pct(p.packBreakagePct));
  const dropVisits = safe(p.dropIns);
  const wanted = unlVisits + packVisits + dropVisits;
  const seated = seats > 0 ? Math.min(wanted, seats) : 0;
  const f = wanted > 0 ? seated / wanted : 1;
  const unlRev = safe(p.unlMembers) * safe(p.unlPrice);
  const packRev = safe(p.packsSold) * safe(p.packPrice) * f;
  const dropRev = dropVisits * safe(p.dropPrice) * f;
  const revenue = unlRev + packRev + dropRev;
  const fees = revenue * pct(p.feePct);
  const instructors = classes * safe(p.instructorPay);
  const fixed = safe(p.rentMonth) + safe(p.otherFixedMonth) + safe(p.marketingMonth);
  const profit = revenue - fees - instructors - fixed;
  const avgClass = classes > 0 ? seated / classes : 0;
  const netPerVisit = seated > 0 ? (revenue - fees) / seated : 0;
  const costPerClass = classes > 0 ? (instructors + fixed) / classes : 0;
  return {
    classes, seats, wanted, seated, turnedAway: Math.max(0, wanted - seats), fillRate: seats > 0 ? seated / seats : 0,
    unlRev, packRev, dropRev, revenue, fees, instructors, fixed, profit, avgClass, netPerVisit, costPerClass,
    breakEvenClassSize: netPerVisit > 0 ? costPerClass / (netPerVisit) : Infinity,
    emptySeats: Math.max(0, seats - seated),
  };
}

// What one visit is worth to the studio under each plan, at the usage typed in. Pack breakage is the pack's quiet
// margin: ten classes sold, fewer taken.
export function perVisit(o) {
  const fee = 1 - pct(o.feePct);
  const unl = safe(o.unlVisits) > 0 ? (safe(o.unlPrice) / safe(o.unlVisits)) * fee : NaN;
  const used = safe(o.packSize) * (1 - pct(o.packBreakagePct));
  const pack = used > 0 ? (safe(o.packPrice) / used) * fee : NaN;
  const drop = safe(o.dropPrice) * fee;
  return { unlimited: unl, pack, dropIn: drop, packSticker: safe(o.packSize) > 0 ? safe(o.packPrice) / safe(o.packSize) : NaN };
}

// The member's side of the same arithmetic: the cheapest way to buy a given number of classes a month. The crossovers are
// the visit counts at which unlimited beats the other two, which is how the plans should be explained on the pricing page.
export function memberChoices(o, visitsList = [2, 4, 6, 8, 10, 12, 16]) {
  const pack = safe(o.packSize) > 0 ? safe(o.packPrice) / safe(o.packSize) : Infinity;
  const rows = visitsList.map((v) => {
    const unl = safe(o.unlPrice);
    // A pack's classes carry over, so a member who uses them all pays the sticker rate per class.
    const packCost = v * pack;
    const dropCost = v * safe(o.dropPrice);
    const best = Math.min(unl, packCost, dropCost);
    const name = best === unl ? "Unlimited" : best === packCost ? "Class pack" : "Drop-in";
    return { visits: v, unlimited: unl, pack: packCost, dropIn: dropCost, best: name, studioPerVisit: (best / v) * (1 - pct(o.feePct)) };
  });
  return {
    rows,
    unlimitedBeatsDropAt: safe(o.dropPrice) > 0 ? safe(o.unlPrice) / safe(o.dropPrice) : Infinity,
    unlimitedBeatsPackAt: Number.isFinite(pack) && pack > 0 ? safe(o.unlPrice) / pack : Infinity,
  };
}

// Unlimited members needed to cover the month, everything else held. Walks up one member at a time so the full-room cap
// is respected; returns null if no count up to the cap gets there.
export function breakEvenUnlimited(o, limit = 3000) {
  for (let u = 0; u <= limit; u++) if (studio(o, { unlMembers: u }).profit >= 0) return u;
  return null;
}

// Move the unlimited price and let members respond along a straight line (priceSensitivity % of members lost per 1%
// rise). The sensitivity is the owner's assumption, not a measurement; the search exists so a best price does.
export function unlimitedPriceSteps(o, mults = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4]) {
  return mults.map((m) => {
    const members = Math.max(0, safe(o.unlMembers) * (1 - safe(o.priceSensitivity) * (m - 1)));
    const price = safe(o.unlPrice) * m;
    const r = studio(o, { unlMembers: members, unlPrice: price });
    return { mult: m, price, members, profit: r.profit, revenue: r.revenue, fillRate: r.fillRate };
  });
}
export function optimizeUnlimitedPrice(o) {
  const rows = unlimitedPriceSteps(o);
  const now = rows.find((r) => r.mult === 1);
  const best = rows.reduce((a, b) => (b.profit > a.profit ? b : a));
  return { rows, now, best, gain: best.profit - now.profit };
}

// If the room has empty seats, what filling some with drop-ins or off-peak packs is worth. Instructor and rent are paid
// anyway, so only the card fee comes off.
export function emptySeatValue(o, fillPcts = [5, 10, 20]) {
  const r = studio(o);
  const net = safe(o.dropPrice) * (1 - pct(o.feePct));
  return fillPcts.map((p) => {
    const seats = r.emptySeats * (p / 100);
    return { pct: p, seats, gain: seats * net };
  });
}

// Sell-through of the room by size of the studio's own classes: how profit moves as average attendance moves, since
// fill is the lever an owner actually pulls (schedule, promotion) rather than members.
export function attendanceSteps(o, mults = [0.8, 0.9, 1, 1.1, 1.2]) {
  return mults.map((m) => {
    const r = studio(o, { unlMembers: safe(o.unlMembers) * m, packsSold: safe(o.packsSold) * m, dropIns: safe(o.dropIns) * m });
    return { mult: m, avgClass: r.avgClass, fillRate: r.fillRate, profit: r.profit };
  });
}
