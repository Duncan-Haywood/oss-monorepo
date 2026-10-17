// Water-well drilling bid for a small driller: what a finished well costs once you count drilling by formation, casing,
// grout seal, pitless adapter, pump and pressure tank, the trench and electric run, mobilization, rig hours, overhead and
// an allowance for the hole that comes up dry, and the price that earns your target margin. It also shows the effective
// price per foot of depth and what one dry hole costs you.
// Pure functions, nothing leaves the browser.
//
// Direct cost = drilling (consumables per foot by formation + rig and crew hours) + casing + grout + pitless adapter
//             + pump and tank + their install hours + trench and electric run + permit and water test + mobilization.
// Total cost  = direct cost x (1 + overhead) + dry-hole allowance, where allowance = chance of a dry hole x what one costs.
// Price       = total cost / (1 - target margin).
// The default figures are placeholders, not your rate card or your suppliers' prices.

export const DEFAULTS = {
  depthFt: 250,             // planned total depth, feet
  overburdenFt: 40,         // soil, clay and gravel above rock, feet (cased through)
  overburdenCostFt: 6,      // bits, fuel and consumables drilling overburden, dollars per foot
  rockCostFt: 11,           // bits, hammer wear, fuel and consumables drilling rock, dollars per foot
  overburdenFtPerHour: 25,  // feet you drill per rig hour in overburden
  rockFtPerHour: 12,        // feet you drill per rig hour in rock
  setupHours: 4,            // set up, develop, surge and clean up, rig hours
  rigRate: 185,             // rig, compressor and crew, dollars per rig hour
  casingFt: 60,             // casing set, feet
  casingCostFt: 14,         // casing and shoe, dollars per foot
  groutFt: 20,              // sealed annulus, feet
  groutCostFt: 6,           // grout or bentonite, dollars per foot
  pitlessCost: 380,         // pitless adapter, cap and fittings, dollars
  pumpCost: 1450,           // submersible pump, motor, wire and drop pipe, dollars
  tankCost: 520,            // pressure tank, switch and fittings, dollars
  pumpInstallHours: 4,      // hours to set pump, tank and plumb
  installRate: 90,          // what an install crew hour costs you, dollars
  trenchFt: 100,            // trench from well to house, feet
  trenchCostFt: 9,          // trench, water line and wire, dollars per foot
  permitTest: 300,          // permit, well log filing and water sample, dollars
  mobilization: 650,        // move the rig on and off, dollars
  dryHolePct: 8,            // chance the hole does not make usable water, percent
  dryRecoverPct: 0,         // share of a dry hole's cost the customer pays under your contract, percent
  abandonCost: 600,         // seal and abandon a dry hole, dollars
  overheadPct: 12,          // insurance, truck, office and licence, percent of direct cost
  marginPct: 25,            // margin you want on the price, percent
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

// Drilling cost and rig hours for the hole to `depthFt`.
export function drilling(o, depthFt = o.depthFt) {
  const over = Math.min(Math.max(o.overburdenFt, 0), depthFt);
  const rock = Math.max(depthFt - over, 0);
  const consumables = over * o.overburdenCostFt + rock * o.rockCostFt;
  const driveHours = (o.overburdenFtPerHour > 0 ? over / o.overburdenFtPerHour : 0) + (o.rockFtPerHour > 0 ? rock / o.rockFtPerHour : 0);
  const rigHours = driveHours + o.setupHours;
  const rig = rigHours * o.rigRate;
  return { over, rock, consumables, driveHours, rigHours, rig, cost: consumables + rig };
}

// Cost of one finished well to `depthFt`, including the dry-hole allowance.
export function wellCost(o, depthFt = o.depthFt) {
  const d = drilling(o, depthFt);
  const casing = o.casingFt * o.casingCostFt;
  const grout = o.groutFt * o.groutCostFt;
  const pumpSystem = o.pitlessCost + o.pumpCost + o.tankCost + o.pumpInstallHours * o.installRate;
  const trench = o.trenchFt * o.trenchCostFt;
  const direct = d.cost + casing + grout + pumpSystem + trench + o.permitTest + o.mobilization;
  const overhead = direct * (o.overheadPct / 100);
  // A dry hole costs what you spent before you knew: the drilling, the casing, the move and the permit, plus sealing it.
  const dryHoleCost = d.cost + casing + o.mobilization + o.permitTest + o.abandonCost;
  const dryHoleLoss = dryHoleCost * (1 - o.dryRecoverPct / 100);
  const allowance = (o.dryHolePct / 100) * dryHoleLoss;
  const cost = direct + overhead + allowance;
  return { drilling: d, casing, grout, pumpSystem, trench, direct, overhead, dryHoleCost, dryHoleLoss, allowance, cost, costIfGood: direct + overhead, depthFt };
}

export function priceFor(o, c, marginPct = o.marginPct) {
  const denom = 1 - marginPct / 100;
  return denom > 0 ? c.cost / denom : Infinity;
}

export function outcome(o, c, price) {
  const profit = price - c.cost;
  return {
    price, profit,
    margin: price > 0 ? (profit / price) * 100 : NaN,
    perFoot: c.depthFt > 0 ? price / c.depthFt : NaN,
    // What a good well earns over cost when no dry-hole allowance is spent.
    profitIfGood: price - c.costIfGood,
    // What this job leaves if this hole is the dry one and the price is not collected beyond your contract terms.
    resultIfDry: -c.dryHoleLoss,
  };
}

export function depthLadder(o, steps = [150, 200, 250, 300, 400, 500]) {
  return steps.map((ft) => {
    const c = wellCost(o, ft);
    const price = priceFor(o, c);
    return { depthFt: ft, price, perFoot: price / ft, cost: c.cost, dryHoleCost: c.dryHoleCost };
  });
}

export function dryRiskLadder(o, steps = [0, 5, 10, 15, 20, 30]) {
  return steps.map((p) => {
    const oo = { ...o, dryHolePct: p };
    const c = wellCost(oo);
    const price = priceFor(oo, c);
    return { dryHolePct: p, price, perFoot: price / o.depthFt, allowance: c.allowance };
  });
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (!(o.depthFt > 0)) warnings.push("Enter a depth above zero.");
  if (o.marginPct >= 100) warnings.push("Target margin must be under 100%.");
  if (o.dryHolePct > 100 || o.dryRecoverPct > 100) warnings.push("Percentages cannot exceed 100.");
  if (warnings.length) return { opts: o, warnings, result: null, depth: [], risk: [] };
  const c = wellCost(o);
  const price = priceFor(o, c);
  const atPrice = outcome(o, c, price);
  const result = { cost: c, price, atPrice, breakEven: c.cost, breakEvenIfGood: c.costIfGood,
    // How many good wells' profit one dry hole eats.
    wellsToCoverDry: atPrice.profitIfGood > 0 ? c.dryHoleLoss / atPrice.profitIfGood : Infinity };
  if (o.overburdenFt > o.depthFt) warnings.push("Overburden is deeper than the hole; it was capped at the depth.");
  if (o.casingFt < o.overburdenFt) warnings.push("Casing is shorter than the overburden; check that the casing reaches competent rock.");
  if (o.groutFt > o.casingFt) warnings.push("Grout length is longer than the casing; check the seal depth against your state rules.");
  if (o.dryHolePct === 0) warnings.push("A dry-hole chance of zero means a dry hole comes out of your margin. Enter your area's rate.");
  if (c.allowance > 0.1 * c.cost) warnings.push("The dry-hole allowance is over 10% of the cost; a contract that bills drilling by the foot would shift that risk to the customer.");
  return { opts: o, warnings, result, depth: depthLadder(o), risk: dryRiskLadder(o) };
}

export function toCsv(a) {
  if (!a || !a.depth.length) return "";
  return [
    "depth_ft,price,price_per_ft,cost,dry_hole_cost",
    ...a.depth.map((r) => [r.depthFt, r.price.toFixed(2), r.perFoot.toFixed(2), r.cost.toFixed(2), r.dryHoleCost.toFixed(2)].join(",")),
    "",
    "dry_hole_chance_pct,price,price_per_ft,allowance",
    ...a.risk.map((r) => [r.dryHolePct, r.price.toFixed(2), r.perFoot.toFixed(2), r.allowance.toFixed(2)].join(",")),
  ].join("\n") + "\n";
}
