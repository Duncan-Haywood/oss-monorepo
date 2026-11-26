import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDxf, extractFeatures } from "../src/index.ts";
import {
  arc,
  circle,
  dxf,
  face3d,
  insert,
  line,
  lwpolyline,
  pairs,
  spline,
  text,
} from "./helpers/dxf-writer.ts";

const close = (actual: number | undefined, expected: number, tol = 1e-3): void => {
  assert.ok(actual !== undefined, "value missing");
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);
};
const codes = (r: { flags: { code: string }[] }): string[] => r.flags.map((f) => f.code);

describe("DXF flat parts", () => {
  it("measures a plate with round holes, a slot and a bend line (mm)", () => {
    // 100 × 50 plate, four Ø6 corner holes, one Ø10 centre hole, a 20 × 8 slot, one bend line
    const slot = lwpolyline(
      "CUT",
      [
        [66, 21],
        [78, 21, 1],
        [78, 29],
        [66, 29, 1],
      ],
      true,
    );
    const text_ = dxf(
      [
        lwpolyline(
          "CUT",
          [
            [0, 0],
            [100, 0],
            [100, 50],
            [0, 50],
          ],
          true,
        ),
        circle("CUT", 10, 10, 3),
        circle("CUT", 90, 10, 3),
        circle("CUT", 90, 40, 3),
        circle("CUT", 10, 40, 3),
        circle("CUT", 35, 25, 5),
        slot,
        line("BEND", 50, 0, 50, 50),
        text("TEXT", "PART 1"),
      ],
      { insunits: 4 },
    );
    const r = extractDxf(text_);
    assert.equal(r.sourceUnits, "mm");
    assert.equal(r.unitsAssumed, false);
    assert.equal(r.confidence, "high");
    const flat = r.flat;
    assert.ok(flat);
    close(flat.outerPerimeter, 300);
    close(flat.grossArea, 5000);
    const holesArea = 4 * Math.PI * 9 + Math.PI * 25 + (12 * 8 + Math.PI * 16);
    close(flat.netArea, 5000 - holesArea);
    assert.equal(flat.holeCount, 6);
    assert.equal(flat.pierceCount, 7);
    assert.deepEqual(flat.circularHoles, [
      { diameter: 6, count: 4 },
      { diameter: 10, count: 1 },
    ]);
    const s = flat.holes.find((h) => h.kind === "slot");
    close(s?.diameter, 8);
    close(s?.length, 20);
    const holesPerim = 4 * Math.PI * 6 + Math.PI * 10 + (24 + Math.PI * 8);
    close(flat.cutLength, 300 + holesPerim);
    assert.equal(flat.bendLineSource, "layer");
    assert.equal(flat.bendLines.length, 1);
    close(flat.bendLines[0]?.length, 50);
    assert.deepEqual(flat.blank, { width: 100, height: 50 });
    assert.deepEqual(r.boundingBox?.size, { x: 100, y: 50, z: 0 });
    assert.deepEqual(r.flags, []);
  });

  it("chains separate LINE and ARC entities into a rounded outline and converts inches", () => {
    // 4 in × 2 in with 0.25 in corner radii, drawn as 4 lines + 4 arcs; Ø0.5 in hole
    const r0 = 0.25;
    const ents = [
      line("0", r0, 0, 4 - r0, 0),
      arc("0", 4 - r0, r0, r0, 270, 360),
      line("0", 4, r0, 4, 2 - r0),
      arc("0", 4 - r0, 2 - r0, r0, 0, 90),
      line("0", 4 - r0, 2, r0, 2),
      arc("0", r0, 2 - r0, r0, 90, 180),
      line("0", 0, 2 - r0, 0, r0),
      arc("0", r0, r0, r0, 180, 270),
      circle("0", 2, 1, 0.25),
    ];
    const r = extractDxf(dxf(ents, { insunits: 1 }));
    assert.equal(r.sourceUnits, "in");
    const k = 25.4;
    const perim = 2 * (4 + 2) - 8 * r0 + 2 * Math.PI * r0;
    const area = 8 - (4 - Math.PI) * r0 * r0;
    close(r.flat?.outerPerimeter, perim * k);
    close(r.flat?.grossArea, area * k * k, 1e-2);
    close(r.flat?.netArea, (area - Math.PI * 0.0625) * k * k, 1e-2);
    assert.deepEqual(r.flat?.circularHoles, [{ diameter: 12.7, count: 1 }]);
    assert.equal(r.flat?.openChainCount, 0);
    assert.equal(r.confidence, "high");
  });

  it("expands block inserts with rotation, scale and a mirrored (230 = -1) insert", () => {
    const blocks = [{ name: "HOLE", entities: [circle("0", 5, 0, 2)] }];
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [200, 0],
          [200, 100],
          [0, 100],
        ],
        true,
      ),
      insert("HOLE", 50, 50), // hole at (55, 50) Ø4
      insert("HOLE", 100, 50, { rot: 90, sx: 2, sy: 2 }), // hole at (100, 60) Ø8
      insert("HOLE", -150, 50, { extrusionZ: -1 }), // OCS (-145, 50) mirrors to (145, 50)
    ];
    const r = extractDxf(dxf(ents, { insunits: 4, blocks }));
    const centers = r.flat?.holes.map((h) => [h.center.x, h.center.y, h.diameter]);
    assert.deepEqual(
      centers?.sort((a, b) => (a[0] as number) - (b[0] as number)),
      [
        [55, 50, 4],
        [100, 60, 8],
        [145, 50, 4],
      ].sort((a, b) => (a[0] as number) - (b[0] as number)),
    );
  });

  it("treats the mirrored insert as outside the part and flags it", () => {
    const blocks = [{ name: "HOLE", entities: [circle("0", 5, 0, 2)] }];
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [200, 0],
          [200, 100],
          [0, 100],
        ],
        true,
      ),
      insert("HOLE", 150, 50, { extrusionZ: -1 }),
    ];
    const r = extractDxf(dxf(ents, { insunits: 4, blocks }));
    // the mirrored circle lands at x = -145, outside the plate: a second outline, not a hole
    assert.equal(r.flat?.holeCount, 0);
    assert.equal(r.flat?.outlineCount, 2);
    assert.ok(codes(r).includes("multiple-outlines"));
  });

  it("assumes units when $INSUNITS is missing and honours assumeUnits", () => {
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        true,
      ),
    ];
    const mm = extractDxf(dxf(ents));
    assert.equal(mm.unitsAssumed, true);
    assert.equal(mm.fieldConfidence.units, "low");
    assert.equal(mm.confidence, "low");
    assert.ok(codes(mm).includes("units-unknown"));
    close(mm.flat?.grossArea, 100);
    const inch = extractDxf(dxf(ents), { assumeUnits: "in" });
    assert.equal(inch.sourceUnits, "in");
    close(inch.flat?.outerPerimeter, 40 * 25.4);
  });

  it("takes dashed lines inside the part as bend lines when there is no bend layer", () => {
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
        true,
      ),
      line("0", 40, 0.5, 40, 49.5, "DASHED"),
      line("0", 70, 0.5, 70, 49.5, "CENTER"),
      line("0", 150, 0, 150, 50, "DASHED"), // outside the part: ignored
    ];
    const r = extractDxf(dxf(ents, { insunits: 4 }));
    assert.equal(r.flat?.bendLineSource, "linetype");
    assert.equal(r.flat?.bendLines.length, 2);
    assert.equal(r.fieldConfidence.bends, "low");
    assert.ok(codes(r).includes("bend-lines-by-linetype"));
    close(r.flat?.outerPerimeter, 300);
  });

  it("reads the linetype from the layer table when the entity says BYLAYER", () => {
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
        true,
      ),
      line("FOLD", 40, 0.5, 40, 49.5),
    ];
    const r = extractDxf(dxf(ents, { insunits: 4, layers: { FOLD: "HIDDEN" } }));
    assert.equal(r.flat?.bendLines.length, 1);
  });

  it("measures etch layers without cutting them and ignores dimension layers", () => {
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
        true,
      ),
      line("ETCH", 10, 10, 30, 10),
      circle("MARKING", 50, 25, 5),
      lwpolyline(
        "DIMENSIONS",
        [
          [0, -10],
          [100, -10],
          [100, -20],
          [0, -20],
        ],
        true,
      ),
    ];
    const r = extractDxf(dxf(ents, { insunits: 4 }));
    close(r.flat?.etchLength, 20 + 10 * Math.PI);
    assert.equal(r.flat?.holeCount, 0);
    assert.equal(r.flat?.outlineCount, 1);
  });

  it("flags open chains, nests and islands", () => {
    const ents = [
      lwpolyline(
        "0",
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        true,
      ),
      lwpolyline(
        "0",
        [
          [20, 20],
          [80, 20],
          [80, 80],
          [20, 80],
        ],
        true,
      ), // cut-out
      circle("0", 50, 50, 10), // part nested inside the cut-out
      lwpolyline(
        "0",
        [
          [200, 0],
          [250, 0],
          [250, 50],
          [200, 50],
        ],
        true,
      ), // second part
      line("0", 300, 0, 320, 0),
      line("0", 320, 0, 320, 30), // open chain
    ];
    const r = extractDxf(dxf(ents, { insunits: 4 }));
    assert.deepEqual(
      codes(r).sort(),
      ["multiple-outlines", "nested-islands", "open-chains"].sort(),
    );
    close(r.flat?.grossArea, 10000);
    close(r.flat?.netArea, 10000 - 3600);
    assert.equal(r.flat?.holeCount, 1);
    assert.equal(r.flat?.openChainCount, 1);
    assert.equal(r.fieldConfidence.measures, "medium");
  });

  it("evaluates a rational spline circle within tessellation error", () => {
    // exact NURBS circle, radius 10, centred at the origin (degree 2, 9 control points)
    const w = Math.SQRT1_2;
    const ctrl: [number, number][] = [
      [10, 0],
      [10, 10],
      [0, 10],
      [-10, 10],
      [-10, 0],
      [-10, -10],
      [0, -10],
      [10, -10],
      [10, 0],
    ];
    const knots = [0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1];
    const ents = [
      lwpolyline(
        "0",
        [
          [-50, -50],
          [50, -50],
          [50, 50],
          [-50, 50],
        ],
        true,
      ),
      spline("0", 2, knots, ctrl, [1, w, 1, w, 1, w, 1, w, 1], true),
    ];
    const r = extractDxf(dxf(ents, { insunits: 4 }));
    const hole = r.flat?.holes[0];
    assert.equal(hole?.kind, "other");
    close(hole?.area, Math.PI * 100, Math.PI * 100 * 2e-3);
    close(hole?.perimeter, Math.PI * 20, Math.PI * 20 * 1e-3);
    assert.ok(codes(r).includes("approximated-curves"));
    assert.equal(r.confidence, "medium");
  });

  it("counts unsupported entities and refuses binary DXF", () => {
    const r = extractDxf(
      dxf(
        [
          lwpolyline(
            "0",
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
            true,
          ),
          face3d("0"),
        ],
        { insunits: 4 },
      ),
    );
    assert.deepEqual(r.unsupported, { "3DFACE": 1 });
    assert.ok(codes(r).includes("unsupported-entities"));
    const bin = extractDxf("AutoCAD Binary DXF\r\n\u001a\u0000...");
    assert.equal(bin.flat, null);
    assert.deepEqual(codes(bin), ["binary-dxf"]);
  });

  it("drops exact duplicate entities before chaining", () => {
    const sq = [
      line("0", 0, 0, 10, 0),
      line("0", 10, 0, 10, 10),
      line("0", 10, 10, 0, 10),
      line("0", 0, 10, 0, 0),
    ];
    const r = extractDxf(dxf([...sq, line("0", 10, 0, 0, 0)], { insunits: 4 }));
    close(r.flat?.outerPerimeter, 40);
    assert.equal(r.flat?.openChainCount, 0);
  });

  it("reports no outline when nothing closes", () => {
    const r = extractDxf(dxf([line("0", 0, 0, 10, 0)], { insunits: 4 }));
    assert.equal(r.flat, null);
    assert.ok(codes(r).includes("no-closed-outline"));
    assert.equal(r.fieldConfidence.measures, "low");
  });

  it("is reachable through extractFeatures with bytes and CRLF line ends", () => {
    const t = dxf(
      [
        lwpolyline(
          "0",
          [
            [0, 0],
            [10, 0],
            [10, 5],
            [0, 5],
          ],
          true,
        ),
      ],
      { insunits: 4 },
    );
    const bytes = new TextEncoder().encode(t.replace(/\n/g, "\r\n"));
    const r = extractFeatures(bytes, "part.DXF");
    assert.equal(r.format, "dxf");
    close(r.flat?.grossArea, 50);
  });
});

