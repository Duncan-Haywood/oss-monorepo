import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenize } from "../src/iges.ts";
import {
  detectFormat,
  extractFeatures,
  extractIges,
  IgesError,
  looksLikeIges,
} from "../src/index.ts";
import { IgesWriter } from "./helpers/iges-writer.ts";

const codes = (r: { flags: { code: string }[] }): string[] => r.flags.map((f) => f.code);
const near = (a: number | null | undefined, b: number, tol = 1e-6) => {
  assert.ok(typeof a === "number", `value missing (${a})`);
  assert.ok(Math.abs(a - b) <= Math.max(Math.abs(b), 1) * tol, `expected ${b}, got ${a}`);
};
const size = (f: ReturnType<typeof extractIges>) => f.boundingBox?.size;

/** 12 edges of a box from (0,0,0) to (x,y,z) as independent lines. */
function wireBox(w: IgesWriter, x: number, y: number, z: number) {
  const c = (i: number) => [i & 1 ? x : 0, i & 2 ? y : 0, i & 4 ? z : 0];
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of edges) {
    const p = c(a as number);
    const q = c(b as number);
    w.line(
      p[0] as number,
      p[1] as number,
      p[2] as number,
      q[0] as number,
      q[1] as number,
      q[2] as number,
    );
  }
}

/** A flat bilinear B-spline patch spanning [x0,x1]×[y0,y1] at z, parameters u, v in [0, 1]. */
function planePatch(w: IgesWriter, x0: number, y0: number, x1: number, y1: number, z = 0) {
  return w.nurbsSurface(
    1,
    1,
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [
      [
        [x0, y0, z],
        [x1, y0, z],
      ],
      [
        [x0, y1, z],
        [x1, y1, z],
      ],
    ],
    undefined,
    { subordinate: 1 },
  );
}

