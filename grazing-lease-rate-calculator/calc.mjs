// Grazing-lease math. Pure functions, no I/O. All money in USD, all inputs entered by the user.
// 1 AUM (animal unit month) = forage to feed one 1,000 lb animal unit for one month.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));

const DEFAULTS = {
  acres: 320,
  forageLbsPerAcre: 2000, // total dry-matter forage produced per acre in the grazing season
  usePct: 40,             // % of forage that can be grazed (rest left for plant health, trampling, wildlife)
  auLbsPerDay: 26,        // dry matter one animal unit eats per day (about 2.6% of 1,000 lb)
  seasonDays: 150,
  auPerHead: 1.2,         // cow-calf pair about 1.2, mature cow 1.0, yearling about 0.7
  rentPerAum: 22,         // lease price entered by the user
  // Landowner side
  cashRentAlt: 18,        // $/acre/yr the land would earn another way (hay ground, cropland, hunting)
  ownerCostPerAcre: 3,    // fence, water, weed control, taxes the owner carries under the lease
  // Rancher side
  hayPerTon: 190,         // $/ton delivered, as fed
  hayDmPct: 86,           // dry matter % of the hay
  hayWastePct: 15,        // % of hay fed that is wasted
  extraCostPerAum: 3,     // haul, extra water, checking, fence repair the rancher carries on the lease
};

export function analyze(input = {}) {
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined && x !== null && x !== "")) };
  for (const k of Object.keys(DEFAULTS)) v[k] = Number(v[k]);
  if (!(v.acres > 0)) return { error: "Enter the acres." };
  if (!(v.forageLbsPerAcre > 0)) return { error: "Enter forage production in pounds per acre." };
  if (!(v.usePct > 0 && v.usePct <= 100)) return { error: "Utilisation must be above 0 and at most 100 percent." };
  if (!(v.auLbsPerDay > 0)) return { error: "Daily intake per animal unit must be above 0." };
  if (!(v.seasonDays >= 1 && v.seasonDays <= 366)) return { error: "Season length must be 1 to 366 days." };
  if (!(v.auPerHead > 0)) return { error: "Animal units per head must be above 0." };
  if (!(v.hayDmPct > 0 && v.hayDmPct <= 100)) return { error: "Hay dry matter must be above 0 and at most 100 percent." };
  if (v.hayWastePct < 0 || v.hayWastePct >= 100) return { error: "Hay waste must be 0 to 99 percent." };
  for (const k of ["rentPerAum", "cashRentAlt", "ownerCostPerAcre", "hayPerTon", "extraCostPerAum"])
    if (!(v[k] >= 0)) return { error: `${k} cannot be negative.` };

  const usableLbs = v.acres * v.forageLbsPerAcre * (v.usePct / 100);
  const auDays = usableLbs / v.auLbsPerDay;
  const aums = auDays / 30.4;
  const animalUnits = auDays / v.seasonDays;       // animal units the season supports
  const head = animalUnits / v.auPerHead;
  const acresPerAu = v.acres / animalUnits;
  const aumsPerAcre = aums / v.acres;

  // Rancher: what a month of feed costs from hay, versus the lease.
  const hayLbsAsFedPerAumDry = v.auLbsPerDay * 30.4;
  const hayCostPerAum = (hayLbsAsFedPerAumDry / (v.hayDmPct / 100) / (1 - v.hayWastePct / 100) / 2000) * v.hayPerTon;
  const rancherCostPerAum = v.rentPerAum + v.extraCostPerAum;
  const rancherSavingPerAum = hayCostPerAum - rancherCostPerAum;
  const rancherBreakEvenRent = hayCostPerAum - v.extraCostPerAum; // top rent before hay is cheaper

  // Landowner: lease income versus the alternative use.
  const rentTotal = aums * v.rentPerAum;
  const rentPerAcre = rentTotal / v.acres;
  const ownerNetPerAcre = rentPerAcre - v.ownerCostPerAcre;
  const ownerAltNetPerAcre = v.cashRentAlt;
  const ownerBreakEvenRent = (v.cashRentAlt + v.ownerCostPerAcre) / aumsPerAcre; // rent per AUM that matches the alternative

  const advice = [];
  advice.push(`${v.acres} acres at ${v.forageLbsPerAcre} lb forage and ${v.usePct}% use carries about ${Math.round(aums)} AUMs: ${Math.round(head)} head (${v.auPerHead} animal units each) for ${v.seasonDays} days, or ${r2(acresPerAu)} acres per animal unit.`);
  if (rancherSavingPerAum > 0) advice.push(`For the rancher the lease costs ${money(rancherCostPerAum)} per AUM all-in against about ${money(hayCostPerAum)} to feed the same month as hay, saving about ${money(rancherSavingPerAum)} an AUM. Hay wins above ${money(rancherBreakEvenRent)} rent per AUM.`);
  else advice.push(`At ${money(v.rentPerAum)} rent the lease costs ${money(rancherCostPerAum)} per AUM all-in, more than the ${money(hayCostPerAum)} it costs to feed a month as hay. The most this ground is worth to a rancher is about ${money(rancherBreakEvenRent)} rent per AUM.`);
  if (ownerNetPerAcre >= ownerAltNetPerAcre) advice.push(`For the landowner the lease nets ${money(ownerNetPerAcre)} an acre after ${money(v.ownerCostPerAcre)} of costs, against ${money(ownerAltNetPerAcre)} an acre from the alternative.`);
  else advice.push(`For the landowner the lease nets ${money(ownerNetPerAcre)} an acre after ${money(v.ownerCostPerAcre)} of costs, below the ${money(ownerAltNetPerAcre)} the alternative earns. Rent needs to reach about ${money(ownerBreakEvenRent)} per AUM to match it.`);
  const overlap = ownerBreakEvenRent <= rancherBreakEvenRent;
  advice.push(overlap ? `A deal exists between ${money(ownerBreakEvenRent)} and ${money(rancherBreakEvenRent)} per AUM: below the first the owner is better off elsewhere, above the second the rancher is better off feeding hay.` : `No rent works for both sides on these numbers: the owner needs ${money(ownerBreakEvenRent)} per AUM and the rancher stops at ${money(rancherBreakEvenRent)}.`);
  if (v.usePct > 50) advice.push("Utilisation above 50% leaves little residual cover; stocking at that rate usually costs forage the following year. Check the figure with your extension agent or NRCS office.");

  return { inputs: v, aums: r2(aums), animalUnits: r2(animalUnits), head: r2(head), acresPerAu: r2(acresPerAu), aumsPerAcre: r2(aumsPerAcre), hayCostPerAum: r2(hayCostPerAum), rancherCostPerAum: r2(rancherCostPerAum), rancherSavingPerAum: r2(rancherSavingPerAum), rancherBreakEvenRent: r2(rancherBreakEvenRent), rentTotal: r2(rentTotal), rentPerAcre: r2(rentPerAcre), rentPerHeadMonth: r2((v.rentPerAum / v.auPerHead)), ownerNetPerAcre: r2(ownerNetPerAcre), ownerBreakEvenRent: r2(ownerBreakEvenRent), dealExists: overlap, advice };
}

