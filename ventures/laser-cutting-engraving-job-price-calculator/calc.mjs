// Laser cutting and engraving job price. Pure arithmetic over what a laser shop types in: the piece size, cut path and engraved area, the
// sheet material (price, size, cut and engrave speed), how many pieces nest on a sheet, machine time, labour, setup, scrap and the margin wanted.
// It turns that into a cost, a price per piece, how the price falls with quantity, and which material costs least.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// One material per line: name, $ per sheet, sheet width in, sheet height in, cut speed in/min, engrave speed sq in/min
export function parseMaterials(text) {
  const materials = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, ...rest] = p;
    const where = `Material line ${i + 1}`;
    if (!name || rest.length < 6 - 1) return errors.push(`${where}: need "name, $ per sheet, sheet width in, sheet height in, cut speed in/min, engrave speed sq in/min".`);
    const [price, sw, sh, cut, engrave] = rest.map(num);
    if (![price, sw, sh, cut, engrave].every(Number.isFinite)) return errors.push(`${where}: use plain numbers.`);
    if (price < 0) return errors.push(`${where}: the sheet price cannot be negative.`);
    if (sw <= 0 || sh <= 0) return errors.push(`${where}: the sheet width and height must be above zero.`);
    if (cut <= 0 || engrave <= 0) return errors.push(`${where}: cut and engrave speeds must be above zero (inches per minute, square inches per minute).`);
    materials.push({ name, price, sw, sh, cut, engrave });
  });
  return { materials, errors };
}

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    qty: f("qty", 1), w: f("w"), h: f("h"), cutPath: f("cutPath"), passes: f("passes", 1), engravePct: f("engravePct"), gap: f("gap", 0.125),
    setupMin: f("setupMin"), loadMin: f("loadMin"), finishMin: f("finishMin"), machineRate: f("machineRate"), laborRate: f("laborRate"),
    overheadRate: f("overheadRate"), supplies: f("supplies"), scrapPct: f("scrapPct"), marginPct: f("marginPct", 40), rushPct: f("rushPct"),
    minCharge: f("minCharge"), targetPerPiece: f("targetPerPiece"),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!Number.isInteger(v.qty) || v.qty < 1) return { error: "Enter a whole number of pieces, at least 1." };
  if (v.w <= 0 || v.h <= 0) return { error: "Enter the width and height of one piece in inches (above zero)." };
  if (!Number.isInteger(v.passes) || v.passes < 1 || v.passes > 20) return { error: "Cut passes must be a whole number from 1 to 20." };
  if (v.engravePct > 100) return { error: "Engraved area is a share of the piece, 0 to 100 percent." };
  if (v.cutPath <= 0 && v.engravePct <= 0) return { error: "Enter a cut path length, an engraved area, or both: there is no laser time otherwise." };
  if (v.scrapPct >= 50) return { error: "Scrap above 50 percent is not a price, it is a process problem. Enter less than 50." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  return { v };
}

// How many pieces fit on one sheet, trying the piece both ways round, with a gap between pieces for kerf and bridges.
export function piecesPerSheet(v, m) {
  const fit = (sw, sh, w, h) => Math.max(0, Math.floor((sw + v.gap) / (w + v.gap))) * Math.max(0, Math.floor((sh + v.gap) / (h + v.gap)));
  return Math.max(fit(m.sw, m.sh, v.w, v.h), fit(m.sw, m.sh, v.h, v.w));
}

