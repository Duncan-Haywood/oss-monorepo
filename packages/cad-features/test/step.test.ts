import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectFormat, extractFeatures, extractStep, parseStep } from "../src/index.ts";
import { plate, rod, StepWriter } from "./helpers/step-writer.ts";

const rel = (actual: number | null | undefined, expected: number, tol = 1e-6): void => {
  assert.ok(typeof actual === "number", `value missing (${actual})`);
  assert.ok(
    Math.abs(actual - expected) <= Math.abs(expected) * tol,
    `expected ${expected}, got ${actual}`,
  );
};
const codes = (r: { flags: { code: string }[] }): string[] => r.flags.map((f) => f.code);

describe("STEP physical file parser", () => {
  it("reads strings with quotes and semicolons, comments, enums, typed and complex instances", () => {
    const f = parseStep(
      [
        "ISO-10303-21;",
        "HEADER; FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }')); ENDSEC;",
        "DATA;",
        "/* a comment; with a semicolon */",
        "#1 = PRODUCT('it''s; a part', 'x', '', (#2));",
        "#2 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI., .METRE.) );",
        "#3 = LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4), #2);",
        "#4 = CARTESIAN_POINT('', (1.E-03, -2.5, 3.));",
        "#5 = BROKEN(((;",
        "#6 = DIRECTION('', (0., 0., 1.));",
        "ENDSEC;",
        "END-ISO-10303-21;",
      ].join("\n"),
    );
    assert.equal(f.schema, "AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }");
    assert.equal(f.instances.get(1)?.args[0], "it's; a part");
    assert.deepEqual(
      f.instances.get(2)?.parts.map((p) => p.type),
      ["LENGTH_UNIT", "NAMED_UNIT", "SI_UNIT"],
    );
    assert.deepEqual(f.instances.get(2)?.parts[2]?.args, [{ enum: "MILLI" }, { enum: "METRE" }]);
    assert.deepEqual(f.instances.get(3)?.args[0], { typed: "LENGTH_MEASURE", value: 25.4 });
    assert.deepEqual(f.instances.get(4)?.args[1], [0.001, -2.5, 3]);
    assert.equal(f.errors, 1);
    assert.ok(f.instances.has(6), "parsing resumes after a bad statement");
  });

  it("detects formats by name and by content", () => {
    assert.equal(detectFormat("", "a.STP"), "step");
    assert.equal(detectFormat("ISO-10303-21;\nHEADER;"), "step");
    assert.equal(detectFormat("  0\nSECTION\n  2\nHEADER\n"), "dxf");
    assert.equal(detectFormat("hello"), null);
    assert.throws(() => extractFeatures("hello", "a.txt"), /Unrecognised/);
  });
});

