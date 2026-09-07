import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareScenarios } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const vsAwsSeo = readFileSync(new URL("./vs-aws-pricing-calculator.html", import.meta.url), "utf8");
const vsGoogle = readFileSync(new URL("./vs-google-cloud-pricing-calculator.html", import.meta.url), "utf8");
const vsAzure = readFileSync(new URL("./vs-azure-pricing-calculator.html", import.meta.url), "utf8");

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

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareScenarios/);
  assert.match(scriptSource, /reviewRecord/);
  assert.match(scriptSource, /decisionSummary/);
  assert.match(scriptSource, /breakEvenEgressGb/);
  assert.match(scriptSource, /countUsage\("calculation"\)/);
  assert.match(scriptSource, /countUsage\("summary_copied"\)/);
  assert.match(scriptSource, /countUsage\("review-export"\)/);
  assert.match(scriptSource, /function fallbackCopy/);
  assert.match(scriptSource, /execCommand\("copy"\)/);
  assert.match(scriptSource, /copyText\(/);
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Two-provider monthly comparison", /compareScenarios/],
    ["annualized savings", /annualSavings/],
    ["break-even outbound transfer", /breakEvenEgressGb/],
    ["copyable decision summary", /decisionSummary/],
    ["private JSON review export", /reviewRecord/],
  ];
  for (const [claim, pattern] of claims) {
    assert.match(featureList[1], new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(scriptSource, pattern, `${claim} is listed but never used`);
  }
});

