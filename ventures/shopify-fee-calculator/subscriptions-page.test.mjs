// Structural tests for the subscription leftover page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareSubscriptions } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-offer-subscriptions-on-shopify.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{Math\.abs\(row\.lifetime - best\)[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareSubscriptions/);
  assert.match(scriptSource, /subscriptions_compared/);
});

test("the hero follows the lifetime winner, not only monthly versus one-time", () => {
  assert.match(scriptSource, /result\.winner === "prepaid"/);
  assert.match(scriptSource, /result\.extraOnPrepaidVsOneTime/);
  assert.match(scriptSource, /Prepaid keeps this much more than one-time/);
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
    ["one-time vs monthly subscribe vs prepaid pack", /result\.oneTime|result\.monthly|result\.prepaid/],
    ["paid cycles that flip monthly", /result\.breakEvenPaidCycles/],
    ["skip rate that flips monthly", /result\.breakEvenSkipPct/],
    ["billing-fee ceiling versus one-time", /result\.breakEvenAppFeePct/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never renders it`);
  }
});

test("default inputs on the page match the worked example", () => {
  const comparison = compareSubscriptions({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 39,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
  });
  assert.equal(comparison.winner, "monthly");
  assert.ok(Math.abs(comparison.oneTime.lifetime - 31.744) < 1e-6);
  assert.ok(Math.abs(comparison.monthly.cycleProfit - 26.5912) < 1e-6);
  assert.ok(Math.abs(comparison.monthly.lifetime - 106.3648) < 1e-6);
  assert.ok(Math.abs(comparison.prepaid.lifetime - 74.2344) < 1e-6);
  assert.match(html, /id="subscribeDiscountPct"[^>]*value="10"/);
  assert.match(html, /id="prepaidDiscountPct"[^>]*value="15"/);
  assert.match(html, /id="prepaidMonths"[^>]*value="3"/);
  assert.match(html, /id="subscriptionFeePct"[^>]*value="1"/);
  assert.match(html, /id="expectedCycles"[^>]*value="5"/);
  assert.match(html, /id="skipPct"[^>]*value="20"/);
  assert.match(html, /\$31\.74/);
  assert.match(html, /\$26\.59/);
  assert.match(html, /\$106\.36/);
  assert.match(html, /\$74\.62/);
  assert.match(html, /\$74\.23/);
  assert.match(html, /\$1492\.42/);
  assert.match(html, /\$21\.98/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the subscription comparison", () => {
  assert.match(index, /should-i-offer-subscriptions-on-shopify\.html/);
  assert.match(sitemap, /should-i-offer-subscriptions-on-shopify\.html/);
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
