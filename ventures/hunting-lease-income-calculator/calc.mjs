// Hunting-lease income math for a landowner. Pure functions, no I/O. Every price and cost is the user's own number.

export const MODELS = Object.freeze({
  club: "One club or group, flat annual lease",
  perHunter: "Individual seasonal leases, one fee per hunter",
  dayHunt: "Paid day or weekend hunts",
});

const r2 = (x) => Math.round(x * 100) / 100;
const pos = (x) => Number.isFinite(x) && x > 0;

/**
 * Net income of one arrangement.
 * input: { acres, ratePerAcre, hunters, perHunterFee, fillPct, dayRate, daysSold, paymentPct,
 *          insuranceCost, upkeepCost, adminCost, lostUseCost, taxSavings, platformFeePct }
 */
export function netIncome(model, i) {
  if (!MODELS[model]) throw new Error(`unknown model: ${model}`);
  const fill = Math.min(1, Math.max(0, (i.fillPct ?? 100) / 100));
  let gross = 0;
  if (model === "club") gross = i.acres * i.ratePerAcre;
  else if (model === "perHunter") gross = i.hunters * fill * i.perHunterFee;
  else gross = i.daysSold * i.dayRate;
  const platform = gross * ((i.platformFeePct ?? 0) / 100);
  const costs = (i.insuranceCost ?? 0) + (i.upkeepCost ?? 0) + (i.adminCost ?? 0) + (i.lostUseCost ?? 0) + platform;
  const net = gross + (i.taxSavings ?? 0) - costs;
  return {
    model,
    label: MODELS[model],
    gross: Math.round(gross),
    costs: Math.round(costs),
    taxSavings: Math.round(i.taxSavings ?? 0),
    net: Math.round(net),
    netPerAcre: i.acres > 0 ? r2(net / i.acres) : null,
    margin: gross > 0 ? r2(net / gross) : null,
  };
}

/** Per-acre price at which the arrangement earns `target` dollars net (default 0, i.e. covers costs). */
export function breakEvenPerAcre(i, target = 0) {
  if (!pos(i.acres)) return null;
  const fixed = (i.insuranceCost ?? 0) + (i.upkeepCost ?? 0) + (i.adminCost ?? 0) + (i.lostUseCost ?? 0) - (i.taxSavings ?? 0);
  const keep = 1 - (i.platformFeePct ?? 0) / 100;
  if (keep <= 0) return null;
  return r2(Math.max(0, (fixed + target) / keep / i.acres));
}

export function validate(i) {
  if (!pos(i.acres)) return "Enter the acres you would lease.";
  for (const k of ["ratePerAcre", "perHunterFee", "dayRate", "insuranceCost", "upkeepCost", "adminCost", "lostUseCost", "taxSavings", "hunters", "daysSold"]) {
    if ((i[k] ?? 0) < 0 || !Number.isFinite(i[k] ?? 0)) return `${k} must be zero or more.`;
  }
  if ((i.fillPct ?? 100) > 100 || (i.paymentPct ?? 100) > 100) return "Percentages must be 100 or less.";
  if ((i.platformFeePct ?? 0) < 0 || (i.platformFeePct ?? 0) >= 100) return "Platform fee must be under 100 percent.";
  return null;
}

/** Compare all three arrangements, plus the hunters-per-acre density each one implies. */
export function compare(i) {
  const err = validate(i);
  if (err) return { error: err };
  const results = Object.keys(MODELS).map((m) => netIncome(m, i));
  const best = [...results].sort((a, b) => b.net - a.net)[0];
  // Density: fewer than ~1 hunter per 40 acres is the usual sanity line for quality, so flag crowding and say it is a rule of thumb.
  const huntersPerAcre = i.hunters > 0 ? i.acres / i.hunters : null;
  const advice = [];
  for (const r of results) if (r.net < 0) advice.push(`${r.label}: costs exceed income by ${money(-r.net)} at these inputs.`);
  if (best.net > 0) advice.push(`Highest net at your inputs: ${best.label}, ${money(best.net)} a year (${money(best.netPerAcre)} per acre).`);
  else advice.push("No arrangement covers its costs at these inputs. Lower the costs, raise the price, or leave the land unleased.");
  if (huntersPerAcre !== null && huntersPerAcre < 40) advice.push(`${Math.round(huntersPerAcre)} acres per hunter is crowded by the common ~40-acre rule of thumb; that is a quality and safety question, and it also affects renewals.`);
  const be = breakEvenPerAcre(i);
  if (be !== null) advice.push(`A flat club lease must be at least ${money2(be)} per acre to cover the costs you entered.`);
  if ((i.insuranceCost ?? 0) === 0) advice.push("Insurance cost is $0. Ask your insurer whether a hunting lease is covered or excluded under your current farm or homeowner policy before signing anything.");
  const clubVsHunters = results[0].net - results[1].net;
  return { results, best: best.model, bestNet: best.net, breakEvenPerAcre: be, clubVsHunters, advice };
}

/** Sensitivity of the per-hunter model to how many seats fill. */
export function fillSensitivity(i, steps = [50, 75, 100]) {
  return steps.map((p) => ({ fillPct: p, net: netIncome("perHunter", { ...i, fillPct: p }).net }));
}

export function money(x) {
  const v = Math.round(x);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}
export function money2(x) {
  return "$" + x.toFixed(2);
}

export function sampleInputs() {
  return { acres: 200, ratePerAcre: 12, hunters: 6, perHunterFee: 600, fillPct: 80, dayRate: 150, daysSold: 14, insuranceCost: 350, upkeepCost: 400, adminCost: 120, lostUseCost: 300, taxSavings: 0, platformFeePct: 0 };
}

export function toCsv(c) {
  const rows = [["arrangement", "gross", "costs", "tax_savings", "net", "net_per_acre"], ...c.results.map((r) => [`"${r.label}"`, r.gross, r.costs, r.taxSavings, r.net, r.netPerAcre ?? ""])];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
