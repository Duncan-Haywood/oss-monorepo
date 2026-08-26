// Structural tests for the in-store pickup vs label page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comparePickup } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-offer-pickup-on-shopify.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{Math\.abs\(row\.expectedProfit - best\)[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /comparePickup/);
  assert.match(scriptSource, /pickup_compared/);
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
    ["free pickup vs carrier label", /result\.free|result\.ship/],
    ["paid pickup after no-show", /result\.paid/],
    ["staff time and bag cost", /result\.pickupFulfillment/],
    ["label cost that ties free pickup", /result\.breakEvenShippingCost/],
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
  const comparison = comparePickup({
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
  assert.equal(comparison.winner, "ship");
  assert.ok(Math.abs(comparison.ship.expectedProfit - 31.744) < 1e-6);
  assert.ok(Math.abs(comparison.free.completedProfit - 29.118) < 1e-6);
  assert.ok(Math.abs(comparison.free.expectedProfit - 25.28784) < 1e-6);
  assert.ok(Math.abs(comparison.paid.expectedProfit - 27.85128) < 1e-6);
  assert.match(html, /id="pickupFee"[^>]*value="3"/);
  assert.match(html, /id="pickupMinutes"[^>]*value="8"/);
  assert.match(html, /id="pickupNoShowPct"[^>]*value="12"/);
  assert.match(html, /\$31\.74/);
  assert.match(html, /\$25\.29/);
  assert.match(html, /\$29\.12/);
  assert.match(html, /\$27\.85/);
  assert.match(html, /\$6\.46/);
  assert.match(html, /\$11\.46/);
  assert.match(html, /\$28\.42/);
  assert.match(html, /\$22\.92/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the pickup comparison", () => {
  assert.match(index, /should-i-offer-pickup-on-shopify\.html/);
  assert.match(sitemap, /should-i-offer-pickup-on-shopify\.html/);
});
