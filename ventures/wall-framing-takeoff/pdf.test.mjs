import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { drawingSetPdf, textWidth } from "./pdf.mjs";
import { main } from "./cli.mjs";

const text = (b) => Buffer.from(b).toString("latin1");

test("PDF has a header, one page per wall and an xref table whose offsets land on each object", () => {
  const plan = samplePlan();
  const r = takeoff(plan);
  const s = text(drawingSetPdf(r, plan));
  assert.match(s, /^%PDF-1\.4\n/);
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  assert.equal((s.match(/\/Type \/Page /g) || []).length, plan.walls.length);
  const start = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.equal(s.slice(start, start + 4), "xref");
  const rows = s.slice(start).split("\n").slice(3).filter((l) => /^\d{10} 00000 n/.test(l));
  assert.ok(rows.length > plan.walls.length * 2);
  rows.forEach((row, i) => assert.equal(s.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`), true, `object ${i + 1}`));
});

test("stream lengths match their bytes", () => {
  const plan = samplePlan();
  const s = text(drawingSetPdf(takeoff(plan), plan));
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(m[2].length, Number(m[1]));
});

test("every wall's marks and parts show up as text, and the disclaimer is on the sheet", () => {
  const plan = samplePlan();
  const s = text(drawingSetPdf(takeoff(plan), plan));
  assert.match(s, /\(Front\) Tj/);
  assert.match(s, /\(S1\) Tj/);
  assert.match(s, /No warranty\./);
});

test("text with parentheses, backslashes and non-Latin characters cannot break the stream", () => {
  const plan = samplePlan();
  plan.walls[0].openings[0].label = "Bay (north) \\ 中";
  const s = text(drawingSetPdf(takeoff(plan), plan));
  assert.match(s, /\(Bay \\\(north\\\) \\\\ \?\) Tj/);
});

test("panelMax adds panel letters and cut lines", () => {
  const plan = samplePlan();
  const r = takeoff(plan);
  assert.doesNotMatch(text(drawingSetPdf(r, plan)), /Panel A/);
  assert.match(text(drawingSetPdf(r, plan, { panelMax: 144 })), /\(Panel A\) Tj/);
});

test("a long parts list continues on another page instead of running off the sheet", () => {
  const plan = samplePlan();
  plan.walls = [{ ...plan.walls[0], length: 1600, openings: Array.from({ length: 24 }, (_, i) => ({ kind: "window", header: "2x10", offset: 20 + i * 60, width: 24 + i, height: 30 + (i % 7) * 2, label: `W${i}` })) }];
  const r = takeoff(plan);
  assert.ok(r.ok, r.errors?.join());
  const pages = (text(drawingSetPdf(r, plan)).match(/\/Type \/Page /g) || []).length;
  assert.ok(pages >= 2, `pages ${pages}`);
  assert.match(text(drawingSetPdf(r, plan)), /parts, continued/);
});

test("textWidth uses Helvetica metrics", () => {
  assert.equal(textWidth("iii", 10), 3 * 2.22);
  assert.ok(textWidth("W", 10) > textWidth("i", 10));
});

test("--pdf returns the file bytes", () => {
  const r = main(["plan.json", "--pdf"], () => JSON.stringify(samplePlan()));
  assert.equal(r.code, 0);
  assert.equal(text(r.bytes).slice(0, 5), "%PDF-");
});

test("panelMax adds one sheet per shop panel after the wall sheets, with that panel's own parts", () => {
  const plan = samplePlan();
  const r = takeoff(plan);
  const base = (text(drawingSetPdf(r, plan)).match(/\/Type \/Page /g) || []).length;
  const s = text(drawingSetPdf(r, plan, { panelMax: 96 }));
  const pages = (s.match(/\/Type \/Page /g) || []).length;
  assert.ok(pages > base, `pages ${pages} vs ${base}`);
  assert.match(s, /\(Front - Panel A\) Tj/);
  assert.match(s, /Panel A of \d+, Front/);
  assert.match(s, /lb of lumber/);
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(m[2].length, Number(m[1]));
});
