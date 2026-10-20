import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readRecords, reconcile } from "./reconcile.mjs";

const page = readFileSync(new URL("./vs-reconciling-in-a-spreadsheet.html", import.meta.url), "utf8");

test("compares against the spreadsheet, not a named competitor, in its own FAQ and title", () => {
  // Generic mental model (a spreadsheet), not a named competitor -- distinct
  // from this venture's own vs-synder.html, which names Synder and carries
  // its own "not affiliated" clause. This page cross-links to vs-synder.html
  // once ("Using both together"), which is fine; the FAQ schema itself must
  // not turn the comparison into one against Synder specifically.
  const faqMatch = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const faq = JSON.parse(faqMatch[1]);
  for (const question of faq.mainEntity) {
    assert.doesNotMatch(question.name, /Synder/i);
    assert.doesNotMatch(question.acceptedAnswer.text, /Synder|QuickBooks|Xero|Sage/i);
  }
  assert.doesNotMatch(page.match(/<h1>.*?<\/h1>/s)[0], /Synder/i);
});

test("carries the no-warranty and no-SLA clauses", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /Best-effort hosting, no SLA/);
});

test("links back to the tool and to vs-synder.html", () => {
  assert.match(page, /href="\.\/"/);
  assert.match(page, /href="vs-synder\.html"/);
});

test("the canonical tag names this file", () => {
  assert.match(page, /vs-reconciling-in-a-spreadsheet\.html/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test("the FAQPage JSON-LD answers are verbatim on the page (word for word)", () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test("the worked example matches this venture's own shipped fixture and reconcile.mjs exactly", () => {
  const payoutsCsv = "payout_date,net\n2026-03-02,1420.00\n2026-03-05,2310.50\n2026-03-09,890.00\n2026-03-16,1750.00\n";
  const depositsCsv = "deposit_date,amount\n2026-03-03,1420.00\n2026-03-06,1200.00\n2026-03-06,1110.50\n2026-03-10,864.35\n2026-03-30,455.00\n";
  const rows = reconcile(readRecords(payoutsCsv, "payouts"), readRecords(depositsCsv, "deposits"), 3);

  const splitMatch = rows.find(r => r.status === "matched" && r.deposits.length > 1);
  assert.ok(splitMatch, "the $2,310.50 payout must match the two-deposit split");
  assert.equal(splitMatch.payout.cents, 231050);

  const feeHint = rows.find(r => r.status === "unmatched payout" && r.hint?.feeLike);
  assert.ok(feeHint, "the $890.00 payout must produce a fee-like hint against the $864.35 deposit");
  assert.equal(feeHint.hint.difference, 2565);

  assert.match(page, /2,310\.50/);
  assert.match(page, /1,200\.00/);
  assert.match(page, /1,110\.50/);
  assert.match(page, /890\.00/);
  assert.match(page, /864\.35/);
  assert.match(page, /25\.65/);
  assert.match(page, /2\.88%/);
});

test("index.html links to the comparison page", () => {
  const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(index, /href="vs-reconciling-in-a-spreadsheet\.html"/);
});

test("the comparison page is listed in the sitemap", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /vs-reconciling-in-a-spreadsheet\.html/);
});
