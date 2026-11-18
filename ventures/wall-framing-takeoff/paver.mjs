// @ts-check
// Paver patio or walk: pavers, compacted base, bedding sand, edge restraint,
// joint sand and fabric for areas typed as rectangles in feet
// (`areas: [{ width, length, subtract? }]`; `subtract: true` takes a planter or
// a slab out of the paved area).
//
// Pavers: area at unit size plus joint, plus waste, rounded up. The excavation
// is base + sand + paver thickness deep and `baseOverhang` wider than the paving
// on every side of each positive rectangle (rectangles are added as typed, so
// two that overlap are counted twice). Base is bought loose, so its volume is
// multiplied by `compaction`. Joint sand fills the gap volume at a typed density.
// Edge restraint runs the perimeter of the positive rectangles unless you type
// `edgeFeet`, since a side against a house or a slab needs none. Every default is a
// typed figure: base depth for your soil and frost, your paver's size and your
// supplier's bag sizes are yours to enter. Slope for drainage, sub-base
// stabilisation, steps and curves are not sized.
import { textNumberErrors } from "./numfields.mjs";

const NUMS = ["length", "width", "thickness", "joint", "baseDepth", "sandDepth", "baseOverhang", "compaction", "waste", "baseTonsPerCuYd", "sandTonsPerCuYd", "jointSandLbPerCuFt", "jointSandBagLb", "edgeStockFt", "spikeSpacingIn", "fabricOverlapFt", "paverPrice", "baseTonPrice", "sandTonPrice", "edgePrice", "spikePrice", "jointSandBagPrice", "fabricSqFtPrice"];
const up = (/** @type {number} */ x) => Math.max(0, Math.ceil(x - 1e-9)) + 0;

/** @param {any} d */
export function validatePaver(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Paver settings are an object."];
  if (!Array.isArray(d.areas) || !d.areas.length) return ["Pavers need `areas`: a list of rectangles with width and length in feet."];
  if (d.areas.length > 100) return ["Pavers take at most 100 areas."];
  const e = [];
  let net = 0;
  for (const [i, a] of d.areas.entries()) {
    if (!a || typeof a !== "object" || Array.isArray(a)) { e.push(`Area ${i + 1} is an object.`); continue; }
    const te = textNumberErrors(a, ["width", "length"]);
    if (te.length) { e.push(...te.map((x) => `Area ${i + 1}: ${x}`)); continue; }
    if (!(a.width > 0 && a.width <= 500 && a.length > 0 && a.length <= 500)) { e.push(`Area ${i + 1}: width and length are feet above 0 and at most 500.`); continue; }
    if (a.subtract != null && typeof a.subtract !== "boolean") { e.push(`Area ${i + 1}: subtract is true or false.`); continue; }
    net += (a.subtract ? -1 : 1) * a.width * a.length;
  }
  if (e.length) return e;
  if (!(net > 0)) return ["The subtracted areas leave nothing to pave."];
  const p = d.paver ?? {};
  if (typeof p !== "object" || Array.isArray(p)) return ["`paver` is an object."];
  e.push(...textNumberErrors(p, NUMS));
  if (d.edgeFeet != null && !(typeof d.edgeFeet === "number" && d.edgeFeet >= 0 && d.edgeFeet <= 5000)) e.push("edgeFeet is a number of feet from 0 to 5000.");
  if (e.length) return e;
  const rng = (/** @type {string} */ k, /** @type {number} */ lo, /** @type {number} */ hi) => { if (p[k] != null && !(p[k] >= lo && p[k] <= hi)) e.push(`${k} must be between ${lo} and ${hi}.`); };
  rng("length", 1, 48); rng("width", 1, 48); rng("thickness", 0.5, 8); rng("joint", 0, 2); rng("baseDepth", 0, 24); rng("sandDepth", 0, 4);
  rng("baseOverhang", 0, 24); rng("compaction", 1, 2); rng("waste", 0, 0.5); rng("baseTonsPerCuYd", 0.5, 2.5); rng("sandTonsPerCuYd", 0.5, 2.5);
  rng("jointSandLbPerCuFt", 20, 150); rng("jointSandBagLb", 5, 200); rng("edgeStockFt", 1, 20); rng("spikeSpacingIn", 4, 48); rng("fabricOverlapFt", 0, 3);
  return e;
}

