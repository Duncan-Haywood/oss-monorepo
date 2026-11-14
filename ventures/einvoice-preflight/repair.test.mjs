import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairInvoice } from "./repair.mjs";

const valid = () => JSON.parse(readFileSync(new URL("./examples/valid-invoice.json", import.meta.url), "utf8"));

test("a clean invoice is left alone", () => {
  const r = repairInvoice(valid());
  assert.equal(r.repaired, false);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.remaining, []);
});

test("wrong line net and totals are recomputed and the result passes", () => {
  const inv = valid();
  inv.lines[0].net = 150;
  inv.totals = { net: 1, tax: 2, gross: 3, prepaid: 38, due: 9 };
  const r = repairInvoice(inv);
  assert.equal(r.repaired, true);
  assert.deepEqual(r.invoice.totals, { net: 200, tax: 38, gross: 238, prepaid: 38, due: 200 });
  assert.ok(r.before.length > 0);
  assert.deepEqual(r.remaining, []);
  assert.ok(r.changes.every((c) => c.path && "from" in c && "to" in c && c.reason));
  assert.equal(inv.totals.net, 1, "input is not mutated");
});

test("lower-case currency is fixed", () => {
  const inv = valid();
  inv.currency = "eur";
  const r = repairInvoice(inv);
  assert.equal(r.invoice.currency, "EUR");
  assert.deepEqual(r.remaining, []);
});

test("an invalid tax rate is never invented; totals are left and finding remains", () => {
  const inv = valid();
  inv.lines[0].tax_percent = "abc";
  inv.totals.gross = 1;
  const r = repairInvoice(inv);
  assert.ok(r.remaining.some((e) => e.rule === "INV-011"));
  assert.equal(r.invoice.lines[0].tax_percent, "abc");
  assert.equal(r.invoice.totals.gross, 1);
});

test("identity and date defects are reported, not guessed", () => {
  const inv = valid();
  inv.issue_date = "24/08/2026";
  delete inv.customer.name;
  const r = repairInvoice(inv);
  assert.deepEqual(r.remaining.map((e) => e.rule).sort(), ["INV-003", "INV-006"]);
});

test("non-object input is returned unchanged", () => {
  const r = repairInvoice([]);
  assert.equal(r.repaired, false);
  assert.equal(r.remaining[0].rule, "INV-001");
});

// Red team 2026-11-14: repair recomputed the arithmetic its own way and broke
// invoices the checker accepts. A valid invoice must come back untouched, and a
// broken one must come back passing, in each shape below.
const shaped = (lines, totals) => ({ ...valid(), lines: lines.map((l) => ({ description: "Item", ...l })), totals });

for (const [name, inv] of [
  ["sub-cent unit price (1000 x 0.125)", shaped([{ quantity: 1000, unit_price: 0.125, tax_percent: 19, net: 125 }], { net: 125, tax: 23.75, gross: 148.75 })],
  ["price base quantity (10 x 50 per 100)", shaped([{ quantity: 10, unit_price: 50, price_base_quantity: 100, tax_percent: 19, net: 5 }], { net: 5, tax: 0.95, gross: 5.95 })],
  ["VAT per rate, not per line (3 x 0.10 at 5%)", shaped([0, 1, 2].map(() => ({ quantity: 1, unit_price: 0.1, tax_percent: 5, net: 0.1 })), { net: 0.3, tax: 0.02, gross: 0.32 })],
]) {
  test(`a valid invoice is left alone: ${name}`, () => {
    const r = repairInvoice(inv);
    assert.deepEqual(r.before, []);
    assert.deepEqual(r.changes, []);
    assert.deepEqual(r.remaining, []);
  });
  test(`a broken invoice is repaired to the checker's numbers: ${name}`, () => {
    const broken = JSON.parse(JSON.stringify(inv));
    broken.lines[0].net = 999;
    broken.totals = { net: 1, tax: 2, gross: 3 };
    const r = repairInvoice(broken);
    assert.deepEqual(r.remaining, []);
    assert.deepEqual(r.invoice.lines, inv.lines);
    assert.deepEqual(r.invoice.totals, inv.totals);
  });
}

test("rounding (BT-114) is kept in the amount due", () => {
  const inv = valid();
  inv.totals = { net: 200, tax: 38, gross: 238, prepaid: 0, rounding: 0.4, due: 1 };
  const r = repairInvoice(inv);
  assert.equal(r.invoice.totals.due, 238.4);
  assert.deepEqual(r.remaining, []);
});

