import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalize, completeWorkOrder, generateDueWorkOrders, importAssetsCsv, emptyData, parseCsv } from "./store.mjs";
import { partStatus } from "./parts.mjs";
import { summarize, toCsv, PLAN_COLUMNS } from "./report.mjs";
import { exampleData } from "./example.mjs";
import { parseDay, planStatus } from "./schedule.mjs";

const today = parseDay("2026-11-22");

test("normalize keeps good records, drops broken ones and says why", () => {
  const { data, problems } = normalize({
    assets: [{ id: "A1", name: "Pump" }, { id: "A1", name: "dup" }, { id: "A2" }],
    plans: [{ id: "P1", assetId: "A1", every: { n: 1, unit: "month" }, start: "2026-01-01" }, { id: "P2", assetId: "A9", every: { n: 1, unit: "month" } }, { id: "P3", assetId: "A1" }],
    workOrders: [{ id: "WO7", assetId: "A1" }],
    parts: [],
  });
  assert.equal(data.assets.length, 1);
  assert.equal(data.plans.length, 1);
  assert.equal(problems.length, 4);
  assert.equal(data.nextId, 8);
  assert.throws(() => normalize([]));
});

test("example data survives normalize untouched", () => {
  const ex = exampleData(today);
  const { data, problems } = normalize(JSON.parse(JSON.stringify(ex)));
  assert.deepEqual(problems, []);
  assert.equal(data.workOrders.length, ex.workOrders.length);
});

test("due plans get one work order each, and completing it moves the plan on and uses the parts", () => {
  const data = exampleData(today);
  const made = generateDueWorkOrders(data, today);
  assert.ok(made.length >= 2);
  assert.equal(generateDueWorkOrders(data, today).length, 0, "no duplicates while one is open");
  const rtu = made.find((w) => w.planId === "P6");
  const filters = data.parts.find((p) => p.id === "S3");
  const before = filters.onHand;
  assert.equal(partStatus(filters, data.workOrders, today).reserved, 4);
  completeWorkOrder(data, rtu.id, { date: "2026-11-22", labourHours: 2 });
  assert.equal(filters.onHand, before - 4);
  const plan = data.plans.find((p) => p.id === "P6");
  assert.equal(planStatus(plan, [], today).due, "2027-02-22");
  assert.throws(() => completeWorkOrder(data, rtu.id, { date: "2026-11-22" }), /already done/);
});

test("completing with a meter reading logs the reading on the asset", () => {
  const data = exampleData(today);
  const w = { id: "WOx", assetId: "A4", planId: "P5", status: "open", parts: [] };
  data.workOrders.push(w);
  const n = data.assets.find((a) => a.id === "A4").readings.length;
  completeWorkOrder(data, "WOx", { date: "2026-11-22", meter: 5400 });
  assert.equal(data.assets.find((a) => a.id === "A4").readings.length, n + 1);
  assert.equal(planStatus(data.plans.find((p) => p.id === "P5"), data.assets.find((a) => a.id === "A4").readings, today).meterDue, 5700);
});

test("parts: reorder point from monthly usage, lead time and service level", () => {
  const part = { id: "S", onHand: 5, leadDays: 30, serviceLevel: 0.95 };
  // 2 a month for 12 months: sd 0, ROP = 2
  const wos = Array.from({ length: 12 }, (_, k) => ({ status: "done", completed: new Date((today - 15 - 30 * k) * 86400000).toISOString().slice(0, 10), parts: [{ partId: "S", qty: 2 }] }));
  const s = partStatus(part, wos, today);
  assert.equal(s.perMonth, 2);
  assert.equal(s.reorderPoint, 2);
  assert.equal(s.status, "ok");
  // lumpy: 24 in one month; same mean, big sd
  const lumpy = [{ status: "done", completed: "2026-11-01", parts: [{ partId: "S", qty: 24 }] }];
  const l = partStatus(part, lumpy, today);
  assert.equal(l.perMonth, 2);
  assert.ok(l.reorderPoint > 10, String(l.reorderPoint));
  assert.equal(l.status, "reorder");
  // claimed by an open order
  assert.equal(partStatus(part, [{ status: "open", parts: [{ partId: "S", qty: 6 }] }], today).status, "short");
});

test("asset CSV import reads quoted cells and flags bad dates", () => {
  const data = emptyData();
  const r = importAssetsCsv(data, '\uFEFFEquipment,Location,Installed,Meter\r\n"Boiler, main",Plant,2019-05-01,hours\r\nFan,Roof,05/01/2019,\r\n,Nowhere,,\r\n');
  assert.equal(r.added, 2);
  assert.equal(data.assets[0].name, "Boiler, main");
  assert.equal(data.assets[0].meterUnit, "hours");
  assert.equal(data.assets[1].inService, "");
  assert.equal(r.problems.length, 2);
  assert.deepEqual(parseCsv('a,"b ""q"""\n'), [["a", 'b "q"']]);
});

test("summary of the example plant and a formula-safe CSV", () => {
  const s = summarize(exampleData(today), today);
  assert.equal(s.counts.overdue, 1);
  assert.ok(s.compliancePct > 50 && s.compliancePct < 100);
  const gear = s.reliability.find((r) => r.assetId === "A2");
  assert.equal(gear.failures, 3);
  assert.ok(gear.replacement.optimal > 0);
  const sealer = s.reliability.find((r) => r.assetId === "A3");
  assert.match(sealer.reading.pattern, /mixed causes/);
  const csv = toCsv([{ asset: "=HYPERLINK(1)", title: "x", compliance: { pct: 1 } }], PLAN_COLUMNS);
  assert.match(csv, /'=HYPERLINK/);
});

test("the CLI runs on the example and prints the due list", () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL("./cli.mjs", import.meta.url)), "--example", "--today", "2026-11-22"], { encoding: "utf8" });
  assert.match(out, /1 overdue/);
  assert.match(out, /Conveyor 3 gearbox: 3 failures/);
});
