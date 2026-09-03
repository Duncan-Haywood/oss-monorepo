// Structural tests for the Faire return page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareFaireReturn, faireReturnNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-take-this-faire-return.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.isBest[\s\S]*?<\/tr>/);

const defaults = {
  unitWholesale: 20,
  quantity: 10,
  unitCogs: 8,
  shippingReimbursement: 15,
  shippingCost: 15,
  region: "north_america",
  payout: "day_60",
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareFaireReturn/);
  assert.match(scriptSource, /faireReturnNote/);
  assert.match(scriptSource, /faire_return_compared/);
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

test("worked example on the page matches the locked comparison", () => {
  const result = compareFaireReturn(defaults);
  assert.equal(result.winner, "keep");
  assert.ok(Math.abs(result.keepAfter - 41.9) < 1e-9);
  assert.equal(result.denyAfter, 37.95);
  assert.equal(result.takeAfter, -49);
  assert.ok(html.includes("$41.90"), "missing keep-it leftover");
  assert.ok(html.includes("$37.95"), "missing deny leftover");
  assert.ok(html.includes("−$49.00"), "missing take-return leftover");
  assert.ok(html.includes("$75.90"), "missing booked leftover");
  assert.ok(html.includes("$46.52"), "missing two-unit flip");
  assert.ok(html.includes("$53.13"), "missing 70% deny flip");
  assert.ok(html.includes("55.2%"), "missing deny floor");
  assert.match(faireReturnNote(result), /\$41\.90/);
  assert.doesNotMatch(html, /must take|should take this return|must deny/i);
});

test("sitemap and index point at the return page", () => {
  assert.match(sitemap, /should-i-take-this-faire-return\.html/);
  assert.match(index, /should-i-take-this-faire-return\.html/);
  assert.match(index, /compareFaireReturn/);
  assert.match(index, /faire_return_compared/);
});

test("disclaimers a user can actually read", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /Not affiliated with Faire/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});
