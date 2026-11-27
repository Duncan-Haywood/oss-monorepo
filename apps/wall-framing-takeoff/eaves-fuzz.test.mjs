import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { layoutEaves, eavesText } from "./eaves.mjs";

// Property test: random roofs (gable, hip, with and without a cross wing) and
// random soffit/fascia settings. Whatever is laid out must be finite, must
// order enough stock to cover the runs (a lower bound from total length and
// from the longest piece), must grow when waste does, must price only the
// prices typed, and must render text. Refusals are fine; crashes are not.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const plan = () => ({ ...samplePlan(), walls: [] });

test("fuzz: eaves stock covers the runs, is finite, and waste only adds", () => {
  const failures = [];
  let laid = 0, refused = 0, hips = 0, wings = 0, rakeSoffits = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const tag = `seed ${seed}`;
    const roofIn = {
      ...sampleRoof(),
      width: Math.round(96 + rand() * 360), length: Math.round(120 + rand() * 600), pitch: 1 + Math.floor(rand() * 14),
      overhang: Math.round(rand() * 36), gableOverhang: Math.round(rand() * 36),
    };
    if (rand() < 0.3) { roofIn.shape = "hip"; roofIn.hip = "2x8"; }
    else if (rand() < 0.4) roofIn.wing = { width: Math.round(96 + rand() * 120), projection: Math.round(60 + rand() * 200), side: rand() < 0.5 ? "right" : "left", at: Math.round(roofIn.length * (0.3 + rand() * 0.4)) };
    const roof = layoutRoof(roofIn, plan());
    if (!roof.ok) continue;
    const d = {
      panelWidth: rand() < 0.5 ? undefined : 6 + Math.floor(rand() * 19), panelStock: rand() < 0.5 ? undefined : 48 + Math.floor(rand() * 241),
      fasciaStock: rand() < 0.5 ? undefined : 48 + Math.floor(rand() * 241), channelStock: rand() < 0.5 ? undefined : 48 + Math.floor(rand() * 241),
      waste: 0, rakeSoffit: rand() < 0.5,
    };
    if (rand() < 0.5) { d.panelPrice = Math.round(rand() * 5000) / 100; d.fasciaPrice = Math.round(rand() * 5000) / 100; }
    const e = layoutEaves(d, roof);
    if (!e.ok) { refused++; continue; }
    laid++;
    if (e.shape === "hip") hips++;
    if (e.wings) wings++;
    if (e.rakeSoffit) rakeSoffits++;
    for (const k of ["eaveFeet", "rakeFeet", "soffitSqFt", "panels", "fascia", "channel"]) {
      if (!Number.isFinite(e[k]) || e[k] < 0) failures.push(`${tag}: ${k} = ${e[k]}`);
    }
    const fasciaFeet = e.eaveFeet + e.rakeFeet;
    if (e.fascia < Math.ceil(fasciaFeet * 12 / e.fasciaStock - 1e-6)) failures.push(`${tag}: fascia ${e.fascia} boards cannot cover ${fasciaFeet} ft`);
    if (e.soffitSqFt > 0 && e.panels < Math.floor(e.soffitSqFt * 144 / (e.panelWidth * e.panelStock))) failures.push(`${tag}: panels ${e.panels} cannot cover ${e.soffitSqFt} sq ft`);
    if (e.cost != null && d.panelPrice == null && d.fasciaPrice == null) failures.push(`${tag}: cost with no price`);
    if (e.cost != null && Math.abs(e.cost - ((d.panelPrice ?? 0) * e.panels + (d.fasciaPrice ?? 0) * e.fascia)) > 1e-6) failures.push(`${tag}: cost does not add up`);
    const w = layoutEaves({ ...d, waste: 0.2 }, roof);
    if (!w.ok || w.panels < e.panels || w.fascia < e.fascia || w.channel < e.channel) failures.push(`${tag}: waste shrank an order`);
    if (e.shape === "hip" && e.rakeFeet !== 0) failures.push(`${tag}: hip with rakes`);
    try { if (eavesText(e).length < 3) failures.push(`${tag}: short text`); } catch (x) { failures.push(`${tag}: text threw ${x.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid >= 100, `only ${laid} laid out (${refused} refused)`);
  assert.ok(hips >= 10 && wings >= 5 && rakeSoffits >= 10, `coverage hips ${hips} wings ${wings} rakeSoffits ${rakeSoffits}`);
});
