import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./which-shopify-promo-costs-less.html", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("promo explainer embeds valid JSON-LD and the disclaimer", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1);
  for (const [, json] of blocks) {
    assert.equal(JSON.parse(json)["@context"], "https://schema.org");
  }
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /\$31\.74/);
  assert.match(html, /\$1\.17 more/);
});

test("index wires the promo table the script paints", () => {
  assert.match(index, /id="promos"/);
  assert.match(index, /id="percentOff"/);
  assert.match(index, /id="amountOff"/);
  assert.match(index, /comparePromos/);
  assert.match(index, /promos_compared/);
  assert.match(index, /which-shopify-promo-costs-less\.html/);
});

test("sitemap lists the promo explainer", () => {
  assert.match(sitemap, /which-shopify-promo-costs-less\.html/);
});
