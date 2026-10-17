// Pet-sitting and dog-walking platform fees versus booking clients directly. Pure functions, nothing leaves the browser.
//
// Marketplace apps (Rover, Wag and similar) keep a cut of every booking; a sitter who finds clients on their own pays only
// card processing plus whatever booking software and marketing they buy. The fee percentages below are typed assumptions
// that were published around the time of writing -- platforms change them, so they are inputs, not constants of nature.
//
// Per booking:   platform net = price * (1 - platformFee) - cost       direct net = price - (price * cardPct + cardFixed) - cost
// Per month:     the direct share of bookings earns the direct net, the rest the platform net, and direct bookings carry the
//                monthly fixed cost of software and marketing.

export const PRESETS = {
  rover: { label: "Rover (sitter-side fee about 20%)", platformFee: 0.2 },
  wag: { label: "Wag (commission about 40% on walks)", platformFee: 0.4 },
  custom: { label: "Another platform: type the fee", platformFee: 0.2 },
};

export const DEFAULTS = {
  bookingsPerMonth: 30,
  price: 45,
  hoursPerBooking: 3,
  costPerBooking: 4,
  platformFee: 0.2,
  directShare: 0.2,
  cardPct: 0.029,
  cardFixed: 0.3,
  softwareMonthly: 25,
  marketingMonthly: 30,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export const platformNet = (o) => o.price * (1 - o.platformFee) - o.costPerBooking;
export const directNet = (o) => o.price - (o.price * o.cardPct + o.cardFixed) - o.costPerBooking;

// Month with a given share (0..1) of bookings coming direct. Fixed costs only apply if any booking is direct.
export function month(o, share) {
  const n = o.bookingsPerMonth;
  const direct = n * share;
  const onPlatform = n - direct;
  const fixed = share > 0 ? o.softwareMonthly + o.marketingMonthly : 0;
  const net = onPlatform * platformNet(o) + direct * directNet(o) - fixed;
  const hours = n * o.hoursPerBooking;
  return { share, direct, onPlatform, fixed, net, hours, hourly: hours > 0 ? net / hours : 0, fees: onPlatform * o.price * o.platformFee + direct * (o.price * o.cardPct + o.cardFixed) };
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  if (warnings.length) return { opts: o, warnings, result: null };
  if (o.platformFee >= 1) warnings.push("platformFee is a decimal (0.20 = 20%) and must be below 1.");
  if (o.directShare > 1) warnings.push("directShare is a decimal (0.20 = 20%) and must be 1 or less.");
  if (o.cardPct >= 1) warnings.push("cardPct is a decimal (0.029 = 2.9%) and must be below 1.");
  if (warnings.length) return { opts: o, warnings, result: null };
  const current = month(o, o.directShare);
  const allPlatform = month(o, 0);
  const allDirect = month(o, 1);
  const gainPerDirect = directNet(o) - platformNet(o); // what moving one booking off the platform adds
  const breakEvenDirect = gainPerDirect > 0 ? (o.softwareMonthly + o.marketingMonthly) / gainPerDirect : Infinity;
  const matchPrice = (directNet(o) + o.costPerBooking) / (1 - o.platformFee); // platform price that nets what a direct booking nets
  const grid = [0, 0.25, 0.5, 0.75, 1].map((s) => month(o, s));
  if (o.platformFee < o.cardPct + (o.cardFixed / Math.max(o.price, 1))) warnings.push("The platform fee is below card processing, so booking direct does not earn more per booking.");
  if (o.price <= o.costPerBooking) warnings.push("The price does not cover your cost per booking.");
  return {
    opts: o, warnings, result: current, current, allPlatform, allDirect, grid,
    platformNet: platformNet(o), directNet: directNet(o), gainPerDirect, breakEvenDirect, matchPrice,
    matchRaise: matchPrice - o.price, annualGain: (allDirect.net - allPlatform.net) * 12,
    breakEvenOk: Number.isFinite(breakEvenDirect) && breakEvenDirect <= o.bookingsPerMonth,
  };
}

export function toCsv(a) {
  const rows = [["direct_share", "direct_bookings", "platform_bookings", "fees", "fixed_costs", "net_per_month", "net_per_hour"],
    ...a.grid.map((g) => [g.share, g.direct, g.onPlatform, g.fees, g.fixed, g.net, g.hourly].map((v) => Number(v).toFixed(2)))];
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}