// The class guard behind the 2026-11-14 fix: over every JSON example, the repair
// never adds a finding the checker did not already report, and it never touches
// an invoice the checker passes.
import { readdirSync } from "node:fs";

test("over every JSON example, repair never adds a finding and leaves clean invoices alone", () => {
  const dir = new URL("./examples/", import.meta.url);
  let checked = 0;
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    let inv;
    try { inv = JSON.parse(readFileSync(new URL(name, dir), "utf8")); } catch { continue; }
    if (!inv || typeof inv !== "object" || Array.isArray(inv) || !("lines" in inv)) continue;
    const r = repairInvoice(inv);
    const key = (e) => `${e.rule} ${e.path}`;
    const before = new Set(r.before.map(key));
    const added = r.remaining.map(key).filter((k) => !before.has(k));
    assert.deepEqual(added, [], `${name}: repair added findings`);
    if (r.before.length === 0) assert.deepEqual(r.changes, [], `${name}: a clean invoice was changed`);
    checked += 1;
  }
  assert.ok(checked >= 2, `only ${checked} JSON invoices found`);
});

// Seeded fuzz over the shapes that broke it: sub-cent prices, base quantities,
// line and header allowances, several rates. The invoice is made consistent with
// the repair itself, then: the checker must pass it, a second repair must not touch
// it, and after its totals and one line net are scrambled the repair must bring it
// back to a state with no finding the scrambled one did not have.
test("seeded fuzz: repaired invoices pass and stay put; repair never adds a finding", () => {
  let seed = 20261114;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  for (let i = 0; i < 300; i += 1) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, j) => {
      const line = { description: `Item ${j}`, quantity: pick([1, 2, 3, 7, 12.5, 1000]), unit_price: pick([0.1, 0.125, 0.333, 9.99, 50, 1234.5678]), tax_percent: pick([0, 5, 7, 19, 21]), net: 0 };
      if (rnd() < 0.25) line.price_base_quantity = pick([10, 100]);
      if (rnd() < 0.2 && (line.quantity * line.unit_price) / (line.price_base_quantity || 1) > 3) line.adjustments = [{ kind: pick(["allowance", "charge"]), amount: pick([0.5, 1, 2.25]), reason: "test" }];
      return line;
    });
    const inv = { ...valid(), lines, totals: { net: 0, tax: 0, gross: 0, prepaid: 0, due: 0 } };
    delete inv.adjustments;
    if (rnd() < 0.2 && new Set(lines.map((l) => l.tax_percent)).size === 1) inv.adjustments = [{ kind: "allowance", amount: 0.01, reason: "test", tax_percent: lines[0].tax_percent, tax_category: "S" }];
    const first = repairInvoice(inv);
    const clean = first.invoice;
    const tag = JSON.stringify(inv);
    if (first.remaining.some((e) => /^\/(lines|totals)/.test(e.path) && /^INV-01[2-8]|^INV-029/.test(e.rule))) {
      assert.fail(`case ${i}: arithmetic findings left after repair: ${JSON.stringify(first.remaining)} on ${tag}`);
    }
    const again = repairInvoice(clean);
    assert.deepEqual(again.changes, [], `case ${i}: a repaired invoice was changed again: ${tag}`);
    const broken = JSON.parse(JSON.stringify(clean));
    broken.lines[0].net = 1;
    broken.totals = { net: 2, tax: 3, gross: 4, prepaid: 0, due: 5 };
    const r = repairInvoice(broken);
    const key = (e) => `${e.rule} ${e.path}`;
    const before = new Set(r.before.map(key));
    assert.deepEqual(r.remaining.map(key).filter((k) => !before.has(k)), [], `case ${i}: ${tag}`);
    assert.deepEqual(r.invoice.totals, clean.totals, `case ${i}: totals differ from the clean repair: ${tag}`);
  }
});

test("an allowance bigger than its line stops the totals; no negative tax is written", () => {
  const inv = valid();
  inv.lines[0] = { ...inv.lines[0], quantity: 2, unit_price: 0.125, net: 0, adjustments: [{ kind: "allowance", amount: 2.25, reason: "test" }] };
  inv.totals = { net: 1, tax: 1, gross: 2 };
  const r = repairInvoice(inv);
  assert.deepEqual(r.invoice.totals, inv.totals);
  assert.ok(!r.changes.some((c) => typeof c.to === "number" && c.to < 0 && c.path.startsWith("/totals")));
});
