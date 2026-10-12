// Sell the grapes or bottle the wine. Pure functions, no I/O. USD, every figure entered by the user.
// One vineyard, two outcomes: sell the crop at a $/ton price, or make, bottle and sell it as wine.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));
export const GALLONS_PER_CASE = 2.3775; // a 12 x 750 ml case is 9 litres

export const DEFAULTS = {
  acres: 10,
  tonsPerAcre: 3.5,
  growCostPerAcre: 4200,  // labour, spray, trellis upkeep, insurance, land cost, per acre per year
  harvestCostPerTon: 120, // picking and hauling, whether the buyer or you pick
  grapePricePerTon: 2400, // what a buyer offers for the crop
  gallonsPerTon: 150,     // finished wine per ton after pressing
  wineLossPct: 5,         // racking, lees, bottling and sampling loss
  cellarCostPerCase: 30,  // winemaking labour, lab work, barrels and additives per case
  packageCostPerBottle: 3.5, // glass, closure, label, capsule, carton
  fixedCostPerYear: 90000, // winemaker or consultant, tasting-room staff, licences, compliance, equipment, insurance
  exciseTaxPerGallon: 1.07, // enter your own federal and state excise per gallon sold
  dtcShare: 35,           // % of sold bottles that go direct (tasting room, club, online)
  dtcPricePerBottle: 32,
  dtcCostPct: 12,         // card fees, shipping, club handling as % of direct revenue
  wholesalePricePerBottle: 14, // net to you after distributor margin
  marketingPct: 8,        // % of wine revenue spent on marketing, events, shipping materials and club software
  unsoldPct: 25,          // % of bottles still unsold when you stop counting
};

const num = (o, k) => (o[k] === undefined || o[k] === null || o[k] === "" ? DEFAULTS[k] : Number(o[k]));

export function readInputs(input = {}) {
  const v = {};
  for (const k of Object.keys(DEFAULTS)) v[k] = num(input, k);
  return v;
}

export function validate(v) {
  if (!(v.acres > 0)) return "Enter the acres.";
  if (!(v.tonsPerAcre > 0)) return "Enter tons per acre.";
  if (!(v.gallonsPerTon > 0)) return "Enter gallons of wine per ton.";
  for (const k of ["growCostPerAcre", "harvestCostPerTon", "grapePricePerTon", "cellarCostPerCase", "packageCostPerBottle", "fixedCostPerYear", "exciseTaxPerGallon", "dtcPricePerBottle", "wholesalePricePerBottle"]) {
    if (v[k] < 0) return "Prices and costs cannot be negative.";
  }
  for (const k of ["wineLossPct", "dtcCostPct", "marketingPct", "unsoldPct"]) if (!(v[k] >= 0 && v[k] < 100)) return "Percentages must be 0 to 99.";
  if (!(v.dtcShare >= 0 && v.dtcShare <= 100)) return "Direct share must be 0 to 100 percent.";
  return null;
}

/** Net if the crop is sold to a buyer by the ton. */
export function grapeSale(v) {
  const tons = v.acres * v.tonsPerAcre;
  const revenue = tons * v.grapePricePerTon;
  const cost = v.acres * v.growCostPerAcre + tons * v.harvestCostPerTon;
  return { tons: r2(tons), revenue: r2(revenue), cost: r2(cost), net: r2(revenue - cost), netPerAcre: r2((revenue - cost) / v.acres) };
}

/** Net if the crop is made into wine; `over` overrides inputs for sensitivity runs. */
export function ownWine(v) {
  const tons = v.acres * v.tonsPerAcre;
  const gallons = tons * v.gallonsPerTon * (1 - v.wineLossPct / 100);
  const cases = gallons / GALLONS_PER_CASE;
  const bottles = cases * 12;
  const soldBottles = bottles * (1 - v.unsoldPct / 100);
  const soldGallons = gallons * (1 - v.unsoldPct / 100);
  const share = v.dtcShare / 100;
  const dtcNetPerBottle = v.dtcPricePerBottle * (1 - v.dtcCostPct / 100);
  const blendedPerBottle = share * dtcNetPerBottle + (1 - share) * v.wholesalePricePerBottle;
  const revenue = soldBottles * blendedPerBottle;
  const farmCost = v.acres * v.growCostPerAcre + tons * v.harvestCostPerTon;
  const cellarCost = cases * v.cellarCostPerCase + bottles * v.packageCostPerBottle;
  const excise = soldGallons * v.exciseTaxPerGallon;
  const marketing = revenue * v.marketingPct / 100;
  const totalCost = farmCost + cellarCost + excise + marketing + v.fixedCostPerYear;
  return {
    gallons: r2(gallons), cases: r2(cases), bottles: Math.round(bottles), soldBottles: Math.round(soldBottles),
    blendedPerBottle: r2(blendedPerBottle), revenue: r2(revenue), farmCost: r2(farmCost), cellarCost: r2(cellarCost),
    excise: r2(excise), marketing: r2(marketing), fixedCost: r2(v.fixedCostPerYear), totalCost: r2(totalCost), net: r2(revenue - totalCost),
    netPerAcre: r2((revenue - totalCost) / v.acres), breakEvenPerBottle: soldBottles > 0 ? r2(totalCost / soldBottles) : null,
  };
}

