// Structural tests for the Walmart returns leftover page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareReturns, returnsSummary } from "./calc.mjs";

const html = readFileSync(new URL("./do-walmart-returns-wipe-the-profit.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row[\s\S]*?<\/tr>/);

const defaults = {
  salePrice: 24.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 7,
  inboundPerUnit: 1.1,
  packagingCost: 0.5,
  sellerShippingCost: 4.5,
  monthlyUnits: 60,
  fulfillmentFee: 3.95,
  fulfillmentMethod: "wfs",
  returnRate: 18,
  returnHandlingFee: 2.75,
  unsellableReturnRate: 20,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareReturns/);
  assert.match(scriptSource, /returnsSummary/);
  assert.match(scriptSource, /returns_compared/);
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
  for (const claim of [
    "expected leftover after returns",
    "return drag",
    "return-rate sweep",
    "break-even return rate",
    "WFS vs seller fulfilled after returns",
  ]) {
    assert.ok(featureList[1].includes(claim), `featureList is missing "${claim}"`);
  }
  assert.match(scriptSource, /row\.returnRate/);
  assert.match(scriptSource, /row\.returnDrag/);
  assert.match(scriptSource, /row\.breakEvenBuyCost/);
});

test("FAQ default leftover matches the live comparison", () => {
  const result = compareReturns(defaults);
  assert.match(html, /\$8\.65/);
  assert.match(html, /\$5\.34/);
  assert.match(html, /\$3\.31/);
  assert.match(html, /47\.0%/);
  assert.match(html, /\$5\.93/);
  assert.match(returnsSummary({
    typedRate: result.returnRate,
    handling: result.returnHandlingFee,
    unsellable: result.unsellableReturnRate,
    typed: result.typed,
  }), /WFS expects \$5\.34 versus \$8\.65/);
  assert.match(returnsSummary({
    typedRate: result.returnRate,
    handling: result.returnHandlingFee,
    unsellable: result.unsellableReturnRate,
    typed: result.typed,
  }), /47\.0%/);
});

test("the sitemap and main calculator point at this page", () => {
  assert.match(sitemap, /do-walmart-returns-wipe-the-profit\.html/);
  assert.match(index, /do-walmart-returns-wipe-the-profit\.html/);
});

test("disclaimer and no-SLA clause are rendered markup", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});
