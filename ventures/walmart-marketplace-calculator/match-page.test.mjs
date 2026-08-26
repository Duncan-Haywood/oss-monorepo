// Structural tests for the Walmart Buy Box match-vs-hold page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareMatchTake, matchTakeNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-match-the-walmart-buy-box.html", import.meta.url), "utf8");
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
  salePrice: 24.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 7,
  inboundPerUnit: 1.1,
  packagingCost: 0.5,
  monthlyUnits: 60,
  matchPrice: 21.99,
  holdTakePct: 40,
  matchTakePct: 70,
  promoTakePct: 80,
  promoDays: 10,
  monthDays: 30,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareMatchTake/);
  assert.match(scriptSource, /matchTakeNote/);
  assert.match(scriptSource, /match_take_compared/);
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
  for (const claim of [
    "hold-list leftover after current take",
    "permanent-match leftover after a higher take",
    "time-boxed promo leftover",
    "match-take floor that still matches holding",
    "promo-day floor that still matches a permanent drop",
  ]) {
    assert.ok(featureList[1].includes(claim), `featureList is missing "${claim}"`);
  }
  assert.match(scriptSource, /row\.salePrice/);
  assert.match(scriptSource, /row\.takePct/);
  assert.match(scriptSource, /row\.completedProfit/);
  assert.match(scriptSource, /row\.monthlyProfit/);
  assert.match(scriptSource, /extraMatchVsHold/);
});

test("FAQ default leftover matches the live comparison", () => {
  const result = compareMatchTake(defaults);
  assert.equal(result.winner, "match");
  assert.match(html, /\$121\.49 more/);
  assert.match(html, /\$640\.48 vs \$518\.99/);
  assert.match(html, /17\.1 days/);
  assert.match(html, /\$20\.50/);
  assert.match(html, /\$61\.50/);
  assert.match(matchTakeNote(result), /keeps \$121\.49 more/);
});

test("the sitemap and main calculator point at this page", () => {
  assert.match(sitemap, /should-i-match-the-walmart-buy-box\.html/);
  assert.match(index, /should-i-match-the-walmart-buy-box\.html/);
});

test("disclaimer and no-SLA clause are rendered markup", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});
