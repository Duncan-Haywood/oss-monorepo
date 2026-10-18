// Speaker / trainer / workshop fee model. Pure functions, no dependencies, nothing leaves the browser.
//
// Two questions, both arithmetic on typed numbers:
//   1. FLOOR: what fee must one booking carry for the year to hit the income goal?
//        floor = ((incomeGoal + overhead) / bookingsPerYear + travelPaidBySpeaker) / (1 - commission)
//      Commission (bureau or agent) comes off the top of the fee the client pays, so the fee is grossed up.
//   2. QUOTE: for one specific booking, base fee plus add-ons (custom content, workshop, virtual discount,
//      recording rights, rush), what the client is quoted, what you keep after commission and travel, and
//      what that is per hour of time the booking really occupies (prep + event + travel days).
// Defaults are placeholders, not market rates.

export const DEFAULTS = {
  incomeGoal: 150000,
  overheadYear: 18000,
  bookingsPerYear: 24,
  commissionPct: 20,
  commissionShare: 50,
  prepHours: 12,
  eventHours: 2,
  travelDays: 1,
  hoursPerTravelDay: 8,
  travelCost: 900,
  travelPaidBy: 0,
  marketFee: 7500,
  customContentPct: 15,
  workshopFee: 2500,
  recordingPct: 25,
  rushPct: 20,
  virtualDiscountPct: 40,
  depositPct: 50,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

// Share of bookings that go through a bureau/agent (commissionShare %), times commission rate.
export const effectiveCommission = (o) => (o.commissionPct / 100) * (o.commissionShare / 100);

// Fee a booking must carry, on average, to net the goal.
export function floorFee(o) {
  const c = effectiveCommission(o);
  const perBooking = (o.incomeGoal + o.overheadYear) / o.bookingsPerYear;
  const travel = o.travelPaidBy === 1 ? o.travelCost : 0; // speaker pays: it must be recovered in the fee
  return (perBooking + travel) / (1 - c);
}

// Hours one booking occupies: prep + the event + travel days.
export const hoursPerBooking = (o) => o.prepHours + o.eventHours + o.travelDays * o.hoursPerTravelDay;

// Quote one booking. `mode` is "in-person" or "virtual".
export function quote(o, { workshop = false, customContent = false, recording = false, rush = false, virtual = false, bureau = true } = {}) {
  const base = virtual ? o.marketFee * (1 - o.virtualDiscountPct / 100) : o.marketFee;
  const lines = [{ label: virtual ? "Keynote fee (virtual)" : "Keynote fee", amount: base }];
  if (customContent) lines.push({ label: "Custom content", amount: base * (o.customContentPct / 100) });
  if (workshop) lines.push({ label: "Workshop add-on", amount: o.workshopFee });
  if (recording) lines.push({ label: "Recording rights", amount: base * (o.recordingPct / 100) });
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (rush) lines.push({ label: "Rush (short notice)", amount: subtotal * (o.rushPct / 100) });
  const fee = lines.reduce((s, l) => s + l.amount, 0);
  const commission = bureau ? fee * (o.commissionPct / 100) : 0;
  const travelOut = !virtual && o.travelPaidBy === 1 ? o.travelCost : 0;
  const travelBilled = !virtual && o.travelPaidBy === 0 ? o.travelCost : 0; // client reimburses on top
  const net = fee - commission - travelOut;
  const hours = o.prepHours + o.eventHours + (virtual ? 0 : o.travelDays * o.hoursPerTravelDay);
  return {
    lines, fee, commission, travelOut, travelBilled, net, hours,
    netPerHour: hours > 0 ? net / hours : 0,
    clientTotal: fee + travelBilled,
    deposit: fee * (o.depositPct / 100),
  };
}

// Bookings per year needed to hit the goal at a given fee.
export function bookingsNeeded(o, fee) {
  const c = effectiveCommission(o);
  const travel = o.travelPaidBy === 1 ? o.travelCost : 0;
  const net = fee * (1 - c) - travel;
  return net > 0 ? (o.incomeGoal + o.overheadYear) / net : Infinity;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of ["incomeGoal", "bookingsPerYear", "marketFee"]) {
    if (!(o[k] > 0)) warnings.push(`${k} must be above zero.`);
  }
  for (const k of ["overheadYear", "prepHours", "eventHours", "travelDays", "travelCost"]) {
    if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  if (o.commissionPct < 0 || o.commissionPct >= 90) warnings.push("Commission should be between 0 and 90%.");
  if (o.commissionShare < 0 || o.commissionShare > 100) warnings.push("Share of bookings through a bureau should be between 0 and 100%.");
  if (warnings.length) return { opts: o, warnings, result: null };

  const floor = floorFee(o);
  const hours = hoursPerBooking(o);
  const inPerson = quote(o, {});
  const virtual = quote(o, { virtual: true });
  const full = quote(o, { workshop: true, customContent: true, recording: true });
  const gap = o.marketFee - floor;
  if (gap < 0) warnings.push(`At ${o.bookingsPerYear} bookings a year your market fee ${money(o.marketFee)} is ${money(-gap)} short of the ${money(floor)} the goal needs. Raise the fee, book more, or lower the goal.`);
  const capacity = Math.floor(2000 / Math.max(hours, 1));
  const needed = bookingsNeeded(o, o.marketFee);
  if (needed > capacity) warnings.push(`That needs ${Number.isFinite(needed) ? Math.ceil(needed) : "more than you can book"} bookings at ${Math.round(hours)} hours each, more than a 2,000-hour working year holds (about ${capacity}).`);

  const ladder = [0.6, 0.8, 1, 1.25, 1.5, 2].map((m) => {
    const fee = o.marketFee * m;
    const n = bookingsNeeded(o, fee);
    return { multiplier: m, fee, bookings: n, hoursYear: Number.isFinite(n) ? n * hours : Infinity };
  });
  const feeGrid = [12, 18, 24, 36, 48].map((n) => ({ bookings: n, floor: floorFee({ ...o, bookingsPerYear: n }) }));

  return {
    opts: o, warnings, result: inPerson, floor, gap, hours, virtual, full, ladder, feeGrid,
    effectiveCommission: effectiveCommission(o), neededBookings: needed,
    breakEvenVirtualDiscount: o.marketFee > 0 ? 1 - floor / o.marketFee : 0,
  };
}

export function toCsv(a) {
  const q = a.result;
  const rows = [
    ["item", "usd"],
    ["fee_floor_for_goal", a.floor.toFixed(2)],
    ["market_fee", a.opts.marketFee.toFixed(2)],
    ["bureau_commission_on_quote", q.commission.toFixed(2)],
    ["travel_paid_by_speaker", q.travelOut.toFixed(2)],
    ["net_after_commission_and_travel", q.net.toFixed(2)],
    ["net_per_hour_occupied", q.netPerHour.toFixed(2)],
    ["virtual_fee", a.virtual.fee.toFixed(2)],
    ["full_package_fee", a.full.fee.toFixed(2)],
  ];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
