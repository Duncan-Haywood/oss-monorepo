// Structural tests for the Vine leftover vs sellable page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareVine } from "./calc.mjs";

const html = readFileSync(new URL("./is-amazon-vine-worth-it.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.horizonProfit === best[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareVine/);
  assert.match(scriptSource, /vine_compared/);
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
    ["skip Vine vs leftover enrollment", /result\.leftover|result\.skip/],
    ["Vine units that would have sold", /result\.sellable/],
    ["enrollment cost after FBA fees", /result\.vineUpfront/],
    ["break-even conversion lift", /result\.breakEvenLiftPct/],
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
  const comparison = compareVine({
    salePrice: 29.99,
    referralRate: 15,
    fulfillmentFee: 4.15,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
  });
  assert.equal(comparison.winner, "leftover");
  assert.ok(Math.abs(comparison.vineUpfront - 419.95) < 1e-6);
  assert.ok(Math.abs(comparison.extraKeptOnLeftover - 213.2636) < 1e-4);
  assert.ok(Math.abs(comparison.extraKeptOnSellable + 116.53515) < 1e-4);
  assert.match(html, /id="vineUnits"[^>]*value="30"/);
  assert.match(html, /id="conversionLiftPct"[^>]*value="12"/);
  assert.match(html, /\$419\.95/);
  assert.match(html, /\$213\.26/);
  assert.match(html, /\$116\.54/);
  assert.match(html, /8\.0%/);
  assert.match(html, /\$5,490\.04/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the Vine comparison", () => {
  assert.match(index, /is-amazon-vine-worth-it\.html/);
  assert.match(sitemap, /is-amazon-vine-worth-it\.html/);
});

test("the calculator page carries the Vine section renderVine writes into", () => {
  assert.match(index, /id="vine"/);
  assert.match(index, /id="vineRows"/);
  assert.match(index, /id="vineVerdict"/);
  assert.match(index, /compareVine/);
  assert.match(index, /vine_compared/);
  const table = index.match(/<table id="vineTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the Vine comparison table");
  const columns = table[0].match(/<th\b/g).length;
  const cells = (index.match(/function renderVine[\s\S]*?packCell\(tr, row\.id === "skip"/) || [""])[0].match(/packCell\(/g) || [];
  assert.equal(cells.length, columns, "renderVine emits a different cell count than the header row");
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
