import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditCharges, auditTotals } from "./audit.mjs";
import { parseRateCard, priceEnteredRows } from "./import.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the audit it claims to run", () => {
  assert.match(scriptSource, /auditCharges/);
  assert.match(scriptSource, /auditTotals/);
  assert.match(scriptSource, /csvForReview/);
  assert.match(scriptSource, /disputeDraft/);
  assert.match(scriptSource, /countUsage\("audit_completed"\)/);
  assert.match(scriptSource, /countUsage\("review_exported"\)/);
  assert.match(scriptSource, /countUsage\("draft_copied"\)/);
  assert.match(scriptSource, /function fallbackCopy/);
  assert.match(scriptSource, /execCommand\("copy"\)/);
  assert.match(scriptSource, /copyText\(/);
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Duplicate and over-expected flags", /auditCharges/],
    ["evidence-aware priority", /evidence/],
    ["private CSV review export", /csvForReview/],
    ["factual dispute draft", /disputeDraft/],
    ["CSV invoice import with column mapping and a contract rate card", /buildImportedRows/],
  ];
  for (const [claim, pattern] of claims) {
    assert.match(featureList[1], new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(scriptSource, pattern, `${claim} is listed but never used`);
  }
});

test("index links the detention extra and the sitemap lists both pages", () => {
  assert.match(html, /should-i-dispute-this-detention-charge\.html/);
  assert.match(html, /should-i-bill-this-accessorial-to-the-customer\.html/);
  assert.match(html, /does-this-fuel-surcharge-match-the-contract\.html/);
  assert.match(sitemap, /should-i-dispute-this-detention-charge\.html/);
  assert.match(sitemap, /should-i-bill-this-accessorial-to-the-customer\.html/);
  assert.match(sitemap, /does-this-fuel-surcharge-match-the-contract\.html/);
  assert.match(sitemap, /\.\//);
});

test("disclaimer, no-SLA, and optional sponsors are visible", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});

test("default demo totals match the FAQ copy", () => {
  // The fourth line carries no expected amount. It is priced here the way the
  // page prices it — from the shipped rate card and the quantity — so the copy
  // and the demo cannot drift apart. That the rows below still match the ones
  // the page actually seeds is checked in import-page.test.mjs.
  const { rates } = parseRateCard(html.match(/<textarea id="rateCard"[^>]*>([\s\S]*?)<\/textarea>/)[1]);
  const results = auditCharges(
    priceEnteredRows(
      [
        { invoice: "INV-1", reference: "PO-8", code: "LIFT", billed: "125", expected: "75", evidence: "missing" },
        { invoice: "INV-1", reference: "PO-8", code: "LIFT", billed: "125", expected: "75", evidence: "missing" },
        { invoice: "INV-2", reference: "PO-9", code: "", billed: "20", expected: "20", evidence: "supports" },
        { invoice: "INV-2", reference: "PO-9", code: "DET", billed: "300", units: "5", evidence: "missing" },
      ],
      rates,
    ),
  );
  const totals = auditTotals(results);
  assert.match(html, /\$205\.00 above expected/);
  assert.match(html, /4 flagged of 4 lines/);
  assert.match(html, /3 actionable/);
  assert.equal(totals.recoverable, 205);
  assert.equal(totals.flagged, 4);
  assert.equal(totals.actionable, 3);
  // Nothing is excluded from the headline: the card priced every line.
  assert.equal(totals.unpriced, 0);
});
