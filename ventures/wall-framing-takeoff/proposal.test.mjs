import test from "node:test";
import assert from "node:assert/strict";
import { proposal, proposalText } from "./proposal.mjs";

const mk = (over = {}) => ({
  lines: [
    { section: "Sheathing", item: "Wall sheets", qty: 10, unit: "sheets", unitPrice: 30, amount: 300 },
    { section: "Labor", item: "Wall framing", qty: 100, unit: "ft", unitPrice: 5, amount: 500 },
    { section: "Allowances", item: "permit", qty: 1, unit: "lump sum", unitPrice: 200, amount: 200 },
  ],
  sections: [{ name: "Sheathing", subtotal: 300, unpriced: 0 }, { name: "Labor", subtotal: 500, unpriced: 0 }, { name: "Allowances", subtotal: 200, unpriced: 0 }],
  materials: 300, tax: 21, contingency: 0, total: 1021, bid: 1225.2, unpriced: [], ...over,
});

test("rows add to the price exactly, markup spread pro rata", () => {
  const q = proposal(mk());
  assert.equal(q.ok, true);
  assert.equal(q.price, 1225.2);
  assert.equal(q.rows.reduce((t, r) => t + r.amount, 0).toFixed(2), "1225.20");
  // sheathing carries its tax: 321 * 1225.2/1021 = 385.20
  assert.equal(q.rows.find((r) => r.name === "Sheathing").amount, 385.2);
  assert.equal(q.rows.find((r) => r.name === "Labor").amount, 600);
});

test("without markup the price is the cost total", () => {
  const q = proposal(mk({ bid: 0 }));
  assert.equal(q.price, 1021);
});

test("refuses unpriced lines unless partial, then warns", () => {
  const b = mk({ unpriced: ["Trusses (8 each)"] });
  assert.equal(proposal(b).ok, false);
  const t = proposalText(proposal(b, { partial: true })).join("\n");
  assert.match(t, /WARNING: partial proposal/);
});

test("text shows scope, allowances, typed exclusions and no cost words", () => {
  const t = proposalText(proposal(mk(), { client: "A. Owner", exclusions: ["landscaping"], terms: ["Net 15"] })).join("\n");
  assert.match(t, /Scope of work: Sheathing, Labor\./);
  assert.match(t, /permit: 200\.00/);
  assert.match(t, /Not included: landscaping/);
  assert.doesNotMatch(t, /profit|overhead|contingency/i);
});
