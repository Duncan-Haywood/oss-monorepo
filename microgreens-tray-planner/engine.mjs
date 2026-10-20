// Microgreens tray planner: arithmetic and a greedy rack-space scheduler on numbers the user types.
// No network, no dependencies.
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULTS = {
  rackTrays: 80,
  harvestDays: [2, 5],
  lossPct: 8,
  mediaPerTray: 0.75,
  packPerOz: 0.12,
  minutesPerTray: 14,
  wage: 20,
  fixedWeek: 90,
  crops: [
    { name: "Radish", days: 8, ozPerTray: 8, pricePerOz: 2.0, seedPerTray: 0.9, trays: 20, maxTrays: 24 },
    { name: "Pea shoots", days: 10, ozPerTray: 14, pricePerOz: 1.6, seedPerTray: 2.4, trays: 10, maxTrays: 16 },
    { name: "Sunflower", days: 9, ozPerTray: 10, pricePerOz: 1.8, seedPerTray: 2.0, trays: 15, maxTrays: 20 },
    { name: "Broccoli", days: 10, ozPerTray: 6, pricePerOz: 2.4, seedPerTray: 0.9, trays: 10, maxTrays: 14 },
  ],
};

export const INPUT_NOTES = [
  { what: "Days to harvest", detail: "Calendar days from the seeding day to the cut, including soak and blackout. Radish is often 7-9 days, pea shoots 9-12, sunflower 8-10. Use your own room's times: a cool room adds days, and every extra day is a rack space you cannot reuse." },
  { what: "Oz per tray", detail: "Ounces you actually cut and pack from one tray, not the seed packet's best case. A 10x20 inch tray commonly gives 6-14 oz depending on crop. Weigh ten trays and average them." },
  { what: "Price per oz", detail: "What the buyer pays you per ounce: farmers market, restaurant or wholesale. Restaurants usually pay less per ounce than the market; use the blend you really get." },
  { what: "Seed per tray", detail: "Seed is the biggest variable cost for heavy seeders such as pea and sunflower. Bulk seed costs a fraction of packet seed, so enter the price you actually pay." },
  { what: "Trays per week and the most you can sell", detail: "Trays per week is the plan the schedule and totals use. The most you can sell is a ceiling for the Optimise button, which fills a limited rack with the crops that earn most per rack space." },
  { what: "Harvest days", detail: "The weekdays you cut and deliver. Each crop's trays are split across them and seeded the right number of days earlier, so a crop that takes 10 days is seeded 10 days before each cut." },
  { what: "Rack spaces", detail: "Trays your racks hold at one time under lights. The plan is checked day by day: the number of trays occupying a rack on the busiest weekday must fit, not just the weekly average." },
  { what: "Loss (%)", detail: "Trays and ounces lost to mould, failed germination, unsold greens and samples. It reduces what you sell but not what you spend." },
  { what: "Media and packaging", detail: "Soil, coco or mats per tray, and clamshells and labels per ounce sold." },
  { what: "Minutes per tray and your wage", detail: "Seeding, watering, moving, harvesting, packing, washing trays and delivery divided over the trays. Time one full week; washing and packing are what people forget." },
  { what: "Fixed cost per week", detail: "Share of rent, electricity for lights and fans, water and insurance, spread to a week." },
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

export function pct(v) {
  return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
}

const mod7 = (n) => ((n % 7) + 7) % 7;

function clean(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const harvestDays = [...new Set((o.harvestDays || []).map((d) => Number(d)))].sort((a, b) => a - b);
  if (!harvestDays.length || harvestDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Choose at least one harvest day.");
  if (!Array.isArray(o.crops) || !o.crops.length) throw new Error("Add at least one crop.");
  const crops = o.crops.map((c, i) => {
    const label = c.name ? String(c.name).trim() : `Crop ${i + 1}`;
    const days = num(c.days, `${label}: days to harvest`, { min: 1 });
    if (!Number.isInteger(days)) throw new Error(`${label}: days to harvest must be a whole number.`);
    const trays = num(c.trays, `${label}: trays per week`);
    const maxTrays = num(c.maxTrays ?? c.trays, `${label}: most trays you can sell`);
    if (!Number.isInteger(trays) || !Number.isInteger(maxTrays)) throw new Error(`${label}: trays must be whole numbers.`);
    return {
      name: label,
      days,
      ozPerTray: num(c.ozPerTray, `${label}: oz per tray`),
      pricePerOz: num(c.pricePerOz, `${label}: price per oz`),
      seedPerTray: num(c.seedPerTray, `${label}: seed per tray`),
      trays,
      maxTrays,
    };
  });
  return {
    harvestDays,
    crops,
    rackTrays: num(o.rackTrays, "Rack spaces", { min: 1 }),
    lossPct: Math.min(100, num(o.lossPct, "Loss")),
    mediaPerTray: num(o.mediaPerTray, "Media per tray"),
    packPerOz: num(o.packPerOz, "Packaging per oz"),
    minutesPerTray: num(o.minutesPerTray, "Minutes per tray"),
    wage: num(o.wage, "Your wage"),
    fixedWeek: num(o.fixedWeek, "Fixed cost per week"),
  };
}

// Split n trays over k harvest days as evenly as whole trays allow.
export function splitTrays(n, k) {
  const base = Math.floor(n / k);
  const extra = n - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

function unitEconomics(c, o) {
  const sold = c.ozPerTray * (1 - o.lossPct / 100);
  const revenue = sold * c.pricePerOz;
  const cost = c.seedPerTray + o.mediaPerTray + o.packPerOz * sold;
  const margin = revenue - cost;
  const labor = (o.minutesPerTray / 60) * o.wage;
  return { sold, revenue, cost, margin, marginPerTrayDay: margin / c.days, afterWagePerTray: margin - labor };
}

function schedule(crops, harvestDays) {
  const batches = [];
  for (const c of crops) {
    const split = splitTrays(c.trays, harvestDays.length);
    harvestDays.forEach((h, i) => {
      if (split[i] > 0) batches.push({ crop: c.name, trays: split[i], days: c.days, harvestDow: h, seedDow: mod7(h - c.days) });
    });
  }
  return batches;
}

// A tray occupies a rack from its seeding day until the morning it is cut.
function occupancy(batches) {
  const occ = Array(7).fill(0);
  for (const b of batches) for (let d = 0; d < b.days; d++) occ[mod7(b.seedDow + d)] += b.trays;
  return occ;
}

function plan(o) {
  const batches = schedule(o.crops, o.harvestDays);
  const occ = occupancy(batches);
  const peak = Math.max(...occ);
  const rows = o.crops.map((c, index) => {
    const u = unitEconomics(c, o);
    return { ...c, ...u, index, weekRevenue: u.revenue * c.trays, weekMargin: u.margin * c.trays, trayDays: c.trays * c.days };
  });
  const revenue = rows.reduce((s, r) => s + r.weekRevenue, 0);
  const variableCost = rows.reduce((s, r) => s + r.cost * r.trays, 0);
  const trays = rows.reduce((s, r) => s + r.trays, 0);
  const hours = (trays * o.minutesPerTray) / 60;
  const margin = revenue - variableCost - o.fixedWeek;
  return {
    rows, batches, occupancy: occ, peak, trays, hours, revenue, variableCost, margin,
    profitPerHour: hours > 0 ? margin / hours : 0,
    afterWage: margin - hours * o.wage,
    fits: peak <= o.rackTrays,
    shortBy: Math.max(0, peak - o.rackTrays),
    utilisation: (peak / o.rackTrays) * 100,
  };
}

// Greedy fill: add trays one harvest-cycle at a time (one tray per harvest day) to the crop that earns the most
// margin per rack-day, keeping only additions that still fit on the busiest weekday and stay under the sell limit.
export function optimiseMix(options = {}) {
  const o = clean(options);
  const k = o.harvestDays.length;
  const base = { ...o, crops: o.crops.map((c) => ({ ...c, trays: 0 })) };
  const order = o.crops.map((c, i) => ({ i, m: unitEconomics(c, o).marginPerTrayDay, positive: unitEconomics(c, o).margin > 0 })).filter((x) => x.positive).sort((a, b) => b.m - a.m);
  for (const { i } of order) {
    const cap = Math.floor(o.crops[i].maxTrays / k) * k;
    while (base.crops[i].trays + k <= cap) {
      base.crops[i].trays += k;
      if (plan(base).peak > o.rackTrays) { base.crops[i].trays -= k; break; }
    }
  }
  // Fill the remainder one tray at a time where whole cycles no longer fit.
  for (const { i } of order) {
    while (base.crops[i].trays < o.crops[i].maxTrays) {
      base.crops[i].trays += 1;
      if (plan(base).peak > o.rackTrays) { base.crops[i].trays -= 1; break; }
    }
  }
  return base.crops.map((c) => c.trays);
}

export function computePlan(options = {}) {
  const o = clean(options);
  const current = plan(o);
  const trays = optimiseMix(options);
  const optimised = plan({ ...o, crops: o.crops.map((c, i) => ({ ...c, trays: trays[i] })) });
  const ranking = [...current.rows].sort((a, b) => b.marginPerTrayDay - a.marginPerTrayDay);
  return {
    ...current,
    input: o,
    ranking,
    optimised: { ...optimised, trays: trays },
    gainPerWeek: current.fits ? optimised.margin - current.margin : 0,
    gainPerYear: current.fits ? (optimised.margin - current.margin) * 52 : 0,
  };
}

export function summarize(r) {
  const top = r.ranking[0];
  const bottom = r.ranking[r.ranking.length - 1];
  const parts = [
    `Your plan sells about ${money(r.revenue)} a week and leaves ${money(r.margin)} after seed, media, packaging and fixed costs, which is ${money(r.profitPerHour)} an hour for ${r.hours.toFixed(1)} hours of work.`,
    r.fits
      ? `The busiest weekday needs ${r.peak} of your ${r.input.rackTrays} rack spaces.`
      : `The busiest weekday needs ${r.peak} rack spaces and you have ${r.input.rackTrays}, so you are ${r.shortBy} short on that day.`,
    `${top.name} earns the most per rack-day at ${money(top.marginPerTrayDay)}; ${bottom.name} earns the least at ${money(bottom.marginPerTrayDay)}.`,
  ];
  const mix = r.input.crops.map((c, i) => `${r.optimised.trays[i]} ${c.name}`).join(", ");
  if (!r.fits) parts.push(`The best mix that does fit ${r.input.rackTrays} rack spaces is ${mix} trays a week, making about ${money(r.optimised.margin)} a week.`);
  else if (r.gainPerWeek > 0.5) parts.push(`Refilling the rack with the best-earning mix within your sell limits (${mix} trays a week) would make about ${money(r.optimised.margin)} a week, ${money(r.gainPerWeek)} more, or ${money(r.gainPerYear)} over 52 weeks.`);
  else parts.push("Your plan is already close to the best mix this rack can hold within your sell limits.");
  return { status: r.fits && r.afterWage >= 0 ? "ok" : "warn", text: parts.join(" ") };
}
