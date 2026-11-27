import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectFormat, extractFeatures, extractStl, isBinaryStl, StlError } from "../src/index.ts";
import { asciiStl, binaryStl, boxMesh, prismMesh, type Tri } from "./helpers/stl-writer.ts";

const codes = (r: { flags: { code: string }[] }): string[] => r.flags.map((f) => f.code);
const near = (a: number | null | undefined, b: number, tol = 1e-6) => {
  assert.ok(typeof a === "number", `value missing (${a})`);
  assert.ok(Math.abs(a - b) <= Math.abs(b) * tol, `expected ${b}, got ${a}`);
};

describe("STL", () => {
  it("measures a closed binary box: size, volume, area, one body", () => {
    const f = extractFeatures(binaryStl(boxMesh(0, 0, 0, 40, 20, 10)), "block.stl");
    assert.equal(f.format, "stl");
    assert.deepEqual(f.boundingBox?.size, { x: 40, y: 20, z: 10 });
    near(f.solid?.totalVolume, 8000);
    near(f.mesh?.surfaceArea, 2 * (40 * 20 + 40 * 10 + 20 * 10));
    assert.equal(f.mesh?.triangles, 12);
    assert.equal(f.solid?.bodies.length, 1);
    assert.equal(f.solid?.schema, "STL (binary)");
    assert.equal(f.fieldConfidence.measures, "medium");
    assert.equal(f.fieldConfidence.units, "low");
    assert.ok(codes(f).includes("units-unknown"));
    assert.ok(!codes(f).includes("surface-model"));
  });

  it("reads a binary STL whose header starts with 'solid' as binary, by its size", () => {
    const bytes = binaryStl(boxMesh(0, 0, 0, 1, 1, 1), "solid exported by some CAD");
    assert.ok(isBinaryStl(bytes));
    const f = extractFeatures(bytes, "x.stl");
    assert.equal(f.solid?.schema, "STL (binary)");
    near(f.solid?.totalVolume, 1);
  });

  it("reads an ASCII STL, from text or bytes, with or without the .stl name", () => {
    const text = asciiStl(boxMesh(0, 0, 0, 3, 2, 1));
    assert.equal(detectFormat(text, "noname"), "stl");
    for (const input of [text, new TextEncoder().encode(text)]) {
      const f = extractFeatures(input, "");
      assert.equal(f.solid?.schema, "STL (ASCII)");
      near(f.solid?.totalVolume, 6);
    }
  });

  it("scales by the assumed unit: an inch mesh comes out in mm", () => {
    const f = extractStl(binaryStl(boxMesh(0, 0, 0, 2, 1, 0.5)), { assumeUnits: "in" });
    assert.deepEqual(f.boundingBox?.size, { x: 50.8, y: 25.4, z: 12.7 });
    near(f.solid?.totalVolume, 2 * 1 * 0.5 * 25.4 ** 3);
    assert.equal(f.sourceUnits, "in");
    assert.equal(f.unitsAssumed, true);
  });

  it("keeps precision for a part far from the origin (float32 coordinates)", () => {
    const f = extractStl(binaryStl(boxMesh(10_000, 10_000, 500, 10_064, 10_032, 516)));
    near(f.solid?.totalVolume, 64 * 32 * 16);
  });

  it("gives the faceted volume of a prism, not the round cylinder's", () => {
    const n = 64;
    const f = extractStl(binaryStl(prismMesh(n, 10, 30)));
    const faceted = (n / 2) * 10 * 10 * Math.sin((2 * Math.PI) / n) * 30;
    near(f.solid?.totalVolume, faceted, 1e-5);
    assert.ok((f.solid?.totalVolume ?? 0) < Math.PI * 100 * 30);
    assert.ok(codes(f).includes("approximated-curves"));
  });

  it("leaves the volume null for an open mesh and says why", () => {
    const tris = boxMesh(0, 0, 0, 10, 10, 10).slice(1); // one triangle missing: a gap
    const f = extractStl(binaryStl(tris));
    assert.equal(f.solid?.totalVolume, null);
    assert.ok(codes(f).includes("surface-model"));
    assert.match(
      f.flags.find((x) => x.code === "surface-model")?.message ?? "",
      /3 edges with no matching/,
    );
    assert.equal(f.fieldConfidence.measures, "low");
    assert.deepEqual(f.boundingBox?.size, { x: 10, y: 10, z: 10 }); // the box is still read
  });

  it("refuses a volume when one triangle faces the wrong way", () => {
    const tris = boxMesh(0, 0, 0, 10, 10, 10);
    const [a, b, c] = tris[0] as Tri;
    tris[0] = [a, c, b];
    const f = extractStl(binaryStl(tris));
    assert.equal(f.solid?.totalVolume, null);
    assert.match(
      f.flags.find((x) => x.code === "surface-model")?.message ?? "",
      /face opposite ways/,
    );
  });

  it("refuses a volume when every triangle faces inward", () => {
    const tris = boxMesh(0, 0, 0, 10, 10, 10).map(([a, b, c]) => [a, c, b] as Tri);
    const f = extractStl(binaryStl(tris));
    assert.equal(f.solid?.totalVolume, null);
    assert.ok(codes(f).includes("volume-failed-check"));
  });

  it("counts separate pieces as bodies and adds their volumes", () => {
    const f = extractStl(binaryStl([...boxMesh(0, 0, 0, 1, 1, 1), ...boxMesh(5, 0, 0, 7, 1, 1)]));
    assert.equal(f.solid?.bodies.length, 2);
    near(f.solid?.totalVolume, 3);
    assert.deepEqual(f.boundingBox?.size, { x: 7, y: 1, z: 1 });
    assert.ok(codes(f).includes("multiple-solids"));
  });

  it("skips triangles with two corners at one point, and says so", () => {
    const tris = boxMesh(0, 0, 0, 2, 2, 2);
    tris.push([
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 1],
    ]);
    const f = extractStl(binaryStl(tris));
    near(f.solid?.totalVolume, 8);
    assert.ok(codes(f).includes("parse-errors"));
  });

  it("throws StlError on something that is not an STL", () => {
    assert.throws(() => extractStl(new Uint8Array(100)), StlError);
    assert.throws(
      () => extractStl("solid x\n facet normal 0 0 0\n vertex 1 2 3\n vertex 1 2\n"),
      StlError,
    );
  });

  it("an empty mesh has no box and no volume", () => {
    const f = extractStl(binaryStl([]));
    assert.equal(f.boundingBox, null);
    assert.equal(f.solid?.totalVolume, null);
    assert.ok(codes(f).includes("no-solid"));
  });
});
