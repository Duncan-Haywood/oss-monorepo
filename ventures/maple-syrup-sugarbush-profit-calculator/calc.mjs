// Maple syrup sugarbush profit: what a season earns per tap and per hour of work, and whether reverse osmosis pays back.
// Pure functions, no DOM, no network.

export const LB_PER_GAL_SYRUP = 11;
const LB_PER_GAL_SAP = 8.4;
const BTU_PER_LB_WATER = 1150; // heat sap from about 35 F to boiling and evaporate a pound of water

export const DEFAULT_SETTINGS = {
  taps: 1000,
  galPerTap: 10,
  brix: 2.2,
  suppliesPerTap: 0.5,
  tubingPerTap: 9,
  tubingYears: 10,
  hoursPerTap: 0.25,
  evapSapGph: 40,
  bottlingHoursPerGal: 0.15,
  laborRate: 18,
  fuelBtuPerUnit: 20_000_000,
  fuelPricePerUnit: 250,
  efficiencyPct: 55,
  evaporatorCost: 12000,
  evaporatorYears: 15,
  overheadPerSeason: 1200,
  roCapital: 9000,
  roYears: 10,
  roMembranesPerSeason: 400,
  roPowerPerSapGal: 0.005,
  roConcBrix: 8,
  useRo: 0,
};

// One line per sales channel: name, price per gallon of syrup, packaging per gallon, percent of sales lost (fees), share of the crop.
export const DEFAULT_CHANNELS = `# name, price per gallon of syrup, packaging per gallon, percent of sales lost (card and market fees), share of crop
Bulk to a packer, 30, 0, 0, 40
Farmers market pints, 104, 8, 6, 35
Farm stand gallons, 62, 2.5, 3, 25`;

const num = (v) => {
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function money(x) {
  const s = Math.abs(Math.round(x)).toLocaleString("en-US");
  return (x < 0 ? "-$" : "$") + s;
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
}

export function parseChannels(text) {
  const channels = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith("#")) return;
    const p = t.split(",").map((x) => x.trim());
    if (/^name$/i.test(p[0])) return;
    const line = i + 1;
    if (p.length < 2) { errors.push(`Channel line ${line}: need name and price per gallon.`); return; }
    const [name, price, pack = "0", pct = "0", share = "100"] = p;
    const v = [price, pack, pct, share].map(num);
    if (!name || v.some((x) => !Number.isFinite(x) || x < 0)) { errors.push(`Channel line ${line}: "${t.slice(0, 40)}" has a missing or negative number.`); return; }
    if (v[2] > 100) { errors.push(`Channel line ${line}: percent of sales cannot exceed 100.`); return; }
    if (channels.some((c) => c.name.toLowerCase() === name.toLowerCase())) { errors.push(`Channel line ${line}: ${name} is listed twice.`); return; }
    channels.push({ name, price: v[0], pack: v[1], pct: v[2], share: v[3] });
  });
  return { channels, errors };
}

