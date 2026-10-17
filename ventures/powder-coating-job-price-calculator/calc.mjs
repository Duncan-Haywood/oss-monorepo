// Powder coating job price. Pure arithmetic over what a coating shop types in: parts, surface area, film thickness, the powder (price,
// transfer efficiency, reclaim), prep / masking / spray / hang labour, oven batches, setup per colour, scrap and the margin wanted.
// It turns that into a cost, a price per piece and per square foot, how the price falls with quantity, and which powder costs least.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Square feet one pound covers at one mil (0.001 in) for a powder of specific gravity 1: 453.6 cm3 spread 0.00254 cm thick.
export const COVERAGE_AT_1_MIL = 192.2;

// One powder per line: name, $ per lb, transfer efficiency %, reclaim % of overspray reused, specific gravity (optional, 1.5)
export function parsePowders(text) {
  const powders = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, priceRaw, teRaw, reclaimRaw, sgRaw] = p;
    const where = `Powder line ${i + 1}`;
    if (!name || priceRaw === undefined || teRaw === undefined) return errors.push(`${where}: need "name, $ per lb, transfer efficiency %, reclaim % (optional), specific gravity (optional)".`);
    const price = num(priceRaw), te = num(teRaw);
    const reclaim = reclaimRaw === undefined || reclaimRaw === "" ? 0 : num(reclaimRaw);
    const sg = sgRaw === undefined || sgRaw === "" ? 1.5 : num(sgRaw);
    if (![price, te, reclaim, sg].every(Number.isFinite)) return errors.push(`${where}: use plain numbers.`);
    if (price < 0) return errors.push(`${where}: the price per pound cannot be negative.`);
    if (te <= 0 || te > 100) return errors.push(`${where}: transfer efficiency must be above 0 and at most 100 percent.`);
    if (reclaim < 0 || reclaim > 100) return errors.push(`${where}: reclaim must be between 0 and 100 percent.`);
    if (sg < 0.8 || sg > 3) return errors.push(`${where}: specific gravity is usually 1.2 to 2.0; check the number.`);
    powders.push({ name, price, te, reclaim, sg });
  });
  return { powders, errors };
}

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    qty: f("qty", 1), area: f("area"), mils: f("mils", 2.5), coats: f("coats", 1), partsPerBatch: f("partsPerBatch", 1), cycleMin: f("cycleMin", 40),
    ovenRate: f("ovenRate"), prepMin: f("prepMin"), maskMin: f("maskMin"), handleMin: f("handleMin"), sprayMin: f("sprayMin"), setupMin: f("setupMin"),
    laborRate: f("laborRate"), overheadRate: f("overheadRate"), supplies: f("supplies"), scrapPct: f("scrapPct"), marginPct: f("marginPct", 35),
    rushPct: f("rushPct"), minCharge: f("minCharge"), targetPerPiece: f("targetPerPiece"),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!Number.isInteger(v.qty) || v.qty < 1) return { error: "Enter a whole number of pieces, at least 1." };
  if (v.area <= 0) return { error: "Enter the surface area of one piece in square feet (above zero)." };
  if (v.mils <= 0 || v.mils > 20) return { error: "Film thickness is usually 1.5 to 4 mils; enter a value between 0 and 20." };
  if (!Number.isInteger(v.coats) || v.coats < 1 || v.coats > 3) return { error: "Coats must be a whole number from 1 to 3." };
  if (!Number.isInteger(v.partsPerBatch) || v.partsPerBatch < 1) return { error: "Pieces per oven batch must be a whole number, at least 1." };
  if (v.scrapPct >= 50) return { error: "Scrap above 50 percent is not a price, it is a process problem. Enter less than 50." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  return { v };
}