describe("DXF expansion budget (hostile files)", () => {
  it("stops a nested block-insert bomb and flags every figure as incomplete", () => {
    // B0 is one circle; each Bk inserts B(k-1) ten times, so B8 would expand to 10^8 circles.
    const blocks = [{ name: "B0", entities: [circle("0", 0, 0, 1)] }];
    for (let k = 1; k <= 8; k++) {
      const ents = Array.from({ length: 10 }, (_, i) => insert(`B${k - 1}`, i * 3, 0));
      blocks.push({ name: `B${k}`, entities: ents });
    }
    const started = Date.now();
    const r = extractDxf(dxf([insert("B8", 0, 0)], { insunits: 4, blocks }));
    assert.ok(Date.now() - started < 10_000, "expansion was not bounded");
    assert.ok(codes(r).includes("expansion-limit"));
    assert.equal(r.confidence, "low");
  });

  it("stops a huge insert array (group 70/71 counts from the file)", () => {
    const blocks = [{ name: "E", entities: [] as string[] }];
    // An INSERT whose column and row counts are a billion each, pointing at an empty block.
    const arr = pairs(
      0,
      "INSERT",
      8,
      "0",
      2,
      "E",
      10,
      0,
      20,
      0,
      30,
      0,
      70,
      1e9,
      71,
      1e9,
      44,
      1,
      45,
      1,
    );
    const started = Date.now();
    const r = extractDxf(
      dxf(
        [
          lwpolyline(
            "0",
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
            ],
            true,
          ),
          arr,
        ],
        { insunits: 4, blocks },
      ),
    );
    assert.ok(Date.now() - started < 10_000, "array expansion was not bounded");
    assert.ok(codes(r).includes("expansion-limit"));
  });
});
