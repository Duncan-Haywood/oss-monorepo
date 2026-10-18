// Backyard honey profit: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  hives: 10,
  yieldLbs: 50,
  price: 10,
  lossPct: 10,
  jarCost: 1.1,
  treatCost: 25,
  equipYear: 400,
  otherYear: 150,
  winterLossPct: 25,
  nucCost: 180,
  hoursPerHive: 20,
  wage: 20,
};

export const INPUT_NOTES = [
  { what: "Hives going into the season", detail: "Count colonies strong enough to make a surplus. A weak or newly split hive eats stores and gives you nothing to sell in its first year." },
  { what: "Honey per hive per year (lb)", detail: "Pounds you actually extract from one hive, not the best hive's best year. Many US beekeepers average 30-60 lb a hive; a drought, a cold spring or a late flow can cut it by half. Use your own three-year average." },
  { what: "Selling price per lb", detail: "What the customer pays per pound at the market, farm gate or shop. Raw local honey commonly sells for $8-14 a pound in jars; wholesale in bulk is far lower. Use the price you really get, not the price on the shelf next to you." },
  { what: "Honey lost or kept (%)", detail: "Honey left on the combs, spilled, given as gifts, eaten at home or fed back to the bees. It cost the same to make but does not earn anything, so it raises the cost of every pound you sell." },
  { what: "Jar, lid and label cost per lb", detail: "A one-pound jar, lid, label and a box of shipping or market packaging. Buying in bulk lowers it; fancy glass raises it. Check your state's honey labelling rules." },
  { what: "Mite treatment and feed per hive per year", detail: "Varroa treatments, sugar syrup and pollen patties. Mites are the main reason colonies die, so a hive with no treatment cost is usually a hive that will not make it through winter." },
  { what: "Equipment per year", detail: "Boxes, frames, foundation, a smoker, suits, and the extractor and bottling kit spread over their life. A $1,200 extractor used for six years is $200 a year, easy to leave out." },
  { what: "Other cost per year", detail: "Hive registration, liability insurance, market stall fees, a cottage-food licence, fuel to the apiary and any rent for the yard." },
  { what: "Winter loss (%) and replacement colony cost", detail: "Share of hives that die each winter, and what a nucleus colony or package costs to replace them. Losses of 20-40 percent a year are common; a replacement is a real yearly cost even when you replace by splitting your own hives, because the split is honey you did not get." },
  { what: "Hours per hive per year", detail: "Inspections, treatments, feeding, adding and removing supers, extracting, bottling, labelling and the trip to sell. Time one full year for a few hives; extraction weekends add up faster than the inspections." },
  { what: "Your wage per hour", detail: "The hourly pay you want for your own work. It is used to say what price you need, not subtracted from the cash margin." },
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
  const hives = num(o.hives, "Hives", { min: 1 });
  const yieldLbs = num(o.yieldLbs, "Honey per hive", { min: 0.01 });
  const price = num(o.price, "Selling price");
  const lossPct = num(o.lossPct, "Honey lost or kept");
  if (lossPct >= 100) throw new Error("Honey lost or kept must be under 100%.");
  const jarCost = num(o.jarCost, "Jar cost");
  const treatCost = num(o.treatCost, "Treatment and feed cost");
  const equipYear = num(o.equipYear, "Equipment per year");
  const otherYear = num(o.otherYear, "Other cost per year");
  const winterLossPct = num(o.winterLossPct, "Winter loss");
  if (winterLossPct > 100) throw new Error("Winter loss must be 100% or less.");
  const nucCost = num(o.nucCost, "Replacement colony cost");
  const hoursPerHive = num(o.hoursPerHive, "Hours per hive", { min: 0.01 });
  const wage = num(o.wage, "Your wage");

  const lbsHarvest = hives * yieldLbs;
  const lbsSold = lbsHarvest * (1 - lossPct / 100);
  const lines = [
    { key: "replacement", label: "Replacing winter losses", value: hives * (winterLossPct / 100) * nucCost },
    { key: "equipment", label: "Equipment", value: equipYear },
    { key: "treatment", label: "Mite treatment and feed", value: hives * treatCost },
    { key: "jars", label: "Jars and labels", value: lbsSold * jarCost },
    { key: "other", label: "Insurance, fees and other", value: otherYear },
  ];
  const costYear = lines.reduce((s, l) => s + l.value, 0);
  const hoursYear = hives * hoursPerHive;
  const revenueYear = lbsSold * price;
  const marginYear = revenueYear - costYear;
  const afterWageYear = marginYear - wage * hoursYear;
  const biggest = lines.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    hives, yieldLbs, price, wage, lossPct, winterLossPct, lines, costYear, hoursYear, revenueYear, marginYear, afterWageYear,
    lbsHarvest, lbsSold,
    costPerLb: costYear / lbsSold,
    hoursPerLb: hoursYear / lbsSold,
    marginPerLb: marginYear / lbsSold,
    profitPerHour: marginYear / hoursYear,
    breakevenPrice: costYear / lbsSold,
    wagePrice: (costYear + wage * hoursYear) / lbsSold,
    costPerHive: costYear / hives,
    biggest, biggestShare: costYear > 0 ? biggest.value / costYear : null,
  };
}

export function computeHoney(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const priceScenarios = [0.8, 1, 1.2, 1.5, 2].map((k) => {
    const x = core({ ...o, price: r.price * k });
    return { factor: k, price: r.price * k, profitPerHour: x.profitPerHour, afterWageYear: x.afterWageYear, marginYear: x.marginYear, current: k === 1 };
  });
  const yieldScenarios = [0.4, 0.6, 1, 1.25].map((k) => {
    const x = core({ ...o, yieldLbs: r.yieldLbs * k });
    return { factor: k, yieldLbs: r.yieldLbs * k, costPerLb: x.costPerLb, profitPerHour: x.profitPerHour, wagePrice: x.wagePrice, current: k === 1 };
  });
  const winterScenarios = [0.4, 1, 1.6, 2.4].map((k) => {
    const w = Math.min(100, r.winterLossPct * k);
    const x = core({ ...o, winterLossPct: w });
    return { factor: k, winterLossPct: w, costPerLb: x.costPerLb, profitPerHour: x.profitPerHour, wagePrice: x.wagePrice, current: k === 1 };
  });
  return { ...r, priceScenarios, yieldScenarios, winterScenarios };
}

export function summarize(r) {
  const good = r.afterWageYear >= 0;
  const parts = [
    `Each pound you sell costs ${money(r.costPerLb)} in cash and ${r.hoursPerLb.toFixed(2)} hours of your time, and ${r.biggest.label.toLowerCase()} is the largest cash line at ${pct(r.biggestShare * 100)}.`,
    `Selling at ${money(r.price)} a pound leaves ${money(r.marginPerLb)} a pound, or ${money(r.profitPerHour)} an hour for your time.`,
    `After paying yourself ${money(r.wage)} an hour that is ${good ? "a margin of" : "a loss of"} ${money(Math.abs(r.afterWageYear))} a year on about ${Math.round(r.lbsSold)} lb sold.`,
    `To earn your wage you need ${money(r.wagePrice)} a pound; you break even on cash at ${money(r.breakevenPrice)}.`,
  ];
  return { status: good ? "ok" : "warn", text: parts.join(" ") };
}
