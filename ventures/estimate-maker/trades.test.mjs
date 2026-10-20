import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { listTrades, renderPage } from "./build-trades.mjs";

const html = readFileSync(new URL("./trade-bid-calculators.html", import.meta.url), "utf8");

test("trade index is current: regenerate with `node build-trades.mjs`", () => {
  assert.equal(html, renderPage(listTrades()));
});

test("every bid calculator is linked and its page exists", () => {
  const trades = listTrades();
  assert.ok(trades.length >= 100);
  for (const t of trades) {
    assert.ok(html.includes(`href="../${t.slug}/"`), t.slug);
    assert.ok(existsSync(new URL(`../${t.slug}/index.html`, import.meta.url)), t.slug);
  }
});

test("index page has the disclaimer, sponsor link and valid structured data", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "ItemList");
  assert.equal(ld.numberOfItems, listTrades().length);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("estimate maker links the trade index and the sitemap lists it", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\/trade-bid-calculators\.html"/);
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /trade-bid-calculators\.html/);
});
