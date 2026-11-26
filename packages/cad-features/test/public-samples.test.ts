// Real files from permissively licensed projects (see test/fixtures/public/SOURCES.md).
// "hand-checked" values are derived independently of this parser; "regression" values are what
// the parser measured when the test was written and guard against unnoticed changes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractFeatures } from "../src/index.ts";

const dir = new URL("./fixtures/public/", import.meta.url);
const load = (name: string): Uint8Array => readFileSync(new URL(name, dir));
const close = (actual: number | null | undefined, expected: number, tol: number): void => {
  assert.ok(typeof actual === "number", `value missing (${actual})`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);
};

describe("public samples", () => {
  it("CadQuery red_cube_blue_cylinder.step (AP214, metres): hand-checked", () => {
    const r = extractFeatures(load("cadquery-red_cube_blue_cylinder.step"), "a.step");
    assert.equal(r.sourceUnits, "m");
    const [cyl, cube] = r.solid?.bodies ?? [];
    assert.equal(cyl?.name, "blue_cylinder");
    close(cyl?.volume, Math.PI * 25 * 10, 0.01); // r = 5 mm, h = 10 mm
    assert.deepEqual(cyl?.cylinders, [{ diameter: 10, kind: "boss", count: 1, depth: 10 }]);
    assert.equal(cube?.name, "red_cube");
    close(cube?.volume, 1000, 1e-6);
    assert.deepEqual(r.boundingBox?.size, { x: 25, y: 10, z: 10 });
  });

  it("build123d nema-17-bracket.step: volume is translation-invariant (regression values)", () => {
    const text = new TextDecoder().decode(load("build123d-nema-17-bracket.step"));
    const r = extractFeatures(text, "b.step");
    const body = r.solid?.bodies[0];
    close(body?.volume, 7061.159, 0.01);
    assert.deepEqual(r.boundingBox?.size, { x: 35, y: 41, z: 51 });
    assert.deepEqual(body?.cylinders, [
      { diameter: 3.3, kind: "hole", count: 4, depth: 3 },
      { diameter: 32, kind: "hole", count: 1, depth: 3 },
    ]);
    // five hole locations: the four motor-screw holes and the shaft bore
    assert.deepEqual(body?.holeAxes, [
      ...Array.from({ length: 4 }, () => ({ diameters: [3.3], depth: 3 })),
      { diameters: [32], depth: 3 },
    ]);
    assert.equal(r.confidence, "high");
    // a wrongly oriented face would make the divergence-theorem sum depend on the origin
    const shifted = text.replace(
      /CARTESIAN_POINT\(\s*'([^']*)'\s*,\s*\(([^)]*)\)\s*\)/g,
      (_m, n: string, c: string) =>
        `CARTESIAN_POINT('${n}',(${c
          .split(",")
          .map((v, i) => String(Number(v) + ([123, -45, 67][i] ?? 0)))
          .join(",")}))`,
    );
    close(extractFeatures(shifted, "b.step").solid?.bodies[0]?.volume, 7061.159, 0.01);
  });

  it("build123d squareandcircle.dxf: 10 × 10 square with a Ø10 circle, hand-checked", () => {
    const r = extractFeatures(load("build123d-squareandcircle.dxf"), "c.dxf");
    close(r.flat?.grossArea, 100, 1e-6);
    close(r.flat?.netArea, 100 - 25 * Math.PI, 1e-3);
    assert.deepEqual(r.flat?.circularHoles, [{ diameter: 10, count: 1 }]);
    assert.equal(r.unitsAssumed, true);
  });

  it("build123d closedlwpolylinebug.dxf: triangle block inserted at scale 2 × 3, hand-checked", () => {
    // block triangle (10,10)-(20,10)-(20,20) → legs 20 and 30 after scaling
    const r = extractFeatures(load("build123d-closedlwpolylinebug.dxf"), "d.dxf");
    close(r.flat?.grossArea, 300, 1e-6);
    close(r.flat?.outerPerimeter, 50 + Math.hypot(20, 30), 1e-3);
    assert.equal(r.confidence, "high");
  });

  it("CadQuery vslot-2020_1.dxf: 20 × 20 extrusion profile with Ø4.2 bore (regression area)", () => {
    const r = extractFeatures(load("cadquery-vslot-2020_1.dxf"), "e.dxf");
    assert.deepEqual(r.flat?.blank, { width: 20, height: 20 });
    assert.deepEqual(r.flat?.circularHoles, [{ diameter: 4.2, count: 1 }]);
    close(r.flat?.netArea, 162.526, 0.01);
    close(r.flat?.outerPerimeter, 151.547, 0.01);
    assert.equal(r.confidence, "high");
  });

  it("CadQuery genshi.dxf: spline outline, flagged as approximated (regression)", () => {
    const r = extractFeatures(load("cadquery-genshi.dxf"), "f.dxf");
    assert.ok(r.flags.some((f) => f.code === "approximated-curves"));
    close(r.flat?.grossArea, 1024.402, 0.5);
    assert.equal(r.fieldConfidence.measures, "medium");
  });
});
