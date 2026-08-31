// Structural tests for the inbound-placement vs split-freight page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareInboundPlacement, placementSummary } from "./calc.mjs";

const html = readFileSync(new URL("./inbound-placement-fee.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{result\.cheapestIds[\s\S]*?<\/tr>/);

const defaults = {
  units: 200,
  freightMinimal: 85,
  freightPartial: 140,
  freightOptimized: 210,
  placementMinimalPerUnit: 0.43,
  placementPartialPerUnit: 0.27,
  placementOptimizedPerUnit: 0,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareInboundPlacement/);
  assert.match(scriptSource, /placementSummary/);
  assert.match(scriptSource, /inbound_placement_compared/);
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
    ["one-warehouse inbound plus placement fee", /result\.paths|path\.placementTotal/],
    ["partial split", /partial/],
    ["Amazon-optimized split", /optimized/],
    ["extra freight the optimized split can absorb", /extraFreightOptimizedCanCarry|placementSummary/],
    ["blended inbound per unit", /path\.perUnit/],
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
  const comparison = compareInboundPlacement(defaults);
  assert.equal(comparison.winner, "minimal");
  assert.match(html, /\$171\.00/);
  assert.match(html, /\$194\.00/);
  assert.match(html, /\$210\.00/);
  assert.match(html, /\$23\.00/);
  assert.match(html, /\$86\.00/);
  assert.match(html, /\$80\.00/);
  assert.match(placementSummary(comparison), /\$171\.00/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("sitemap and calculator index link the inbound-placement page", () => {
  assert.match(sitemap, /inbound-placement-fee\.html/);
  assert.match(index, /inbound-placement-fee\.html/);
  assert.match(index, /id="placementCompare"/);
  assert.match(index, /inbound_placement_compared/);
});
