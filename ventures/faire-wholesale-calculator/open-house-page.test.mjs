// Structural tests for the Faire Open House page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareOpenHouse, openHouseNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-list-during-faire-open-house.html", import.meta.url), "utf8");
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
  assert.match(scriptSource, /compareOpenHouse/);
  assert.match(scriptSource, /openHouseNote/);
  assert.match(scriptSource, /open_house_compared/);
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
    ["Everyday first-order leftover after commission and the new-customer fee", /id === "everyday"|everyday\.profit/],
    ["Open House leftover after a deeper retailer discount", /openHouseDiscountRate|id === "open_house"/],
    ["Open House leftover at your everyday discount", /open_house_same_list|sameListVsEveryday/],
    ["discount ceiling that still matches everyday", /discountCeiling|15\.3%/],
    ["extra-retailer pile leftover", /pileProfit|openHouseExtraRetailers/],
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
  const result = compareOpenHouse(defaults);
  assert.equal(result.bestPerOrder.id, "open_house_same_list");
  assert.ok(Math.abs(result.everyday.profit - 75.9) < 1e-9);
  assert.ok(Math.abs(result.openHouse.profit - 66.66) < 1e-9);
  const note = openHouseNote(result);
  assert.ok(html.includes("$75.90"), "missing everyday leftover");
  assert.ok(html.includes("$66.66"), "missing Open House leftover");
  assert.ok(html.includes("$9.24"), "missing per-order leak");
  assert.ok(html.includes("15.3%"), "missing discount ceiling");
  assert.ok(html.includes("$105.90"), "missing same-list leftover");
  assert.ok(html.includes("$30.00"), "missing same-list gap");
  assert.ok(html.includes("$199.98"), "missing event pile");
  assert.ok(html.includes("$124.08"), "missing pile flip");
  assert.match(note, /\$75\.90/);
  assert.match(note, /\$66\.66/);
  assert.doesNotMatch(html, /should list during Open House|must wait|switch now/i);
});

test("sitemap and index point at the Open House page", () => {
  assert.match(sitemap, /should-i-list-during-faire-open-house\.html/);
  assert.match(index, /should-i-list-during-faire-open-house\.html/);
  assert.match(index, /compareOpenHouse/);
  assert.match(index, /open_house_compared/);
});

test("disclaimers a user can actually read", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /Not affiliated with Faire/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});
