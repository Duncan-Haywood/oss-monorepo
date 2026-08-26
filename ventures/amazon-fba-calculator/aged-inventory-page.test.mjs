// Structural tests for the aged-inventory keep vs remove vs dispose page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a cash figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareAgedInventory } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-remove-aged-amazon-inventory.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.cash === best[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareAgedInventory/);
  assert.match(scriptSource, /aged_inventory_compared/);
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
    ["keep vs return removal vs dispose", /result\.keep|result\.remove|result\.dispose/],
    ["leftover units after the horizon", /result\.keep\.leftoverUnits/],
    ["carrying fees", /result\.keep\.carryingFees/],
    ["sell-through that still ties dispose", /result\.breakEvenSellThroughVsDispose/],
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
  const comparison = compareAgedInventory({
    salePrice: 29.99,
    referralRate: 15,
    fulfillmentFee: 4.15,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    adsPerUnit: 0,
    storageRate: 0.87,
    fulfillmentMethod: "fba",
  });
  assert.equal(comparison.winner, "dispose");
  assert.ok(Math.abs(comparison.keep.cash + 109.82315166666672) < 1e-6);
  assert.ok(Math.abs(comparison.remove.cash + 83.2) < 1e-6);
  assert.ok(Math.abs(comparison.dispose.cash + 25.6) < 1e-6);
  assert.ok(Math.abs(comparison.extraKeepVsDispose + 84.22315166666672) < 1e-4);
  assert.match(html, /id="agedUnits"[^>]*value="80"/);
  assert.match(html, /id="monthlySellThroughPct"[^>]*value="5"/);
  assert.match(html, /id="aisPerUnit"[^>]*value="1\.50"/);
  assert.match(html, /−\$109\.82|-\$109\.82/);
  assert.match(html, /−\$83\.20|-\$83\.20/);
  assert.match(html, /−\$25\.60|-\$25\.60/);
  assert.match(html, /\$84\.22/);
  assert.match(html, /6\.7%/);
  assert.match(html, /\$353\.33/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the aged-inventory comparison", () => {
  assert.match(index, /should-i-remove-aged-amazon-inventory\.html/);
  assert.match(sitemap, /should-i-remove-aged-amazon-inventory\.html/);
});
