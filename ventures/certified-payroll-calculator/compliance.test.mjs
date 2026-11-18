import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReport, sampleReport } from "./wh347.mjs";
import { buildCompliance } from "./compliance.mjs";

test("sample: apprentice named, laborer underpaid listed as an exception", () => {
  const c = buildCompliance(buildReport(sampleReport()));
  assert.deepEqual(c.apprentices, ["B. Apprentice"]);
  assert.equal(c.exceptions.length, 1);
  assert.equal(c.exceptions[0].worker, "C. Laborer");
  assert.equal(c.readyToSign, false);
  assert.ok(c.lines.some((l) => l.startsWith("Exceptions: C. Laborer")));
});
test("clean week with plan fringe only", () => {
  const r = buildReport({ header: { contractor: "X", project: "P", payrollNo: "1", weekEnding: "2026-10-04" }, workers: [
    { name: "T", idLast4: "1234", classification: "Laborer", days: [8, 8, 8, 8, 8, 0, 0], requiredBase: 30, requiredFringe: 10, actualBase: 30, planFringe: 10, cashFringe: 0 }] });
  const c = buildCompliance(r);
  assert.equal(c.fringeMode, "plan");
  assert.equal(c.readyToSign, true);
  assert.ok(c.lines.some((l) => /No apprentices/.test(l)));
  assert.ok(c.lines.some((l) => /Exceptions: none/.test(l)));
});
test("page wires the statement in", () => {
  const p = readFileSync(new URL("./wh347-report.html", import.meta.url), "utf8");
  assert.match(p, /buildCompliance/);
  assert.match(p, /id="soc"/);
});
