// Structural tests for the Walmart aged WFS inventory page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareAgedWfs, agedWfsNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-pull-aged-wfs-inventory.html", import.meta.url), "utf8");
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
  salePrice: 24.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  sellerShippingCost: 4.5,
  packagingCost: 0.5,
  leftoverUnits: 40,
  monthlySellThroughPct: 12,
  horizonMonths: 4,
  agedStorageRate: 2.1,
  removalFee: 1.25,
  disposalFee: 0.35,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareAgedWfs/);
  assert.match(scriptSource, /agedWfsNote/);
  assert.match(scriptSource, /aged_wfs_compared/);
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
  for (const claim of [
    "WFS leftover cash after aged storage",
    "seller-fulfilled leftover after a WFS removal",
    "disposal leftover",
    "expected leftover after monthly sell-through",
    "sell-through floor that still matches a removal",
  ]) {
    assert.ok(featureList[1].includes(claim), `featureList is missing "${claim}"`);
  }
  assert.match(scriptSource, /row\.soldUnits/);
  assert.match(scriptSource, /row\.leftoverUnits/);
  assert.match(scriptSource, /row\.carryingFees/);
  assert.match(scriptSource, /row\.cash/);
  assert.match(scriptSource, /extraRemoveVsKeep/);
});

test("FAQ default leftover matches the live comparison", () => {
  const result = compareAgedWfs(defaults);
  assert.equal(result.winner, "remove");
  assert.match(html, /\$338\.35 more/);
  assert.match(html, /\$599\.66 vs \$261\.31/);
  assert.match(html, /41\.3%/);
  assert.match(html, /\$55\.50 more/);
  assert.match(agedWfsNote(result), /keeps \$338\.35 more/);
});

test("the sitemap and main calculator point at this page", () => {
  assert.match(sitemap, /should-i-pull-aged-wfs-inventory\.html/);
  assert.match(index, /should-i-pull-aged-wfs-inventory\.html/);
});

test("disclaimer and no-SLA clause are rendered markup", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});
