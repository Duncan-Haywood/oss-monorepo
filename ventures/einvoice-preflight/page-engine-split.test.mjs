// The official-Schematron bridge and the repair modules are not static imports
// of page-engine.mjs (so a plain "Check" never fetches them), and the engine's
// async wrappers give the same answers as the modules they load
// (docs/history/einvoice-page-perf-2026-11-26-official-and-repair-on-demand.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as engine from "./page-engine.mjs";
import * as official from "./official.mjs";
import { officialNote } from "./official-note.mjs";
import { repairInvoice } from "./repair.mjs";
import { repairUbl } from "./repair-ubl.mjs";
import { repairCii } from "./repair-cii.mjs";
import { repairFacturX } from "./repair-facturx.mjs";
import { looksLikeCii } from "./cii.mjs";

const here = (f) => new URL(`./${f}`, import.meta.url);
const statics = (src) => [...src.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*"([^"]+)"/gm)].map((m) => m[1]);

test("no static import of the engine reaches official.mjs or a repair module", () => {
  const lazy = ["./official.mjs", "./official-browser.mjs", "./repair.mjs", "./repair-ubl.mjs", "./repair-cii.mjs", "./repair-facturx.mjs"];
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const d of statics(readFileSync(here(f), "utf8"))) if (d.startsWith("./")) walk(d);
  };
  walk("./page-engine.mjs");
  for (const f of lazy) assert.ok(!seen.has(f), `${f} is statically reachable from page-engine.mjs`);
  assert.ok(seen.has("./report.mjs"));
});

test("official-note.mjs imports nothing; official.mjs re-exports the same function", () => {
  assert.deepEqual(statics(readFileSync(here("official-note.mjs"), "utf8")), []);
  assert.equal(official.officialNote, officialNote);
  assert.equal(engine.officialNote, officialNote);
});

test("the engine's repair wrappers return what the repair modules return", async () => {
  await engine.repairsReady();
  let n = 0;
  for (const f of readdirSync(here("examples"))) {
    const p = here(`examples/${f}`);
    if (f.endsWith(".json")) {
      const text = readFileSync(p, "utf8");
      let direct;
      try { direct = repairInvoice(JSON.parse(text)); } catch (e) { await assert.rejects(engine.repairInvoice(JSON.parse(text)), { message: e.message }); n++; continue; }
      assert.deepEqual(await engine.repairInvoice(JSON.parse(text)), direct, f);
      n++;
    } else if (f.endsWith(".xml")) {
      const text = readFileSync(p, "utf8");
      const [mine, theirs] = looksLikeCii(text) ? [engine.repairCii, repairCii] : [engine.repairUbl, repairUbl];
      let direct;
      try { direct = theirs(text); } catch (e) { await assert.rejects(mine(text), { message: e.message }); n++; continue; }
      assert.deepEqual(await mine(text), direct, f);
      n++;
    } else if (f.endsWith(".pdf")) {
      const bytes = new Uint8Array(readFileSync(p));
      assert.deepEqual(await engine.repairFacturX(bytes), await repairFacturX(bytes), f);
      n++;
    }
  }
  assert.ok(n >= 20, `only ${n} examples compared`);
});

test("addOfficialFindings through the engine matches official.mjs", async () => {
  const text = readFileSync(here("examples/cii-invoice.xml"), "utf8");
  const inputs = [{ name: "cii-invoice.xml", source: text }];
  const run = async (add) => {
    const result = await engine.preflightDocuments(inputs, {});
    // No ./plain/ runner and no server: both report "unavailable".
    await add(result, inputs, { runner: null, fetchFn: async () => { throw new Error("offline"); } });
    return result;
  };
  const viaEngine = await run(engine.addOfficialFindings);
  assert.equal(viaEngine.reports[0].schematron, "unavailable");
  assert.deepEqual(viaEngine, await run(official.addOfficialFindings));
});
