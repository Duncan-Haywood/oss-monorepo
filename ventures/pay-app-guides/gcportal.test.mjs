import { test } from "node:test";
import assert from "node:assert/strict";
import { portalLine, gcpaySovCheck } from "./gcportal.mjs";

test("a line with stored materials rising: new stored is the rise, every portal's numbers follow", () => {
  const r = portalLine({ scheduled: "50,000", previous: "20000", thisPeriod: "8000", storedNow: "3000", storedBefore: "1000" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.columns.g, 3100000);
  assert.equal(r.columns.balance, 1900000);
  assert.equal(r.procore.workThisPeriod, 800000);
  assert.equal(r.procore.newMaterialsStored, 200000);
  assert.equal(r.procore.materialsPresentlyStored, 300000);
  assert.deepEqual(r.textura.thisPeriod, { workThisPeriod: 800000, materialStoredThisPeriod: 200000 });
  assert.deepEqual(r.textura.toDate, { completedToDate: 3100000, storedToDate: 300000 });
  assert.equal(r.gcpay.thisPeriod, 800000);
  assert.equal(r.gcpay.workToDatePercent, 0.56);
});

test("first application here: the whole stored balance is new", () => {
  const r = portalLine({ scheduled: "10000", previous: "0", thisPeriod: "1000", storedNow: "500", storedBefore: "" });
  assert.equal(r.procore.newMaterialsStored, 50000);
});

test("stored balance fell: new stored is unknown and the page says why, never a guess", () => {
  const r = portalLine({ scheduled: "10000", previous: "2000", thisPeriod: "3000", storedNow: "500", storedBefore: "2000" });
  assert.equal(r.procore.newMaterialsStored, null);
  assert.equal(r.textura.thisPeriod.materialStoredThisPeriod, null);
  assert.match(r.warnings.join(" "), /delivery tickets/);
});

test("billing past the scheduled value warns; bad and negative amounts are errors", () => {
  assert.match(portalLine({ scheduled: "1000", previous: "900", thisPeriod: "200", storedNow: "0" }).warnings[0], /past 100%/);
  assert.equal(portalLine({ scheduled: "abc", previous: "0", thisPeriod: "0", storedNow: "0" }).errors.length, 1);
  assert.equal(portalLine({ scheduled: "100", previous: "-5", thisPeriod: "0", storedNow: "0" }).errors.length, 1);
  assert.equal(portalLine({}).errors.length, 4);
});

test("GCPay SOV: lines that add to the contract match", () => {
  const r = gcpaySovCheck({ contract: "100000", lines: "1, Mobilization, 5000\n2\tRough-in\t60000\n3,\"Trim, fixtures\",\"35,000.00\"" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.findings, []);
  assert.equal(r.total, 10000000);
  assert.equal(r.matches, true);
});

test("GCPay SOV: a short total, a total row, a change order, extra columns and duplicates are all named", () => {
  const r = gcpaySovCheck({ contract: "100000", lines: "1,Mobilization,5000\n1,Rough-in,60000\n3,CO #2 added outlets,1200\n4,Trim,10,30000\n,Total,96200" });
  assert.equal(r.matches, false);
  assert.equal(r.difference, 9620000 - 10000000);
  const all = r.findings.join("\n");
  assert.match(all, /total row/);
  assert.match(all, /change order/);
  assert.match(all, /four|4 cells/);
  assert.match(all, /used twice/);
});

test("GCPay SOV: no contract, a bad value cell and an empty paste", () => {
  const r = gcpaySovCheck({ contract: "", lines: "1,Mob,abc\n2,Rough,\n3" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Original contract value/);
  assert.equal(r.findings.length, 3);
  assert.equal(r.difference, null);
});
