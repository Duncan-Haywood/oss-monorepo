import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan, validatePlan } from "./engine.mjs";
import { drawingSetHtml, markMembers } from "./drawings.mjs";
import { drawingSetPdf } from "./pdf.mjs";

// Property test: random valid plans (wall lengths, stud sizes and spacing, openings, shop-panel
// limits, sheathing weight) always give a drawing set that is whole: one HTML sheet per wall,
// balanced SVG, no NaN or undefined text, marks that cover every member, and a PDF whose
// startxref points at its xref table and whose page count is at least the wall count.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWall(rand, id) {
  const length = 72 + Math.floor(rand() * 80) * 6;
  const openings = [];
  let at = 12 + Math.floor(rand() * 40);
  while (rand() < 0.8 && at < length - 40) {
    const door = rand() < 0.3;
    const width = door ? 36 : 24 + Math.floor(rand() * 8) * 6;
    if (at + width > length - 12) break;
    openings.push(door
      ? { kind: "door", label: `D<${openings.length}>`, offset: at, width, height: 82.5, header: "2x10" }
      : { kind: "window", label: `W&${openings.length}`, offset: at, width, height: 24 + Math.floor(rand() * 5) * 6, header: "2x10" });
    at += width + 8 + Math.floor(rand() * 60);
  }
  return { id, length, stud: rand() < 0.5 ? "2x4" : "2x6", corner: rand() < 0.5, openings };
}

const count = (s, re) => (s.match(re) || []).length;

test("fuzz: random plans give a whole HTML and PDF drawing set", () => {
  let done = 0;
  const failures = [];
  for (let seed = 1; seed <= 150; seed++) {
    const rand = rng(seed);
    const plan = samplePlan();
    plan.studSpacing = rand() < 0.5 ? 16 : 24;
    plan.walls = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => randomWall(rand, `Wall ${"ABCD"[i]}`));
    if (validatePlan(plan).length) continue;
    const r = takeoff(plan);
    if (!r.ok) continue;
    const opts = {};
    if (rand() < 0.6) opts.panelMax = [48, 96, 144][Math.floor(rand() * 3)];
    if (opts.panelMax && rand() < 0.5) { opts.panelSheets = true; opts.sheathPsf = 1.5; }
    try {
      const html = drawingSetHtml(r, plan, opts);
      if (count(html, /<section class="sheet"/g) < r.walls.length) failures.push(`seed ${seed}: fewer sheets than walls`);
      if (count(html, /<svg\b/g) !== count(html, /<\/svg>/g)) failures.push(`seed ${seed}: unbalanced svg`);
      if (/NaN|undefined|Infinity/.test(html)) failures.push(`seed ${seed}: NaN/undefined in HTML`);
      if (/<[A-Z]\d*>|W&\d/.test(html.replace(/<(?:\/?[a-z][^>]*)>/g, ""))) failures.push(`seed ${seed}: label not escaped`);
      for (const w of r.walls) {
        const { marks, parts } = markMembers(w);
        if (marks.some((m) => !m) || parts.reduce((s, p) => s + p.qty, 0) !== w.members.length) failures.push(`seed ${seed}: marks incomplete`);
      }
      const pdf = drawingSetPdf(r, plan, opts);
      const txt = Buffer.from(pdf).toString("latin1");
      if (!txt.startsWith("%PDF-") || !txt.trimEnd().endsWith("%%EOF")) failures.push(`seed ${seed}: bad PDF framing`);
      const sx = Number(/startxref\s+(\d+)/.exec(txt)?.[1]);
      if (txt.slice(sx, sx + 4) !== "xref") failures.push(`seed ${seed}: startxref misses xref`);
      if (count(txt, /\/Type\s*\/Page\b/g) < r.walls.length) failures.push(`seed ${seed}: fewer PDF pages than walls`);
      if (/NaN|undefined/.test(txt.replace(/stream[\s\S]*?endstream/g, (s) => s))) failures.push(`seed ${seed}: NaN in PDF`);
    } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); }
    done++;
  }
  assert.deepEqual(failures.slice(0, 8), []);
  assert.ok(done > 100, `only ${done} plans drawn`);
});
