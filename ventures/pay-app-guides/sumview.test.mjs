import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSummary, isTabular } from "./sumview.mjs";
import { compute, summaryText, SAMPLE } from "./calc.mjs";

test("the pay app summary splits into one label and amount per line", () => {
  const rows = parseSummary(summaryText(compute(SAMPLE.lines, SAMPLE.settings)));
  assert.ok(isTabular(rows));
  assert.deepEqual(rows[0], { text: "PAY APPLICATION SUMMARY (worksheet, check before sending)", heading: true });
  const pairs = rows.filter((r) => r.pair);
  assert.equal(pairs.length, 12, "every numbered line, including the one whose label fills the padding");
  assert.deepEqual(pairs.find((r) => r.label.startsWith("8.")), { pair: true, indent: 0, label: "8. CURRENT PAYMENT DUE (6 - 7)", value: "$40,365.00" });
  assert.equal(pairs.at(-1).label, "9. Balance to finish, incl. retainage (3 - 6)");
});

test("space-padded columns keep their indent and join extra columns", () => {
  const rows = parseSummary("Retainage receivable\n\n  on completed jobs                         $102,250.00\n  Harbor Construction (2)   $120,000.00  overdue $22,000.00\nOldest overdue      88 days\n");
  assert.deepEqual(rows[1], { blank: true });
  assert.deepEqual(rows[2], { pair: true, indent: 2, label: "on completed jobs", value: "$102,250.00" });
  assert.equal(rows[3].value, "$120,000.00 · overdue $22,000.00");
  assert.ok(isTabular(rows));
});

test("a letter is not treated as a table", () => {
  const rows = parseSummary("Subject: Past due: Maple St, pay application #4, $41,200.00\n\nHello,\n\nPay application #4 for $41,200.00 was due on 2026-10-01.\nThanks,\n");
  assert.equal(isTabular(rows), false);
});

test("bulleted findings are list items and short lines are headings", () => {
  const rows = parseSummary("Front-loading check\nContract    $580,000.00\nCost    $499,000.00\nMarkup    16.2%\n- Item 1 (Mobilization): marked up 171.4%.\n- Item 2: billed early.\n\nEstimates from your own costs; the contract decides what is accepted.\n");
  assert.deepEqual(rows[0], { text: "Front-loading check", heading: true });
  assert.deepEqual(rows[4], { item: "Item 1 (Mobilization): marked up 171.4%." });
  assert.deepEqual(rows.at(-1), { text: "Estimates from your own costs; the contract decides what is accepted." });
  assert.ok(isTabular(rows), "list items do not count against the table");
});
