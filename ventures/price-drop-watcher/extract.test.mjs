import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice, extractProduct, diffReading, robotsAllows, normaliseAvailability, SAMPLE_HTML } from "./extract.mjs";

test("parsePrice reads US, EU and bare formats", () => {
  const cases = [["$1,299.00", 1299], ["1.299,00 €", 1299], ["12,50", 12.5], ["1 299,50", 1299.5], ["12.5", 12.5], ["1,299", 1299], ["0,99", 0.99], ["1.234.567", 1234567], ["free", null], ["", null], [null, null], [-3, null]];
  for (const [i, o] of cases) assert.equal(parsePrice(i), o, String(i));
});

test("availability normalises schema.org URLs and words", () => {
  assert.equal(normaliseAvailability("https://schema.org/OutOfStock"), "out_of_stock");
  assert.equal(normaliseAvailability("in stock"), "in_stock");
  assert.equal(normaliseAvailability("InStock"), "in_stock");
  assert.equal(normaliseAvailability("PreOrder"), "preorder");
  assert.equal(normaliseAvailability("maybe"), null);
});

test("JSON-LD product is read, and the cheapest in-stock offer wins", () => {
  const r = extractProduct(SAMPLE_HTML);
  assert.deepEqual([r.price, r.currency, r.availability, r.source, r.title], [129, "USD", "in_stock", "json-ld", "Trail Runner 2"]);
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"X","offers":{"@type":"AggregateOffer","offers":[{"price":"10","priceCurrency":"EUR","availability":"OutOfStock"},{"price":"12","priceCurrency":"EUR","availability":"InStock"}]}}]}</script>`;
  const m = extractProduct(html);
  assert.equal(m.price, 12);
  assert.equal(m.availability, "in_stock");
});

test("bad JSON-LD falls through to meta tags, then microdata", () => {
  const meta = `<script type="application/ld+json">{oops</script><meta property="product:price:amount" content="19.99"><meta property="product:price:currency" content="GBP"><meta property="og:availability" content="oos">`;
  const r = extractProduct(meta);
  assert.deepEqual([r.price, r.currency, r.source], [19.99, "GBP", "meta"]);
  const micro = `<span itemprop="price" content="7.50"></span><meta itemprop="priceCurrency" content="CAD"><link itemprop="availability" href="https://schema.org/InStock">`;
  const m = extractProduct(micro);
  assert.deepEqual([m.price, m.currency, m.availability, m.source], [7.5, "CAD", "in_stock", "microdata"]);
});

test("a user priceRegex beats guessing, stockRegex sets stock, bad regexes are reported", () => {
  const html = `<html><title>Odd</title><body>Now $45.50 <button>Add to cart</button></body></html>`;
  const r = extractProduct(html, { priceRegex: "Now\\s*\\$([\\d.,]+)", stockRegex: "Add to cart" });
  assert.deepEqual([r.ok, r.price, r.availability, r.currency, r.source], [true, 45.5, "in_stock", "USD", "regex"]);
  assert.equal(extractProduct(html, { priceRegex: "Nope([0-9]+)" }).ok, false);
  assert.match(extractProduct(html, { priceRegex: "(" }).error, /not a valid/);
  assert.equal(extractProduct("<p>nothing</p>").ok, false);
  assert.equal(extractProduct("  ").ok, false);
});

test("diffReading reports drops, restocks and target crossings once", () => {
  const a = { price: 100, availability: "out_of_stock" };
  const b = { price: 80, availability: "in_stock" };
  const d = diffReading(a, b, { targetPrice: 90, minDropPercent: 5 });
  assert.deepEqual(d.events.map((e) => e.type), ["price_drop", "back_in_stock", "target_hit"]);
  assert.equal(diffReading(b, { price: 79, availability: "in_stock" }, { targetPrice: 90 }).events.some((e) => e.type === "target_hit"), false);
  assert.equal(diffReading(a, { price: 98, availability: "out_of_stock" }, { minDropPercent: 5 }).events.length, 0);
  assert.equal(diffReading(a, { price: 120, availability: "out_of_stock" }, {}).events.length, 0);
  assert.equal(diffReading(a, { price: 120, availability: "out_of_stock" }, { alertOnRise: true }).events[0].type, "price_rise");
  assert.equal(diffReading(null, b, {}).events[0].type, "first_reading");
});

test("robots.txt: specific agent beats *, longest rule wins, wildcards work", () => {
  const txt = `User-agent: *\nDisallow: /cart\nDisallow: /p/*?ref=\nAllow: /cart/public\n\nUser-agent: price-drop-watcher\nDisallow: /private$`;
  assert.equal(robotsAllows(txt, "/products/x"), true);
  assert.equal(robotsAllows(txt, "/private"), false);
  assert.equal(robotsAllows(txt, "/private/ok"), true);
  assert.equal(robotsAllows(txt, "/cart", "otherbot"), false);
  assert.equal(robotsAllows(txt, "/cart/public/1", "otherbot"), true);
  assert.equal(robotsAllows(txt, "/p/a?ref=1", "otherbot"), false);
  assert.equal(robotsAllows("", "/anything"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/x"), false);
});
