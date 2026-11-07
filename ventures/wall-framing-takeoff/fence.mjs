// @ts-check
// Fence: posts, rails, pickets, post concrete and hardware for a picket or
// board fence typed as straight runs in feet (`runs: [length]`), with gates.
//
// Layout per run: gates split a run into sections; each section is cut into
// the fewest equal bays no wider than `postSpacing` (default 96 in). Posts
// stand at bay ends; corners and ends are shared between neighbouring runs
// (`closed: true` joins the last run back to the first); each gate adds two
// gate posts. Rails run whole bays, so a rail piece ends on a post: a stock
// board of `railStock` in (default 96) carries floor(stock / bay) bays.
// Pickets fill each section and each gate leaf at width + gap. Post length is
// height above grade plus `postDepth` buried, rounded up to a listed stock
// length. Concrete is the hole (typed diameter) less the post, in 80 lb bags
// at a typed yield. Every default is a typed figure: your frost depth, your
// code's height limit and your product's sizes are yours to enter. Gate
// frames, bracing, slope, grade changes and the post's lumber grade are not
// sized.
import { textNumberErrors } from "./numfields.mjs";

const NUMS = ["height", "postSpacing", "railCount", "railStock", "picketWidth", "gap", "postDepth", "holeDiameter", "postSize", "bagYieldCuFt", "waste", "fastenersPerCrossing", "fastenersPerBox", "postPrice", "railPrice", "picketPrice", "bagPrice", "fastenerBoxPrice", "gateKitPrice"];
const up = (/** @type {number} */ x) => Math.ceil(x - 1e-9);
const POST_STOCK = [96, 120, 144];

/** @param {any} d */
export function validateFence(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Fence settings are an object."];
  if (!Array.isArray(d.runs) || !d.runs.length) return ["Fence needs `runs`: a list of straight run lengths in feet."];
  if (d.runs.length > 100) return ["Fence takes at most 100 runs."];
  const e = [];
  for (const [i, r] of d.runs.entries()) if (typeof r !== "number" || !(r > 0 && r <= 2000)) e.push(`Run ${i + 1} must be a number of feet above 0 and at most 2000.`);
  if (e.length) return e;
  if (d.closed != null && typeof d.closed !== "boolean") return ["`closed` is true or false."];
  if (d.closed && d.runs.length < 3) return ["A closed fence needs at least 3 runs."];
  const f = d.fence ?? {};
  if (typeof f !== "object" || Array.isArray(f)) return ["`fence` is an object."];
  e.push(...textNumberErrors(f, NUMS));
  if (e.length) return e;
  const rng = (/** @type {string} */ k, /** @type {number} */ lo, /** @type {number} */ hi) => { if (f[k] != null && !(f[k] >= lo && f[k] <= hi)) e.push(`${k} must be between ${lo} and ${hi}.`); };
  rng("height", 12, 120); rng("postSpacing", 24, 144); rng("railCount", 1, 6); rng("railStock", 24, 240);
  rng("picketWidth", 1, 12); rng("gap", 0, 6); rng("postDepth", 12, 72); rng("holeDiameter", 4, 24);
  rng("postSize", 1, 8); rng("bagYieldCuFt", 0.1, 2); rng("waste", 0, 0.5); rng("fastenersPerCrossing", 1, 6); rng("fastenersPerBox", 10, 5000);
  if (f.railCount != null && !Number.isInteger(f.railCount)) e.push("railCount is a whole number.");
  if (e.length) return e;
  const gates = d.gates ?? [];
  if (!Array.isArray(gates) || gates.length > 50) return ["`gates` is a list of up to 50."];
  const used = d.runs.map(() => 0);
  for (const [i, g] of gates.entries()) {
    if (!g || typeof g !== "object" || Array.isArray(g)) { e.push(`Gate ${i + 1} is an object.`); continue; }
    const te = textNumberErrors(g, ["width", "run"]);
    if (te.length) { e.push(...te.map((x) => `Gate ${i + 1}: ${x}`)); continue; }
    const run = g.run ?? 0;
    if (!(g.width >= 24 && g.width <= 240)) { e.push(`Gate ${i + 1} needs a width between 24 and 240 in.`); continue; }
    if (!Number.isInteger(run) || run < 0 || run >= d.runs.length) { e.push(`Gate ${i + 1}: run must be the number of a run, counting from 0.`); continue; }
    used[run] += g.width;
  }
  if (e.length) return e;
  const spacing = f.postSpacing ?? 96, stock = f.railStock ?? 96;
  if (stock < spacing / Math.ceil(spacing / stock) - 1e-9 || stock < 12) e.push("railStock is too short.");
  d.runs.forEach((/** @type {number} */ r, /** @type {number} */ i) => { if (used[i] + 12 * (gates.filter((/** @type {any} */ g) => (g.run ?? 0) === i).length) > r * 12) e.push(`Run ${i + 1}: its gates leave no fence.`); });
  return e;
}

