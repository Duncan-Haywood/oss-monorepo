// IGES holes: full cylinders told apart as holes or bosses by a ray along each axis. The fixtures
// in test/fixtures/occt/ are Open CASCADE's own IGES output for parts designed in
// scripts/make-iges-fixtures.py, so every diameter and depth below is known by construction.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { extractIges } from "../src/index.ts";
import { IgesWriter } from "./helpers/iges-writer.ts";

const occt = (name: string) =>
  gunzipSync(readFileSync(new URL(`./fixtures/occt/${name}.igs.gz`, import.meta.url))).toString(
    "latin1",
  );
const summary = (f: ReturnType<typeof extractIges>) => {
  const b = f.solid?.bodies.find((x) => x.cylinders.length || x.partialCylinderFaces);
  return {
    cylinders: (b?.cylinders ?? []).map((c) => `${c.kind} Ø${c.diameter} ×${c.count} ${c.depth}`),
    holeAxes: (b?.holeAxes ?? []).map((a) => `${a.diameters.join("+")} ${a.depth}`),
    partial: b?.partialCylinderFaces ?? 0,
  };
};
const codes = (f: ReturnType<typeof extractIges>) => f.flags.map((x) => x.code);

const BRACKET = {
  cylinders: [
    "hole Ø4 ×1 60", // cross hole along X
    "hole Ø5 ×1 8", // blind, flat bottom
    "hole Ø6.6 ×3 10", // two through, one under the counterbore
    "hole Ø8 ×1 6", // in the boss
    "hole Ø11 ×1 6.5", // counterbore
    "boss Ø20 ×1 8",
  ],
  holeAxes: ["4 60", "5 8", "6.6 10", "6.6 10", "6.6+11 10", "8 6"],
  partial: 0,
};

const BLOCK = {
  cylinders: [
    "hole Ø6.4 ×1 17", // below the countersink
    "hole Ø6.8 ×1 20", // from the side, crossing the Ø6.4
    "hole Ø8.5 ×1 15", // drilled, 118° point
    "hole Ø10 ×1 19", // below the chamfer
  ],
  holeAxes: ["6.4 17", "6.8 20", "8.5 15", "10 19"],
  partial: 4, // the R5 corner fillets
};

describe("IGES holes, on Open CASCADE's own files", () => {
  it("reads a plate's holes, counterbore and boss from trimmed surfaces (120 cylinders)", () => {
    const f = extractIges(occt("bracket-faces"));
    assert.deepEqual(summary(f), BRACKET);
    assert.equal(f.fieldConfidence.holes, "high");
    assert.ok(!codes(f).includes("hole-sense-unknown"));
    assert.deepEqual(f.boundingBox?.size, { x: 60, y: 40, z: 18 });
  });

  it("reads the same part from a B-rep solid (192 cylinders)", () => {
    const f = extractIges(occt("bracket-brep"));
    assert.deepEqual(summary(f), BRACKET);
    assert.equal(f.fieldConfidence.holes, "high");
  });

  it("reads drilled, countersunk, chamfered and crossing holes on a part placed at an angle", () => {
    for (const name of ["block-faces", "block-brep", "block-nurbs-faces"]) {
      const f = extractIges(occt(name));
      assert.deepEqual(summary(f), BLOCK, name);
      // the Ø6.4's rays are blocked one way by the crossing hole: decided from one end only
      assert.equal(f.fieldConfidence.holes, "medium", name);
    }
  });

  it("gives the same holes in millimetres from an inch file", () => {
    const f = extractIges(occt("block-faces-in"));
    assert.equal(f.sourceUnits, "in");
    assert.deepEqual(summary(f), BLOCK);
  });

  it("reads a turned shaft's steps as bosses and its bore as a hole; a cross hole through the round is left unclassified", () => {
    const f = extractIges(occt("shaft-faces"));
    assert.deepEqual(summary(f), {
      cylinders: ["hole Ø8 ×1 25", "boss Ø12 ×1 20", "boss Ø20 ×1 30", "boss Ø30 ×1 40"],
      holeAxes: ["8 25"],
      partial: 0,
    });
    const flag = f.flags.find((x) => x.code === "hole-sense-unknown");
    assert.match(flag?.message ?? "", /1 full cylinders \(Ø6 mm\)/);
    assert.equal(f.fieldConfidence.holes, "medium");
  });
});

