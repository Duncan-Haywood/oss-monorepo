import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { planFromIfcWasm, ifcPlanDxf } from "./ifc-wasm.mjs";

const files = ["bsi-simple-scene-architecture-ifc2x3.ifc", "bsi-simple-scene-architecture-ifc43.ifc", "bsi-wall-with-opening-and-window-ifc4.ifc"];

test("the wasm reader gives a plan for each buildingSMART sample", async () => {
  for (const f of files) {
    const r = await planFromIfcWasm(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
    assert.ok(r.ok, `${f}: ${r.errors}`);
    assert.ok(r.plan.walls.length > 0, f);
  }
});

test("the wall with an opening keeps its window", async () => {
  const r = await planFromIfcWasm(readFileSync(new URL("./fixtures/bsi-wall-with-opening-and-window-ifc4.ifc", import.meta.url), "utf8"));
  assert.ok(r.plan.walls.some((w) => (w.openings ?? []).length > 0));
});

test("native CLI and wasm write the same DXF", { skip: !existsSync(new URL("./ifc-engine/target/release/ifc-engine", import.meta.url)) }, async () => {
  for (const f of files) {
    const p = new URL(`./fixtures/${f}`, import.meta.url).pathname;
    const native = execFileSync(new URL("./ifc-engine/target/release/ifc-engine", import.meta.url).pathname, ["dxf", p], { encoding: "utf8" });
    assert.equal(await ifcPlanDxf(readFileSync(p, "utf8")), native, f);
  }
});

test("bad input is refused, not thrown", async () => {
  assert.equal((await planFromIfcWasm("hello")).ok, false);
  assert.equal((await planFromIfcWasm("ISO-10303-21;\nHEADER;ENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;")).ok, false);
  const f = readFileSync(new URL(`./fixtures/${files[0]}`, import.meta.url), "utf8");
  assert.equal((await planFromIfcWasm(f, { storey: 99 })).ok, false);
});