// Everything for one powder at one quantity.
export function jobCost(v, powder, qty = v.qty) {
  const coverage = COVERAGE_AT_1_MIL / (powder.sg * v.mils);
  const appliedPerPiece = (v.coats * v.area) / coverage;
  const sprayedPerPiece = appliedPerPiece / (powder.te / 100);
  const overspray = sprayedPerPiece - appliedPerPiece;
  const consumedPerPiece = appliedPerPiece + overspray * (1 - powder.reclaim / 100);
  const runQty = qty / (1 - v.scrapPct / 100);
  const powderLb = consumedPerPiece * runQty;
  const lostLb = overspray * (1 - powder.reclaim / 100) * runQty;
  const powderCost = powderLb * powder.price;
  const pieceHours = (runQty * (v.prepMin + v.maskMin + v.handleMin + v.coats * v.sprayMin)) / 60;
  const setupHours = (v.coats * v.setupMin) / 60;
  const laborHours = pieceHours + setupHours;
  const laborCost = laborHours * v.laborRate;
  const overhead = laborHours * v.overheadRate;
  const batches = Math.ceil(runQty / v.partsPerBatch - 1e-9);
  const lastBatchFill = runQty / (batches * v.partsPerBatch);
  const ovenHours = (batches * v.coats * v.cycleMin) / 60;
  const ovenCost = ovenHours * v.ovenRate;
  const suppliesCost = runQty * v.supplies;
  const cost = powderCost + laborCost + overhead + ovenCost + suppliesCost;
  const wanted = (cost / (1 - v.marginPct / 100)) * (1 + v.rushPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  const perPiece = price / qty;
  const profit = price - cost;
  const labourYield = laborHours > 0 ? (price - powderCost - suppliesCost - ovenCost) / laborHours : null;
  return {
    powder: powder.name,
    powderLb: round2(powderLb), lostLb: round2(lostLb), coverage: round2(coverage),
    powderCost: round2(powderCost), laborCost: round2(laborCost), overhead: round2(overhead), ovenCost: round2(ovenCost), suppliesCost: round2(suppliesCost),
    laborHours: round2(laborHours), setupHours: round2(setupHours), ovenHours: round2(ovenHours), batches, lastBatchFill: round2(lastBatchFill),
    cost: round2(cost), wanted: round2(wanted), minApplied, price: round2(price), perPiece: round2(perPiece), perSqFt: round2(perPiece / v.area),
    profit: round2(profit), actualMarginPct: price > 0 ? round2((profit / price) * 100) : 0,
    labourYield: labourYield === null ? null : round2(labourYield), qty,
  };
}

const BREAKS = [1, 2, 5, 10, 25, 50, 100, 250, 500];

// Price per piece as the order grows, plus the smallest quantity that meets the customer's target price if one was given.
export function quantityBreaks(v, powder) {
  const qtys = [...new Set([...BREAKS, v.qty])].sort((a, b) => a - b);
  return qtys.map((q) => {
    const c = jobCost(v, powder, q);
    return { qty: q, price: c.price, perPiece: c.perPiece, minApplied: c.minApplied, current: q === v.qty };
  });
}

export function breakEvenQty(v, powder, limit = 5000) {
  if (!(v.targetPerPiece > 0)) return null;
  if (jobCost(v, powder, 1).perPiece <= v.targetPerPiece) return 1;
  if (jobCost(v, powder, limit).perPiece > v.targetPerPiece) return Infinity;
  let lo = 1, hi = limit;
  // Per-piece price is not strictly monotone (the last oven batch fills and empties), so confirm the answer with a short upward scan.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (jobCost(v, powder, mid).perPiece <= v.targetPerPiece) hi = mid; else lo = mid;
  }
  let q = Math.max(1, hi - 25);
  for (; q <= hi; q++) if (jobCost(v, powder, q).perPiece <= v.targetPerPiece) return q;
  return hi;
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const { powders, errors } = parsePowders(input.powders);
  if (errors.length) return { error: errors[0] };
  if (!powders.length) return { error: "Add at least one powder." };
  const rows = powders.map((p) => jobCost(v, p));
  const best = rows.reduce((a, b) => (b.price < a.price ? b : a));
  const worst = rows.reduce((a, b) => (b.price > a.price ? b : a));
  const first = rows[0];
  const advice = [];
  advice.push(`Quote ${usd(best.perPiece)} per piece (${usd(best.perSqFt)} per square foot), ${usd(best.price)} for ${v.qty} piece${v.qty === 1 ? "" : "s"} in ${best.powder}. It costs you ${usd(best.cost)} to run and leaves ${usd(best.profit)} (${best.actualMarginPct}% of the price).`);
  if (best.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge is what sets this price: the job's cost-plus price is only ${usd(best.wanted)}. Below the minimum you are paid for the setup, not the pieces.`);
  const parts = [["powder", best.powderCost], ["labour", best.laborCost], ["overhead", best.overhead], ["oven", best.ovenCost], ["supplies", best.suppliesCost]].sort((a, b) => b[1] - a[1]);
  if (best.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / best.cost) * 100)}% of the job.`);
  if (best.setupHours > 0 && best.cost > 0) {
    const setupCost = best.setupHours * (v.laborRate + v.overheadRate);
    advice.push(`Colour setup is ${best.setupHours} hours, ${usd(setupCost)} before a single piece is sprayed: ${usd(setupCost / v.qty)} per piece at this quantity.`);
  }
  if (best.lostLb > 0) advice.push(`${best.lostLb} lb of powder never reaches a part or the reclaim hopper on this job, ${usd(best.lostLb * powders.find((p) => p.name === best.powder).price)} thrown away.`);
  if (best.batches > 0 && best.lastBatchFill < 0.7) advice.push(`The last of ${best.batches} oven batch${best.batches === 1 ? "" : "es"} is only ${Math.round(best.lastBatchFill * 100)}% full. Rounding the order up to fill it, or running it with another job, costs almost nothing in oven time.`);
  const be = breakEvenQty(v, powders.find((p) => p.name === best.powder));
  if (be !== null) {
    if (be === Infinity) advice.push(`At ${usd(v.targetPerPiece)} per piece the customer is below your price at every quantity up to 5,000. Either the price or the process has to change.`);
    else if (be === 1) advice.push(`Your price is already at or under the customer's ${usd(v.targetPerPiece)} per piece for a single piece.`);
    else advice.push(`To meet the customer's ${usd(v.targetPerPiece)} per piece at your margin, the order has to reach ${be} pieces (you are quoting ${v.qty}).`);
  }
  if (rows.length > 1) advice.push(`Cheapest powder for this job: ${best.powder} at ${usd(best.price)}. The dearest, ${worst.powder}, prices at ${usd(worst.price)}, ${usd(worst.price - best.price)} more.`);
  return { error: null, input: v, powders, rows, best, worst, advice, breaks: quantityBreaks(v, powders.find((p) => p.name === best.powder)), sensitivity: sensitivity(input), first };
}

