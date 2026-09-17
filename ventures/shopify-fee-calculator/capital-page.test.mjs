// Structural tests for the Shopify Capital comparison page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareShopifyCapital } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-take-shopify-capital.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.kept === bestKept[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareShopifyCapital/);
  assert.match(scriptSource, /shopify_capital_compared/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-path <tr> template");
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `table declares ${headers.length} columns (${headers.join(" | ")}) but the row emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Shopify Capital fee", /result\.fee/],
    ["days of holdback", /result\.daysToRepay/],
    ["simple annualized cost", /result\.simpleAnnualizedPct/],
    ["extra monthly profit that covers the fee", /result\.breakEvenExtraMonthly/],
    ["wait vs bank leftover", /row\.kept|row\.vsWait/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never renders it`);
  }
});

test("null self-fund days are rendered as a placeholder, not .toFixed on null", () => {
  assert.match(scriptSource, /value == null \|\| !Number\.isFinite\(value\)/);
});

test("default inputs on the page match the worked example", () => {
  const comparison = compareShopifyCapital({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 39,
    monthlyOrders: 100,
    advanceAmount: 10000,
    repaymentAmount: 11400,
    holdbackPct: 10,
    monthlySales: 30000,
    extraMonthlyProfit: 0,
    bankAprPct: 12,
    paymentMethod: "shopify_payments",
  });
  assert.equal(comparison.winner, "wait");
  assert.ok(Math.abs(comparison.fee - 1400) < 1e-9);
  assert.ok(Math.abs(comparison.daysToRepay - 114) < 1e-9);
  assert.match(html, /id="advanceAmount"[^>]*value="10000"/);
  assert.match(html, /id="repaymentAmount"[^>]*value="11400"/);
  assert.match(html, /id="holdbackPct"[^>]*value="10"/);
  assert.match(html, /\$1,400\.00/);
  assert.match(html, /44\.8%/);
  assert.match(html, /\$368\.42/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
});

test("index and sitemap point at the Capital comparison", () => {
  assert.match(index, /should-i-take-shopify-capital\.html/);
  assert.match(sitemap, /should-i-take-shopify-capital\.html/);
});

test("the result panel is announced to screen readers when it updates", () => {
  // The result section re-renders its hero figure and breakdown in place
  // on every keystroke, with no page reload, but had no aria-live -- so a
  // screen-reader user changing an input got no announcement that the
  // result had changed. Same gap already fixed fleet-wide (see #3125-#3127
  // and prior sessions' aria-live commits).
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    "the result section is not a live region, so updates are never announced",
  );
});