// Everything for one material at one quantity.
export function jobCost(v, m, qty = v.qty) {
  const perSheet = piecesPerSheet(v, m);
  if (perSheet < 1) return null;
  const runQty = qty / (1 - v.scrapPct / 100);
  const sheets = Math.ceil(runQty / perSheet - 1e-9);
  const lastSheetFill = runQty / (sheets * perSheet);
  const materialCost = sheets * m.price;
  const engraveArea = v.w * v.h * (v.engravePct / 100);
  const cutMin = (runQty * v.cutPath * v.passes) / m.cut;
  const engraveMin = (runQty * engraveArea) / m.engrave;
  const machineHours = (cutMin + engraveMin) / 60;
  const laborHours = (v.setupMin + sheets * v.loadMin + runQty * v.finishMin) / 60;
  const machineCost = machineHours * v.machineRate;
  const laborCost = laborHours * v.laborRate;
  const overhead = laborHours * v.overheadRate;
  const suppliesCost = runQty * v.supplies;
  const cost = materialCost + machineCost + laborCost + overhead + suppliesCost;
  const wanted = (cost / (1 - v.marginPct / 100)) * (1 + v.rushPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  const profit = price - cost;
  const piece = price / qty;
  const perMachineHour = machineHours > 0 ? (price - materialCost - suppliesCost) / machineHours : null;
  return {
    material: m.name, perSheet, sheets, lastSheetFill: round2(lastSheetFill), wasteShare: round2(1 - (qty * v.w * v.h) / (sheets * m.sw * m.sh)),
    materialCost: round2(materialCost), machineCost: round2(machineCost), laborCost: round2(laborCost), overhead: round2(overhead), suppliesCost: round2(suppliesCost),
    machineHours: round2(machineHours), cutHours: round2(cutMin / 60), engraveHours: round2(engraveMin / 60), laborHours: round2(laborHours),
    cost: round2(cost), wanted: round2(wanted), minApplied, price: round2(price), perPiece: round2(piece), profit: round2(profit),
    actualMarginPct: price > 0 ? round2((profit / price) * 100) : 0, perMachineHour: perMachineHour === null ? null : round2(perMachineHour), qty,
  };
}

const BREAKS = [1, 2, 5, 10, 25, 50, 100, 250, 500];

export function quantityBreaks(v, m) {
  const qtys = [...new Set([...BREAKS, v.qty])].sort((a, b) => a - b);
  return qtys.map((q) => {
    const c = jobCost(v, m, q);
    return { qty: q, price: c.price, perPiece: c.perPiece, minApplied: c.minApplied, current: q === v.qty };
  });
}

// Smallest order that brings the per-piece price to the customer's target (null if none given, Infinity if it never gets there).
export function breakEvenQty(v, m, limit = 5000) {
  if (!(v.targetPerPiece > 0)) return null;
  if (jobCost(v, m, 1).perPiece <= v.targetPerPiece) return 1;
  if (jobCost(v, m, limit).perPiece > v.targetPerPiece) return Infinity;
  let lo = 1, hi = limit;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (jobCost(v, m, mid).perPiece <= v.targetPerPiece) hi = mid; else lo = mid;
  }
  // Per-piece price is not strictly monotone (the last sheet fills and empties), so confirm with a short upward scan.
  for (let q = Math.max(1, hi - 25); q <= hi; q++) if (jobCost(v, m, q).perPiece <= v.targetPerPiece) return q;
  return hi;
}