// One season. `ro` true runs the sap through reverse osmosis to roConcBrix before it reaches the evaporator.
export function season(s, channels, ro, yieldFactor = 1) {
  const sapGal = s.taps * s.galPerTap * yieldFactor;
  const syrupGal = sapGal * s.brix / 86; // the rule of 86: gallons of sap per gallon of syrup = 86 / Brix
  const conc = ro ? Math.max(s.roConcBrix, s.brix) : s.brix;
  const boilerSap = sapGal * s.brix / conc;
  const waterLb = Math.max(boilerSap * LB_PER_GAL_SAP - syrupGal * LB_PER_GAL_SYRUP, 0);
  const fuelUnits = waterLb * BTU_PER_LB_WATER / (Math.min(Math.max(s.efficiencyPct, 5), 100) / 100) / s.fuelBtuPerUnit;
  const fuel = fuelUnits * s.fuelPricePerUnit;
  const boilHours = boilerSap / s.evapSapGph;
  const hours = s.taps * s.hoursPerTap + boilHours + syrupGal * s.bottlingHoursPerGal;
  const labor = hours * s.laborRate;
  const supplies = s.taps * s.suppliesPerTap;
  const tubing = s.taps * s.tubingPerTap / s.tubingYears;
  const evaporator = s.evaporatorCost / s.evaporatorYears;
  const roCost = ro ? s.roCapital / s.roYears + s.roMembranesPerSeason + sapGal * s.roPowerPerSapGal : 0;
  const shareTotal = channels.reduce((x, c) => x + c.share, 0) || 1;
  let revenue = 0, packaging = 0, fees = 0;
  const parts = channels.map((c) => {
    const gal = syrupGal * c.share / shareTotal;
    const rev = gal * c.price;
    const pk = gal * c.pack;
    const fee = rev * c.pct / 100;
    revenue += rev; packaging += pk; fees += fee;
    return { name: c.name, gal, revenue: rev, net: rev - pk - fee, netPerGal: gal ? (rev - pk - fee) / gal : 0 };
  });
  const cash = fuel + supplies + packaging + fees + roCost + s.overheadPerSeason;
  const depreciation = tubing + evaporator;
  const beforeLabor = revenue - cash - depreciation;
  const profit = beforeLabor - labor;
  const allIn = cash + depreciation + labor;
  return {
    sapGal, syrupGal, boilerSap, fuelUnits, fuel, hours, boilHours, labor, supplies, tubing, evaporator, roCost, packaging, fees,
    overhead: s.overheadPerSeason, revenue, beforeLabor, profit, parts,
    perTap: s.taps ? profit / s.taps : 0,
    perTapBeforeLabor: s.taps ? beforeLabor / s.taps : 0,
    perHour: hours ? beforeLabor / hours : 0,
    costPerGal: syrupGal ? allIn / syrupGal : 0,
    costPerGalBeforeLabor: syrupGal ? (allIn - labor) / syrupGal : 0,
    avgPricePerGal: syrupGal ? revenue / syrupGal : 0,
  };
}

