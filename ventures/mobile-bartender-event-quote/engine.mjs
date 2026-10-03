// Mobile bar event quote engine. Pure arithmetic; no I/O, no network.
// Planning arithmetic, not a licence, insurance or liquor-law determination.

export const DEFAULTS = Object.freeze({
  guests: 100,
  hours: 4,
  service: "full-bar", // full-bar | beer-wine | service-only
  guestsPerBartender: 50,
  bartenderRate: 30, // $/h paid per bartender
  minBartenderHours: 4, // call minimum per bartender
  setupHours: 1.5, // per event, lead bartender, unpaid by the client's clock
  drinksFirstHour: 2,
  drinksLaterHour: 1.2,
  alcoholCostPerDrink: null, // null = use the service default
  mixerCostPerDrink: 0.35,
  iceLbsPerGuest: 1.5,
  icePerLb: 0.18,
  cupsNapkinsPerGuest: 0.6,
  insuranceAndPermit: 150,
  miles: 25,
  perMile: 0.7,
  targetMargin: 0.4, // margin on price
});

const ALCOHOL_PER_DRINK = { "full-bar": 1.9, "beer-wine": 1.45, "service-only": 0 };

export function quote(input = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(input)) if (v !== undefined && v !== null && v !== "") o[k] = v;
  const n = (k) => {
    const x = Number(o[k]);
    if (!Number.isFinite(x) || x < 0) throw new RangeError(`${k} must be a non-negative number`);
    return x;
  };
  if (!(o.service in ALCOHOL_PER_DRINK)) throw new RangeError("service must be full-bar, beer-wine or service-only");
  const guests = n("guests"), hours = n("hours");
  if (guests < 1) throw new RangeError("guests must be at least 1");
  if (hours <= 0) throw new RangeError("hours must be above 0");
  const margin = n("targetMargin");
  if (margin >= 0.95) throw new RangeError("targetMargin must be below 0.95");

  const drinks = Math.ceil(guests * (n("drinksFirstHour") + Math.max(0, hours - 1) * n("drinksLaterHour")));
  const bartenders = Math.max(1, Math.ceil(guests / Math.max(1, n("guestsPerBartender"))));
  const paidHoursEach = Math.max(hours + n("setupHours"), n("minBartenderHours"));
  const labor = round2(bartenders * paidHoursEach * n("bartenderRate"));

  const alcPer = o.alcoholCostPerDrink == null ? ALCOHOL_PER_DRINK[o.service] : n("alcoholCostPerDrink");
  const alcohol = o.service === "service-only" ? 0 : round2(drinks * alcPer);
  const mixers = round2(drinks * n("mixerCostPerDrink"));
  const ice = round2(guests * n("iceLbsPerGuest") * n("icePerLb"));
  const disposables = round2(guests * n("cupsNapkinsPerGuest"));
  const travel = round2(n("miles") * 2 * n("perMile"));
  const fixed = round2(n("insuranceAndPermit"));
  const supplies = round2(mixers + ice + disposables);

  const cost = round2(labor + alcohol + supplies + travel + fixed);
  const price = round2(cost / (1 - margin));
  const profit = round2(price - cost);
  return {
    inputs: o, drinks, bartenders, paidHoursEach: round2(paidHoursEach),
    lines: { labor, alcohol, supplies, travel, fixed },
    cost, price, profit,
    pricePerGuest: round2(price / guests),
    pricePerDrink: round2(price / drinks),
    // The lowest number that still covers every cost: the walk-away floor.
    walkAway: cost,
    effectiveHourly: round2(profit / (bartenders * paidHoursEach)),
  };
}

// Price the same event under each service model so the client can compare.
export function compareServices(input = {}) {
  return ["full-bar", "beer-wine", "service-only"].map((service) => {
    const q = quote({ ...input, service });
    return { service, price: q.price, pricePerGuest: q.pricePerGuest, cost: q.cost, profit: q.profit };
  });
}

// What a client's "$X per head" ask nets you.
export function checkAsk(input = {}, askPerGuest) {
  const ask = Number(askPerGuest);
  if (!Number.isFinite(ask) || ask <= 0) throw new RangeError("ask must be a positive number");
  const q = quote(input);
  const revenue = round2(ask * q.inputs.guests);
  const profit = round2(revenue - q.cost);
  return { revenue, profit, margin: round2(profit / revenue), verdict: profit < 0 ? "loss" : revenue >= q.price ? "meets-target" : "below-target", quote: q };
}

export function toMarkdown(q, { client = "" } = {}) {
  const m = (x) => `$${x.toFixed(2)}`;
  const L = q.lines;
  return [
    `# Bar service quote${client ? ` for ${client}` : ""}`,
    "",
    `${q.inputs.guests} guests, ${q.inputs.hours} h, ${q.inputs.service}. ${q.bartenders} bartender(s), about ${q.drinks} drinks.`,
    "",
    `- Staffing: ${m(L.labor)}`,
    `- Alcohol: ${m(L.alcohol)}`,
    `- Mixers, ice, cups: ${m(L.supplies)}`,
    `- Travel: ${m(L.travel)}`,
    `- Insurance / permit: ${m(L.fixed)}`,
    "",
    `**Quote: ${m(q.price)}** (${m(q.pricePerGuest)} per guest). Planning estimate only; licensing and liquor-law rules are set locally.`,
  ].join("\n");
}

function round2(x) { return Math.round(x * 100) / 100; }