/** Direct-sales share (0-100) at which wine net equals grape-sale net; null when no share in 0-100 gets there. */
export function breakEvenDtcShare(v) {
  const target = grapeSale(v).net;
  const at0 = ownWine({ ...v, dtcShare: 0 }).net, at100 = ownWine({ ...v, dtcShare: 100 }).net;
  if (at100 === at0) return null;
  const s = ((target - at0) / (at100 - at0)) * 100;
  return s >= 0 && s <= 100 ? r2(s) : null;
}

export function analyze(input = {}) {
  const v = readInputs(input);
  const error = validate(v);
  if (error) return { error };
  const grapes = grapeSale(v), wine = ownWine(v);
  const tons = grapes.tons;
  // The grape price at which selling grapes would pay exactly what the wine does.
  const grapePriceToMatchWine = r2((wine.net + grapes.cost) / tons);
  const gap = r2(wine.net - grapes.net);
  const winner = gap > 0 ? "wine" : "grapes";
  const share = breakEvenDtcShare(v);
  const advice = [];
  advice.push(`${v.acres} acres at ${v.tonsPerAcre} t/acre is ${grapes.tons} tons. Selling the grapes nets ${money(grapes.net)} (${money(grapes.netPerAcre)}/acre). Making and selling wine nets ${money(wine.net)} (${money(wine.netPerAcre)}/acre) on ${wine.soldBottles.toLocaleString("en-US")} bottles sold.`);
  advice.push(winner === "wine"
    ? `On these numbers bottling wins by ${money(gap)} a year. Selling the grapes would have to fetch ${money(grapePriceToMatchWine)}/ton to match it, against ${money(v.grapePricePerTon)} offered.`
    : `On these numbers selling the grapes wins by ${money(-gap)} a year. The grapes are worth ${money(grapePriceToMatchWine)}/ton as wine to you; a buyer is offering ${money(v.grapePricePerTon)}.`);
  advice.push(wine.breakEvenPerBottle == null ? "No bottles are sold on these inputs." : `Your all-in cost is ${money(wine.breakEvenPerBottle)} per bottle sold; the blended net price you entered is ${money(wine.blendedPerBottle)}.`);
  if (share == null) advice.push(wine.net > grapes.net ? "Wine beats the grape price at every direct-sales share from 0 to 100%." : "No direct-sales share from 0 to 100% lets wine beat the grape price on these inputs; the price, volume or cost has to move first.");
  else advice.push(`Wine only matches the grape price once about ${share}% of your sold bottles go direct at ${money(v.dtcPricePerBottle)}.`);
  if (wine.net > grapes.net && v.unsoldPct >= 25) advice.push("Wine wins on paper, but a quarter or more of the bottles unsold ties up cash in inventory; check the sell-through row below.");
  return { inputs: v, grapes, wine, gap, winner, grapePriceToMatchWine, breakEvenDtcShare: share, advice };
}

/** Wine net as direct share (rows) and unsold bottles (columns) move; the grape-sale net is the comparison. */
export function sensitivity(input, shares = [20, 50, 80], unsold = [5, 15, 30]) {
  const v = readInputs(input);
  if (validate(v)) return [];
  return shares.map((s) => ({ share: s, cells: unsold.map((u) => ({ unsold: u, net: ownWine({ ...v, dtcShare: s, unsoldPct: u }).net })) }));
}

export function sampleInput() {
  return { acres: 8, tonsPerAcre: 3, grapePricePerTon: 3200, dtcShare: 20, dtcPricePerBottle: 30, wholesalePricePerBottle: 14, unsoldPct: 30 };
}

export function toCsv(r) {
  const rows = [["route", "net", "net per acre", "revenue", "cost"]];
  rows.push(["Sell grapes", r.grapes.net, r.grapes.netPerAcre, r.grapes.revenue, r.grapes.cost]);
  rows.push(["Make and sell wine", r.wine.net, r.wine.netPerAcre, r.wine.revenue, r.wine.totalCost]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
