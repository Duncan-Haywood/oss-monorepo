// Lash studio service menu: what a full set, a fill or a volume set really earns per hour of chair time once you count
// the clean-up between clients, lashes and glue, card fees, no-shows, the studio's rent and overhead spread over the hours
// you actually book, and how many return visits a new client is worth. It compares up to three services side by side,
// shows the price that reaches the take-home you want per hour, and the bookings a month needed to cover the studio.
// Pure functions, nothing leaves the browser.
//
// Per booked slot:
//   expected revenue = price x (1 - no-show chance) + deposit kept x no-show chance
//   card fee         = (price x card % + fixed fee) x (1 - no-show chance)
//   contribution     = expected revenue - card fee - supplies
//   chair minutes    = appointment + set-up and clean-up (a no-show still blocks the slot)
// Studio cost per booked hour = (rent + other monthly costs) / (chair hours a month x share of them you book).
// Take-home per hour = contribution / chair hours - studio cost per booked hour.
// The default figures are placeholders, not any studio's prices.

export const SERVICE_DEFAULTS = {
  price: 180,        // what the client pays, dollars
  apptMin: 120,      // minutes of lashing
  setupMin: 15,      // consult, patch check, sanitising, rebooking, minutes
  supplies: 22,      // lashes, adhesive, pads, tape, disposables per appointment, dollars
  noShowPct: 8,      // chance the client no-shows or cancels too late, percent
  depositKept: 25,   // deposit or fee you keep on a no-show, dollars
  visits: 1,         // times a client books this service over the life of the relationship
};
export const SHARED_DEFAULTS = {
  chairHours: 120,   // chair hours a month you could book
  utilPct: 70,       // share of those hours that are actually booked, percent
  rent: 900,         // suite or chair rent a month, dollars
  otherMonthly: 250, // insurance, software, licences, marketing, laundry a month, dollars
  cardPct: 2.9,      // card processing percentage
  cardFixed: 0.3,    // card processing fixed fee per charge, dollars
  targetHourly: 40,  // take-home you want per chair hour after studio costs, dollars
};
export const DEFAULTS = { ...SERVICE_DEFAULTS, ...SHARED_DEFAULTS };

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;

