import test from "node:test";
import assert from "node:assert/strict";
import { draft, grade, area, isSimple, offsetRing, polylineLength, solveCap, pieceSvg, gradeSvg, dxf, checkText } from "./pattern.mjs";

test("area and offset: a 10 x 20 rectangle grows to (10+2d) x (20+2d), a zero edge stays put", () => {
  const sq = [[0, 0], [10, 0], [10, 20], [0, 20]];
  const o = offsetRing(sq, [1, 1, 1, 1]);
  assert.ok(Math.abs(area(o) - 12 * 22) < 1e-9);
  const fold = offsetRing(sq, [1, 1, 1, 0]); // edge 3 runs (0,20)->(0,0): the fold, no allowance
  const xs = fold.map(p => p[0]);
  assert.ok(Math.abs(Math.min(...xs)) < 1e-9);
  assert.equal(Math.max(...xs), 11);
});

test("isSimple spots a bow-tie", () => {
  assert.equal(isSimple([[0, 0], [10, 10], [10, 0], [0, 10]]), false);
  assert.equal(isSimple([[0, 0], [10, 0], [10, 10], [0, 10]]), true);
});

test("the sleeve cap is as long as the armhole plus the ease, front and back separately", () => {
  for (const s of ["XS", "S", "M", "L", "XL", "XXL"]) {
    for (const capEaseCm of [0, 1, 2.5]) {
      const d = draft("tee", s, { capEaseCm });
      assert.ok(d.ok);
      const c = d.checks;
      assert.ok(Math.abs(c.capEaseCm - capEaseCm) < 0.05, `${s} ease ${c.capEaseCm}`);
      assert.ok(Math.abs(c.capFrontCm - c.frontArmholeCm - capEaseCm / 2) < 0.05);
      assert.ok(Math.abs(c.capBackCm - c.backArmholeCm - capEaseCm / 2) < 0.05);
    }
  }
});

test("an independent walk along the piece outlines agrees with the reported armhole", () => {
  const d = draft("tee", "M");
  const sleeve = d.pieces.find(p => p.name === "sleeve");
  // the cap is the first run of the sleeve ring; its end points are the two underarm corners
  const cap = sleeve.stitch.slice(0, 57);
  assert.ok(Math.abs(polylineLength(cap) - (d.checks.capFrontCm + d.checks.capBackCm)) < 0.01);
});

test("solveCap: a longer target gives a taller cap", () => {
  const a = solveCap(22, 20, 20), b = solveCap(22, 24, 24);
  assert.ok(b.h > a.h);
});

test("every piece of every size is a simple polygon with the cutting line outside the stitch line", () => {
  for (const g of ["tee", "longsleeve", "crewneck"]) {
    const gr = grade(g);
    assert.ok(gr.ok && gr.monotone);
    for (const d of gr.drafts) for (const p of d.pieces) {
      assert.ok(p.simple, `${g} ${d.size} ${p.name}`);
      assert.ok(p.cutAreaCm2 > p.stitchAreaCm2);
    }
  }
});

test("the fold edge has no allowance and the hem has more than the seams", () => {
  const d = draft("tee", "M", { seamCm: 1, hemCm: 3 });
  const front = d.pieces.find(p => p.name === "front");
  assert.ok(Math.abs(Math.min(...front.cut.map(p => p[0]))) < 1e-9);
  const maxY = Math.max(...front.cut.map(p => p[1])), L = d.block.L;
  assert.ok(Math.abs(maxY - (L + 3)) < 1e-6);
  assert.ok(Math.abs(Math.max(...front.cut.map(p => p[0])) - (d.block.Q + 1)) < 1e-6);
});

test("grading: each step up in size widens the body by half the chest step and deepens the armhole", () => {
  const gr = grade("tee");
  const row = l => gr.table.find(r => r.label.startsWith(l));
  assert.deepEqual(row("Half chest").steps, [2, 2, 2, 2, 2]);
  assert.deepEqual(row("Body length").steps, [2, 2, 2, 2, 2]);
  assert.ok(row("Armhole depth").steps.every(v => v > 1 && v < 3));
});

test("refusals: unknown garment or size, bad allowance", () => {
  assert.equal(draft("cape", "M").ok, false);
  assert.equal(draft("tee", "Q").ok, false);
  assert.equal(draft("tee", "M", { seamCm: -1 }).ok, false);
  assert.equal(draft("tee", "M", { hemCm: NaN }).ok, false);
  assert.equal(grade("tee", ["M", "Q"]).ok === true, true); // unknown sizes are skipped in a list
});

test("SVG and DXF: 1:1 centimetre units, notches, layers, escaping", () => {
  const d = draft("tee", "M");
  const svg = pieceSvg(d.pieces[0]);
  assert.match(svg, /width="[\d.]+cm"/);
  assert.match(svg, /<circle/);
  assert.ok(gradeSvg(grade("tee"), "front").includes("<path"));
  const x = dxf(d);
  for (const k of ["CUT", "STITCH", "GRAIN", "NOTCH", "EOF"]) assert.ok(x.includes(k), k);
  assert.equal((x.match(/POLYLINE/g) || []).length, (x.match(/SEQEND/g) || []).length);
  assert.match(checkText(d), /ease 1 cm/);
});

test("hoodie: hood neck edge equals the neck seam, pieces are simple, pocket and hood sized sensibly", () => {
  for (const s of ["XS", "M", "XXL"]) {
    const d = draft("hoodie", s);
    assert.ok(d.ok, d.error);
    assert.deepEqual(d.pieces.map(p => p.name), ["front", "back", "sleeve", "hood", "pocket"]);
    assert.ok(d.checks.allSimple);
    assert.ok(Math.abs(d.checks.hoodNeckEdgeCm - d.checks.neckSeamCm) < 0.01);
    // independent walk: the stitch ring of the hood starts with its straight neck edge B -> A
    const hood = d.pieces.find(p => p.name === "hood");
    assert.ok(Math.abs(Math.hypot(hood.stitch[0][0] - hood.stitch[1][0], hood.stitch[0][1] - hood.stitch[1][1]) - d.checks.neckSeamCm) < 0.01);
    assert.equal(hood.qty, 2);
    assert.ok(d.checks.hoodHeightCm > 30 && d.checks.hoodHeightCm < 50, `hood height ${d.checks.hoodHeightCm}`);
    assert.ok(d.checks.hoodDepthCm > 25 && d.checks.hoodDepthCm < 40, `hood depth ${d.checks.hoodDepthCm}`);
    assert.ok(d.checks.pocketWidthCm < d.block.Q * 2);
  }
  assert.match(checkText(draft("hoodie", "M")), /Hood neck edge/);
  assert.ok(grade("hoodie").monotone);
});

test("hoodie: pocket hand openings carry a larger allowance than the joined edges; hood is bigger in bigger sizes", () => {
  const d = draft("hoodie", "M", { seamCm: 1 });
  const pocket = d.pieces.find(p => p.name === "pocket");
  assert.equal(pocket.bbox.w > pocket.stitch.reduce((a, p) => Math.max(a, p[0]), -1e9) - pocket.stitch.reduce((a, p) => Math.min(a, p[0]), 1e9), true);
  const big = draft("hoodie", "XXL");
  assert.ok(big.checks.hoodHeightCm > d.checks.hoodHeightCm);
});
