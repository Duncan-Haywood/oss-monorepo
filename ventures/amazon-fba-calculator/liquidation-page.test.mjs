// Structural tests for the FBA Liquidations page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareLiquidation, liquidationNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-liquidate-aged-fba-inventory.html", import.meta.url), "utf8");
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
  fulfillmentFee: 4.15,
  adsPerUnit: 0,
  agedUnits: 80,
  monthlySellThroughPct: 5,
  horizonMonths: 3,
  aisPerUnit: 1.5,
  storageRate: 0.87,
  recoveryPct: 8,
  liquidationFee: 0.3,
  removalFee: 1.04,
  elsewhereNet: 4,
  disposalFee: 0.32,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareLiquidation/);
  assert.match(scriptSource, /liquidationNote/);
  assert.match(scriptSource, /liquidation_compared/);
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
    ["FBA Liquidations leftover after recovery percent and processing fee", /recoveryPct|liquidationFee/],
    ["dispose leftover", /disposalFee|id === "dispose"/],
    ["remove-and-sell-elsewhere leftover after the return-removal fee", /elsewhereNet|removalFee/],
    ["keep leftover after storage and aged-inventory surcharge", /aisPerUnit|monthlySellThroughPct/],
    ["elsewhere leftover that still matches liquidations", /breakEvenElsewhereVsLiquidate|\$3\.14/],
    ["monthly sell-through that still ties liquidations", /10\.9%|breakEvenSellThroughVsLiquidate/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource + html, rendered, `"${claim}" is advertised but never rendered`);
  }
});

test("worked example on the page matches the locked comparison", () => {
  const result = compareLiquidation(defaults);
  assert.equal(result.winner, "elsewhere");
  assert.ok(Math.abs(result.extraElsewhereVsLiquidate - 68.864) < 1e-4);
  const note = liquidationNote(result);
  assert.ok(html.includes("$68.86"), "missing $68.86 elsewhere gap");
  assert.ok(html.includes("$236.80"), "missing elsewhere pile");
  assert.ok(html.includes("$167.94"), "missing liquidations pile");
  assert.ok(html.includes("−$25.60") || html.includes("-$25.60"), "missing dispose pile");
  assert.ok(html.includes("−$109.82") || html.includes("-$109.82"), "missing keep pile");
  assert.ok(html.includes("$3.14"), "missing elsewhere floor");
  assert.ok(html.includes("10.9%"), "missing sell-through floor");
  assert.ok(html.includes("$530.94"), "missing 20% keep flip");
  assert.ok(html.includes("$193.54"), "missing no-channel liquidations gap");
  assert.ok(html.includes("1.6%"), "missing dispose-flip recovery floor");
  assert.match(note, /\$68\.86 more/);
  assert.doesNotMatch(html, /you should liquidate|must liquidate|create a liquidation order now/i);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("sitemap and index point at the liquidation page", () => {
  assert.match(sitemap, /should-i-liquidate-aged-fba-inventory\.html/);
  assert.match(index, /should-i-liquidate-aged-fba-inventory\.html/);
});

// The calculator page now renders this comparison itself rather than only
// linking out. These guard the wiring: renderLiquidation writes into ids that
// must exist, reads inputs that must be in the collected ids, and emits one
// cell per column. agedRemovalFee is a distinct id so MCF's removalFee is
// not reused.
test("the calculator page carries the liquidation section renderLiquidation writes into", () => {
  const { markup, scripts } = parse(index);
  const script = scripts.join("\n");
  assert.match(markup, /id="liquidation"/);
  for (const id of [
    "liquidationVerdict",
    "liquidationRows",
    "liquidationNote",
    "agedUnits",
    "monthlySellThroughPct",
    "horizonMonths",
    "aisPerUnit",
    "recoveryPct",
    "liquidationFee",
    "agedRemovalFee",
    "elsewhereNet",
    "disposalFee",
  ]) {
    assert.ok(markup.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.match(script, /compareLiquidation/, "renderLiquidation must import the comparison");
  assert.match(script, /liquidationNote/, "the note must come from calc.mjs, not be retyped");
  assert.match(script, /"agedUnits",/, "agedUnits must be in the collected ids");
  assert.match(script, /"agedRemovalFee",/, "agedRemovalFee must be in the collected ids");
  assert.match(script, /removalFee: input\.agedRemovalFee/, "MCF removalFee must not be passed through as the return-removal fee");
  assert.match(script, /liquidation_compared/, "changing liquidation fields must count usage");
});

test("the calculator's liquidation table renders one cell per column", () => {
  const { markup, scripts } = parse(index);
  const table = markup.match(/<table id="liquidationTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the liquidation table");
  const columns = table[0].match(/<th\b/g).length;
  const body = scripts.join("\n").match(/function renderLiquidation\([\s\S]*?\n    \}\n/);
  assert.ok(body, "renderLiquidation not found on the calculator page");
  const cells = body[0].match(/packCell\(tr,/g).length;
  assert.equal(cells, columns, "renderLiquidation emits a different cell count than the header row");
});

test("a missing aged-pile figure does not blank the profit result", () => {
  const script = parse(index).scripts.join("\n");
  assert.match(script, /try \{\s*renderLiquidation\(readInput\(\)\);\s*\} catch \(liquidationError\) \{/);
});