/** Sensitivity: head and rent income if forage comes in at the given fractions of the entered yield (drought planning). */
export function droughtTable(input, fractions = [1, 0.75, 0.5]) {
  return fractions.map((f) => {
    const r = analyze({ ...input, forageLbsPerAcre: Number({ ...DEFAULTS, ...input }.forageLbsPerAcre) * f });
    return r.error ? { fraction: f, error: r.error } : { fraction: f, aums: r.aums, head: r.head, rentTotal: r.rentTotal };
  });
}

export function sampleInput() {
  return { ...DEFAULTS, acres: 640, forageLbsPerAcre: 1800, usePct: 35, seasonDays: 180, rentPerAum: 24, cashRentAlt: 14 };
}

export function toCsv(r) {
  const rows = [["line", "value"], ["AUMs", r.aums], ["animal units carried", r.animalUnits], ["head carried", r.head], ["acres per animal unit", r.acresPerAu], ["hay cost per AUM", r.hayCostPerAum], ["lease cost per AUM (rancher, all-in)", r.rancherCostPerAum], ["rancher break-even rent per AUM", r.rancherBreakEvenRent], ["owner break-even rent per AUM", r.ownerBreakEvenRent], ["annual rent", r.rentTotal], ["rent per acre", r.rentPerAcre], ["rent per head-month", r.rentPerHeadMonth]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
