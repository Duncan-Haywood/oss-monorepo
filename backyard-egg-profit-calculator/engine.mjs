// Backyard egg profit: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  hens: 20,
  layPct: 70,
  price: 5,
  feedLbs: 0.25,
  feedPerLb: 0.45,
  otherMonth: 30,
  pulletCost: 8,
  layYears: 2,
  cartonCost: 0.35,
  hoursWeek: 4,
  wage: 15,
  lossPct: 8,
};

export const INPUT_NOTES = [
  { what: "Hens in lay", detail: "Count only birds that are laying now. Pullets not yet in lay, broody hens and moulting hens eat feed and produce nothing, so a flock of 20 on the fence is often 14 in the nest boxes in winter." },
  { what: "Lay rate (%)", detail: "Eggs per hen per day as a percentage. A young hen can run 80-90 percent in spring, a two-year-old nearer 60-70, and almost every flock drops hard in the short days and during moult. Use your own yearly average from a month of counting, not the breed brochure." },
  { what: "Selling price per dozen", detail: "What the customer pays per dozen at the gate, market or co-op. Compare with the grocery shelf for pasture or organic eggs in your area, then check that you can actually sell that many at the price." },
  { what: "Feed per hen per day, price per lb", detail: "A laying hen eats about a quarter pound (4 ounces) of layer feed a day, more in cold weather. Divide a 50 lb bag's price by 50 for the price per pound; include scratch, treats and oyster shell if you buy them." },
  { what: "Other cost per month", detail: "Bedding, electricity for a heat lamp or water heater, fencing and coop repairs, vet or parasite treatment, egg-washing supplies, a cottage-food or farm-stand licence, and insurance if you carry it." },
  { what: "Replacement pullet cost and laying years", detail: "A hen lays well for about two years, then drops off. The pullet price (or chick price plus the months of feed before she lays) divided by her laying years is a real yearly cost that is easy to leave out." },
  { what: "Carton cost per dozen", detail: "New cartons or labels cost real money; if customers return cartons put the average replacement cost here. Some states require new or clean cartons and labels for sale." },
  { what: "Hours per week", detail: "Chores, collecting, washing, candling, packing and the trip to sell. Time one ordinary week; hauling water in winter and handling customers add up faster than the feeding." },
  { what: "Your wage per hour", detail: "The hourly pay you want for your own work. It is used to say what price you need, not subtracted from the cash margin." },
  { what: "Eggs lost or kept (%)", detail: "Cracked, dirty, undersized and the ones your family eats. They cost the same feed to produce but do not earn anything, so they raise the cost of every dozen you sell." },
];

const num = (v, name, { min = 0 } = {}) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of ${min} or more.`);
  return n;
};

export function money(v) {
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}$${s}`;
}
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

function core(o) {
  const hens = num(o.hens, "Hens", { min: 1 });
  const layPct = num(o.layPct, "Lay rate", { min: 0.01 });
  if (layPct > 100) throw new Error("Lay rate must be 100% or less.");
  const price = num(o.price, "Selling price");
  const feedLbs = num(o.feedLbs, "Feed per hen");
  const feedPerLb = num(o.feedPerLb, "Feed price per lb");
  const otherMonth = num(o.otherMonth, "Other cost per month");
  const pulletCost = num(o.pulletCost, "Pullet cost");
  const layYears = num(o.layYears, "Laying years", { min: 0.1 });
  const cartonCost = num(o.cartonCost, "Carton cost");
  const hoursWeek = num(o.hoursWeek, "Hours per week", { min: 0.01 });
  const wage = num(o.wage, "Your wage");
  const lossPct = num(o.lossPct, "Eggs lost or kept");
  if (lossPct >= 100) throw new Error("Eggs lost or kept must be under 100%.");

  const sold = 1 - lossPct / 100;
  const eggsYear = hens * (layPct / 100) * 365;
  const dozensSold = (eggsYear / 12) * sold;
  const lines = [
    { key: "feed", label: "Feed", value: hens * feedLbs * 365 * feedPerLb },
    { key: "other", label: "Bedding, repairs and other", value: otherMonth * 12 },
    { key: "replacement", label: "Replacing hens", value: (hens * pulletCost) / layYears },
    { key: "cartons", label: "Cartons", value: dozensSold * cartonCost },
  ];
  const costYear = lines.reduce((s, l) => s + l.value, 0);
  const hoursYear = hoursWeek * 52;
  const revenueYear = dozensSold * price;
  const marginYear = revenueYear - costYear;
  const afterWageYear = marginYear - wage * hoursYear;
  const biggest = lines.reduce((a, b) => (b.value > a.value ? b : a));
  const wagePrice = (costYear + wage * hoursYear) / dozensSold;
  return {
    hens, layPct, price, wage, lossPct, lines, costYear, hoursYear, revenueYear, marginYear, afterWageYear,
    dozensSold, eggsYear,
    dozensWeek: dozensSold / 52,
    costPerDozen: costYear / dozensSold,
    hoursPerDozen: hoursYear / dozensSold,
    marginPerDozen: marginYear / dozensSold,
    profitPerHour: marginYear / hoursYear,
    breakevenPrice: costYear / dozensSold,
    wagePrice,
    costPerEgg: costYear / (eggsYear * sold),
    biggest, biggestShare: costYear > 0 ? biggest.value / costYear : null,
  };
}

export function computeEggs(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const priceScenarios = [0.8, 1, 1.2, 1.5, 2].map((k) => {
    const x = core({ ...o, price: r.price * k });
    return { factor: k, price: r.price * k, profitPerHour: x.profitPerHour, afterWageYear: x.afterWageYear, marginYear: x.marginYear, current: k === 1 };
  });
  const feedScenarios = [1, 1.25, 1.5, 2].map((k) => {
    const x = core({ ...o, feedPerLb: Number(o.feedPerLb) * k });
    return { factor: k, feedPerLb: Number(o.feedPerLb) * k, costPerDozen: x.costPerDozen, profitPerHour: x.profitPerHour, wagePrice: x.wagePrice, current: k === 1 };
  });
  const layScenarios = [0.5, 0.75, 1, 1.15].map((k) => {
    const lay = Math.min(100, r.layPct * k);
    const x = core({ ...o, layPct: lay });
    return { factor: k, layPct: lay, costPerDozen: x.costPerDozen, profitPerHour: x.profitPerHour, wagePrice: x.wagePrice, current: k === 1 };
  });
  return { ...r, priceScenarios, feedScenarios, layScenarios };
}

export function summarize(r) {
  const good = r.afterWageYear >= 0;
  const parts = [
    `Each dozen you sell costs ${money(r.costPerDozen)} in cash and ${r.hoursPerDozen.toFixed(2)} hours of your time, and ${r.biggest.label.toLowerCase()} is the largest cash line at ${pct(r.biggestShare * 100)}.`,
    `Selling at ${money(r.price)} a dozen leaves ${money(r.marginPerDozen)} a dozen, or ${money(r.profitPerHour)} an hour for your time.`,
    `After paying yourself ${money(r.wage)} an hour that is ${good ? "a margin of" : "a loss of"} ${money(Math.abs(r.afterWageYear))} a year on about ${Math.round(r.dozensWeek * 10) / 10} dozen a week.`,
    `To earn your wage you need ${money(r.wagePrice)} a dozen; you break even on cash at ${money(r.breakevenPrice)}.`,
  ];
  return { status: good ? "ok" : "warn", text: parts.join(" ") };
}