/** @param {any} d */
export function layoutPaver(d) {
  const errors = validatePaver(d);
  if (errors.length) return { ok: false, errors };
  const p = d.paver ?? {};
  const L = p.length ?? 8, W = p.width ?? 4, T = p.thickness ?? 2.375, J = p.joint ?? 0.125;
  const baseD = p.baseDepth ?? 4, sandD = p.sandDepth ?? 1, over = p.baseOverhang ?? 6, comp = p.compaction ?? 1.25, waste = p.waste ?? 0.1;
  const baseT = p.baseTonsPerCuYd ?? 1.4, sandT = p.sandTonsPerCuYd ?? 1.35, sandLb = p.jointSandLbPerCuFt ?? 100, bagLb = p.jointSandBagLb ?? 50;
  const stock = p.edgeStockFt ?? 10, spike = p.spikeSpacingIn ?? 12, lap = p.fabricOverlapFt ?? 1;
  let net = 0, spread = 0, perim = 0, fabric = 0;
  for (const a of d.areas) {
    if (a.subtract) { net -= a.width * a.length; continue; }
    net += a.width * a.length;
    spread += (a.width + 2 * over / 12) * (a.length + 2 * over / 12);
    perim += 2 * (a.width + a.length);
    fabric += (a.width + 2 * over / 12 + lap) * (a.length + 2 * over / 12 + lap);
  }
  for (const a of d.areas) if (a.subtract) spread -= a.width * a.length;
  const unitIn2 = (L + J) * (W + J);
  const exact = net * 144 / unitIn2;
  const pavers = up(exact * (1 + waste));
  const cu = (/** @type {number} */ ft2, /** @type {number} */ inches) => ft2 * inches / 12 / 27;
  const excavation = cu(spread, baseD + sandD + T);
  const baseLoose = cu(spread, baseD) * comp;
  const baseTons = baseLoose * baseT;
  const sandCu = cu(net, sandD), sandTons = sandCu * sandT;
  const gapFrac = 1 - (L * W) / unitIn2;
  const jointCuFt = net * T / 12 * gapFrac;
  const jointLb = jointCuFt * sandLb;
  const jointBags = up(jointLb / bagLb);
  const edgeFeet = d.edgeFeet ?? perim;
  const edgePieces = up(edgeFeet / stock);
  const spikes = up(edgeFeet * 12 / spike);
  const notes = [];
  if (baseD < 4) notes.push(`A ${baseD} in base is thin; guides usually give 4 in for a walk or patio and 6 to 12 in for a drive or weak soil. Yours is a typed figure.`);
  if (J > 0.5) notes.push("A joint over 1/2 in is wide for a paver; check your product's spacing.");
  if (L / W > 4 && Math.min(L, W) < 3) notes.push("Slender pavers can crack in the plain; check the maker's length to thickness limit.");
  if (d.areas.some((/** @type {any} */ a) => a.subtract) && d.edgeFeet == null) notes.push("The perimeter of a subtracted area is not added to the edge restraint; type edgeFeet if it needs one.");
  const lines = [[pavers, p.paverPrice], [baseTons, p.baseTonPrice], [sandTons, p.sandTonPrice], [edgePieces, p.edgePrice], [spikes, p.spikePrice], [jointBags, p.jointSandBagPrice], [fabric, p.fabricSqFtPrice]];
  const cost = lines.some(([, pr]) => pr != null) ? lines.reduce((s, [n, pr]) => s + (pr != null ? n * pr : 0), 0) : null;
  return {
    ok: true, errors: [], netSqFt: net, pavers, paversExact: exact, perSqFt: pavers / net, excavationCuYd: excavation, depthIn: baseD + sandD + T,
    baseCuYd: baseLoose, baseTons, sandCuYd: sandCu, sandTons, jointSandLb: jointLb, jointSandBags: jointBags, edgeFeet, edgePieces, spikes, fabricSqFt: fabric, cost, notes,
  };
}

/** @param {any} p */
export function paverText(p) {
  const n1 = (/** @type {number} */ x) => x.toFixed(2);
  const l = [];
  l.push(`  Paving: ${n1(p.netSqFt)} sq ft -> ${p.pavers} pavers (${n1(p.paversExact)} exact, ${n1(p.perSqFt)} per sq ft with waste).`);
  l.push(`  Dig ${n1(p.depthIn)} in deep: ${n1(p.excavationCuYd)} cu yd out. Base ${n1(p.baseCuYd)} cu yd loose (${n1(p.baseTons)} tons), bedding sand ${n1(p.sandCuYd)} cu yd (${n1(p.sandTons)} tons), fabric ${Math.ceil(p.fabricSqFt)} sq ft.`);
  l.push(`  Edge restraint: ${n1(p.edgeFeet)} ft -> ${p.edgePieces} piece${p.edgePieces === 1 ? "" : "s"} and ${p.spikes} spike${p.spikes === 1 ? "" : "s"}. Joint sand: ${Math.ceil(p.jointSandLb)} lb -> ${p.jointSandBags} bag${p.jointSandBags === 1 ? "" : "s"}.`);
  for (const x of p.notes) l.push(`  Note: ${x}`);
  if (p.cost != null) l.push(`  Paving cost: ${p.cost.toFixed(2)}.`);
  l.push("  Defaults are typed figures, not a code's or a maker's. Drainage slope, sub-base stabilisation, steps, curves, cuts beyond the waste and permits are not sized.");
  return l;
}
