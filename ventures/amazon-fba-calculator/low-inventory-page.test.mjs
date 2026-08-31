// Structural tests for the restock vs low-inventory-level fee page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a cash figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareLowInventory, cubicFeet, lowInventoryNote } from "./calc.mjs";

const html = readFileSync(new URL("./low-inventory-level-fee.html", import.meta.url), "utf8");
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

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareLowInventory/);
  assert.match(scriptSource, /lowInventoryNote/);
  assert.match(scriptSource, /low_inventory_compared/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-policy <tr> template");
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
    ["30-day and 90-day days of supply", /result\.bandDays|result\.shortTermDays/],
    ["low-inventory-level surcharge band", /result\.monthlyFee|result\.feePerUnit/],
    ["stay-thin monthly fee", /Stay thin/],
    ["extra units to 28 days", /result\.extraUnitsTo28/],
    ["extra storage vs inbound", /result\.extraStoragePerMonth/],
    ["restock payback months", /lowInventoryNote|inboundPaybackMonths/],
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
  const comparison = compareLowInventory({
    onHandUnits: 10,
    soldLast30Days: 30,
    soldLast90Days: 90,
    sizeTier: "small_standard",
    weightLb: 0.5,
    cubicFeet: cubicFeet({ length: 8, width: 6, height: 2 }),
    storageRate: 0.87,
    inboundPerUnit: 1.2,
    monthlyUnits: 30,
    fulfillmentMethod: "fba",
  });
  assert.equal(comparison.applies, true);
  assert.equal(comparison.cheaperPolicy, "restock");
  assert.ok(Math.abs(comparison.feePerUnit - 0.89) < 1e-6);
  assert.ok(Math.abs(comparison.monthlyFee - 26.7) < 1e-6);
  assert.ok(Math.abs(comparison.extraUnitsTo28 - 18) < 1e-6);
  assert.ok(Math.abs(comparison.restockSavesPerMonth - (26.7 - 18 * comparison.cubicFeet * 0.87)) < 1e-6);
  assert.match(html, /id="onHandUnits"[^>]*value="10"/);
  assert.match(html, /id="soldLast30Days"[^>]*value="30"/);
  assert.match(html, /id="soldLast90Days"[^>]*value="90"/);
  assert.match(html, /\$26\.70/);
  assert.match(html, /\$25\.83/);
  assert.match(html, /18 units/);
  assert.doesNotMatch(lowInventoryNote(comparison), /should restock|must send|stay thin is better/i);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the low-inventory comparison", () => {
  assert.match(index, /low-inventory-level-fee\.html/);
  assert.match(sitemap, /low-inventory-level-fee\.html/);
});

// The calculator page now renders this comparison itself rather than only
// linking out to the page above. These guard the wiring: renderLowInventory
// writes into ids that must exist, reads inputs that must be in the ids list
// the page collects, and emits one cell per column header.
test("the calculator page carries the low-inventory section renderLowInventory writes into", () => {
  const { markup, scripts } = parse(index);
  const script = scripts.join("\n");
  assert.match(markup, /id="low-inventory"/);
  for (const id of [
    "lowInventoryVerdict",
    "lowInventoryRows",
    "lowInventoryNote",
    "onHandUnits",
    "soldLast30Days",
    "soldLast90Days",
    "lowInventoryFee",
  ]) {
    assert.ok(markup.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.match(script, /compareLowInventory/, "renderLowInventory must import the comparison");
  assert.match(script, /lowInventoryNote/, "the note must come from calc.mjs, not be retyped");
  assert.match(script, /"onHandUnits",/, "onHandUnits must be in the collected ids");
  assert.match(script, /low_inventory_compared/, "changing restock fields must count usage");
});

test("the calculator's low-inventory table renders one cell per column", () => {
  const { markup, scripts } = parse(index);
  const table = markup.match(/<table id="lowInventoryTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the low-inventory table");
  const columns = table[0].match(/<th\b/g).length;
  const body = scripts.join("\n").match(/function renderLowInventory\([\s\S]*?\n    \}\n/);
  assert.ok(body, "renderLowInventory not found on the calculator page");
  const cells = body[0].match(/packCell\(tr,/g).length;
  assert.equal(cells, columns, "renderLowInventory emits a different cell count than the header row");
});

test("a missing on-hand figure does not blank the profit result", () => {
  const script = parse(index).scripts.join("\n");
  assert.match(script, /try \{\s*renderLowInventory\(\{ \.\.\.readInput\(\), sizeTier: result\.sizeTier \}\);\s*\} catch \(lowInventoryError\) \{/);
});
