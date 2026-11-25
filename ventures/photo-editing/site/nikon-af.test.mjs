import { test } from "node:test";
import assert from "node:assert/strict";
import { nikonPhaseAf } from "./rawpreview.mjs";
import { NIKON_AF_BODIES, NIKON_AF_NAMES } from "./nikon-af-grids.mjs";

// A big-endian view like the maker note's own (Nikon notes are "MM").
const be = (b) => { const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); return { u16: (o) => dv.getUint16(o, false) }; };
const info = (ver, len, set) => { const b = new Uint8Array(len); b.set(new TextEncoder().encode(ver), 0); set(b); return b; };

test("Nikon 0100 51-point: primary and used bits name the point; D810 uses the D800 grid", () => {
  // The public D810 sample: schema 1, primary 11, AFPointsUsed 00 04 (bit 10 -> point 11 = C5).
  const b = info("0100", 30, (b) => { b[5] = 0x0d; b[6] = 1; b[7] = 11; b[9] = 0x04; });
  const af = nikonPhaseAf(b, 0, b.length, be(b), "NIKON D810");
  assert.equal(af.source, "Nikon AFInfo2 51-point");
  assert.deepEqual(af.names, ["C5"]);
  assert.equal(af.points.length, 51);
  const on = af.points.filter((p) => p.inFocus);
  assert.deepEqual(on.map((p) => p.name), ["C5"]);
  assert.deepEqual([on[0].x, on[0].y], NIKON_AF_BODIES["NIKON D800"].pts.C5.slice(0, 2));
  assert.ok(on[0].x < 0.5 && on[0].y === 0.5);
});

test("Nikon 0100 39-point and point numbering follow ExifTool's tables", () => {
  assert.equal(NIKON_AF_NAMES["51"][1], "C6");
  assert.equal(NIKON_AF_NAMES["39"][3], "A2");
  assert.equal(NIKON_AF_NAMES["153"][1], "E9");
  // D7000: point 3 (A2, top row centre) used.
  const b = info("0100", 30, (b) => { b[6] = 3; b[7] = 3; b[8] = 0b100; });
  const af = nikonPhaseAf(b, 0, b.length, be(b), "NIKON D7000");
  assert.deepEqual(af.names, ["A2"]);
  const p = af.points.find((q) => q.inFocus);
  assert.ok(Math.abs(p.x - 0.5) < 0.01 && p.y < 0.45);
});

test("Nikon 0101 153-point: in-focus bits win; interpolated points are flagged", () => {
  // D500: AFPointsInFocus bit for point 2 (D9, an unlisted row) and primary 1 (E9).
  const b = info("0101", 0x50, (b) => { b[6] = 7; b[8] = 1; b[0x30] = 0b10; b[0x44] = 1; });
  const af = nikonPhaseAf(b, 0, b.length, be(b), "NIKON D500");
  assert.equal(af.source, "Nikon AFInfo2 153-point");
  assert.deepEqual(af.names, ["D9"]);
  const d9 = af.points.find((p) => p.name === "D9");
  assert.ok(d9.inFocus && d9.interpolated);
  const e9 = af.points.find((p) => p.name === "E9"), c9 = af.points.find((p) => p.name === "C9");
  assert.ok(Math.abs(d9.y - (e9.y + c9.y) / 2) < 1e-4 && Math.abs(e9.x - 0.5) < 1e-3);
});

test("Nikon 04xx mirrorless: AF area centre in AF-image pixels, no table needed", () => {
  const b = info("0400", 0x50, (b) => { b[7] = 1; const dv = new DataView(b.buffer); [8256, 5504, 2064, 4128, 400, 400].forEach((v, i) => dv.setUint16(0x3e + 2 * i, v)); });
  const af = nikonPhaseAf(b, 0, b.length, be(b), "NIKON Z 8");
  assert.equal(af.source, "Nikon AFInfo2 (AF area)");
  assert.deepEqual([af.points[0].x, af.points[0].y], [0.25, 0.75]);
});

test("Nikon: unknown body, 11-point schema, or nothing used gives none", () => {
  const used = info("0100", 30, (b) => { b[6] = 1; b[7] = 1; b[8] = 1; });
  assert.equal(nikonPhaseAf(used, 0, 30, be(used), "NIKON D9999"), null);
  const eleven = info("0100", 30, (b) => { b[6] = 2; b[7] = 1; b[8] = 1; });
  assert.equal(nikonPhaseAf(eleven, 0, 30, be(eleven), "NIKON D90"), null);
  const none = info("0100", 30, (b) => { b[6] = 1; });
  assert.equal(nikonPhaseAf(none, 0, 30, be(none), "NIKON D800"), null);
});

test("Nikon: a DX crop on an FX body moves the points out from the centre", () => {
  const b = info("0100", 30, (b) => { b[6] = 1; b[7] = 6; b[8] = 0b100000; }); // point 6 = C7
  const full = nikonPhaseAf(b, 0, 30, be(b), "NIKON D800").points.find((p) => p.inFocus);
  const dx = nikonPhaseAf(b, 0, 30, be(b), "NIKON D800", { x0: 1 / 6, y0: 1 / 6, w: 2 / 3, h: 2 / 3 }).points.find((p) => p.inFocus);
  assert.ok(Math.abs((dx.x - 0.5) - 1.5 * (full.x - 0.5)) < 1e-9);
});