describe("STEP solids", () => {
  it("measures a box exactly", () => {
    const w = new StepWriter();
    const r = extractStep(w.file([plate(w, { w: 100, h: 50, t: 10 }, "box")]));
    assert.equal(r.sourceUnits, "mm");
    assert.equal(r.confidence, "high");
    assert.deepEqual(r.boundingBox?.size, { x: 100, y: 50, z: 10 });
    const b = r.solid?.bodies[0];
    assert.equal(b?.name, "box");
    assert.equal(b?.faceCount, 6);
    rel(b?.volume, 50000);
    assert.deepEqual(b?.cylinders, []);
    assert.deepEqual(r.flags, []);
  });

  it("subtracts a drilled hole and reports it as a hole", () => {
    const w = new StepWriter();
    const r = extractStep(
      w.file([plate(w, { w: 100, h: 50, t: 10, zHoles: [{ x: 30, y: 25, r: 5 }] })]),
    );
    rel(r.solid?.totalVolume, 50000 - Math.PI * 25 * 10);
    assert.deepEqual(r.solid?.bodies[0]?.cylinders, [
      { diameter: 10, kind: "hole", count: 1, depth: 10 },
    ]);
  });

  it("handles holes on two axes", () => {
    const w = new StepWriter();
    const s = plate(w, {
      w: 100,
      h: 50,
      t: 20,
      zHoles: [
        { x: 50, y: 40, r: 4 },
        { x: 80, y: 40, r: 4 },
      ],
      xHoles: [{ y: 15, z: 10, r: 3 }],
    });
    const r = extractStep(w.file([s]));
    rel(r.solid?.totalVolume, 100000 - 2 * Math.PI * 16 * 20 - Math.PI * 9 * 100);
    assert.deepEqual(r.solid?.bodies[0]?.cylinders, [
      { diameter: 6, kind: "hole", count: 1, depth: 100 },
      { diameter: 8, kind: "hole", count: 2, depth: 20 },
    ]);
    assert.deepEqual(r.solid?.bodies[0]?.holeAxes, [
      { diameters: [6], depth: 100 },
      { diameters: [8], depth: 20 },
      { diameters: [8], depth: 20 },
    ]);
    assert.equal(r.fieldConfidence.measures, "high");
  });

  it("counts a counterbored hole as one location with two diameters", () => {
    const w = new StepWriter();
    const s = plate(w, {
      w: 60,
      h: 40,
      t: 20,
      zHoles: [
        { x: 15, y: 20, r: 3.3, counterbore: { R: 5.5, depth: 6 } },
        { x: 45, y: 20, r: 3.3, counterbore: { R: 5.5, depth: 6 } },
        { x: 30, y: 30, r: 2.5 },
      ],
    });
    const r = extractStep(w.file([s]));
    const cb = Math.PI * 3.3 * 3.3 * 14 + Math.PI * 5.5 * 5.5 * 6;
    rel(r.solid?.totalVolume, 48000 - 2 * cb - Math.PI * 2.5 * 2.5 * 20);
    assert.deepEqual(r.solid?.bodies[0]?.cylinders, [
      { diameter: 5, kind: "hole", count: 1, depth: 20 },
      { diameter: 6.6, kind: "hole", count: 2, depth: 14 },
      { diameter: 11, kind: "hole", count: 2, depth: 6 },
    ]);
    assert.deepEqual(r.solid?.bodies[0]?.holeAxes, [
      { diameters: [5], depth: 20 },
      { diameters: [6.6, 11], depth: 20 },
      { diameters: [6.6, 11], depth: 20 },
    ]);
  });

  for (const angle of ["rad", "deg"] as const) {
    it(`integrates a countersink cone (semi-angle in ${angle})`, () => {
      const w = new StepWriter();
      const s = plate(w, {
        w: 40,
        h: 40,
        t: 10,
        zHoles: [{ x: 20, y: 20, r: 3, countersink: { R: 6, depth: 3 } }],
      });
      let text = w.file([s], "mm", angle);
      if (angle === "deg") {
        text = text.replace(
          /CONICAL_SURFACE\('',(#\d+),3\.,([-0-9.e]+)\)/,
          (_m, a: string, v: string) =>
            `CONICAL_SURFACE('',${a},3.,${(Number(v) * 180) / Math.PI})`,
        );
        assert.match(text, /CONICAL_SURFACE\('',#\d+,3\.,45\b/);
      }
      const r = extractStep(text);
      const frustum = (Math.PI * 3 * (9 + 18 + 36)) / 3;
      rel(r.solid?.totalVolume, 16000 - Math.PI * 9 * 7 - frustum);
      assert.deepEqual(r.solid?.bodies[0]?.surfaceTypes, {
        PLANE: 6,
        CYLINDRICAL_SURFACE: 1,
        CONICAL_SURFACE: 1,
      });
    });
  }

  it("converts inch files and finds a boss", () => {
    const w = new StepWriter();
    const r = extractStep(w.file([rod(w, 0.5, 2)], "in"));
    assert.equal(r.sourceUnits, "in");
    rel(r.solid?.totalVolume, Math.PI * 0.25 * 2 * 25.4 ** 3, 1e-5);
    assert.deepEqual(r.boundingBox?.size, { x: 25.4, y: 25.4, z: 50.8 });
    assert.deepEqual(r.solid?.bodies[0]?.cylinders, [
      { diameter: 25.4, kind: "boss", count: 1, depth: 50.8 },
    ]);
  });

  it("converts metre files", () => {
    const w = new StepWriter();
    const r = extractStep(w.file([plate(w, { w: 0.1, h: 0.05, t: 0.01 })], "m"));
    assert.equal(r.sourceUnits, "m");
    rel(r.solid?.totalVolume, 50000);
  });

  it("measures several bodies and flags them", () => {
    const w = new StepWriter();
    const r = extractStep(w.file([plate(w, { w: 10, h: 10, t: 10 }, "a"), rod(w, 5, 10, "b")]));
    assert.equal(r.solid?.bodies.length, 2);
    rel(r.solid?.totalVolume, 1000 + Math.PI * 250, 1e-5);
    assert.ok(codes(r).includes("multiple-solids"));
  });

  it("reports unsupported faces instead of guessing a volume", () => {
    const w = new StepWriter();
    const text = w
      .file([plate(w, { w: 10, h: 10, t: 10 })])
      .replace(/PLANE\('',(#\d+)\)/, (_m, a: string) => `SPHERICAL_SURFACE('',${a},5.)`);
    const r = extractStep(text);
    assert.equal(r.solid?.bodies[0]?.volume, null);
    assert.match(r.solid?.bodies[0]?.volumeNote ?? "", /SPHERICAL_SURFACE/);
    assert.deepEqual(r.unsupported, { SPHERICAL_SURFACE: 1 });
    assert.ok(codes(r).includes("volume-unsupported"));
    assert.ok(codes(r).includes("bbox-may-underestimate"));
    assert.equal(r.fieldConfidence.measures, "low");
    assert.deepEqual(r.boundingBox?.size, { x: 10, y: 10, z: 10 });
  });

  it("assumes mm and flags it when no unit is declared", () => {
    const w = new StepWriter();
    const text = w
      .file([plate(w, { w: 10, h: 10, t: 10 })])
      .replace(
        "( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )",
        "( NAMED_UNIT(*) SI_UNIT($,.SECOND.) TIME_UNIT() )",
      );
    const r = extractStep(text, { assumeUnits: "in" });
    assert.equal(r.unitsAssumed, true);
    assert.equal(r.sourceUnits, "in");
    assert.ok(codes(r).includes("units-unknown"));
    assert.deepEqual(r.boundingBox?.size, { x: 254, y: 254, z: 254 });
  });

  it("falls back to all points when the file has no solid", () => {
    const r = extractStep(
      "ISO-10303-21;\nHEADER;ENDSEC;\nDATA;\n#1=CARTESIAN_POINT('',(0.,0.,0.));\n#2=CARTESIAN_POINT('',(3.,4.,5.));\nENDSEC;\n",
    );
    assert.ok(codes(r).includes("no-solid"));
    assert.deepEqual(r.boundingBox?.size, { x: 3, y: 4, z: 5 });
    assert.equal(r.fieldConfidence.boundingBox, "low");
  });
});
