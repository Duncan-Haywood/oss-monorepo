// Structural tests for the peak vs off-peak storage page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareStorageSeasons, storageSeasonNote } from "./calc.mjs";

const html = readFileSync(new URL("./peak-vs-off-peak-storage.html", import.meta.url), "utf8");
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
  salePrice: 29.99,
  referralRate: 15,
  length: 12,
  width: 12,
  height: 12,
  fulfillmentFee: 5,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  packagingCost: 0.6,
  monthsInStorage: 3,
  peakMonths: 2,
  units: 200,
  offPeakRate: 0.87,
  peakRate: 2.4,
  monthlySellerFee: 0,
  sizeTier: "large_standard",
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareStorageSeasons/);
  assert.match(scriptSource, /storageSeasonNote/);
  assert.match(scriptSource, /storage_season_compared/);
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
    ["January vs Q4 stay leftover", /compareStorageSeasons|off_peak/],
    ["all-peak stay cost", /storageSeasonNote|peakCostsExtra/],
    ["cubic-foot blended storage rate", /storagePerUnit|storageOnUnits/],
    ["months of peak storage that wipe profit", /storageSeasonNote/],
    ["shipment-level January savings", /waitUntilJanuarySaves|storageOnUnits/],
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
  const result = compareStorageSeasons(defaults);
  assert.equal(result.winner, "off_peak");
  assert.ok(Math.abs(result.waitUntilJanuarySaves - 612) < 1e-9);
  const note = storageSeasonNote(result);
  assert.ok(html.includes("$3.06"), "missing $3.06 per-unit gap");
  assert.ok(html.includes("$612.00"), "missing $612 shipment gap");
  assert.ok(html.includes("4.5"), "missing 4.5 peak-month wipe");
  assert.match(note, /\$3\.06 more per unit/);
  assert.doesNotMatch(html, /should send|must wait|inbound now/i);
});

test("sitemap and index point at the peak-storage page", () => {
  assert.match(sitemap, /peak-vs-off-peak-storage\.html/);
  assert.match(index, /peak-vs-off-peak-storage\.html/);
});
