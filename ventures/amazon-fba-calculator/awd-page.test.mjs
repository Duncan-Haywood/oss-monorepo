// Structural tests for the Amazon AWD inbound-bulk page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareAwd, awdNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-use-amazon-awd.html", import.meta.url), "utf8");
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
  assert.match(scriptSource, /compareAwd/);
  assert.match(scriptSource, /awdNote/);
  assert.match(scriptSource, /awd_compared/);
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
    ["Send-all-to-FBA leftover on a fresh PO", /id === "fba"|row\.cash/],
    ["AWD replenish leftover after receive and transfer", /awdInboundPerUnit|awdToFbaPerUnit/],
    ["you-hold drip leftover after home storage", /youHoldStoragePerUnit|id === "hold"/],
    ["extra cash vs FBA on the lot", /extraAwdVsFba|row\.vsFba/],
    ["AWD-to-FBA transfer ceiling that still matches FBA", /breakEvenAwdToFba|\$1\.09/],
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
  const result = compareAwd(defaults);
  assert.equal(result.winner, "awd");
  assert.ok(Math.abs(result.extraAwdVsFba - 165.33333333333303) < 1e-4);
  const note = awdNote(result);
  assert.ok(html.includes("$165.33"), "missing $165.33 lot gap");
  assert.ok(html.includes("$4723.93"), "missing AWD leftover");
  assert.ok(html.includes("$4558.60"), "missing FBA leftover");
  assert.ok(html.includes("$1.09"), "missing transfer ceiling");
  assert.ok(html.includes("$1.20"), "missing expensive-transfer flip");
  assert.ok(html.includes("$42.67"), "missing expensive-transfer gap");
  assert.ok(html.includes("$161.33"), "missing you-hold gap");
  assert.match(note, /\$165\.33 more on 400 units/);
  assert.doesNotMatch(html, /should use AWD|must send to FBA|switch now/i);
});

test("sitemap and index point at the AWD page", () => {
  assert.match(sitemap, /should-i-use-amazon-awd\.html/);
  assert.match(index, /should-i-use-amazon-awd\.html/);
});
