// The STEP/DXF adapter against packages/cad-features' public fixtures (Apache-2.0, see that
// package's test/fixtures/public/SOURCES.md). Expected values are the package's own hand-checked
// millimetre results converted to inches.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  suggestBendingOperation,
  suggestCuttingOperation,
  suggestDrillingOperation,
} from "@shared/costing";
import { canSuggestBlank, flatMeasures, holeLocationMeasures } from "@shared/geometry";
import { describe, expect, it } from "vitest";
import {
  circle,
  dxf,
  line,
  lwpolyline,
} from "../../../../../packages/cad-features/test/helpers/dxf-writer";
import { IgesWriter } from "../../../../../packages/cad-features/test/helpers/iges-writer";
import { binaryStl, boxMesh } from "../../../../../packages/cad-features/test/helpers/stl-writer";
import { CadFeaturesGeometry } from "./geometry";

const fixture = (name: string) => {
  const buf = readFileSync(
    fileURLToPath(
      new URL(`../../../../../packages/cad-features/test/fixtures/public/${name}`, import.meta.url),
    ),
  );
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

const geometry = new CadFeaturesGeometry("test");

describe("CadFeaturesGeometry", () => {
  it("reads a STEP solid: box, volume and holes in inches, high confidence", async () => {
    const g = await geometry.extract({
      name: "nema-17-bracket.STEP",
      bytes: fixture("build123d-nema-17-bracket.step"),
    });
    expect(g?.format).toBe("step");
    // 35 × 41 × 51 mm
    expect(g?.boundingBoxIn).toEqual({ xIn: 1.378, yIn: 1.6142, zIn: 2.0079 });
    // 7061.159 mm³
    expect(g?.volumeIn3).toBeCloseTo(7061.159 / 16_387.064, 3);
    expect(g?.holes).toEqual([
      { diameterIn: 0.1299, depthIn: 0.1181, count: 4, threaded: null },
      { diameterIn: 1.2598, depthIn: 0.1181, count: 1, threaded: null },
    ]);
    expect(g?.confidence).toEqual({
      boundingBox: "high",
      volume: "high",
      holes: "high",
      bends: "low",
    });
    expect(g?.flat).toBeNull();
    expect(g && canSuggestBlank(g)).toBe(true);
  });

  it("turns a STEP solid's hole locations into a drilling operation", async () => {
    const g = await geometry.extract({
      name: "nema-17-bracket.step",
      bytes: fixture("build123d-nema-17-bracket.step"),
    });
    expect(g?.holeLocations).toEqual([
      ...Array.from({ length: 4 }, () => ({ diametersIn: [0.1299], depthIn: 0.1181 })),
      { diametersIn: [1.2598], depthIn: 0.1181 },
    ]);
    const holes = g ? holeLocationMeasures(g) : null;
    expect(holes).not.toBeNull();
    const vmc = { id: "vmc", name: "VMC", defaultSetupMinutes: 45, secondsPerHole: 9 };
    expect(holes && suggestDrillingOperation(holes, [vmc])).toEqual({
      machineId: "vmc",
      label: "Drill from CAD: 4 holes × 9 s (1 bore over 1 in left out)",
      setupMinutes: 45,
      cycleMinutesPerPart: 0.6,
    });
    // a DXF's holes are cut, not drilled
    const flat = await geometry.extract({
      name: "vslot.dxf",
      bytes: fixture("cadquery-vslot-2020_1.dxf"),
    });
    expect(flat && holeLocationMeasures(flat)).toBeNull();
  });

  it("reads a DXF flat pattern: blank, cut length and holes, never a 3D blank", async () => {
    const g = await geometry.extract({
      name: "vslot.dxf",
      bytes: fixture("cadquery-vslot-2020_1.dxf"),
    });
    expect(g?.format).toBe("dxf");
    expect(g?.volumeIn3).toBeNull();
    expect(g?.flat?.blankIn).toEqual({ widthIn: 0.7874, heightIn: 0.7874 });
    expect(g?.flat?.netAreaIn2).toBeCloseTo(162.526 / 645.16, 3);
    expect(g?.holes).toEqual([{ diameterIn: 0.1654, depthIn: null, count: 1, threaded: null }]);
    expect(g && canSuggestBlank(g)).toBe(false);
  });

  it("turns a flat pattern with a bend layer into a cut and a bend operation", async () => {
    // 4 × 2 in plate (inches, $INSUNITS 1), two Ø0.25 holes, one line on a BEND layer
    const text = dxf(
      [
        lwpolyline(
          "CUT",
          [
            [0, 0],
            [4, 0],
            [4, 2],
            [0, 2],
          ],
          true,
        ),
        circle("CUT", 0.5, 1, 0.125),
        circle("CUT", 3.5, 1, 0.125),
        line("BEND", 2, 0, 2, 2),
      ],
      { insunits: 1 },
    );
    const g = await geometry.extract({
      name: "bracket.dxf",
      bytes: new TextEncoder().encode(text).buffer as ArrayBuffer,
    });
    expect(g?.flat).toMatchObject({ pierceCount: 3, bendLineCount: 1 });
    // 12 in outline + 2 × π × 0.25 in holes
    expect(g?.flat?.cutLengthIn).toBeCloseTo(12 + 2 * Math.PI * 0.25, 3);
    expect(g?.confidence).toMatchObject({ volume: "high", holes: "high", bends: "high" });
    const flat = g && flatMeasures(g);
    expect(flat).not.toBeNull();
    const rates = { pierceSeconds: null, secondsPerBend: null, cutSpeedInPerMin: null };
    const laser = { ...rates, id: "l", name: "Laser", defaultSetupMinutes: 10 };
    const machines = [
      { ...laser, cutSpeedInPerMin: 200, pierceSeconds: 2 },
      { ...laser, id: "b", name: "Brake", secondsPerBend: 12 },
    ];
    if (!flat) return;
    // 13.571 / 200 = 0.0679 min + 3 × 2 s = 0.1 min -> 0.1679, rounded up to 0.17
    expect(suggestCuttingOperation(flat, machines)).toMatchObject({
      machineId: "l",
      label: "Cut from DXF: 13.6 in at 200 in/min + 3 pierces × 2 s",
      cycleMinutesPerPart: 0.17,
    });
    expect(suggestBendingOperation(flat, machines)).toMatchObject({
      machineId: "b",
      label: "Bend from DXF: 1 bend line × 12 s",
      cycleMinutesPerPart: 0.2,
    });
  });

  it("carries the parser's flags, e.g. units it had to assume", async () => {
    const g = await geometry.extract({
      name: "square.dxf",
      bytes: fixture("build123d-squareandcircle.dxf"),
    });
    expect(g?.flags?.map((f) => f.code)).toContain("units-unknown");
  });

  it("returns null for CAD types it does not read", async () => {
    expect(await geometry.extract({ name: "part.sldprt", bytes: new ArrayBuffer(8) })).toBeNull();
  });
});

describe("STL through the adapter", () => {
  // A 2 × 1 × 0.5 block drawn in inches; the file cannot say so.
  const stl = () => {
    const b = binaryStl(boxMesh(0, 0, 0, 2, 1, 0.5));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };

  it("measures it in assumed millimetres and suggests nothing until someone says the units", async () => {
    const g = await geometry.extract({ name: "BLOCK-1.stl", bytes: stl() });
    expect(g?.format).toBe("stl");
    expect(g?.units).toEqual({ read: "mm", setBy: "assumed" });
    expect(g?.boundingBoxIn).toEqual({ xIn: 0.0787, yIn: 0.0394, zIn: 0.0197 });
    expect(g?.confidence?.boundingBox).toBe("low");
    expect(g && canSuggestBlank(g)).toBe(false);
    expect(g?.flags?.map((f) => f.code)).toContain("units-unknown");
  });

  it("reads it in the unit the estimator chose: blank and volume become usable", async () => {
    const g = await geometry.extract({ name: "BLOCK-1.stl", bytes: stl(), units: "in" });
    expect(g?.units).toEqual({ read: "in", setBy: "estimator" });
    expect(g?.boundingBoxIn).toEqual({ xIn: 2, yIn: 1, zIn: 0.5 });
    expect(g?.volumeIn3).toBeCloseTo(1, 4);
    expect(g?.surfaceAreaIn2).toBeCloseTo(2 * (2 + 1 + 0.5), 4);
    expect(g?.confidence).toMatchObject({ boundingBox: "medium", volume: "medium", holes: "low" });
    expect(g && canSuggestBlank(g)).toBe(true);
    expect(g && holeLocationMeasures(g)).toBeNull();
    expect(g?.flags?.map((f) => f.code)).not.toContain("units-unknown");
  });

  it("keeps a STEP file's own units even when a unit is passed", async () => {
    const g = await geometry.extract({
      name: "cube.step",
      bytes: fixture("cadquery-red_cube_blue_cylinder.step"),
      units: "in",
    });
    expect(g?.units).toBeUndefined();
  });
});

describe("IGES through the adapter", () => {
  // A 3 × 2 × 1 in block's top face: a 1 m B-spline plane trimmed to 3 × 2, plus its 1 in side edge.
  const iges = (unitFlag = 1) => {
    const w = new IgesWriter({ unitFlag, unitName: unitFlag === 1 ? "IN" : "FURLONG" });
    const s = w.nurbsSurface(
      1,
      1,
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [
        [
          [-20, -20, 1],
          [20, -20, 1],
        ],
        [
          [-20, 20, 1],
          [20, 20, 1],
        ],
      ],
      undefined,
      { subordinate: 1 },
    );
    const uv = w.polyline(
      [
        [0.5, 0.5, 0],
        [0.575, 0.5, 0],
        [0.575, 0.55, 0],
        [0.5, 0.55, 0],
      ],
      { use: 5 },
    );
    const xyz = w.polyline([
      [0, 0, 1],
      [3, 0, 1],
      [3, 2, 1],
      [0, 2, 1],
    ]);
    w.add(144, [s, 1, 0, w.add(142, [1, s, uv, xyz, 1], { subordinate: 1 })]);
    w.line(0, 0, 0, 0, 0, 1);
    return new TextEncoder().encode(w.toString()).buffer as ArrayBuffer;
  };

  it("measures the trimmed box in the file's own inches and can size a blank from it", async () => {
    const g = await geometry.extract({ name: "BLOCK.IGS", bytes: iges() });
    expect(g?.format).toBe("iges");
    expect(g?.boundingBoxIn).toEqual({ xIn: 3, yIn: 2, zIn: 1 });
    expect(g?.units).toBeUndefined();
    expect(g?.volumeIn3).toBeNull();
    expect(g?.holes).toEqual([]);
    expect(g?.confidence?.boundingBox).toBe("medium");
    expect(g && canSuggestBlank(g)).toBe(true);
    expect(g?.flags?.map((f) => f.code)).toContain("volume-unsupported");
  });

  it("suggests nothing from a file whose units it does not recognise until someone says them", async () => {
    const g = await geometry.extract({ name: "block.iges", bytes: iges(3) });
    // read in inches, the IGES default, but only as an assumption
    expect(g?.units).toEqual({ read: "in", setBy: "assumed" });
    expect(g && canSuggestBlank(g)).toBe(false);
    const chosen = await geometry.extract({ name: "block.iges", bytes: iges(3), units: "in" });
    expect(chosen?.boundingBoxIn).toEqual({ xIn: 3, yIn: 2, zIn: 1 });
    expect(chosen?.units).toEqual({ read: "in", setBy: "estimator" });
    expect(chosen && canSuggestBlank(chosen)).toBe(true);
  });
});
