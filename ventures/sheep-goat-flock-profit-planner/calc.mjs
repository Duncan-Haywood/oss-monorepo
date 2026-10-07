// Sheep and goat flock profit planner: pure functions, no dependencies, nothing leaves the browser.
// Flock model per year: adult deaths, culls, young weaned per breeding female, female young kept to refill the flock up
// to the pasture limit, everything else sold (at weaning, finished, or as breeding stock). Feed is charged on every
// breeding female; replacements born on the farm cost nothing to acquire.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  startFemales: 25, cap: 60, years: 5,
  deathPct: 5, cullPct: 15, weanedPerFemale: 1.4, femaleSharePct: 50,
  weanWeight: 85, weanPrice: 2.0,
  finishSharePct: 0, finishWeight: 120, finishPrice: 1.7, finishFeedCost: 45,
  breedingSharePct: 0, breedingPrice: 275,
  cullPrice: 120, woolPerHead: 5, marketingPerHead: 8,
  hayLbPerDay: 4.5, hayDays: 150, hayPrice: 200, grainPerFemale: 25, vetPerFemale: 22, creepPerYoung: 12,
  ramCost: 600, femalesPerRam: 30, ramLifeYears: 4,
  buyPerFemale: 250, setupCost: 4000, setupLifeYears: 15, fixedYear: 600,
  hoursPerFemale: 7, valueOfHour: 20,
};

// Starting points per kind of flock. Each overrides only what differs from the sheep defaults; all are placeholders.
export const PRESETS = {
  sheep: { label: "Wool sheep (meat lambs plus wool)", values: {} },
  hair: { label: "Hair sheep (no wool, no shearing)", values: { woolPerHead: 0, weanedPerFemale: 1.3, buyPerFemale: 300, weanWeight: 80 } },
  goat: {
    label: "Meat goats",
    values: {
      deathPct: 8, weanedPerFemale: 1.6, cullPct: 20, weanWeight: 60, weanPrice: 2.75, finishWeight: 80, finishPrice: 2.5,
      finishFeedCost: 35, breedingPrice: 300, cullPrice: 150, woolPerHead: 0, hayLbPerDay: 4, hayDays: 120, vetPerFemale: 28,
      ramCost: 500, buyPerFemale: 225,
    },
  },
};

const clampPct = (p) => Math.min(100, Math.max(0, p));

export function yearModel(start, o) {
  const survivors = start * (1 - clampPct(o.deathPct) / 100);
  const weaned = survivors * Math.max(0, o.weanedPerFemale);
  const culls = survivors * clampPct(o.cullPct) / 100;
  const keptAdults = survivors - culls;
  const room = Math.max(0, o.cap - keptAdults);
  const femaleYoung = weaned * clampPct(o.femaleSharePct) / 100;
  const retained = Math.min(femaleYoung, room);
  const surplusFemales = femaleYoung - retained;
  const breedingSold = surplusFemales * clampPct(o.breedingSharePct) / 100;
  const marketYoung = weaned - femaleYoung + surplusFemales - breedingSold;
  const finished = marketYoung * clampPct(o.finishSharePct) / 100;
  const atWeaning = marketYoung - finished;
  const youngRev = atWeaning * o.weanWeight * o.weanPrice + finished * o.finishWeight * o.finishPrice;
  const breedingRev = breedingSold * o.breedingPrice;
  const cullRev = culls * o.cullPrice;
  const woolRev = survivors * Math.max(0, o.woolPerHead);
  const revenue = youngRev + breedingRev + cullRev + woolRev;
  const hay = start * (Math.max(0, o.hayLbPerDay) * Math.max(0, o.hayDays) / 2000) * o.hayPrice;
  const feed = hay + start * o.grainPerFemale + weaned * o.creepPerYoung + finished * o.finishFeedCost;
  const vet = start * o.vetPerFemale;
  const rams = Math.ceil(start / Math.max(1, o.femalesPerRam)) * o.ramCost / Math.max(1, o.ramLifeYears);
  const marketing = (marketYoung + breedingSold + culls) * o.marketingPerHead;
  const depreciation = o.setupCost / Math.max(1, o.setupLifeYears);
  const cash = feed + vet + rams + marketing + o.fixedYear;
  const hours = start * o.hoursPerFemale + weaned * 0.3;
  const cashProfit = revenue - cash;
  const profit = cashProfit - depreciation;
  return {
    start, survivors, weaned, culls, retained, breedingSold, marketYoung, finished, atWeaning,
    youngRev, breedingRev, cullRev, woolRev, revenue, hay, feed, vet, rams, marketing, depreciation, cash, hours,
    cashProfit, profit,
    profitAfterLabour: profit - hours * o.valueOfHour,
    perFemaleProfit: start ? profit / start : 0,
    profitPerHour: hours ? profit / hours : 0,
    end: keptAdults + retained,
  };
}