export function analyze(channelsText, settings = {}) {
  const s = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(s)) if (Number.isFinite(settings[k])) s[k] = settings[k];
  s.brix = Math.min(Math.max(s.brix, 0.5), 8);
  s.tubingYears = Math.max(s.tubingYears, 1);
  s.evaporatorYears = Math.max(s.evaporatorYears, 1);
  s.roYears = Math.max(s.roYears, 1);
  s.evapSapGph = Math.max(s.evapSapGph, 1);
  s.fuelBtuPerUnit = Math.max(s.fuelBtuPerUnit, 1);
  const ch = parseChannels(channelsText);
  const errors = [...ch.errors];
  if (!ch.channels.length) return { summary: null, errors: [...errors, "Add at least one sales channel."], warnings: [] };
  if (!(s.taps > 0) || !(s.galPerTap > 0)) return { summary: null, errors: [...errors, "Taps and sap per tap must be above zero."], warnings: [] };
  const ro = Boolean(s.useRo);
  const now = season(s, ch.channels, ro);
  const without = season(s, ch.channels, false);
  const withRo = season(s, ch.channels, true);
  const roGain = withRo.profit - without.profit;
  const roSaving = (without.fuel + without.labor) - (withRo.fuel + withRo.labor);
  const roAnnualCost = withRo.roCost;
  const paybackYears = roSaving - (roAnnualCost - s.roCapital / s.roYears) > 0 ? s.roCapital / (roSaving - (withRo.roCost - s.roCapital / s.roYears)) : null;
  const seasons = [["Poor season", 0.6], ["Average season", 1], ["Good season", 1.3]].map(([label, f]) => ({ label, factor: f, ...season(s, ch.channels, ro, f) }));
  const warnings = [];
  const shareTotal = ch.channels.reduce((x, c) => x + c.share, 0);
  if (Math.abs(shareTotal - 100) > 0.5) warnings.push({ level: "medium", text: `Channel shares add to ${Math.round(shareTotal * 10) / 10}, not 100. They were scaled to 100.` });
  if (now.profit < 0) warnings.push({ level: "high", text: `At these numbers the season loses ${money(-now.profit)} once your own labour is paid at ${money2(s.laborRate)} an hour. Before labour it ${now.beforeLabor >= 0 ? "makes " + money(now.beforeLabor) + ", which is " + money2(now.perHour) + " for each of your " + Math.round(now.hours).toLocaleString("en-US") + " hours" : "still loses " + money(-now.beforeLabor)}.` });
  else warnings.push({ level: "info", text: `After paying your own labour at ${money2(s.laborRate)} an hour the season makes ${money(now.profit)}. Before labour it makes ${money(now.beforeLabor)}, which is ${money2(now.perHour)} for each of your ${Math.round(now.hours).toLocaleString("en-US")} hours.` });
  if (now.avgPricePerGal < now.costPerGal) warnings.push({ level: "high", text: `Your average price is ${money2(now.avgPricePerGal)} a gallon and your all-in cost is ${money2(now.costPerGal)}. Shift crop toward your best-paying channel or lower cost per gallon.` });
  const best = [...now.parts].sort((a, b) => b.netPerGal - a.netPerGal);
  if (best.length > 1 && best[0].netPerGal > 1.5 * best[best.length - 1].netPerGal) warnings.push({ level: "medium", text: `${best[0].name} nets ${money2(best[0].netPerGal)} a gallon after packaging and fees; ${best[best.length - 1].name} nets ${money2(best[best.length - 1].netPerGal)}. Moving ten points of the crop between them changes the season by about ${money(0.1 * now.syrupGal * (best[0].netPerGal - best[best.length - 1].netPerGal))}.` });
  if (s.roCapital > 0 && roAnnualCost > 0) {
    warnings.push({ level: "info", text: roGain > 0
      ? `Reverse osmosis to ${s.roConcBrix}% would raise profit about ${money(roGain)} a season: it saves ${money(roSaving)} of fuel and boiling labour and costs ${money(roAnnualCost)} a season to own and run. ${paybackYears ? `The ${money(s.roCapital)} unit pays for itself in about ${paybackYears.toFixed(1)} years at ${s.taps.toLocaleString("en-US")} taps.` : ""}`
      : `Reverse osmosis would lower profit about ${money(-roGain)} a season at ${s.taps.toLocaleString("en-US")} taps: it saves ${money(roSaving)} and costs ${money(roAnnualCost)} to own and run. It tends to pay at larger tap counts and with costly fuel.` });
  }
  if (s.galPerTap < 8) warnings.push({ level: "info", text: `${s.galPerTap} gallons of sap a tap is low; healthy trees on vacuum often give 15 to 25. Sap per tap moves the result more than anything else here, so try your own multi-year average.` });
  warnings.push({ level: "info", text: `Syrup is sap divided by 86 over Brix (the rule of 86): ${s.brix}% sap needs about ${(86 / s.brix).toFixed(0)} gallons of sap per gallon of syrup. Fuel is the heat to evaporate the water at ${s.efficiencyPct}% efficiency; check it against your own cords or gallons burned.` });
  const summary = { ...now, taps: s.taps, ro, without, withRo, roGain, roSaving, roAnnualCost, paybackYears, seasons };
  return { summary, parts: now.parts, seasons, warnings, errors, settings: s };
}

export function resultCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["scenario", "sap_gal", "syrup_gal", "revenue", "fuel", "labour", "profit_before_labour", "profit_after_labour", "hours", "profit_per_tap", "cost_per_gal"]];
  const f = (x) => Math.round(x * 100) / 100;
  for (const sc of [["without_ro", r.summary.without], ["with_ro", r.summary.withRo], ...r.seasons.map((x) => [x.label, x])]) {
    const a = sc[1];
    rows.push([sc[0], f(a.sapGal), f(a.syrupGal), f(a.revenue), f(a.fuel), f(a.labor), f(a.beforeLabor), f(a.profit), f(a.hours), f(a.perTap), f(a.costPerGal)]);
  }
  return rows.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export function summaryText(r) {
  const s = r.summary;
  const out = ["Maple sugarbush season", ""];
  out.push(`${s.taps.toLocaleString("en-US")} taps, ${Math.round(s.syrupGal)} gallons of syrup, revenue ${money(s.revenue)}.`);
  out.push(`Profit before your labour ${money(s.beforeLabor)} (${money2(s.perHour)} an hour for ${Math.round(s.hours)} hours); after paying labour ${money(s.profit)}, ${money2(s.perTap)} a tap.`);
  out.push(`All-in cost ${money2(s.costPerGal)} a gallon against an average price of ${money2(s.avgPricePerGal)}.`);
  for (const x of r.seasons) out.push(`${x.label}: ${money(x.profit)} after labour.`);
  out.push("", "Estimates from the numbers entered. Not tax, legal or food-safety advice.");
  return out.join("\n");
}
