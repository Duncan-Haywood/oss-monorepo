// Structural tests for the Amazon Remote Fulfillment page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareRemoteFulfillment, remoteFulfillmentNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-use-amazon-remote-fulfillment.html", import.meta.url), "utf8");
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
  storageRate: 0.87,
  monthlyUnits: 80,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareRemoteFulfillment/);
  assert.match(scriptSource, /remoteFulfillmentNote/);
  assert.match(scriptSource, /remote_fulfillment_compared/);
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
    ["Skip-Canada leftover on incremental demand", /id === "skip"|row\.expectedProfit/],
    ["Remote Fulfillment leftover after the US-to-Canada surcharge", /narfFee|id === "narf"/],
    ["dedicated Canada pile leftover after CA inbound", /caInboundPerUnit|id === "canada"/],
    ["extra cash vs skip on the session", /extraNarfVsSkip|row\.vsSkip/],
    ["remote-fee ceiling that still matches the Canada pile", /breakEvenNarfFee|\$1\.75/],
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
  const result = compareRemoteFulfillment(defaults);
  assert.equal(result.winner, "narf");
  assert.ok(Math.abs(result.extraNarfVsSkip - 5.121583333333332) < 1e-4);
  const note = remoteFulfillmentNote(result);
  assert.ok(html.includes("$5.12"), "missing $5.12 session leftover");
  assert.ok(html.includes("$204.86"), "missing monthly gap");
  assert.ok(html.includes("$4.87"), "missing Canada pile leftover");
  assert.ok(html.includes("$0.25"), "missing pile gap");
  assert.ok(html.includes("$1.75"), "missing remote-fee ceiling");
  assert.ok(html.includes("$2.40"), "missing cheap-inbound flip");
  assert.ok(html.includes("$1.57"), "missing cheap-inbound gap");
  assert.ok(html.includes("$6.69"), "missing cheap-inbound leftover");
  assert.match(note, /\$5\.12 more per Canada session/);
  assert.doesNotMatch(html, /should use Remote Fulfillment|must send to Canada|switch now/i);
});

test("sitemap and index point at the Remote Fulfillment page", () => {
  assert.match(sitemap, /should-i-use-amazon-remote-fulfillment\.html/);
  assert.match(index, /should-i-use-amazon-remote-fulfillment\.html/);
});
