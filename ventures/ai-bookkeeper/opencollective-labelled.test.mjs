import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";
import { evaluate, toRow, MAPS } from "./eval/opencollective-labelled.mjs";

// Rows are made up; the real reading fetches Open Collective's public expense records at run time
// (eval/opencollective-labelled.mjs, README "Labelled books from five fiscal hosts").
const cold = (desc) => suggest({ desc, cents: -5000 }, { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) }).account;

test("expense-memo words people type are suggested", () => {
  assert.equal(cold("Web hosting"), "6060");
  assert.equal(cold("Domain renewal 2027"), "6060");
  assert.equal(cold("Virtual Card charge: infomaniak.com"), "6060");
  assert.equal(cold("Maintenance and Development - March 2026"), "6020");
  assert.equal(cold("Consulting Services"), "6020");
  assert.equal(cold("Legal Services"), "6050");
  assert.equal(cold("Printing"), "6070");
  assert.equal(cold("Office supplies"), "6070");
  assert.equal(cold("Encampment supplies"), "6100");
  assert.equal(cold("Groceries for the workshop"), "6130");
  assert.equal(cold("Rideshare to venue"), "6120");
  assert.equal(cold("Professional development course"), "6170");
});

test("words that fit two accounts stay unsuggested", () => {
  assert.equal(cold("Gas"), null);
  assert.equal(cold("Quarterly maintenance"), null);
  assert.equal(cold("Yii development"), null);
});

test("a vendor rule above still wins over a memo word", () => {
  assert.equal(cold("Mailchimp monthly subscription"), "6000");
});

test("online replay learns a host's own convention month by month", () => {
  const n = (date, description, cat) => toRow({ createdAt: `${date}T00:00:00Z`, description, payee: { name: "Someone" }, accountingCategory: cat ? { name: cat } : null });
  const rows = [
    n("2026-01-05", "Freedom fridge restock", "Materials & Supplies"),
    n("2026-01-20", "Freedom fridge restock", "Materials & Supplies"),
    n("2026-02-03", "Freedom fridge restock", "Materials & Supplies"),
    n("2026-02-04", "Grant to partner", "Award Grant"),
    n("2026-02-05", "Untagged", null),
  ];
  const o = evaluate(rows, MAPS.foundation, "memo");
  assert.equal(o.all.n, 3);
  assert.equal(o.unscored, 1);
  assert.equal(o.uncategorised, 1);
  // January's two lines see nothing learned (batches are months); February's sees both.
  assert.equal(o.all.blank, 2);
  assert.equal(o.all.right, 1);
  assert.equal(o.bySource.memory.n, 1);
  assert.equal(evaluate(rows, MAPS.foundation, "memo", { learn: false }).all.right, 0);
});
