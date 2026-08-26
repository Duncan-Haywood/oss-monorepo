// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green for a whole class of defect this page is exposed to: a
// featureList claim that the DOM never renders, a comparison table whose
// header count does not match the row template, or a null figure formatted
// with .toFixed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(
    unclosed,
    null,
    `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`,
  );
});

test("the page renders a first result without counting a bounce as usage", () => {
  assert.match(scriptSource, /\bpaint\(\);/);
  assert.doesNotMatch(
    scriptSource,
    /count\([^)]+\);\s*paint\(\);?\s*$/,
    "the initial paint() must not sit behind a count() — that was the academy-tools bounce-as-usage bug",
  );
});

test("organic vs affiliate table headers match the two rendered rows", () => {
  const table = markup.match(/Organic vs affiliate[\s\S]*?<table>[\s\S]*?<\/table>/);
  assert.ok(table, "organic vs affiliate table missing from markup");
  const headers = [...table[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)];
  assert.equal(headers.length, 4, `expected 4 headers, found ${headers.length}`);
  const rowCells = [...scriptSource.matchAll(/<tr>[\s\S]*?<\/tr>/g)]
    .filter((row) => row[0].includes("Organic listing") || row[0].includes("Affiliate-sourced"));
  assert.equal(rowCells.length, 2, "expected one organic row and one affiliate row");
  for (const row of rowCells) {
    const cells = row[0].match(/<t[hd][\s>]/g) || [];
    assert.equal(cells.length, 4, `row has ${cells.length} cells, table has 4 headers`);
  }
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Organic vs affiliate profit", /paths\.organic\.expectedProfit/],
    ["expected profit after returns", /result\.expectedProfit/],
    ["TikTok referral fee", /result\.referralFee/],
    ["creator facilitation fee", /result\.facilitationFee/],
    ["affiliate commission kept on returns", /affiliateRefundedOnReturn/],
    ["break-even price", /breakEvenPrice/],
    ["target-margin price", /targetMarginPrice/],
    ["current vs October 2026 fee schedule", /compareFeeSchedules/],
    ["monthly P&L", /result\.monthlyProfit/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"; update this test or restore the claim`,
    );
    assert.match(
      scriptSource,
      rendered,
      `featureList advertises "${claim}" but the page script never uses ${rendered}`,
    );
  }
});

test("null figures are rendered defensively", () => {
  assert.match(
    scriptSource,
    /result\.expectedMargin === null/,
    "expectedMargin is null when every order returns; do not call .toFixed on null",
  );
  assert.match(
    scriptSource,
    /bePrice === null/,
    "break-even can be unsatisfiable; render a placeholder instead of money(null) alone",
  );
  assert.match(
    scriptSource,
    /targetPrice === null/,
    "target-margin price can be unsatisfiable; render a placeholder",
  );
});

test("the landing copy names the affiliate-return problem in the first screen", () => {
  assert.match(markup, /The 6% is not what you keep/);
  assert.match(markup, /affiliate-commission-on-returns\.html/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
});

test("scenario sharing is local and restores entered assumptions", () => {
  assert.match(markup, /id="copyScenario"/);
  assert.match(scriptSource, /URLSearchParams/);
  assert.match(scriptSource, /restoreScenario/);
  assert.match(scriptSource, /navigator\.clipboard\.writeText/);
  assert.match(scriptSource, /scenario_shared/);
});
