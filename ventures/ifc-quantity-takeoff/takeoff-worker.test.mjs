import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv, rowsCsv, checkSummary } from "./qto.mjs";
import { PRESETS } from "./measure.mjs";
import { diffTakeoffs, changesCsv } from "./diff.mjs";
import { storeyList, modelOrigin } from "./view-mesh.mjs";

const bytes = (name) => new Uint8Array(readFileSync(new URL(`./samples/${name}`, import.meta.url)));

// view-worker.mjs run in this process with a stand-in `self`; returns what it posted
async function runWorker(data) {
  const posted = [];
  globalThis.self = { postMessage: (d) => posted.push(structuredClone(d)), close() {} };
  await import(`./view-worker.mjs?${Math.random()}`);
  self.onmessage({ data });
  delete globalThis.self;
  return posted;
}

const outputs = (t) => {
  const s = [rowsCsv(t.rows), JSON.stringify(checkSummary(t.rows)), JSON.stringify(storeyList(t.rows)), JSON.stringify(modelOrigin(t.rows))];
  for (const by of [["class", "type"], ["storey", "class"], ["uniformat"]]) for (const rule of [null, ...Object.values(PRESETS)]) s.push(boqCsv(boq(t.rows, by, rule), by, {}, rule));
  return s;
};

test("the worker posts the takeoff first, without the solids, and every page output is the same", async () => {
  const posted = await runWorker({ bytes: bytes("sample-office.ifc"), mesh: true });
  assert.ok(posted[0].takeoff, "first message is the takeoff");
  assert.ok(posted[1].ready && posted.at(-1).done, "then the meshing batches");
  const fromWorker = posted[0].takeoff, onPage = takeoff(parseStep(bytes("sample-office.ifc")));
  assert.deepEqual(outputs(fromWorker), outputs(onPage));
  const solid = fromWorker.rows.find((r) => r.computed?.status === "ok");
  assert.ok(solid && solid.computed.solids === undefined && solid.world === undefined, "solids stay in the worker");
});

test("a revision's takeoff stops after the rows, and diffs the same as the page's", async () => {
  const posted = await runWorker({ bytes: bytes("sample-office.ifc"), mesh: false });
  assert.equal(posted.length, 1);
  const later = takeoff(parseStep(bytes("sample-office-rev2.ifc")));
  const page = takeoff(parseStep(bytes("sample-office.ifc")));
  assert.equal(changesCsv(diffTakeoffs(posted[0].takeoff.rows, later.rows)), changesCsv(diffTakeoffs(page.rows, later.rows)));
});

test("a file that is not IFC is reported as unreadable, so the page does not try it again", async () => {
  const posted = await runWorker({ bytes: new TextEncoder().encode("hello"), mesh: true });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].read, true);
  assert.match(posted[0].failed, /not a STEP file/);
});
