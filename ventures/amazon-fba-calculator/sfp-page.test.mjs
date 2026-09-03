// Structural tests for the Seller Fulfilled Prime page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareSfp, sfpNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-use-seller-fulfilled-prime.html", import.meta.url), "utf8");
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
  fbmShippingCost: 4.75,
  monthsInStorage: 1,
  storageRate: 0.87,
  monthlySellerFee: 39.99,
  monthlyUnits: 80,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareSfp/);
  assert.match(scriptSource, /sfpNote/);
  assert.match(scriptSource, /sfp_compared/);
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
    ["FBA leftover with Prime take", /result\.fba|row\.completedProfit/],
    ["Seller Fulfilled Prime leftover after a 2-day label and pack time", /sfpShippingCost|sfpMinutes/],
    ["merchant-fulfilled leftover without Prime", /fbmShippingCost|id === "fbm"/],
    ["expected leftover per session", /expectedProfit/],
    ["monthly leftover at typed FBA volume", /monthlyUnits|monthlyExtraOnSfp|sfpNote/],
    ["2-day label ceiling that still matches FBA", /breakEvenSfpShipping|\$2\.75/],
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
  const result = compareSfp(defaults);
  assert.equal(result.winner, "fba");
  assert.ok(Math.abs(result.extraKeptOnSfp + 4.028247916666666) < 1e-4);
  const note = sfpNote(result);
  assert.ok(html.includes("$4.03"), "missing $4.03 per-session gap");
  assert.ok(html.includes("$460.37"), "missing $460.37 monthly gap");
  assert.ok(html.includes("$7.70"), "missing FBA expected leftover");
  assert.ok(html.includes("$3.67"), "missing SFP expected leftover");
  assert.ok(html.includes("$2.75"), "missing 2-day ceiling");
  assert.ok(html.includes("$2.40"), "missing cheap-label flip");
  assert.ok(html.includes("$26.20"), "missing cheap-label monthly flip");
  assert.ok(html.includes("66.1%"), "missing FBM take floor");
  assert.match(note, /\$4\.03 more per session/);
  assert.doesNotMatch(html, /should leave FBA|must join SFP|switch now/i);
});

test("sitemap and index point at the SFP page", () => {
  assert.match(sitemap, /should-i-use-seller-fulfilled-prime\.html/);
  assert.match(index, /should-i-use-seller-fulfilled-prime\.html/);
});

test("index surfaces compareSfp on the listing itself", () => {
  assert.match(index, /id="sfp"/);
  assert.match(index, /id="sfpRows"/);
  assert.match(index, /id="sfpVerdict"/);
  assert.match(index, /compareSfp/);
  assert.match(index, /sfp_compared/);
  assert.match(index, /id="sfpShippingCost"/);
  const table = index.match(/<table id="sfpTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the SFP comparison table");
  const columns = table[0].match(/<th\b/g).length;
  assert.equal(columns, 5, "SFP table should have five columns");
});
