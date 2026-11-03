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
