// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareSizeTierPackaging } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const seo = readFileSync(new URL("./does-smaller-box-cut-amazon-fba-fees.html", import.meta.url), "utf8");

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
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the packaging table has one cell per column", () => {
  const packMarkup = markup.split('id="packTable"')[1] || "";
  const headers = [...packMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  assert.equal(headers.length, 7, `expected 7 pack columns, found ${headers.join(" | ")}`);
  assert.match(scriptSource, /packCell\(tr, `\$\{row\.label\}/);
  assert.match(scriptSource, /packCell\(tr, row\.item\.sizeTierLabel\)/);
  assert.match(scriptSource, /packCell\(tr, money\(row\.item\.fulfillmentFee\)\)/);
  assert.match(scriptSource, /packCell\(tr, money\(row\.item\.storagePerUnit\)\)/);
  assert.match(scriptSource, /packCell\(tr, money\(row\.item\.packExtra\)\)/);
  assert.match(scriptSource, /packCell\(tr, money\(row\.item\.profit\)\)/);
  assert.match(scriptSource, /signedMoney\(row\.delta\)/);
});

test("schema.org featureList names the packaging comparison the page actually renders", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  assert.match(featureList[1], /size-tier packaging cliff/i);
  assert.match(markup, /id="packTable"/);
  assert.match(markup, /id="repackCostPerUnit"/);
  assert.match(scriptSource, /compareSizeTierPackaging/);
  assert.match(scriptSource, /size_tier_packaging_compared/);
  assert.match(markup, /no SLA/i);
  assert.match(markup, /GitHub Sponsors/);
});

test("the SEO page uses the same worked example the calculator defaults produce", () => {
  assert.match(seo, /Does a smaller box cut Amazon FBA fees/i);
  assert.match(seo, /href="\.\/#size-tier-pack"/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;
  const defaults = compareSizeTierPackaging({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.87,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
  });
  assert.ok(seo.includes(money(defaults.current.fulfillmentFee)), `missing current fee ${money(defaults.current.fulfillmentFee)}`);
  assert.ok(seo.includes(money(defaults.dropTier.fulfillmentFee)), `missing drop-tier fee ${money(defaults.dropTier.fulfillmentFee)}`);
  assert.ok(seo.includes(signed(defaults.dropTier.profitDelta)), `missing drop-tier delta ${signed(defaults.dropTier.profitDelta)}`);
  assert.ok(seo.includes(money(defaults.dropTier.monthlyDelta)), `missing monthly ${money(defaults.dropTier.monthlyDelta)}`);
  assert.ok(seo.includes(money(defaults.current.profit)), `missing current profit ${money(defaults.current.profit)}`);
  assert.ok(seo.includes(money(defaults.dropTier.profit)), `missing drop-tier profit ${money(defaults.dropTier.profit)}`);
  assert.ok(seo.includes(signed(defaults.dropWeight.profitDelta)), `missing weight-band delta ${signed(defaults.dropWeight.profitDelta)}`);
});