test("index links the CDN extra and the sitemap lists both pages", () => {
  assert.match(html, /does-a-cdn-cut-s3-egress\.html/);
  assert.match(html, /does-a-replica-beat-cross-region-pull\.html/);
  assert.match(html, /does-infrequent-access-still-beat-standard\.html/);
  assert.match(html, /vs-google-cloud-pricing-calculator\.html/);
  assert.match(sitemap, /does-a-cdn-cut-s3-egress\.html/);
  assert.match(sitemap, /does-a-replica-beat-cross-region-pull\.html/);
  assert.match(sitemap, /does-infrequent-access-still-beat-standard\.html/);
  assert.match(sitemap, /vs-google-cloud-pricing-calculator\.html/);
  assert.match(sitemap, /\.\//);
});

test("index links the AWS incumbent-comparison page and the sitemap lists it too", () => {
  assert.match(html, /vs-aws-pricing-calculator\.html/);
  assert.match(sitemap, /vs-aws-pricing-calculator\.html/);
});

test("index links the Azure incumbent-comparison page and the sitemap lists it too", () => {
  assert.match(html, /vs-azure-pricing-calculator\.html/);
  assert.match(sitemap, /vs-azure-pricing-calculator\.html/);
});

test("the AWS incumbent-comparison page links back, names the incumbent honestly, and gives no unverifiable AWS numbers", () => {
  assert.match(vsAwsSeo, /<a href="\.\/">/);
  // Names AWS's own tool and links to AWS's own domains so a reader can check
  // the source directly -- this page must never claim a number for AWS's
  // calculator that only AWS's own live price list could confirm.
  assert.match(vsAwsSeo, /calculator\.aws/);
  assert.match(vsAwsSeo, /aws\.amazon\.com\/aws-cost-management\/aws-pricing-calculator\/faqs/);
  assert.doesNotMatch(vsAwsSeo, /AWS('s)? (charges|costs?|prices?) \$/i);
  assert.doesNotMatch(vsAwsSeo, /\$0\.\d+\s*\/\s*GB/i);
  assert.match(vsAwsSeo, /not affiliated with, endorsed by, or sponsored by Amazon/i);
  assert.match(vsAwsSeo, /trademarks of Amazon\.com/i);
  assert.match(vsAwsSeo, /No warranty/);
  assert.match(vsAwsSeo, /Best-effort hosting, no SLA/);
  assert.match(vsAwsSeo, /github\.com\/sponsors\/Duncan-Haywood/);
});

// The comparison page's whole value is that a reader can check it. Every claim
// it makes about Google's tool is a quotation from a Google page it links to,
// so these tests pin the two things that would quietly turn it into marketing:
// a number invented on Google's behalf, and a lost link to the primary source.
test("the incumbent-comparison page links back, cites Google's own pages, and invents no Google numbers", () => {
  assert.match(vsGoogle, /<a href="\.\/">/);
  assert.match(vsGoogle, /cloud\.google\.com\/products\/calculator/);
  assert.match(vsGoogle, /cloud\.google\.com\/storage\/pricing/);
  // Verbatim from cloud.google.com/products/calculator, read 2026-09-01. The
  // quotation is wrapped across source lines, so compare on collapsed
  // whitespace rather than on the raw markup.
  const flowed = vsGoogle.replace(/\s+/g, " ");
  assert.ok(
    flowed.includes(
      "This tool creates cost estimates based on assumptions that you provide. These estimates may not accurately reflect the final costs on your monthly Google Cloud bill.",
    ),
    "Google's own estimate disclaimer is no longer quoted verbatim",
  );
  // No price, rate, or fee may ever be asserted for Google here: only Google's
  // own live schedule can confirm one, and this site publishes nobody's rates.
  assert.doesNotMatch(vsGoogle, /Google('s)? (charges|rate is|price is|fee is|costs?) \$/i);
  assert.doesNotMatch(vsGoogle, /\$\d/);
  assert.match(vsGoogle, /not affiliated with, endorsed by, or sponsored by Google LLC/i);
  assert.match(vsGoogle, /trademarks of Google LLC/i);
});

test("the incumbent-comparison page carries the disclaimer, no-SLA clause, and optional sponsor link", () => {
  assert.match(vsGoogle, /No warranty/);
  assert.match(vsGoogle, /Best-effort hosting, no SLA/);
  assert.match(vsGoogle, /github\.com\/sponsors\/Duncan-Haywood/);
});

// Same discipline as the AWS and Google pages: every claim about Microsoft's
// tool is a quotation from a Microsoft page this page links to, so these
// tests pin the two things that would quietly turn it into marketing -- a
// number invented on Microsoft's behalf, and a lost link to the primary
// source.
test("the Azure incumbent-comparison page links back, cites Microsoft's own pages, and invents no Azure numbers", () => {
  assert.match(vsAzure, /<a href="\.\/">/);
  assert.match(vsAzure, /azure\.microsoft\.com\/pricing\/calculator/);
  assert.match(vsAzure, /learn\.microsoft\.com\/en-us\/azure\/cost-management-billing\/costs\/pricing-calculator/);
  // Verbatim from learn.microsoft.com's Azure pricing-calculator article, read
  // 2026-09-01. Compare on collapsed whitespace since the quotation wraps
  // across source lines.
  const flowed = vsAzure.replace(/\s+/g, " ");
  assert.ok(
    flowed.includes(
      "The Azure pricing calculator helps you turn anticipated usage into an estimated cost, which makes it easier to plan and budget for your Azure usage.",
    ),
    "Microsoft's own calculator description is no longer quoted verbatim",
  );
  assert.ok(
    flowed.includes(
      "Prices shown in this article are examples to help you understand how the calculator works. They aren't actual prices.",
    ),
    "Microsoft's own examples-not-actual-prices disclaimer is no longer quoted verbatim",
  );
  // No price, rate, or fee may ever be asserted for Azure here: only
  // Microsoft's own live schedule (or signed-in negotiated rate) can confirm
  // one, and this site publishes nobody's rates.
  assert.doesNotMatch(vsAzure, /Azure('s)? (charges|rate is|price is|fee is|costs?) \$/i);
  assert.doesNotMatch(vsAzure, /Microsoft('s)? (charges|rate is|price is|fee is|costs?) \$/i);
  assert.doesNotMatch(vsAzure, /\$\d/);
  assert.match(vsAzure, /not affiliated with, endorsed by, or sponsored by Microsoft Corporation/i);
  assert.match(vsAzure, /trademarks of Microsoft Corporation/i);
});

test("the Azure incumbent-comparison page carries the disclaimer, no-SLA clause, and optional sponsor link", () => {
  assert.match(vsAzure, /No warranty/);
  assert.match(vsAzure, /Best-effort hosting, no SLA/);
  assert.match(vsAzure, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("the Azure comparison page's FAQ schema is visible copy, and it routes readers to the sibling pages", () => {
  const block = vsAzure.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, "no FAQPage JSON-LD found on the Azure comparison page");
  const faq = JSON.parse(block[1]);
  assert.equal(faq["@type"], "FAQPage");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vsAzure.replace(/<script[\s\S]*?<\/script>/g, "");
  for (const entry of faq.mainEntity) {
    assert.match(visible, new RegExp(`<h3>${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h3>`));
    const firstSentence = entry.acceptedAnswer.text.split(". ")[0];
    assert.ok(visible.includes(firstSentence), `answer to "${entry.name}" is in the schema but not on the page`);
  }
  for (const sibling of [
    "does-a-cdn-cut-s3-egress.html",
    "does-a-replica-beat-cross-region-pull.html",
    "does-infrequent-access-still-beat-standard.html",
  ]) {
    assert.ok(vsAzure.includes(sibling), `${sibling} is not reachable from the Azure comparison page`);
  }
});

test("the comparison page's FAQ schema is visible copy, and it routes readers to the sibling pages", () => {
  const block = vsGoogle.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, "no FAQPage JSON-LD found on the comparison page");
  const faq = JSON.parse(block[1]);
  assert.equal(faq["@type"], "FAQPage");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vsGoogle.replace(/<script[\s\S]*?<\/script>/g, "");
  for (const entry of faq.mainEntity) {
    assert.match(visible, new RegExp(`<h3>${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h3>`));
    // A sentence long enough to be distinctive, so the schema cannot drift
    // away from the copy a visitor actually reads.
    const firstSentence = entry.acceptedAnswer.text.split(". ")[0];
    assert.ok(visible.includes(firstSentence), `answer to "${entry.name}" is in the schema but not on the page`);
  }
  for (const sibling of [
    "does-a-cdn-cut-s3-egress.html",
    "does-a-replica-beat-cross-region-pull.html",
    "does-infrequent-access-still-beat-standard.html",
  ]) {
    assert.ok(vsGoogle.includes(sibling), `${sibling} is not reachable from the comparison page`);
  }
});

test("disclaimer, no-SLA, and optional sponsors are visible", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});

test("default demo totals match the FAQ copy", () => {
  const result = compareScenarios({
    first: { storageGb: 500, requestsMillion: 2, egressGb: 100, storageRate: 0.023, requestRate: 0.4, egressRate: 0.09 },
    second: { storageGb: 500, requestsMillion: 2, egressGb: 100, storageRate: 0.006, requestRate: 0.36, egressRate: 0 },
  });
  assert.match(html, /\$21\.30/);
  assert.match(html, /\$3\.72/);
  assert.match(html, /\$17\.58/);
  assert.equal(result.first.total, 21.3);
  assert.equal(result.second.total, 3.72);
});

test("break-even FAQ example matches the arithmetic", () => {
  const below = compareScenarios({
    first: { storageGb: 500, requestsMillion: 2, egressGb: 60, storageRate: 0.006, requestRate: 0.36, egressRate: 0.09 },
    second: { storageGb: 500, requestsMillion: 2, egressGb: 60, storageRate: 0.023, requestRate: 0.4, egressRate: 0 },
  });
  const above = compareScenarios({
    first: { storageGb: 500, requestsMillion: 2, egressGb: 150, storageRate: 0.006, requestRate: 0.36, egressRate: 0.09 },
    second: { storageGb: 500, requestsMillion: 2, egressGb: 150, storageRate: 0.023, requestRate: 0.4, egressRate: 0 },
  });
  assert.equal(below.first.total, 9.12);
  assert.equal(below.second.total, 12.3);
  assert.equal(below.cheaper, "first");
  assert.equal(above.first.total, 17.22);
  assert.equal(above.second.total, 12.3);
  assert.equal(above.cheaper, "second");
  assert.equal(Math.round(below.breakEvenEgressGb * 100) / 100, 95.33);
  assert.match(html, /\$9\.12/);
  assert.match(html, /\$12\.30/);
  assert.match(html, /\$17\.22/);
  assert.match(html, /95\.33 GB/);
});

test("an invalid input clears the stale per-option totals, not just the verdict line", () => {
  // Before this fix, calculate()'s catch block overwrote #verdict,
  // #annualImpact, and #breakEven, but left #aTotal, #bTotal, and
  // #difference showing the last valid comparison. A visitor who missed
  // the one-line message in #verdict could read those stale totals as the
  // answer for the invalid inputs now in the form.
  // Scoped to calculate() rather than to the first `catch` in the file: other
  // helpers have their own (tiersFor re-labels a rate-sheet parse error), and
  // matching the first one would silently start asserting about the wrong
  // function instead of failing.
  const calculateStart = scriptSource.indexOf("function calculate(");
  assert.ok(calculateStart !== -1, "calculate() was not found");
  const rest = scriptSource.slice(calculateStart);
  const nextFunction = rest.slice(1).search(/\n  (?:async )?function /);
  const calculateSource = nextFunction === -1 ? rest : rest.slice(0, nextFunction + 1);

  const catchMatch = calculateSource.match(/\} catch \(error\) \{([\s\S]*?)\n\s*\}\n\s*\}/);
  assert.ok(catchMatch, "calculate()'s catch block was not found");
  const body = catchMatch[1];
  assert.match(body, /\$\("verdict"\)\.textContent = error\.message/, "the error message is never shown");
  for (const id of ["aTotal", "bTotal", "difference"]) {
    assert.match(
      body,
      new RegExp(`\\$\\("${id}"\\)\\.textContent = ""`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
});

test("free-egress inputs exist for both options and are wired into every calculation path", () => {
  assert.match(html, /id="aFree"/);
  assert.match(html, /id="bFree"/);
  assert.match(scriptSource, /freeEgressGb:\s*\+\$\("aFree"\)\.value/);
  assert.match(scriptSource, /freeEgressGb:\s*\+\$\("bFree"\)\.value/);
  // Every place the page builds a first/second scenario object must read the
  // free-tier field, not just the on-screen recalculation -- otherwise the
  // copied summary or the exported review would silently drop it.
  const scenarioBuilders = scriptSource.match(/(?:first|second):\s*\{[^}]*\}/g) || [];
  assert.ok(scenarioBuilders.length >= 6, "expected first/second scenario objects in calculate, copySummary, and export");
  for (const builder of scenarioBuilders) {
    assert.match(builder, /freeEgressGb/, `scenario object missing freeEgressGb: ${builder}`);
  }
});

test("graduated rate sheets exist for both options and are wired into every calculation path", () => {
  assert.match(html, /id="aTiers"/);
  assert.match(html, /id="bTiers"/);
  // Both textareas must be labelled and reachable, not just present: a bare
  // textarea in a <details> is invisible to a screen reader browsing by form
  // control, and the placeholder is not a label.
  for (const letter of ["a", "b"]) {
    assert.match(html, new RegExp(`<label for="${letter}Tiers">`), `#${letter}Tiers has no associated label`);
  }
  // Editing a sheet must recalculate, exactly as editing a rate does.
  assert.match(scriptSource, /"aTiers"/);
  assert.match(scriptSource, /"bTiers"/);
  const idsLine = scriptSource.match(/const ids = \[[^\]]*\]/);
  assert.ok(idsLine, "the recalculating input list was not found");
  assert.match(idsLine[0], /aTiers/, "editing Option A's rate sheet would not recalculate");
  assert.match(idsLine[0], /bTiers/, "editing Option B's rate sheet would not recalculate");
  // And the sheet must reach the copied summary and the exported record too,
  // not only the on-screen totals.
  const scenarioBuilders = scriptSource.match(/(?:first|second):\s*\{[^}]*\}/g) || [];
  for (const builder of scenarioBuilders) {
    assert.match(builder, /egressTiers/, `scenario object missing egressTiers: ${builder}`);
  }
});

test("the two new FAQ questions are present in both the visible copy and the FAQPage schema", () => {
  const questions = [
    "What outbound volume is the break-even point?",
    "Does this include migration cost or contract minimums?",
  ];
  for (const q of questions) {
    assert.match(html, new RegExp(`<h3>${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h3>`));
    assert.match(scriptSource, new RegExp(`"name":"${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});

// Closest sibling: same monthly-cost-normalization shape, but a fulfillment
// quote rather than a cloud storage bill. Without a crawlable link here, a
// crawler entering on the cloud egress calculator never reaches the 3PL
// quote normalizer in one hop.
test("index links one hop to the 3pl-quote-normalizer sibling", () => {
  assert.match(
    html,
    /href="\.\.\/3pl-quote-normalizer\/"/,
    "index must link ../3pl-quote-normalizer/ so crawlers reach the 3PL quote normalizer in one hop",
  );
});
