// @ts-check
// Segmental retaining wall: blocks, cap, base gravel, drainage gravel, fabric,
// perforated pipe, geogrid and cap adhesive for straight walls typed as
// `walls: [{ length, height }]` in feet (`height` is the exposed height).
//
// Courses: the exposed height over the block height, rounded up, plus enough
// buried courses to cover `buryIn` (the first course goes below grade). Blocks
// per course: length over block length, rounded up, with `waste`. The cap is a
// separate unit on top and is not a course. The base trench is `baseDepth` deep
// and the block depth plus `baseOverhang` each side wide, bought loose
// (`compaction`). Drainage gravel fills `drainWidth` behind the wall over the
// whole built height. Geogrid goes every `geogridEvery` courses when typed
// (0 = none) at `geogridLength` feet back from the face. Every default is a typed
// figure, not an engineer's or a block maker's. Surcharge, slopes above or
// below, water, soil type, batter, corners, curves, steps in grade and walls
// over the height your jurisdiction allows without an engineer are not designed.
import { textNumberErrors } from "./numfields.mjs";

const NUMS = ["blockLength", "blockHeight", "blockDepth", "capLength", "buryIn", "waste", "baseDepth", "baseOverhang", "drainWidth", "compaction", "baseTonsPerCuYd", "drainTonsPerCuYd", "geogridEvery", "geogridLength", "capAdhesiveFtPerTube", "pipeFeet", "blockPrice", "capPrice", "baseTonPrice", "drainTonPrice", "fabricSqFtPrice", "pipeFootPrice", "geogridSqFtPrice", "adhesivePrice"];
const up = (/** @type {number} */ x) => Math.max(0, Math.ceil(x - 1e-9)) + 0;

/** @param {any} d */
export function validateRetaining(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Retaining wall settings are an object."];
  if (!Array.isArray(d.walls) || !d.walls.length) return ["A retaining wall needs `walls`: a list of straight runs with length and height in feet."];
  if (d.walls.length > 100) return ["At most 100 walls."];
  const e = [];
  for (const [i, w] of d.walls.entries()) {
    if (!w || typeof w !== "object" || Array.isArray(w)) { e.push(`Wall ${i + 1} is an object.`); continue; }
    const te = textNumberErrors(w, ["length", "height"]);
    if (te.length) { e.push(...te.map((x) => `Wall ${i + 1}: ${x}`)); continue; }
    if (!(w.length > 0 && w.length <= 1000)) e.push(`Wall ${i + 1}: length is feet above 0 and at most 1000.`);
    if (!(w.height > 0 && w.height <= 20)) e.push(`Wall ${i + 1}: height is exposed feet above 0 and at most 20.`);
  }
  if (e.length) return e;
  const b = d.block ?? {};
  if (typeof b !== "object" || Array.isArray(b)) return ["`block` is an object."];
  e.push(...textNumberErrors(b, NUMS));
  if (e.length) return e;
  const rng = (/** @type {string} */ k, /** @type {number} */ lo, /** @type {number} */ hi) => { if (b[k] != null && !(b[k] >= lo && b[k] <= hi)) e.push(`${k} must be between ${lo} and ${hi}.`); };
  rng("blockLength", 4, 48); rng("blockHeight", 2, 24); rng("blockDepth", 4, 36); rng("capLength", 4, 48); rng("buryIn", 0, 36); rng("waste", 0, 0.5);
  rng("baseDepth", 0, 24); rng("baseOverhang", 0, 24); rng("drainWidth", 0, 48); rng("compaction", 1, 2); rng("baseTonsPerCuYd", 0.5, 2.5); rng("drainTonsPerCuYd", 0.5, 2.5);
  rng("geogridEvery", 0, 20); rng("geogridLength", 0, 30); rng("capAdhesiveFtPerTube", 1, 100); rng("pipeFeet", 0, 5000);
  if (b.geogridEvery != null && b.geogridEvery >= 0 && !Number.isInteger(b.geogridEvery)) e.push("geogridEvery is a whole number of courses between geogrid layers (0 for none).");
  return e;
}

