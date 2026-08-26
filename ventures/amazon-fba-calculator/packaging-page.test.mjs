// Structural tests for the size-tier packaging page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareSizeTierPackaging, sizeTierPackagingNote } from "./calc.mjs";

const html = readFileSync(new URL("./does-smaller-box-cut-amazon-fba-fees.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{winner[\s\S]*?<\/tr>/);

const defaults = {
  salePrice: 29.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  packagingCost: 0.6,
  monthsInStorage: 1,
  storageRate: 0.87,
  monthlySellerFee: 39.99,
  monthlyUnits: 80,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareSizeTierPackaging/);
  assert.match(scriptSource, /sizeTierPackagingNote/);
  assert.match(scriptSource, /size_tier_packaging_compared/);
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
    ["current carton leftover", /result\.current|row\.profit/],
    ["next-lower size-tier pack", /dropTier|drop_tier/],
    ["next cheaper weight band", /dropWeight|drop_weight/],
    ["extra prep on the smaller carton", /repackCostPerUnit/],
    ["monthly leftover at typed volume", /monthlyUnits|monthlyDelta|sizeTierPackagingNote/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `"${claim}" is advertised but never rendered`);
  }
});

test("worked example on the page matches the locked comparison", () => {
  const result = compareSizeTierPackaging(defaults);
  assert.equal(result.winner, "drop_tier");
  assert.ok(Math.abs(result.dropTier.profitDelta - 0.800208) < 1e-4);
  const note = sizeTierPackagingNote(result);
  assert.ok(html.includes("$0.80"), "missing $0.80 per-unit gap");
  assert.ok(html.includes("$64.02"), "missing $64.02 monthly gap");
  assert.ok(html.includes("$4.15"), "missing large-standard fee");
  assert.ok(html.includes("$3.38"), "missing small-standard fee");
  assert.match(note, /\$0\.80 more per unit/);
  assert.doesNotMatch(html, /should pack|must flatten|change the box|pack now/i);
});

test("sitemap and index point at the packaging page", () => {
  assert.match(sitemap, /does-smaller-box-cut-amazon-fba-fees\.html/);
  assert.match(index, /does-smaller-box-cut-amazon-fba-fees\.html/);
});
