// Cow-calf breakeven: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  cows: 100,
  hayTons: 2,
  hayPrice: 140,
  supplement: 60,
  pasture: 200,
  health: 35,
  bull: 45,
  labor: 90,
  other: 60,
  replacePct: 12,
  replaceCost: 1800,
  cullWeight: 1300,
  cullPrice: 100,
  weanPct: 88,
  weanWeight: 550,
  calfPrice: 250,
};

export const INPUT_NOTES = [
  { what: "Cows exposed", detail: "Cows and bred heifers put with a bull this year. Every per-cow figure below divides by this number, not by calves sold." },
  { what: "Hay, tons per cow", detail: "Tons fed per cow across the winter, as fed and including waste. Weigh a few bales and count how many you unroll; a feeding-day guess is usually low." },
  { what: "Hay price per ton", detail: "What a ton costs you delivered to the bale ring: purchase price, or for your own hay the cost to cut, bale and haul. Raising it with your own price is the fastest way to see whether the herd still pays." },
  { what: "Supplement, pasture, health, bull, labor, other", detail: "Dollars per cow per year. Pasture is rent, or the land's share of taxes, interest and fertiliser if you own it. Bull is purchase less resale spread over the years he works, divided by the cows he covers. Labor counts your own time at what you would pay someone, plus fuel and equipment." },
  { what: "Replacement rate and cost", detail: "Share of the herd replaced each year, and what a bred replacement costs (bought, or the market value of the heifer you keep). The loss on a cull cow is replacement cost less her sale value, spread over the whole herd." },
  { what: "Cull cow weight and price", detail: "Sale weight and price per hundredweight of the cows that leave the herd. A cull cow brings in far less than a replacement costs, and that gap is a real annual cost." },
  { what: "Weaned calves per cow exposed", detail: "Calves sold or weaned per hundred cows exposed, after open cows, calving losses and calves lost before weaning. 100 is not a realistic figure; check your own count, not the best year you remember." },
  { what: "Weaning weight and calf price", detail: "Average weight in pounds at sale and the blended price per hundredweight across steers and heifers. Prices move; use what the sale barn paid you or a number you want to test." },
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
export const money0 = (v) => money(Math.round(v)).replace(/\.00$/, "");
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

function core(o) {
  const cows = Math.round(num(o.cows, "Cows exposed", { min: 1 }));
  const hayTons = num(o.hayTons, "Hay tons per cow");
  const hayPrice = num(o.hayPrice, "Hay price per ton");
  const supplement = num(o.supplement, "Supplement");
  const pasture = num(o.pasture, "Pasture");
  const health = num(o.health, "Health");
  const bull = num(o.bull, "Bull");
  const labor = num(o.labor, "Labor and equipment");
  const other = num(o.other, "Other costs");
  const replacePct = num(o.replacePct, "Replacement rate");
  const replaceCost = num(o.replaceCost, "Replacement cost");
  const cullWeight = num(o.cullWeight, "Cull cow weight");
  const cullPrice = num(o.cullPrice, "Cull cow price");
  const weanPct = num(o.weanPct, "Weaned calves per cow exposed");
  const weanWeight = num(o.weanWeight, "Weaning weight", { min: 1 });
  const calfPrice = num(o.calfPrice, "Calf price");
  if (replacePct > 100) throw new Error("Replacement rate cannot be over 100%.");
  if (weanPct > 100) throw new Error("Weaned calves per cow exposed cannot be over 100%.");
  if (weanPct <= 0) throw new Error("Weaned calves per cow exposed must be over 0%.");

  const hay = hayTons * hayPrice;
  const cullValue = (cullWeight / 100) * cullPrice;
  const replacement = (replacePct / 100) * (replaceCost - cullValue);
  const lines = [
    { key: "hay", label: "Hay", value: hay },
    { key: "supplement", label: "Supplement", value: supplement },
    { key: "pasture", label: "Pasture", value: pasture },
    { key: "health", label: "Health", value: health },
    { key: "bull", label: "Bull", value: bull },
    { key: "labor", label: "Labor and equipment", value: labor },
    { key: "other", label: "Other", value: other },
    { key: "replacement", label: "Replacing cows (net of culls)", value: replacement },
  ];
  const costPerCow = lines.reduce((s, l) => s + l.value, 0);
  const calvesPerCow = weanPct / 100;
  const cwtPerCow = calvesPerCow * (weanWeight / 100);
  const revenuePerCow = cwtPerCow * calfPrice;
  const netPerCow = revenuePerCow - costPerCow;
  const biggest = lines.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    cows, lines, costPerCow, revenuePerCow, netPerCow, netHerd: netPerCow * cows,
    breakevenPrice: costPerCow / cwtPerCow,
    breakevenWeight: costPerCow / (calvesPerCow * (calfPrice / 100)),
    breakevenWeanPct: weanWeight && calfPrice ? (costPerCow / ((weanWeight / 100) * calfPrice)) * 100 : null,
    costPerCalf: costPerCow / calvesPerCow,
    perPoundOfWeight: calvesPerCow * (calfPrice / 100),
    perPointOfWeaning: (weanWeight / 100) * calfPrice / 100,
    biggest, biggestShare: costPerCow > 0 ? biggest.value / costPerCow : null,
    hayShare: costPerCow > 0 ? hay / costPerCow : null,
    weanPct, weanWeight, calfPrice, hayPrice, hayTons,
  };
}

export function computeBreakeven(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const priceScenarios = [0.8, 0.9, 1, 1.1, 1.2].map((k) => {
    const x = core({ ...o, calfPrice: r.calfPrice * k });
    return { factor: k, calfPrice: r.calfPrice * k, netPerCow: x.netPerCow, netHerd: x.netHerd, current: k === 1 };
  });
  const hayScenarios = [0.75, 1, 1.25, 1.5, 2].map((k) => {
    const x = core({ ...o, hayPrice: r.hayPrice * k });
    return { factor: k, hayPrice: r.hayPrice * k, costPerCow: x.costPerCow, netPerCow: x.netPerCow, breakevenPrice: x.breakevenPrice, current: k === 1 };
  });
  const weanScenarios = [-5, 0, 5].filter((d) => r.weanPct + d > 0 && r.weanPct + d <= 100).map((d) => {
    const x = core({ ...o, weanPct: r.weanPct + d });
    return { weanPct: r.weanPct + d, netPerCow: x.netPerCow, breakevenPrice: x.breakevenPrice, current: d === 0 };
  });
  return { ...r, priceScenarios, hayScenarios, weanScenarios };
}

export function summarize(r) {
  const good = r.netPerCow >= 0;
  const parts = [
    `Each cow exposed costs ${money(r.costPerCow)} a year and ${r.biggest.label.toLowerCase()} is the largest line at ${pct(r.biggestShare * 100)}.`,
    `At ${pct(r.weanPct)} weaned and ${Math.round(r.weanWeight)} lb, she brings in ${money(r.revenuePerCow)} at ${money(r.calfPrice)} per cwt, ${good ? "a margin of" : "a loss of"} ${money(Math.abs(r.netPerCow))} per cow, ${money(Math.abs(r.netHerd))} across ${r.cows} cows.`,
    `You break even at ${money(r.breakevenPrice)} per cwt on the calves you wean, or at ${Math.round(r.breakevenWeight)} lb at your price.`,
    `Each extra pound at weaning is worth ${money(r.perPoundOfWeight)} per cow exposed, and each extra point of calves weaned ${money(r.perPointOfWeaning)}.`,
  ];
  return { status: good ? "ok" : "warn", text: parts.join(" ") };
}
