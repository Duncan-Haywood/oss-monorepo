import test from "node:test";
import assert from "node:assert/strict";
import { briefToFile, briefFromFile, briefFromEyewear, briefFromStudio, prefillFor, saveBrief, loadBrief, applyBrief, BRIEF_KEY } from "./launchbrief.mjs";
import { unitCost, DEFAULT_PLAN } from "./costing.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
// By hand: goods 10, duty 10% = 1, freight 0.5, trims 0.4 + packaging 0.1 -> landed 11.5.
const sheet = { currency: "EUR", moq: 100, leadTimeDays: 35, dutyPct: 10, freightPerUnit: 0.5, trimsPerUnit: 0.4, packagingPerUnit: 0.1 };
const plan = { salesTaxPct: 20, channelFeePct: 5, paymentFeePct: 3, paymentFixed: 0.3 };
const design = { quantity: 200, price: 48 };
const cost = { landed: 11.5, currency: "EUR" };

test("goods, extras, freight and net per sale are worked back by hand", () => {
  const b = briefFromStudio(design, sheet, plan, cost);
  assert.equal(b.factoryPerUnit, 9.5);      // (11.5 - 0.5) / 1.1 = 10 goods, minus 0.5 extras
  assert.equal(b.extrasPerUnit, 0.5);
  assert.equal(b.freightTotal, 100);        // 0.5 x 200
  assert.equal(b.netPerSale, 35.86);        // 48/1.2 = 40, minus 8% of 48 = 3.84, minus 0.3 -> 35.86
  assert.equal(b.profitPerSale, 24.36);
});

test("round trip through the real costing function", () => {
  const d = { garment: "tee", fabric: "cotton-jersey", quantity: 100, price: 40, placements: [], decorations: [] };
  let c; try { c = unitCost({ ...d, decoration: [] }, EXAMPLE_SUPPLIER); } catch { c = { landed: 10, currency: "EUR" }; }
  const b = briefFromStudio({ quantity: 100, price: 40 }, EXAMPLE_SUPPLIER, DEFAULT_PLAN, c);
  // factory + extras, grown by duty, plus freight, gives back the landed cost (to a cent)
  const back = (b.factoryPerUnit + b.extrasPerUnit) * (1 + b.dutyPct / 100) + b.freightTotal / b.quantity;
  assert.ok(Math.abs(back - b.landed) < 0.02);
  assert.equal(b.example, true);
});

test("prefill maps each page and skips what it cannot fill", () => {
  const b = briefFromStudio(design, sheet, plan, cost);
  assert.deepEqual(prefillFor("cashflow", b), { units: 200, fpu: 9.5, oth: 0.5, frt: 100, duty: 10, net: 35.86, prod: 5 });
  assert.deepEqual(prefillFor("preorder", b), { price: 48, landed: 11.5, moq: 100, tax: 20, fee: 8, feef: 0.3 });
  assert.deepEqual(prefillFor("tna", b), { "d-production": 35 });
  assert.deepEqual(prefillFor("nonsense", b), {});
  assert.deepEqual(prefillFor("cashflow", null), {});
  const noMoq = briefFromStudio(design, { ...sheet, moq: 0, leadTimeDays: null }, plan, cost);
  assert.equal("moq" in prefillFor("preorder", noMoq), false);
  assert.equal("prod" in prefillFor("cashflow", noMoq), false);
});

test("refuses a cost that is not a number or an empty run", () => {
  assert.equal(briefFromStudio(design, sheet, plan, { landed: NaN }), null);
  assert.equal(briefFromStudio({ quantity: 0, price: 5 }, sheet, plan, cost), null);
  assert.equal(saveBrief(null, mem()), false);
});

test("save, load, bad data, and applyBrief writes boxes and reports", () => {
  const s = mem();
  assert.equal(loadBrief(s), null);
  saveBrief(briefFromStudio(design, sheet, plan, cost), s, new Date("2026-11-06T10:00:00Z"));
  assert.equal(loadBrief(s).savedAt.slice(0, 10), "2026-11-06");
  s.setItem(BRIEF_KEY, "{not json"); assert.equal(loadBrief(s), null);
  s.setItem(BRIEF_KEY, JSON.stringify({ version: 2, quantity: 5 })); assert.equal(loadBrief(s), null);
  saveBrief(briefFromStudio(design, sheet, plan, cost), s);
  const boxes = { units: { value: "" }, fpu: { value: "" } };
  const doc = { getElementById: id => boxes[id] ?? null };
  const note = applyBrief("cashflow", doc, s);
  assert.equal(boxes.units.value, "200"); assert.equal(boxes.fpu.value, "9.5");
  assert.match(note, /Filled 7 boxes/);
  assert.equal(applyBrief("cashflow", doc, mem()), "");
});

test("sunglasses brief: cloth counts as an extra, duty and freight are worked back by hand", () => {
  // By hand: goods 10 + 10% duty = 11, freight 1 -> landed 12. Extras: cloth 0.4 + packaging 0.6 = 1.
  const eyeSheet = { currency: "EUR", moq: 100, dutyPct: 10, freightPerUnit: 1, clothPerUnit: 0.4, packagingPerUnit: 0.6, example: true };
  const b = briefFromEyewear({ quantity: 150, price: 65 }, eyeSheet, { salesTaxPct: 22, channelFeePct: 0, paymentFeePct: 3, paymentFixed: 0.3 }, { landed: 12, currency: "EUR" });
  assert.equal(b.kind, "sunglasses");
  assert.equal(b.extrasPerUnit, 1);
  assert.equal(b.factoryPerUnit, 9);        // (12 - 1) / 1.1 = 10 goods, minus 1 extras
  assert.equal(b.freightTotal, 150);
  assert.equal(b.netPerSale, 51.03);        // 65/1.22 = 53.28, minus 3% of 65 = 1.95, minus 0.3
  assert.equal(b.leadTimeDays, null);
  assert.equal(b.profitPerSale, 39.03);     // 51.03 - 12
  assert.match(applyFor(b), /sunglasses design \(150 pairs/);
});

function applyFor(b) {
  const store = mem(); saveBrief(b, store);
  const doc = { getElementById: () => ({ value: "" }) };
  return applyBrief("reorder", doc, store);
}

test("brief file: round trip keeps every number, and a hostile file is cut down to known fields", () => {
  const b = briefFromStudio(design, sheet, plan, cost);
  const text = briefToFile(b, new Date("2026-11-07T10:00:00Z"));
  const back = briefFromFile(text);
  assert.equal(back.error, "");
  assert.deepEqual(back.brief, { ...b, savedAt: "2026-11-07T10:00:00.000Z" });
  assert.equal(briefToFile(null), null);
  const evil = JSON.stringify({ ...b, price: 48, evil: "<script>", currency: "<b>", savedAt: "x" });
  const e = briefFromFile(evil).brief;
  assert.equal(e.evil, undefined); assert.equal(e.currency, "EUR"); assert.equal(e.savedAt, null);
  assert.match(briefFromFile(JSON.stringify({ ...b, price: "48" })).error, /"price" must be a number/);
  assert.match(briefFromFile(JSON.stringify({ ...b, quantity: 0 })).error, /quantity above zero/);
  assert.match(briefFromFile("{nope").error, /not JSON/);
  assert.match(briefFromFile(JSON.stringify({ version: 2 })).error, /version 1/);
  // a file saved here fills a page's boxes the same as the in-browser copy
  assert.deepEqual(prefillFor("preorder", back.brief), prefillFor("preorder", b));
});