describe("IGES", () => {
  it("measures a wireframe box drawn in inches: size in mm, units high", () => {
    const w = new IgesWriter({ unitFlag: 1, unitName: "IN" });
    wireBox(w, 4, 2, 1);
    const f = extractFeatures(w.toString(), "block.igs");
    assert.equal(f.format, "iges");
    assert.deepEqual(size(f), { x: 101.6, y: 50.8, z: 25.4 });
    assert.equal(f.sourceUnits, "in");
    assert.equal(f.unitsAssumed, false);
    assert.equal(f.fieldConfidence.units, "high");
    assert.equal(f.fieldConfidence.boundingBox, "medium");
    assert.equal(f.solid?.totalVolume, null);
    assert.equal(f.solid?.schema, "IGES 5.3");
    assert.ok(codes(f).includes("volume-unsupported"));
    assert.ok(!codes(f).includes("bbox-may-underestimate"));
  });

  it("reads the unit flag, a unit name under flag 3, and the model-space scale", () => {
    for (const [g, mm] of [
      [{ unitFlag: 2, unitName: "MM" }, 10],
      [{ unitFlag: 6, unitName: "M" }, 10_000],
      [{ unitFlag: 10, unitName: "CM" }, 100],
      [{ unitFlag: 3, unitName: "MM" }, 10],
      [{ unitFlag: 3, unitName: "INCH" }, 254],
      [{ unitFlag: 8, unitName: "MIL" }, 0.254],
    ] as const) {
      const w = new IgesWriter(g);
      w.line(0, 0, 0, 10, 0, 0);
      near(size(extractIges(w.toString()))?.x, mm);
    }
    const scaled = new IgesWriter({ unitFlag: 2, modelScale: 0.5 });
    scaled.line(0, 0, 0, 10, 0, 0);
    const f = extractIges(scaled.toString());
    near(size(f)?.x, 20);
    assert.ok(codes(f).includes("model-space-scale"));
  });

  it("assumes inches (the IGES default) for an unknown unit, and says so", () => {
    const w = new IgesWriter({ unitFlag: 3, unitName: "FURLONG" });
    w.line(0, 0, 0, 1, 0, 0);
    const f = extractIges(w.toString());
    near(size(f)?.x, 25.4);
    assert.equal(f.unitsAssumed, true);
    assert.equal(f.fieldConfidence.units, "low");
    assert.equal(f.confidence, "low");
    assert.ok(codes(f).includes("units-unknown"));
    near(size(extractIges(w.toString(), { assumeUnits: "mm" }))?.x, 1);
  });

  it("parses Hollerith strings with delimiters inside, defaulted delimiters, D exponents and CRLF", () => {
    assert.deepEqual(tokenize("3Ha,b,1.5D2,,7;junk", ",", ";"), ["a,b", "1.5D2", null, "7"]);
    const w = new IgesWriter({
      fileName: "odd, name;.igs",
      defaultDelimiters: true,
      dExponent: true,
    });
    w.line(0, 0, 0, 12.5, 0.25, 0);
    for (const eol of ["\n", "\r\n", ""]) {
      const f = extractIges(w.toString(eol));
      near(size(f)?.x, 12.5);
      near(size(f)?.y, 0.25);
    }
  });

  it("is found by content without an extension; compressed and binary files are refused", () => {
    const w = new IgesWriter();
    w.line(0, 0, 0, 1, 1, 1);
    const text = w.toString();
    assert.ok(looksLikeIges(text));
    assert.equal(detectFormat(text, "attachment"), "iges");
    assert.equal(detectFormat("x", "PART.IGES"), "iges");
    assert.equal(extractFeatures(new TextEncoder().encode(text), "").format, "iges");
    const compressed = `${"x".padEnd(72)}C      1\n`;
    assert.throws(() => extractIges(compressed), IgesError);
  });

  it("finds an arc's true extremes, full circles, and applies a transformation matrix", () => {
    const quarter = new IgesWriter();
    quarter.add(100, [0, 0, 0, 10, 0, 0, 10]); // centre (0,0), 0° to 90°
    const q = extractIges(quarter.toString());
    near(size(q)?.x, 10);
    near(size(q)?.y, 10);

    const circle = new IgesWriter();
    circle.add(100, [2, 5, 5, 15, 5, 15, 5]); // full circle r = 10 about (5, 5) at z = 2
    const c = extractIges(circle.toString());
    near(c.boundingBox?.min.x, -5);
    near(c.boundingBox?.max.y, 15);
    near(c.boundingBox?.min.z, 2);

    // the same circle turned 90° about x, moved up 100: it now spans z
    const t = new IgesWriter();
    const m = t.matrix(
      [
        [1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      ],
      [0, 0, 100],
    );
    t.add(100, [0, 0, 0, 10, 0, 10, 0], { transform: m });
    const r = extractIges(t.toString());
    near(size(r)?.x, 20);
    near(size(r)?.y, 0);
    near(size(r)?.z, 20);
    near(r.boundingBox?.min.z, 90);
  });

  it("samples a rational B-spline quarter circle to its true radius", () => {
    const w = new IgesWriter();
    const h = Math.SQRT1_2;
    w.nurbsCurve(
      2,
      [0, 0, 0, 1, 1, 1],
      [
        [10, 0, 0],
        [10, 10, 0],
        [0, 10, 0],
      ],
      [1, h, 1],
    );
    const f = extractIges(w.toString());
    near(size(f)?.x, 10);
    near(size(f)?.y, 10);
  });

  it("measures a trimmed face by its trim, not its oversized surface", () => {
    const w = new IgesWriter();
    const surf = planePatch(w, -500, -500, 500, 500);
    // trim loop in (u, v): the square [0.5, 0.52] × [0.5, 0.51] -> model x 0..20, y 0..10
    const uv = w.polyline(
      [
        [0.5, 0.5, 0],
        [0.52, 0.5, 0],
        [0.52, 0.51, 0],
        [0.5, 0.51, 0],
      ],
      { use: 5 },
    );
    const xyz = w.polyline([
      [0, 0, 0],
      [20, 0, 0],
      [20, 10, 0],
      [0, 10, 0],
    ]);
    const loop = w.add(142, [1, surf, uv, xyz, 1], { subordinate: 1 });
    w.add(144, [surf, 1, 0, loop]);
    const f = extractIges(w.toString());
    near(size(f)?.x, 20, 1e-4);
    near(size(f)?.y, 10, 1e-4);
    near(f.boundingBox?.min.x, 0, 1e-4);
    assert.ok(!codes(f).includes("bbox-may-underestimate"), JSON.stringify(f.flags));
    assert.equal(f.fieldConfidence.boundingBox, "medium");
    assert.equal(f.solid?.bodies[0]?.faceCount, 1);
  });

  it("maps the parameter-space trim through the surface when there is no model-space curve", () => {
    const w = new IgesWriter();
    const surf = planePatch(w, -500, -500, 500, 500);
    const uv = w.polyline(
      [
        [0.5, 0.5, 0],
        [0.52, 0.5, 0],
        [0.52, 0.51, 0],
        [0.5, 0.51, 0],
      ],
      { use: 5 },
    );
    const loop = w.add(142, [1, surf, uv, 0, 1], { subordinate: 1 });
    w.add(144, [surf, 1, 0, loop]);
    const f = extractIges(w.toString());
    near(size(f)?.x, 20, 1e-4);
    near(size(f)?.y, 10, 1e-4);
  });

  it("finds the top of a curved B-spline face that its edges never reach", () => {
    // biquadratic patch over 10 × 10 with the centre control point at z = 8: the surface peaks at 2
    const pts = [0, 1, 2].map((j) =>
      [0, 1, 2].map((i) => [i * 5, j * 5, i === 1 && j === 1 ? 8 : 0]),
    );
    const natural = new IgesWriter();
    const s1 = natural.nurbsSurface(2, 2, [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], pts, undefined, {
      subordinate: 1,
    });
    natural.add(144, [s1, 0, 0, 0]);
    const n = extractIges(natural.toString());
    near(size(n)?.z, 2, 1e-9);
    near(size(n)?.x, 10, 1e-9);

    // the same surface trimmed to the middle: edges sit lower, the interior still reaches 2
    const trimmed = new IgesWriter();
    const s2 = trimmed.nurbsSurface(2, 2, [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], pts, undefined, {
      subordinate: 1,
    });
    const uv = trimmed.polyline(
      [
        [0.25, 0.25, 0],
        [0.75, 0.25, 0],
        [0.75, 0.75, 0],
        [0.25, 0.75, 0],
      ],
      { use: 5 },
    );
    const loop = trimmed.add(142, [1, s2, uv, 0, 1], { subordinate: 1 });
    trimmed.add(144, [s2, 1, 0, loop]);
    const t = extractIges(trimmed.toString());
    near(t.boundingBox?.max.z, 2, 1e-9);
    near(t.boundingBox?.min.x, 2.5, 1e-9);
    near(t.boundingBox?.max.x, 7.5, 1e-9);
  });

  it("flags a dome bounded only by its rim instead of guessing its height", () => {
    // a hemisphere r = 10: an arc revolved about z, trimmed by its rim circle in model space only
    const w = new IgesWriter();
    const axis = w.line(0, 0, -50, 0, 0, 50, { subordinate: 1 });
    // generatrix: quarter arc in the xz plane, as an arc in xy turned onto xz
    const toXZ = w.matrix(
      [
        [1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      ],
      [0, 0, 0],
    );
    const gen = w.add(100, [0, 0, 0, 10, 0, 0, 10], { transform: toXZ, subordinate: 1 });
    // that arc runs from (10,0,0) to (0,0,-10) after the turn; flip so it rises
    const flip = w.matrix(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ],
      [0, 0, 0],
    );
    const surf = w.add(120, [axis, gen, 0, 2 * Math.PI], { subordinate: 1, transform: flip });
    const rim = w.add(100, [0, 0, 0, 10, 0, 10, 0], { subordinate: 1 });
    const loop = w.add(142, [1, surf, 0, rim, 1], { subordinate: 1 });
    w.add(144, [surf, 1, 0, loop]);
    const f = extractIges(w.toString());
    near(size(f)?.x, 20);
    near(size(f)?.z, 0); // what the rim shows
    assert.ok(codes(f).includes("bbox-may-underestimate"));
    assert.match(
      f.flags.find((x) => x.code === "bbox-may-underestimate")?.message ?? "",
      /z by up to 10 mm/,
    );
    assert.equal(f.fieldConfidence.boundingBox, "low");
    // the 100 mm axis line defines the surface; it is not part of the box
    assert.ok((size(f)?.z ?? 99) < 1);
  });

  it("leaves out annotation, construction and blanked geometry", () => {
    const w = new IgesWriter();
    w.line(0, 0, 0, 10, 10, 10);
    w.line(-100, 0, 0, 100, 0, 0, { use: 1 }); // annotation
    w.line(0, -100, 0, 0, 100, 0, { use: 6 }); // construction
    w.line(0, 0, -100, 0, 0, 100, { blank: 1 }); // hidden
    w.add(116, [500, 500, 500]); // a reference point
    w.add(212, [1, 4, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, "NOTE"]); // a note
    const f = extractIges(w.toString());
    assert.deepEqual(size(f), { x: 10, y: 10, z: 10 });
    assert.ok(!codes(f).includes("unsupported-entities"), JSON.stringify(f.unsupported));
  });

  it("reads a B-rep solid's faces through shell, face, loop and edge list", () => {
    const w = new IgesWriter();
    const lines = [
      w.line(0, 0, 0, 30, 0, 0, { subordinate: 1 }),
      w.line(30, 0, 0, 30, 15, 0, { subordinate: 1 }),
      w.line(30, 15, 0, 0, 15, 0, { subordinate: 1 }),
      w.line(0, 15, 0, 0, 0, 0, { subordinate: 1 }),
      w.line(0, 0, 0, 0, 0, 5, { subordinate: 1 }),
    ];
    const verts = w.add(502, [2, 0, 0, 0, 30, 0, 0], { form: 1, subordinate: 1 });
    const edges = w.add(502 + 2, [lines.length, ...lines.flatMap((l) => [l, verts, 1, verts, 2])], {
      form: 1,
      subordinate: 1,
    });
    const loop = w.add(508, [4, ...[1, 2, 3, 4].flatMap((i) => [0, edges, i, 1, 0])], {
      form: 1,
      subordinate: 1,
    });
    const loop2 = w.add(508, [1, 0, edges, 5, 1, 0], { form: 1, subordinate: 1 });
    const pt = w.add(116, [0, 0, 0], { subordinate: 1 });
    const dir = w.add(123, [0, 0, 1], { subordinate: 1 });
    const plane = w.add(190, [pt, dir], { subordinate: 1 });
    const face = w.add(510, [plane, 1, 1, loop], { form: 1, subordinate: 1 });
    const face2 = w.add(510, [plane, 1, 1, loop2], { form: 1, subordinate: 1 });
    const shell = w.add(514, [2, face, 1, face2, 1], { form: 1, subordinate: 1 });
    w.add(186, [shell, 1, 0], { label: "BRACKET" });
    const f = extractIges(w.toString());
    assert.deepEqual(size(f), { x: 30, y: 15, z: 5 });
    assert.equal(f.solid?.bodies.length, 1);
    assert.equal(f.solid?.bodies[0]?.name, "BRACKET");
    assert.equal(f.solid?.bodies[0]?.faceCount, 2);
    assert.ok(!codes(f).includes("bbox-may-underestimate"), JSON.stringify(f.flags));
  });

  it("flags a grouping entity's own matrix rather than silently placing its members", () => {
    const w = new IgesWriter();
    const m = w.matrix(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [1000, 0, 0],
    );
    const a = w.line(0, 0, 0, 5, 0, 0, { subordinate: 1 });
    const b = w.line(5, 0, 0, 5, 5, 0, { subordinate: 1 });
    w.add(102, [2, a, b], { transform: m });
    const f = extractIges(w.toString());
    assert.ok(codes(f).includes("assembly-placement-ignored"));
    assert.equal(f.fieldConfidence.boundingBox, "low");
  });

  it("counts entities it does not measure, and says when nothing could be measured", () => {
    const w = new IgesWriter();
    w.add(408, [1, 0, 0, 0, 1]);
    const f = extractIges(w.toString());
    assert.equal(f.boundingBox, null);
    assert.ok(codes(f).includes("no-solid"));
    assert.ok(codes(f).includes("unsupported-entities"));
    assert.equal(f.confidence, "low");
  });

  it("reads a parametric spline curve's exact extremes", () => {
    // one cubic segment: x = s, y = 2.4s - s³ on s in [0, 2] peaks at s = √0.8, y = 1.6√0.8,
    // between the even samples (s = 0.75 gives 1.378, s = 1 gives 1.4)
    const w = new IgesWriter();
    w.add(112, [3, 3, 3, 1, 0, 2, 0, 1, 0, 0, 0, 2.4, 0, -1, 0, 0, 0, 0]);
    const f = extractIges(w.toString());
    near(f.boundingBox?.max.y, 1.6 * Math.sqrt(0.8), 1e-4);
    near(f.boundingBox?.min.y, -3.2); // y(2) = 4.8 - 8
    near(size(f)?.x, 2);
  });
});
