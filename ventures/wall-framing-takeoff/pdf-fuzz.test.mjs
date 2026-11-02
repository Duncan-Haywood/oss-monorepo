import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { drawingSetPdf, textWidth } from "./pdf.mjs";

// Property test: random plans with hostile label text and random panel limits.
// A takeoff that is refused is skipped; otherwise the PDF must build, start and
// end like a PDF, have an xref table whose offsets land on each object, stream
// lengths equal to their bytes, balanced text parentheses, and no non-Latin-1 bytes.
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
const HOSTILE = ["Bay (north)", "a\\b", "中文", "x)) Tj ET (", "“quoted” – dash", "", "((((", "\\)\\(", "é ü ñ", "W".repeat(80)];

function randomPlan(rand) {
  const plan = samplePlan();
  const n = 1 + Math.floor(rand() * 3);
  plan.walls = Array.from({ length: n }, (_, i) => {
    const length = pick(rand, [48, 96, 144, 240, 480, 960]);
    const openings = [];
    let at = 12;
    for (let k = 0; k < Math.floor(rand() * 5); k++) {
      const width = pick(rand, [24, 36, 48, 72]);
      if (at + width + 12 > length) break;
      openings.push({ kind: "window", header: "2x10", offset: at, width, height: pick(rand, [30, 36, 48]), label: pick(rand, HOSTILE) });
      at += width + 12 + Math.floor(rand() * 30);
    }
    return { ...plan.walls[0], tees: [], id: `${pick(rand, HOSTILE)}#${i}`, length, openings };
  });
  return plan;
}

test("fuzz: random plans always yield a well-formed PDF", () => {
  let built = 0, skipped = 0;
  const failures = [];
  for (let seed = 1; seed <= 150; seed++) {
    const rand = rng(seed);
    const plan = randomPlan(rand);
    const r = takeoff(plan);
    if (!r.ok) { skipped++; if (process.env.DBG) console.log(r.errors[0]); continue; }
    const opts = rand() < 0.5 ? { panelMax: pick(rand, [48, 96, 144, 192]) } : {};
    let bytes;
    try { bytes = drawingSetPdf(r, plan, opts); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    built++;
    const s = Buffer.from(bytes).toString("latin1");
    if (!s.startsWith("%PDF-1.4\n") || !s.trimEnd().endsWith("%%EOF")) failures.push(`seed ${seed}: header or trailer`);
    if (Buffer.from(bytes).length !== s.length) failures.push(`seed ${seed}: byte/latin1 length mismatch`);
    const sm = /startxref\n(\d+)/.exec(s);
    if (!sm || s.slice(Number(sm[1]), Number(sm[1]) + 4) !== "xref") failures.push(`seed ${seed}: startxref`);
    else {
      const rows = s.slice(Number(sm[1])).split("\n").filter((l) => /^\d{10} 00000 n/.test(l));
      rows.forEach((row, i) => { if (!s.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`)) failures.push(`seed ${seed}: xref row ${i + 1}`); });
    }
    for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      if (m[2].length !== Number(m[1])) failures.push(`seed ${seed}: stream length`);
      // every text operand: unescaped parentheses must balance to one string before " Tj"
      for (const t of m[2].matchAll(/\(((?:[^\\()]|\\.)*)\) Tj/g)) if (/[^\x20-\x7e\xa0-\xff]/.test(t[1])) failures.push(`seed ${seed}: non-Latin-1 byte in text`);
      const ops = m[2].split("\n").filter((l) => / Tj ET$/.test(l));
      for (const l of ops) if (!/^BT [\d. -]+ rg \/F[12] [\d.]+ Tf [\d. -]+ Tm \((?:[^\\()]|\\.)*\) Tj ET$/.test(l)) failures.push(`seed ${seed}: malformed text op ${l.slice(0, 60)}`);
      if (/NaN|Infinity|undefined/.test(m[2])) failures.push(`seed ${seed}: NaN/undefined in stream`);
    }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(built >= 50, `only ${built} built (${skipped} refused)`);
});

test("fuzz: textWidth is finite and monotone in length for any string", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const s = Array.from({ length: Math.floor(rand() * 30) }, () => String.fromCharCode(Math.floor(rand() * 600))).join("");
    const w = textWidth(s, 10);
    assert.ok(Number.isFinite(w) && w >= 0);
    assert.ok(textWidth(s + "i", 10) > w);
    assert.ok(textWidth(s, 10, true) >= w);
  }
});
