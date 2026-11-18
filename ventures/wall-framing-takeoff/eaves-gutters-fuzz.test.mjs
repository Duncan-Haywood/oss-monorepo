import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof } from "./roof.mjs";
import { layoutEaves, eavesText } from "./eaves.mjs";
import { layoutGutters, guttersText } from "./gutters.mjs";

// Property test: random roofs with random soffit, fascia and gutter settings are
// refused with a reason, or give counts whose stock covers the runs, with no NaN,
// no negative count, and more waste never giving fewer pieces.
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

test("fuzz: random roofs and eave/gutter settings are refused with a reason or add up", () => {
  const plan = { ...samplePlan(), walls: [] };
  let laid = 0, hip = 0, refused = 0;
  const failures = [];
  const bad = (v) => !Number.isFinite(v) || v < 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const shape = rand() < 0.35 ? "hip" : "gable";
    const roof = layoutRoof({
      id: "R", shape, width: 240 + Math.floor(rand() * (shape === "hip" ? 3 : 12)) * 12, length: 300 + Math.floor(rand() * (shape === "hip" ? 4 : 20)) * 12,
      pitch: 2 + Math.floor(rand() * 8), overhang: pick(rand, [0, 6, 12, 18, 24]), gableOverhang: pick(rand, [0, 6, 12, 18]),
      rafter: "2x12", spacing: 12, ridge: "2x10", ceilingJoist: "2x6",
    }, plan);
    if (!roof.ok) continue;
    const ed = {
      panelWidth: pick(rand, [6, 12, 16, 24]), panelStock: pick(rand, [96, 144, 192]), fasciaStock: pick(rand, [96, 192, 240]),
      channelStock: pick(rand, [96, 144]), waste: pick(rand, [0, 0.1, 0.3]), rakeSoffit: rand() < 0.5,
      panelPrice: pick(rand, [undefined, 14]), fasciaPrice: pick(rand, [undefined, 22]),
    };
    const gd = {
      gutterStock: pick(rand, [120, 240]), downspoutStock: pick(rand, [96, 120]), eaveHeight: pick(rand, [96, 120, 240]),
      hangerSpacing: pick(rand, [16, 24, 32]), maxRunFeet: pick(rand, [20, 40, 80]), sqFtPerDownspout: pick(rand, [300, 600, 1200]),
      waste: pick(rand, [0, 0.1, 0.3]), gutterPrice: pick(rand, [undefined, 9]),
    };
    let e, g;
    try { e = layoutEaves(ed, roof); g = layoutGutters(gd, roof); } catch (x) { failures.push(`seed ${seed}: threw ${x.message}`); continue; }
    for (const r of [e, g]) if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); }
    if (!e.ok || !g.ok) continue;
    laid++;
    if (shape === "hip") hip++;
    const eps = 1e-6;
    for (const [k, v] of Object.entries({ eaveFeet: e.eaveFeet, rakeFeet: e.rakeFeet, soffitSqFt: e.soffitSqFt, panels: e.panels, fascia: e.fascia, channel: e.channel })) if (bad(v)) failures.push(`seed ${seed}: eaves ${k} is ${v}`);
    for (const [k, v] of Object.entries({ runFeet: g.runFeet, gutters: g.gutters, downspouts: g.downspouts, downspoutPieces: g.downspoutPieces, hangers: g.hangers, endCaps: g.endCaps, elbows: g.elbows, straps: g.straps })) if (bad(v)) failures.push(`seed ${seed}: gutters ${k} is ${v}`);
    // stock covers the runs
    if (e.fascia * e.fasciaStock + eps < (e.eaveFeet + e.rakeFeet) * 12) failures.push(`seed ${seed}: fascia cannot hold its runs`);
    if (g.gutters * g.gutterStock + eps < g.runFeet * 12) failures.push(`seed ${seed}: gutter cannot hold its runs`);
    if (e.eaveCourses * ed.panelWidth + eps < roof.overhang) failures.push(`seed ${seed}: soffit courses short of overhang`);
    if (e.rakeFeet > 0 && shape === "hip") failures.push(`seed ${seed}: rake on a hip`);
    if (!ed.rakeSoffit && e.rakeCourses !== 0) failures.push(`seed ${seed}: rake soffit not asked for`);
    // downspouts: at least one per run, hangers at least one per run, two caps per run, corners only on a hip
    if (g.downspouts < g.runs) failures.push(`seed ${seed}: fewer downspouts than runs`);
    if (g.hangers < g.runs) failures.push(`seed ${seed}: fewer hangers than runs`);
    if (g.endCaps !== 2 * g.runs) failures.push(`seed ${seed}: end caps`);
    if (g.outsideCorners !== (shape === "hip" ? 4 : 0)) failures.push(`seed ${seed}: corners ${g.outsideCorners}`);
    if (g.elbows !== 2 * g.downspouts) failures.push(`seed ${seed}: elbows`);
    if (g.cost != null && bad(g.cost)) failures.push(`seed ${seed}: bad gutter cost`);
    if (e.cost != null && bad(e.cost)) failures.push(`seed ${seed}: bad eave cost`);
    if (eavesText(e).length < 3 || guttersText(g).length < 3) failures.push(`seed ${seed}: text too short`);
    // more waste never gives fewer pieces
    const e2 = layoutEaves({ ...ed, waste: 0.3 }, roof), g2 = layoutGutters({ ...gd, waste: 0.3 }, roof);
    if (e2.panels < e.panels || e2.fascia < e.fascia || e2.channel < e.channel) failures.push(`seed ${seed}: more waste gave fewer eave pieces`);
    if (g2.gutters < g.gutters) failures.push(`seed ${seed}: more waste gave fewer gutters`);
  }
  assert.deepEqual(failures.slice(0, 8), []);
  assert.ok(laid > 100, `laid ${laid}`);
  assert.ok(hip > 10, `hip ${hip}`);
});