export function readService(raw) {
  const o = { ...SERVICE_DEFAULTS };
  for (const k of Object.keys(SERVICE_DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  return o;
}
export function readShared(raw) {
  const s = { ...SHARED_DEFAULTS };
  for (const k of Object.keys(SHARED_DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) s[k] = num(raw[k]);
  return s;
}

export function sharedWarnings(s) {
  const w = [];
  for (const k of Object.keys(SHARED_DEFAULTS)) if (s[k] < 0) w.push(`${k} cannot be negative.`);
  if (!(s.chairHours > 0)) w.push("Enter the chair hours a month, above zero.");
  if (!(s.utilPct > 0) || s.utilPct > 100) w.push("Booked share must be above 0% and at most 100%.");
  if (s.cardPct >= 100) w.push("Card percentage must be under 100%.");
  return w;
}
export function serviceWarnings(o) {
  const w = [];
  for (const k of Object.keys(SERVICE_DEFAULTS)) if (o[k] < 0) w.push(`${k} cannot be negative.`);
  if (!(o.price > 0)) w.push("Enter a price above zero.");
  if (!(o.apptMin + o.setupMin > 0)) w.push("Enter the minutes the service takes, above zero.");
  if (o.noShowPct >= 100) w.push("No-show chance must be under 100%.");
  return w;
}

// Studio rent and overhead spread over the hours you actually book.
export function overheadPerHour(s) {
  return (s.rent + s.otherMonthly) / (s.chairHours * (s.utilPct / 100));
}

export function serviceEconomics(o, s) {
  const ns = o.noShowPct / 100;
  const expectedRevenue = o.price * (1 - ns) + o.depositKept * ns;
  const cardFee = (o.price * (s.cardPct / 100) + s.cardFixed) * (1 - ns);
  const contribution = expectedRevenue - cardFee - o.supplies;
  const minutes = o.apptMin + o.setupMin;
  const hours = minutes / 60;
  const overhead = overheadPerHour(s);
  const contributionPerHour = contribution / hours;
  const takeHomePerHour = contributionPerHour - overhead;
  const perClient = contribution * o.visits;
  return {
    ns, expectedRevenue, cardFee, contribution, minutes, hours, overhead,
    contributionPerHour, takeHomePerHour,
    takeHome: takeHomePerHour * hours,
    // The rate on the menu: price over the time the client is in the chair.
    menuHourly: o.apptMin > 0 ? o.price / (o.apptMin / 60) : NaN,
    perClient,
    perClientHours: hours * o.visits,
  };
}

// Price that makes take-home per chair hour equal `target`, other inputs as typed.
export function priceForTarget(o, s, target) {
  const ns = o.noShowPct / 100;
  const hours = (o.apptMin + o.setupMin) / 60;
  const need = (target + overheadPerHour(s)) * hours + o.supplies - o.depositKept * ns + s.cardFixed * (1 - ns);
  const keep = (1 - ns) * (1 - s.cardPct / 100);
  return keep > 0 ? need / keep : NaN;
}

// Bookings a month of this one service needed to cover rent and other costs; Infinity if each booking loses money.
export function breakEvenBookings(o, s) {
  const e = serviceEconomics(o, s);
  return e.contribution > 0 ? (s.rent + s.otherMonthly) / e.contribution : Infinity;
}

// Most bookings the booked hours can hold if the whole chair did only this service.
export function capacityBookings(o, s) {
  const e = serviceEconomics(o, s);
  return (s.chairHours * (s.utilPct / 100)) / e.hours;
}

export function analyzeService(raw, s = SHARED_DEFAULTS) {
  const o = readService(raw);
  const warnings = serviceWarnings(o);
  if (warnings.length) return { opts: o, warnings, e: null };
  const e = serviceEconomics(o, s);
  const w = [];
  if (e.contribution <= 0) w.push("Each booking loses money before the studio is paid for: supplies and card fees are more than you keep.");
  else if (e.takeHomePerHour < 0) w.push(`After the studio costs of ${money2(e.overhead)} per booked hour, this service loses ${money2(-e.takeHomePerHour)} an hour.`);
  else if (e.takeHomePerHour < s.targetHourly) w.push(`This service takes home ${money2(e.takeHomePerHour)} an hour against your ${money2(s.targetHourly)} target.`);
  if (e.takeHomePerHour > 0 && e.menuHourly / e.takeHomePerHour > 3) w.push(`The menu rate per hour in the chair (${money2(e.menuHourly)}) is more than three times what you take home per hour.`);
  return {
    opts: o, warnings: w, e,
    targetPrice: priceForTarget(o, s, s.targetHourly),
    breakEven: breakEvenBookings(o, s),
    capacity: capacityBookings(o, s),
  };
}

// Compare the services that have a price entered. Services are { name, ...fields }.
export function compare(services, rawShared) {
  const shared = readShared(rawShared);
  const sw = sharedWarnings(shared);
  if (sw.length) return { shared, sharedWarnings: sw, rows: [], ranked: [], bad: [], best: null };
  const rows = services
    .map((raw, i) => ({ i, name: (raw && raw.name) || `Service ${String.fromCharCode(65 + i)}`, raw }))
    .filter((x) => x.raw && Number.isFinite(num(x.raw.price)) && num(x.raw.price) > 0)
    .map((x) => ({ ...x, a: analyzeService(x.raw, shared) }));
  const valid = rows.filter((r) => r.a.e);
  const ranked = [...valid].sort((p, q) => q.a.e.takeHomePerHour - p.a.e.takeHomePerHour);
  const bad = rows.filter((r) => !r.a.e);
  return { shared, sharedWarnings: [], rows, ranked, bad, best: ranked[0] || null };
}

export function toCsv(cmp) {
  if (!cmp || !cmp.ranked.length) return "";
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return [
    "service,price,expected_revenue,card_fee,supplies,contribution,chair_hours,studio_cost_per_hour,take_home_per_hour,menu_hourly,price_for_target,break_even_bookings,value_per_client",
    ...cmp.ranked.map((r) => {
      const { e, targetPrice, breakEven, opts } = r.a;
      return [q(r.name), opts.price.toFixed(2), e.expectedRevenue.toFixed(2), e.cardFee.toFixed(2), opts.supplies.toFixed(2), e.contribution.toFixed(2),
        e.hours.toFixed(2), e.overhead.toFixed(2), e.takeHomePerHour.toFixed(2), e.menuHourly.toFixed(2), targetPrice.toFixed(2),
        Number.isFinite(breakEven) ? breakEven.toFixed(1) : "", e.perClient.toFixed(2)].join(",");
    }),
  ].join("\n") + "\n";
}