// The first powder's price as the powder price moves; powder cost is the line most likely to change under you.
export function sensitivity(input) {
  const { v } = readInput(input);
  const { powders } = parsePowders(input.powders);
  if (!v || !powders.length) return [];
  return [0.75, 1, 1.25, 1.5, 2].map((m) => {
    const p = { ...powders[0], price: round2(powders[0].price * m) };
    const c = jobCost(v, p);
    return { multiplier: m, pricePerLb: p.price, powderCost: c.powderCost, perPiece: c.perPiece, price: c.price };
  });
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return {
    qty: "40", area: "3.5", mils: "2.5", coats: "1", partsPerBatch: "12", cycleMin: "45", ovenRate: "14", prepMin: "4", maskMin: "2", handleMin: "1.5",
    sprayMin: "3", setupMin: "30", laborRate: "28", overheadRate: "18", supplies: "0.6", scrapPct: "4", marginPct: "35", rushPct: "0", minCharge: "125",
    targetPerPiece: "18",
    powders: "Standard polyester gloss black, 7.5, 65, 0\nReclaimed standard polyester, 7.5, 65, 80\nCandy translucent, 24, 55, 50\nTexture black, 9, 70, 70",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = ["qty", "area", "mils", "coats", "partsPerBatch", "cycleMin", "ovenRate", "prepMin", "maskMin", "handleMin", "sprayMin", "setupMin", "laborRate", "overheadRate", "supplies", "scrapPct", "marginPct", "rushPct", "minCharge", "targetPerPiece", "powders"];

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
  const head = "powder,powder_lb,powder_cost,labour,overhead,oven,supplies,cost,price,per_piece,per_sqft,margin_pct";
  return [head, ...result.rows.map((r) => [JSON.stringify(r.powder), r.powderLb, r.powderCost, r.laborCost, r.overhead, r.ovenCost, r.suppliesCost, r.cost, r.price, r.perPiece, r.perSqFt, r.actualMarginPct].join(","))].join("\n");
}