// The machine hourly rate that makes the job price at a flat target per piece: what the customer's number implies you earn on the laser.
export function impliedMachineRate(v, m) {
  if (!(v.targetPerPiece > 0)) return null;
  const c = jobCost(v, m);
  if (c.machineHours <= 0) return null;
  const budget = v.targetPerPiece * v.qty * (1 - v.marginPct / 100) / (1 + v.rushPct / 100);
  return round2((budget - c.materialCost - c.laborCost - c.overhead - c.suppliesCost) / c.machineHours);
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const { materials, errors } = parseMaterials(input.materials);
  if (errors.length) return { error: errors[0] };
  if (!materials.length) return { error: "Add at least one material." };
  const fitting = materials.filter((m) => piecesPerSheet(v, m) >= 1);
  if (!fitting.length) return { error: "The piece does not fit on any of the sheets. Check the piece size and the sheet sizes (both in inches)." };
  const skipped = materials.filter((m) => !fitting.includes(m)).map((m) => m.name);
  const rows = fitting.map((m) => jobCost(v, m));
  const best = rows.reduce((a, b) => (b.price < a.price ? b : a));
  const worst = rows.reduce((a, b) => (b.price > a.price ? b : a));
  const bestM = fitting.find((m) => m.name === best.material);
  const advice = [];
  advice.push(`Quote ${usd(best.perPiece)} per piece, ${usd(best.price)} for ${v.qty} piece${v.qty === 1 ? "" : "s"} in ${best.material}. It costs you ${usd(best.cost)} to run and leaves ${usd(best.profit)} (${best.actualMarginPct}% of the price).`);
  if (best.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge is what sets this price: the job's cost-plus price is only ${usd(best.wanted)}. Below the minimum you are paid for the setup, not the pieces.`);
  const parts = [["material", best.materialCost], ["laser time", best.machineCost], ["labour", best.laborCost], ["overhead", best.overhead], ["supplies", best.suppliesCost]].sort((a, b) => b[1] - a[1]);
  if (best.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / best.cost) * 100)}% of the job.`);
  advice.push(`${best.perSheet} piece${best.perSheet === 1 ? "" : "s"} nest on a ${bestM.sw} x ${bestM.sh} in sheet, so the job takes ${best.sheets} sheet${best.sheets === 1 ? "" : "s"} and ${Math.round(best.wasteShare * 100)}% of the material bought is offcut.`);
  if (best.lastSheetFill < 0.6 && best.sheets > 1) advice.push(`The last sheet is only ${Math.round(best.lastSheetFill * 100)}% used. Rounding the order up to fill it adds pieces for almost no extra material cost.`);
  if (best.machineHours > 0) advice.push(`Laser time is ${best.machineHours} hours (${best.cutHours} cutting, ${best.engraveHours} engraving). After material and supplies the job earns ${usd(best.perMachineHour)} per laser hour; if your machine rate is lower than that, the price is paying for more than the laser.`);
  const be = breakEvenQty(v, bestM);
  if (be !== null) {
    if (be === Infinity) advice.push(`At ${usd(v.targetPerPiece)} per piece the customer is below your price at every quantity up to 5,000. Either the price or the process has to change.`);
    else if (be === 1) advice.push(`Your price is already at or under the customer's ${usd(v.targetPerPiece)} per piece for a single piece.`);
    else advice.push(`To meet the customer's ${usd(v.targetPerPiece)} per piece at your margin, the order has to reach ${be} pieces (you are quoting ${v.qty}).`);
    const imp = impliedMachineRate(v, bestM);
    if (imp !== null) advice.push(imp < v.machineRate ? `At ${usd(v.targetPerPiece)} per piece the laser would earn ${usd(imp)} an hour, below the ${usd(v.machineRate)} you set for it.` : `At ${usd(v.targetPerPiece)} per piece the laser would still earn ${usd(imp)} an hour, above the ${usd(v.machineRate)} you set for it.`);
  }
  if (rows.length > 1) advice.push(`Cheapest material for this job: ${best.material} at ${usd(best.price)}. The dearest, ${worst.material}, prices at ${usd(worst.price)}, ${usd(worst.price - best.price)} more.`);
  if (skipped.length) advice.push(`Left out because the piece does not fit the sheet: ${skipped.join(", ")}.`);
  return { error: null, input: v, materials: fitting, rows, best, worst, advice, breaks: quantityBreaks(v, bestM), sensitivity: sensitivity(input) };
}

// The first fitting material's price as the sheet price moves; sheet stock is the line most likely to change under you.
export function sensitivity(input) {
  const { v } = readInput(input);
  const { materials } = parseMaterials(input.materials);
  const m0 = v && materials.find((m) => piecesPerSheet(v, m) >= 1);
  if (!m0) return [];
  return [0.75, 1, 1.25, 1.5, 2].map((k) => {
    const m = { ...m0, price: round2(m0.price * k) };
    const c = jobCost(v, m);
    return { multiplier: k, sheetPrice: m.price, materialCost: c.materialCost, perPiece: c.perPiece, price: c.price };
  });
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return {
    qty: "60", w: "4", h: "3", cutPath: "14", passes: "1", engravePct: "35", gap: "0.125", setupMin: "20", loadMin: "3", finishMin: "1.5",
    machineRate: "30", laborRate: "25", overheadRate: "10", supplies: "0.25", scrapPct: "3", marginPct: "40", rushPct: "0", minCharge: "60", targetPerPiece: "6",
    materials: "1/8 in baltic birch ply, 9, 24, 12, 25, 30\n1/8 in basswood ply, 14, 24, 12, 28, 32\n1/8 in cast acrylic, 38, 24, 12, 18, 40\n1/4 in walnut hardwood, 55, 24, 12, 8, 24",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = ["qty", "w", "h", "cutPath", "passes", "engravePct", "gap", "setupMin", "loadMin", "finishMin", "machineRate", "laborRate", "overheadRate", "supplies", "scrapPct", "marginPct", "rushPct", "minCharge", "targetPerPiece", "materials"];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 2000));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 2000);
  return out;
}

export function toCsv(result) {
  const head = "material,pieces_per_sheet,sheets,material_cost,laser_cost,labour,overhead,supplies,cost,price,per_piece,margin_pct";
  return [head, ...result.rows.map((r) => [JSON.stringify(r.material), r.perSheet, r.sheets, r.materialCost, r.machineCost, r.laborCost, r.overhead, r.suppliesCost, r.cost, r.price, r.perPiece, r.actualMarginPct].join(","))].join("\n");
}
