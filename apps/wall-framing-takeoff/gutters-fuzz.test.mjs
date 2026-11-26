import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof } from "./roof.mjs";
import { layoutGutters, guttersText } from "./gutters.mjs";

// Property test: random roofs and gutter settings are refused with a reason, or
// give runs that the stock gutter can cover, a downspout on every run, enough
// hangers and caps, and no NaN or negative count. More waste never gives fewer
// gutter sections, and a lower per-downspout area never gives fewer downspouts.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

test("fuzz: random roofs and gutter settings are refused with a reason or add up", () => {
  const plan = { ...samplePlan(), walls: [] };
  let laid = 0, hips = 0, priced = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const hip = rand() < 0.35;
    const roof = layoutRoof({
      id: "R", shape: hip ? "hip" : "gable",
      width: hip ? 180 + Math.floor(rand() * 5) * 12 : 240 + Math.floor(rand() * 12) * 12, length: hip ? 240 + Math.floor(rand() * 6) * 12 : 300 + Math.floor(rand() * 20) * 12,
      pitch: 2 + Math.floor(rand() * 8), overhang: pick(rand, [6, 12, 18]), gableOverhang: pick(rand, [6, 12, 18]),
      rafter: "2x8", spacing: 16, ridge: "2x10", ceilingJoist: "2x6", collarTies: false,
    }, plan);
    if (!roof.ok) continue;
    const d = {
      gutterStock: pick(rand, [undefined, 96, 120, 240]),
      downspoutStock: pick(rand, [undefined, 120, 240]),
      eaveHeight: pick(rand, [undefined, 96, 120, 240]),
      hangerSpacing: pick(rand, [undefined, 16, 24, 32]),
      maxRunFeet: pick(rand, [undefined, 20, 40, 80]),
      sqFtPerDownspout: pick(rand, [undefined, 300, 600, 1500]),
      strapSpacing: pick(rand, [undefined, 48, 72]),
      waste: pick(rand, [0, 0.05, 0.1, 0.2]),
    };
    if (rand() < 0.4) Object.assign(d, { gutterPrice: 18, downspoutPrice: 9, hangerPrice: 1.2, capPrice: 3, elbowPrice: 4, cornerPrice: 8, strapPrice: 0.8 });
    let g;
    try { g = layoutGutters(d, roof); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!g.ok) { failures.push(`seed ${seed}: valid input refused: ${g.errors}`); continue; }
    laid++;
    if (hip) hips++;
    const eps = 1e-6;
    const nums = { runFeet: g.runFeet, runs: g.runs, planSqFt: g.planSqFt, gutters: g.gutters, downspouts: g.downspouts, downspoutPieces: g.downspoutPieces, hangers: g.hangers, endCaps: g.endCaps, outsideCorners: g.outsideCorners, elbows: g.elbows, straps: g.straps };
    for (const [k, v] of Object.entries(nums)) if (!Number.isFinite(v) || v < 0) failures.push(`seed ${seed}: ${k} is ${v}`);
    if (g.gutters * g.gutterStock + eps < g.runFeet * 12) failures.push(`seed ${seed}: sections cannot hold the runs`);
    if (g.downspouts < g.runs) failures.push(`seed ${seed}: a run has no downspout`);
    if (g.endCaps !== 2 * g.runs) failures.push(`seed ${seed}: caps ${g.endCaps} for ${g.runs} runs`);
    if (g.hangers < Math.floor(g.runFeet * 12 / g.hangerSpacing)) failures.push(`seed ${seed}: hangers short`);
    if (g.elbows !== 2 * g.downspouts) failures.push(`seed ${seed}: elbows`);
    if (g.downspoutPieces * g.downspoutStock + eps < g.downspouts * g.eaveHeight) failures.push(`seed ${seed}: downspout pieces short`);
    if (g.outsideCorners !== (hip ? 4 : 0)) failures.push(`seed ${seed}: corners ${g.outsideCorners}`);
    const anyPrice = d.gutterPrice != null;
    if (anyPrice) { priced++; if (!(g.cost > 0) || !Number.isFinite(g.cost)) failures.push(`seed ${seed}: bad cost ${g.cost}`); }
    else if (g.cost !== null) failures.push(`seed ${seed}: cost without prices`);
    if (guttersText(g).length < 4) failures.push(`seed ${seed}: text too short`);
    const more = layoutGutters({ ...d, waste: Math.min(0.3, (d.waste ?? 0.1) + 0.1) }, roof);
    if (more.gutters < g.gutters) failures.push(`seed ${seed}: more waste gave fewer sections`);
    const tighter = layoutGutters({ ...d, sqFtPerDownspout: Math.max(100, (d.sqFtPerDownspout ?? 600) / 2) }, roof);
    if (tighter.downspouts < g.downspouts) failures.push(`seed ${seed}: tighter area rule gave fewer downspouts`);
  }
  assert.deepEqual(failures, []);
  assert.ok(laid > 100, `laid ${laid}`);
  assert.ok(hips > 30, `hips ${hips}`);
  assert.ok(priced > 30, `priced ${priced}`);
});
