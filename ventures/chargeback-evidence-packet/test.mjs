import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("landing page exposes the chargeback workflow and safety boundary", () => {
  assert.match(html, /Build a chargeback evidence packet/);
  assert.match(html, /not legal, financial, or payment-dispute advice/);
  assert.match(html, /Everything runs locally/);
  assert.match(html, /SoftwareApplication/);
});

test("each dispute reason has a deterministic evidence rule", () => {
  assert.match(html, /reason==='Merchandise not received'\?\['order','payment','fulfillment','tracking'\]/);
  assert.match(html, /reason==='Credit not processed'\?\['order','payment','contact','refund'\]/);
  assert.match(html, /Checkout terms acceptance/);
});

test("generated draft preserves factual-input and review language", () => {
  assert.match(html, /Factual timeline/);
  assert.match(html, /Review before submitting/);
  assert.match(html, /This is an observation, not a decision/);
  assert.match(html, /Order date: \$\{date\}/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /draft_copied/);
});

test("discoverability answers the two most important questions", () => {
  assert.match(html, /FAQPage/);
  assert.match(html, /What is a chargeback evidence packet/);
  assert.match(html, /Does this tool submit a chargeback response/);
});