/** @param {any} d */
export function layoutFence(d) {
  const errors = validateFence(d);
  if (errors.length) return { ok: false, errors };
  const f = d.fence ?? {};
  const H = f.height ?? 72, S = f.postSpacing ?? 96, R = f.railCount ?? 3, stock = f.railStock ?? 96;
  const pw = f.picketWidth ?? 5.5, gap = f.gap ?? 0.25, depth = f.postDepth ?? 30, hole = f.holeDiameter ?? 10, ps = f.postSize ?? 3.5;
  const waste = f.waste ?? 0.05, yieldCu = f.bagYieldCuFt ?? 0.6, per = f.fastenersPerCrossing ?? 2, box = f.fastenersPerBox ?? 1000;
  const gates = d.gates ?? [];
  const nRuns = d.runs.length;
  let linePosts = 0, railPieces = 0, pickets = 0, fenceIn = 0, bays = 0;
  const notes = [];
  for (let i = 0; i < nRuns; i++) {
    const gs = gates.filter((/** @type {any} */ g) => (g.run ?? 0) === i);
    const net = d.runs[i] * 12 - gs.reduce((/** @type {number} */ a, /** @type {any} */ g) => a + g.width, 0);
    const sections = gs.length + 1, sec = net / sections;
    const b = Math.max(1, up(sec / S)), bay = sec / b;
    if (bay > stock + 1e-9) notes.push(`Run ${i + 1}: bays of ${bay.toFixed(1)} in are longer than the ${stock} in rail stock.`);
    const perBoard = Math.max(1, Math.floor((stock + 1e-9) / bay));
    linePosts += sections * (b - 1);
    bays += sections * b;
    railPieces += sections * R * up(b / perBoard);
    pickets += sections * up((sec + gap) / (pw + gap));
    fenceIn += net;
  }
  const gateCount = gates.length;
  for (const g of gates) pickets += up((g.width + gap) / (pw + gap));
  const cornerPosts = d.closed ? nRuns : nRuns + 1;
  const gatePosts = gateCount * 2;
  const posts = cornerPosts + linePosts + gatePosts;
  pickets = up(pickets * (1 + waste));
  const need = H + depth;
  const postLen = POST_STOCK.find((x) => x >= need - 1e-9);
  if (!postLen) return { ok: false, errors: [`A ${H} in fence with ${depth} in buried needs ${need} in posts; the longest listed is 144 in.`] };
  const holeCu = Math.PI * (hole / 2) ** 2 * depth / 1728 - ps * ps * depth / 1728;
  const bagsPerPost = Math.max(0, holeCu / yieldCu);
  const bags = up(posts * bagsPerPost);
  const fasteners = pickets * R * per;
  const boxes = up(fasteners / box);
  if (H > 72) notes.push("Over 6 ft: many places need a permit or a variance for a fence this tall; check yours.");
  if (depth < H / 3) notes.push(`Posts buried ${depth} in are under a third of the ${H} in height; most guides bury a third to a half and below the frost line.`);
  if (hole < 2 * ps) notes.push("A hole under twice the post width leaves little concrete round the post.");
  const lines = [[posts, f.postPrice], [railPieces, f.railPrice], [pickets, f.picketPrice], [bags, f.bagPrice], [boxes, f.fastenerBoxPrice], [gateCount, f.gateKitPrice]];
  const cost = lines.some(([, p]) => p != null) ? lines.reduce((s, [n, p]) => s + (p != null ? n * p : 0), 0) : null;
  return {
    ok: true, errors: [], feet: d.runs.reduce((/** @type {number} */ a, /** @type {number} */ b2) => a + b2, 0), fenceInches: fenceIn, bays, gates: gateCount,
    cornerPosts, linePosts, gatePosts, posts, postLength: postLen, rails: R, railPieces, railStock: stock, pickets, concreteBags: bags,
    concreteBagsPerPost: bagsPerPost, fasteners, fastenerBoxes: boxes, hinges: gateCount * 2, latches: gateCount, cost, notes,
  };
}

/** @param {any} p */
export function fenceText(p) {
  const s = (/** @type {number} */ n, /** @type {string} */ w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const l = [];
  l.push(`  Fence: ${p.feet} ft in ${s(p.bays, "bay")} and ${s(p.gates, "gate")}: ${s(p.posts, "post")} of ${p.postLength / 12} ft (${p.cornerPosts} end or corner, ${p.linePosts} line, ${p.gatePosts} gate), ${s(p.railPieces, "rail")} of ${p.railStock} in (${p.rails} per bay), ${s(p.pickets, "picket")} with waste.`);
  l.push(`  Concrete: ${p.concreteBagsPerPost.toFixed(2)} bags per hole -> ${s(p.concreteBags, "bag")}. Fasteners: ${p.fasteners} -> ${p.fastenerBoxes} box${p.fastenerBoxes === 1 ? "" : "es"}${p.gates ? `; ${s(p.hinges, "hinge")} and ${s(p.latches, "latch")}` : ""}.`);
  for (const n of p.notes) l.push(`  Note: ${n}`);
  if (p.cost != null) l.push(`  Fence cost: ${p.cost.toFixed(2)}.`);
  l.push("  Defaults are typed figures, not a code's or a maker's. Gate frames and bracing, slope, grade steps, post grade and permits are not counted.");
  return l;
}
