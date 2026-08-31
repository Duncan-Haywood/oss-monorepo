// Structural tests for the expected-profit-after-returns page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareReturns, returnsSummary } from "./calc.mjs";

const html = readFileSync(new URL("./do-amazon-returns-wipe-the-profit.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.isCurrent[\s\S]*?<\/tr>/);

const defaults = {
  salePrice: 29.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  monthsInStorage: 1,
  storageRate: 0.87,
  fbmShippingCost: 4.75,
  packagingCost: 0.6,
  monthlySellerFee: 39.99,
  monthlyUnits: 80,
  fulfillmentFee: 4.15,
  fulfillmentMethod: "fba",
  sizeTier: "large_standard",
  returnRate: 15,
  returnHandlingFee: 2.5,
  unsellableReturnRate: 20,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareReturns/);
  assert.match(scriptSource, /returnsSummary/);
  assert.match(scriptSource, /return_rate_calculated/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-rate <tr> template");
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
    ["expected profit after returns", /row\.profit/],
    ["return drag", /row\.returnDrag/],
    ["return-rate sweep", /compareReturns|row\.returnRate/],
    ["break-even return rate", /breakEvenReturnRate|returnsSummary/],
    ["FBA vs FBM after returns", /FBM|cheaperPath|fbmProfit/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(html, rendered, `page no longer renders "${claim}"`);
  }
});

test("SEO copy uses the same 15% mix the calculator locks", () => {
  const comparison = compareReturns(defaults);
  const summary = returnsSummary({
    typedRate: comparison.returnRate,
    handling: comparison.returnHandlingFee,
    unsellable: comparison.unsellableReturnRate,
    typed: comparison.typed,
  });
  assert.match(summary, /\$7\.75/);
  assert.match(summary, /\$10\.99/);
  assert.match(summary, /\$3\.24/);
  assert.match(summary, /50\.9%/);
  assert.match(html, /\$7\.75/);
  assert.match(html, /\$10\.99/);
  assert.match(html, /\$3\.24/);
  assert.match(html, /50\.9%/);
  assert.match(html, /\$8\.40/);
});

test("index and sitemap point at the returns page", () => {
  assert.match(index, /do-amazon-returns-wipe-the-profit\.html/);
  assert.match(index, /id="returnsCompare"/);
  assert.match(index, /id="returnRate"/);
  assert.match(index, /return_rate_calculated/);
  assert.match(sitemap, /do-amazon-returns-wipe-the-profit\.html/);
});
