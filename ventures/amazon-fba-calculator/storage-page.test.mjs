// Structural tests for the Q4 peak vs January storage page.
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
  weightLb: 2,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  monthsInStorage: 3,
  peakMonths: 2,
  units: 200,
  packagingCost: 0.6,
  monthlySellerFee: 0,
  monthlyUnits: 80,
  fulfillmentFee: 5,
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
  assert.ok(rowTemplate, "could not find the per-timing <tr> template");
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
    ["January vs Q4 stay leftover", /scenarios\.off_peak|scenarios\.mixed/],
    ["all-peak storage row", /scenarios\.peak/],
    ["months of peak storage that wipe profit", /storageSeasonNote|peakMonthsUntilUnprofitable/],
    ["cubic-foot blended rate", /compareStorageSeasons/],
    ["storage on the shipment", /storageOnUnits/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList claims "${claim}" but the page never renders it`);
  }
});

test("worked example in the copy matches the calculator defaults", () => {
  const result = compareStorageSeasons(defaults);
  const note = storageSeasonNote(result);
  assert.equal(result.waitUntilJanuarySaves.toFixed(2), "612.00");
  assert.equal(result.waitUntilJanuarySavesPerUnit.toFixed(2), "3.06");
  assert.match(html, /\$3\.06/);
  assert.match(html, /\$612\.00/);
  assert.match(note, /\$612\.00/);
  assert.doesNotMatch(html, /should send now|must wait|opt in or out/i);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the Q4 storage page", () => {
  assert.match(index, /peak-vs-off-peak-storage\.html/);
  assert.match(index, /id="storage-season"/);
  assert.match(index, /compareStorageSeasons/);
  assert.match(sitemap, /peak-vs-off-peak-storage\.html/);
});