/** A Ø10 × 20 cylinder wall as a trimmed 120 surface, bounded by its two circles and the seam. */
function wall(w: IgesWriter) {
  const axis = w.line(0, 0, 0, 0, 0, 1, { subordinate: 1 });
  const gen = w.line(5, 0, 0, 5, 0, 20, { subordinate: 1 });
  const surf = w.add(120, [axis, gen, 0, 2 * Math.PI], { subordinate: 1 });
  const up = w.line(5, 0, 0, 5, 0, 20, { subordinate: 1 });
  const top = w.add(100, [20, 0, 0, 5, 0, 5, 0], { subordinate: 1 });
  const down = w.line(5, 0, 20, 5, 0, 0, { subordinate: 1 });
  const bottom = w.add(100, [0, 0, 0, 5, 0, 5, 0], { subordinate: 1 });
  const loop = w.add(102, [4, up, top, down, bottom], { subordinate: 1 });
  const cos = w.add(142, [0, surf, 0, loop, 2], { subordinate: 1 });
  w.add(144, [surf, 1, 0, cos]);
}

/** A disc of radius 5 at height z as a trimmed plane bounded by one circle. */
function disc(w: IgesWriter, z: number) {
  const plane = w.add(108, [0, 0, 1, z, 0, 0, 0, 0, 0], { subordinate: 1 });
  const rim = w.add(100, [z, 0, 0, 5, 0, 5, 0], { subordinate: 1 });
  const cos = w.add(142, [0, plane, 0, rim, 2], { subordinate: 1 });
  w.add(144, [plane, 1, 0, cos]);
}

describe("IGES holes, authored files", () => {
  it("calls a capped cylinder a boss", () => {
    const w = new IgesWriter();
    wall(w);
    disc(w, 0);
    disc(w, 20);
    const f = extractIges(w.toString());
    assert.deepEqual(summary(f), { cylinders: ["boss Ø10 ×1 20"], holeAxes: [], partial: 0 });
    assert.equal(f.fieldConfidence.holes, "high");
  });

  it("does not guess a lone cylinder surface into a hole: nothing around it is material", () => {
    const w = new IgesWriter();
    wall(w);
    const f = extractIges(w.toString());
    assert.deepEqual(summary(f).cylinders, []);
    assert.ok(codes(f).includes("hole-sense-unknown"));
    assert.equal(f.fieldConfidence.holes, "low");
  });

  it("counts a half cylinder (a slot end or fillet) as partial, not a hole", () => {
    const w = new IgesWriter();
    const axis = w.line(0, 0, 0, 0, 0, 1, { subordinate: 1 });
    const gen = w.line(5, 0, 0, 5, 0, 20, { subordinate: 1 });
    const surf = w.add(120, [axis, gen, 0, Math.PI], { subordinate: 1 });
    const up = w.line(5, 0, 0, 5, 0, 20, { subordinate: 1 });
    const top = w.add(100, [20, 0, 0, 5, 0, -5, 0], { subordinate: 1 });
    const down = w.line(-5, 0, 20, -5, 0, 0, { subordinate: 1 });
    // an arc runs anticlockwise, so the bottom edge is the same half circle (the loop's
    // direction does not matter to the wrap)
    const bottom = w.add(100, [0, 0, 0, 5, 0, -5, 0], { subordinate: 1 });
    const loop = w.add(102, [4, up, top, down, bottom], { subordinate: 1 });
    const cos = w.add(142, [0, surf, 0, loop, 2], { subordinate: 1 });
    w.add(144, [surf, 1, 0, cos]);
    const f = extractIges(w.toString());
    assert.deepEqual(summary(f), { cylinders: [], holeAxes: [], partial: 1 });
  });
});
