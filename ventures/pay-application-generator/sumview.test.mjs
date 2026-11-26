import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSummary, isTabular } from "./sumview.mjs";
import { compute, sampleList, SAMPLE_SETTINGS, summaryText } from "./calc.mjs";

const text = summaryText(compute(sampleList(), SAMPLE_SETTINGS), SAMPLE_SETTINGS);

test("the summary splits into the nine numbered lines, numbers kept with their labels", () => {
  const rows = parseSummary(text);
  assert.ok(isTabular(rows));
  const pairs = rows.filter((r) => r.pair);
  assert.equal(pairs.length, 9);
  assert.deepEqual(pairs.map((r) => r.label.split(" ")[0]), ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9."]);
  assert.equal(pairs[0].label, "1. Original contract sum");
  assert.match(pairs[4].label, /^5\. Retainage \(work \$[\d,]+\.\d\d, stored \$[\d,]+\.\d\d\)$/, "the dollar figures inside the label stay in the label");
  assert.match(pairs[4].value, /^\$[\d,]+\.\d\d$/);
  assert.equal(pairs[8].label, "9. Balance to finish, including retainage (3 - 6)");
});

test("the title is a heading and the header fields are plain lines", () => {
  const rows = parseSummary(text);
  assert.deepEqual(rows[0], { text: "PAYMENT APPLICATION NO. 4", heading: true });
  assert.deepEqual(rows[1], { text: "Project: Example Office Renovation" });
});

test("the pay-app-guides summary style still parses (one space after the number, dot leaders)", () => {
  const rows = parseSummary("Summary\n8. CURRENT PAYMENT DUE (6 - 7) $40,365.00\n5. Total retainage held........ $7,985.00\n  on completed jobs        $102,250.00\n");
  assert.deepEqual(rows.slice(1).map((r) => [r.label, r.value]), [["8. CURRENT PAYMENT DUE (6 - 7)", "$40,365.00"], ["5. Total retainage held", "$7,985.00"], ["on completed jobs", "$102,250.00"]]);
});

test("the page loads the phone view and labels every amount cell for the phone cards", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /<script type="module" src="sumview\.mjs"><\/script>/);
  assert.match(html, /<table class="stack sov-out">/);
  for (const label of ["Scheduled", "Previous", "This period", "Stored", "Completed", "Percent complete", "Balance to finish", "Retainage"]) assert.ok(html.includes(`data-label="${label}"`), label);
  assert.doesNotMatch(readFileSync(new URL("./sumview.mjs", import.meta.url), "utf8"), /innerHTML/, "summary text is user-typed: textContent only");
});
