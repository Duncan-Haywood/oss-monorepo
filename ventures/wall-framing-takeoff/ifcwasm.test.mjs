import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadIfcEngine } from "./ifcwasm.mjs";
import { planFromDxf } from "./dxf.mjs";

const wasm = readFileSync(new URL("./ifc-engine.wasm", import.meta.url));
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const native = new URL("./ifc-engine/target/release/ifc-engine", import.meta.url).pathname;

test("wasm reads the buildingSMART wall with a window", async () => {
  const e = await loadIfcEngine(wasm);
  const p = e.plan(fx("bsi-wall-with-opening-and-window-ifc4.ifc"));
  assert.equal(p.walls.length, 1);
  assert.ok(Math.abs(p.walls[0].length - 3) < 1e-6);
  assert.equal(p.walls[0].openings.length, 1);
  const r = planFromDxf(e.dxf(fx("bsi-wall-with-opening-and-window-ifc4.ifc")));
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.stats.walls, 1);
  assert.equal(r.stats.openings, 1);
});

test("wasm and the native binary give identical DXF and JSON on the real fixtures", { skip: !existsSync(native) && "build the native binary: cargo build --release" }, async () => {
  const e = await loadIfcEngine(wasm);
  for (const n of ["bsi-simple-scene-architecture-ifc2x3.ifc", "bsi-simple-scene-architecture-ifc43.ifc", "bsi-wall-with-opening-and-window-ifc4.ifc"]) {
    const f = new URL(`./fixtures/${n}`, import.meta.url).pathname;
    assert.equal(e.dxf(fx(n), 1), execFileSync(native, ["dxf", f, "--storey", "1"]).toString(), n);
    assert.deepEqual(e.plan(fx(n), 1), JSON.parse(execFileSync(native, ["plan", f, "--storey", "1"]).toString()), n);
  }
});

test("garbage input returns an error, not a trap; repeated calls leak nothing fatal", async () => {
  const e = await loadIfcEngine(wasm);
  for (let i = 0; i < 200; i++) {
    const r = e.plan(new TextEncoder().encode("not an ifc file"));
    assert.ok(r.error || r.walls?.length === 0);
  }
  assert.equal(e.dxf(new Uint8Array(0)), "");
});

test("openingSizes: a bare void with a sill is framed as a window at its own height", async () => {
  const { openingSizes } = await import("./ifcwasm.mjs");
  // the shape of a real wood-framed wall (12 ft, a 32 x 80 in void at the floor, a 36 x 48 in void with a 32 in sill)
  const info = { walls: [{ start: [1.2192, 1.27635], end: [4.8768, 1.27635], openings: [
    { kind: "void", from: 0.6096, to: 1.4224, sill: 0, height: 2.032 },
    { kind: "void", from: 2.1336, to: 3.048, sill: 0.8128, height: 1.2192 }] }] };
  const f = openingSizes(info), k = 1 / 0.0254;
  const door = f({ x: (1.2192 + 1.016) * k, y: 1.27635 * k }), win = f({ x: (1.2192 + 2.5908) * k, y: 1.27635 * k });
  assert.deepEqual(door, { height: 80, headerHeight: 80, kind: "door" });
  assert.deepEqual(win, { height: 48, headerHeight: 80, kind: "window" });
  assert.equal(f({ x: 0, y: 0 }), null);
  const dxf = (l, a, b) => `0\nLINE\n8\n${l}\n10\n${a}\n20\n50.25\n30\n0\n11\n${b}\n21\n50.25\n31\n0\n`;
  const text = "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n" + dxf("A-WALL", 48, 192) + dxf("A-DOOR", 72, 104) + dxf("A-DOOR", 132, 168) + "0\nENDSEC\n0\nEOF\n";
  const bare = planFromDxf(text), sized = planFromDxf(text, { openingSize: f });
  assert.deepEqual(bare.plan.walls[0].openings.map((o) => o.kind), ["door", "door"]);
  const ops = sized.plan.walls[0].openings;
  assert.deepEqual(ops.map((o) => [o.kind, o.height, o.headerHeight]), [["door", 80, 80], ["window", 48, 80]]);
});
