// The JavaScript member checks must agree with the research track's Python
// originals (data/structure-fixture.json, written by verify/structure_fixture.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, maxSpan, sizeMember, studCheck, headerCheck, sizeHeader, roofCase, FLOOR } from "./structure.mjs";

const fx = JSON.parse(readFileSync(new URL("./data/structure-fixture.json", import.meta.url), "utf8"));
const CASES = { floor: FLOOR, "roof-snow30": roofCase(30), "roof-snow50": roofCase(50) };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test("span checks match house-spans for every size, spacing, case and span", () => {
  assert.ok(fx.check.length >= 100);
  for (const c of fx.check) {
    const r = check({ size: c.size, spacingIn: c.spacing, pitch: c.pitch }, c.span, CASES[c.case]);
    for (const [k, v] of Object.entries(c.ratios)) close(r[k], v, `${c.size} @${c.spacing} ${c.case} ${c.span} ft ${k}`);
  }
});

test("maximum spans match house-spans to the hundredth of a foot", () => {
  for (const c of fx.maxSpan) assert.equal(maxSpan({ size: c.size, spacingIn: c.spacing }, CASES[c.case]), c.ft, `${c.size} @${c.spacing} ${c.case}`);
});

test("member sizing picks the same size and governing check", () => {
  for (const c of fx.size) {
    const r = sizeMember(c.span, CASES[c.case], { spacingIn: c.spacing });
    if (c.result === null) assert.equal(r, null);
    else { assert.equal(r.size, c.result.size); assert.equal(r.governs, c.result.governs); close(r.ratio, c.result.ratio, `size ${c.span}`); }
  }
});

test("stud checks match house-framing", () => {
  for (const c of fx.stud) close(studCheck(c.stud, c.spacing, c.lengthIn, c.roofPlf, c.wind), c.ratio, `${c.stud} @${c.spacing} ${c.roofPlf}`);
});

test("header checks match house-framing, and sizing returns the first passing header", () => {
  for (const c of fx.header) close(headerCheck(c.size, c.spanIn, c.wPlf, c.plies, c.jacks, c.stud), c.ratio, `${c.plies}-ply ${c.size} ${c.spanIn} in ${c.wPlf} plf`);
  const h = sizeHeader(75, 600);
  assert.ok(h && h.ratio <= 1);
  assert.ok(headerCheck(h.size, 75, 600, h.plies, h.jacks) <= 1);
  assert.equal(sizeHeader(400, 2000), null, "a 33 ft opening needs an engineered beam");
});