export function project(o) {
  const years = Math.min(15, Math.max(1, Math.round(o.years)));
  const rows = [];
  let females = Math.max(1, Math.round(o.startFemales));
  const invest = females * o.buyPerFemale + o.setupCost;
  let cumulative = -invest;
  let paybackYear = null;
  for (let y = 1; y <= years; y++) {
    const r = yearModel(females, o);
    cumulative += r.cashProfit;
    if (paybackYear === null && cumulative >= 0) paybackYear = y;
    rows.push({ year: y, ...r, cumulative });
    females = Math.max(1, r.end);
  }
  const flockValue = females * o.buyPerFemale;
  return {
    rows, invest, paybackYear, finalFemales: females, flockValue,
    totalProfit: rows.reduce((a, r) => a + r.profit, 0),
    netGain: cumulative + flockValue,
  };
}

// Re-run the whole plan across values of one input: the numbers that decide a flock are few and uncertain.
export function sensitivity(o, key, values) {
  return values.map((value) => {
    const p = project({ ...o, [key]: value });
    return { value, finalFemales: p.finalFemales, totalProfit: p.totalProfit, paybackYear: p.paybackYear };
  });
}

export const weanedSensitivity = (o, values = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0]) => sensitivity(o, "weanedPerFemale", values);
export function hayPriceSensitivity(o, mults = [0.75, 1, 1.25, 1.5, 2]) {
  return sensitivity(o, "hayPrice", mults.map((m) => Math.round(o.hayPrice * m * 100) / 100));
}
export function pricePerLbSensitivity(o, mults = [0.7, 0.85, 1, 1.15, 1.3]) {
  return mults.map((m) => {
    const p = project({ ...o, weanPrice: o.weanPrice * m, finishPrice: o.finishPrice * m });
    return { mult: m, weanPrice: o.weanPrice * m, totalProfit: p.totalProfit, paybackYear: p.paybackYear, finalFemales: p.finalFemales };
  });
}

// What each way of selling the crop adds over selling everything at weaning.
export function scenarios(o) {
  const defs = [
    ["All sold at weaning", { ...o, finishSharePct: 0, breedingSharePct: 0 }],
    ["Finish them to market weight", { ...o, finishSharePct: 100, breedingSharePct: 0 }],
    ["Sell half of surplus females as breeding stock", { ...o, finishSharePct: 0, breedingSharePct: 50 }],
    ["Finish and sell breeding stock", { ...o, finishSharePct: 100, breedingSharePct: 50 }],
  ];
  return defs.map(([label, s]) => {
    const p = project(s);
    return { label, totalProfit: p.totalProfit, paybackYear: p.paybackYear, finalFemales: p.finalFemales };
  });
}

// Weaned young per breeding female needed just to refill deaths and culls with home-raised females.
export function holdSteadyWeaned(o) {
  const alive = 1 - clampPct(o.deathPct) / 100;
  const lost = 1 - alive * (1 - clampPct(o.cullPct) / 100);
  const fem = clampPct(o.femaleSharePct) / 100;
  if (alive <= 0 || fem <= 0) return null;
  return Math.round((lost / (alive * fem)) * 100) / 100;
}

// Weaned young per female at which a flock held at its starting size just breaks even for the year; null if even
// five per female loses money (so the problem is price or cost, not lambing).
export function breakEvenWeaned(o) {
  const f = Math.max(1, Math.round(o.startFemales));
  const at = (w) => yearModel(f, { ...o, cap: f, weanedPerFemale: w }).profit;
  if (at(0) >= 0) return 0;
  if (at(5) < 0) return null;
  let lo = 0;
  let hi = 5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= 0) hi = mid;
    else lo = mid;
  }
  return Math.round(hi * 100) / 100;
}

// Steady-state flock size where margin per female covers fixed cost and depreciation; null if each female loses money.
export function breakEvenFemales(o) {
  const n = 100;
  const r = yearModel(n, { ...o, cap: n, fixedYear: 0, setupCost: 0 });
  const per = r.profit / n;
  if (per <= 0) return null;
  const fixed = o.fixedYear + o.setupCost / Math.max(1, o.setupLifeYears);
  return Math.ceil(fixed / per);
}