/** @param {any} d */
export function layoutRetaining(d) {
  const errors = validateRetaining(d);
  if (errors.length) return { ok: false, errors };
  const b = d.block ?? {};
  const L = b.blockLength ?? 16, H = b.blockHeight ?? 6, D = b.blockDepth ?? 12, capL = b.capLength ?? 16;
  const bury = b.buryIn ?? 6, waste = b.waste ?? 0.05, baseD = b.baseDepth ?? 6, over = b.baseOverhang ?? 6, drainW = b.drainWidth ?? 12;
  const comp = b.compaction ?? 1.25, baseT = b.baseTonsPerCuYd ?? 1.4, drainT = b.drainTonsPerCuYd ?? 1.35;
  const gEvery = b.geogridEvery ?? 0, gLen = b.geogridLength ?? 4, tubeFt = b.capAdhesiveFtPerTube ?? 20;
  let feet = 0, blocks = 0, caps = 0, baseCu = 0, drainCu = 0, fabric = 0, gridSqFt = 0, maxH = 0;
  const per = [];
  for (const w of d.walls) {
    const exposed = up(w.height * 12 / H);
    const buried = up(bury / H);
    const courses = exposed + buried;
    const perCourse = up(w.length * 12 / L);
    const wallBlocks = up(courses * perCourse * (1 + waste));
    const wallCaps = up(w.length * 12 / capL * (1 + waste));
    const builtFt = courses * H / 12;
    const layers = gEvery > 0 && gLen > 0 ? Math.floor((exposed - 1) / gEvery) : 0;
    feet += w.length; blocks += wallBlocks; caps += wallCaps; maxH = Math.max(maxH, w.height);
    baseCu += w.length * ((D + 2 * over) / 12) * (baseD / 12) / 27 * comp;
    drainCu += w.length * (drainW / 12) * builtFt / 27;
    fabric += w.length * (builtFt + drainW / 12 + 2);
    gridSqFt += layers * w.length * gLen;
    per.push({ length: w.length, height: w.height, exposedCourses: exposed, buriedCourses: buried, courses, blocksPerCourse: perCourse, blocks: wallBlocks, caps: wallCaps, geogridLayers: layers, faceSqFt: w.length * w.height });
  }
  const baseTons = baseCu * baseT, drainTons = drainCu * drainT;
  const pipeFeet = b.pipeFeet ?? feet;
  const tubes = up(feet / tubeFt);
  const faceSqFt = per.reduce((s, x) => s + x.faceSqFt, 0);
  const notes = [];
  if (maxH > 4 && b.geogridEvery == null) notes.push("A wall over about 4 ft exposed usually needs geogrid and often an engineer; type geogridEvery (courses between layers) and geogridLength if your block maker's manual calls for it.");
  if (maxH > 4) notes.push("Many jurisdictions require a permit and an engineer's design above about 4 ft (3 ft in some places) or with a slope or driveway above. Check yours.");
  if (bury < 6 && b.buryIn != null) notes.push("A buried course under 6 in is shallow; your maker's manual sets the embedment, often 1 course or 10% of the height.");
  if (D < H) notes.push("A block shallower than it is tall is unusual for a gravity wall; check the dimensions.");
  const lines = [[blocks, b.blockPrice], [caps, b.capPrice], [baseTons, b.baseTonPrice], [drainTons, b.drainTonPrice], [fabric, b.fabricSqFtPrice], [pipeFeet, b.pipeFootPrice], [gridSqFt, b.geogridSqFtPrice], [tubes, b.adhesivePrice]];
  const cost = lines.some(([, pr]) => pr != null) ? lines.reduce((s, [n, pr]) => s + (pr != null ? n * pr : 0), 0) : null;
  return { ok: true, errors: [], feet, faceSqFt, walls: per, blocks, caps, blocksPerSqFt: blocks / faceSqFt, baseCuYd: baseCu, baseTons, drainCuYd: drainCu, drainTons, fabricSqFt: fabric, pipeFeet, geogridSqFt: gridSqFt, adhesiveTubes: tubes, cost, notes };
}

/** @param {any} r */
export function retainingText(r) {
  const n1 = (/** @type {number} */ x) => x.toFixed(2);
  const l = [];
  for (const [i, w] of r.walls.entries()) l.push(`  Wall ${i + 1}: ${n1(w.length)} ft x ${n1(w.height)} ft exposed = ${w.exposedCourses} courses + ${w.buriedCourses} buried, ${w.blocksPerCourse} blocks per course -> ${w.blocks} blocks, ${w.caps} caps${w.geogridLayers ? `, ${w.geogridLayers} geogrid layer${w.geogridLayers === 1 ? "" : "s"}` : ""}.`);
  l.push(`  Total: ${r.blocks} blocks (${n1(r.blocksPerSqFt)} per sq ft of face) and ${r.caps} caps over ${n1(r.feet)} ft; ${r.adhesiveTubes} tube${r.adhesiveTubes === 1 ? "" : "s"} of cap adhesive.`);
  l.push(`  Gravel: base ${n1(r.baseCuYd)} cu yd loose (${n1(r.baseTons)} tons), drainage ${n1(r.drainCuYd)} cu yd (${n1(r.drainTons)} tons). Fabric ${Math.ceil(r.fabricSqFt)} sq ft, drain pipe ${Math.ceil(r.pipeFeet)} ft${r.geogridSqFt ? `, geogrid ${Math.ceil(r.geogridSqFt)} sq ft` : ""}.`);
  for (const x of r.notes) l.push(`  Note: ${x}`);
  if (r.cost != null) l.push(`  Wall cost: ${r.cost.toFixed(2)}.`);
  l.push("  Defaults are typed figures, not an engineer's or a block maker's. Surcharge, slopes, water, soil, batter, corners, curves, steps in grade and permits are not designed.");
  return l;
}
