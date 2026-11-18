import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFeed,
  checkItem,
  checkFeed,
  gtinChecksumValid,
  gtinLengthValid,
  REQUIRED_CORE_FIELDS,
} from "./engine.mjs";

test("gtinChecksumValid: canonical EAN-13 worked example (Wikipedia) validates", () => {
  assert.equal(gtinChecksumValid("4006381333931"), true);
});

test("gtinChecksumValid: flipping the check digit invalidates it", () => {
  assert.equal(gtinChecksumValid("4006381333930"), false);
});

test("gtinChecksumValid: rejects non-digit junk and wrong lengths", () => {
  assert.equal(gtinChecksumValid("not-a-gtin"), false);
  assert.equal(gtinChecksumValid("12345"), false);
});

test("gtinLengthValid accepts 8/12/13/14 digit strings only", () => {
  assert.equal(gtinLengthValid("12345678"), true);
  assert.equal(gtinLengthValid("123456789012"), true);
  assert.equal(gtinLengthValid("1234567890123"), true);
  assert.equal(gtinLengthValid("12345678901234"), true);
  assert.equal(gtinLengthValid("123"), false);
});

test("parseFeed: JSON array with header-casing variants normalizes fields", () => {
  const items = parseFeed(
    JSON.stringify([{ ID: "sku1", Title: "A Widget", Price: "9.99 USD", Image_Link: "https://x.test/a.jpg" }]),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "sku1");
  assert.equal(items[0].title, "A Widget");
  assert.equal(items[0].image_link, "https://x.test/a.jpg");
});

test("parseFeed: {items: [...]} wrapper is accepted", () => {
  const items = parseFeed(JSON.stringify({ items: [{ id: "a", title: "t" }] }));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "a");
});

test("parseFeed: CSV with header row maps columns by name, ignoring column order", () => {
  const csv = "price,id,title\n19.99 USD,sku2,A Thing";
  const items = parseFeed(csv);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "sku2");
  assert.equal(items[0].price, "19.99 USD");
});

test("parseFeed: TSV is auto-detected from a tab in the header", () => {
  const tsv = "id\ttitle\tprice\nsku3\tA Thing\t9.99 USD";
  const items = parseFeed(tsv);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "A Thing");
});

test("parseFeed: quoted CSV field containing a comma is not split", () => {
  const csv = 'id,title\nsku4,"Widget, Deluxe Edition"';
  const items = parseFeed(csv);
  assert.equal(items[0].title, "Widget, Deluxe Edition");
});

test("parseFeed: invalid JSON throws a readable error", () => {
  assert.throws(() => parseFeed("{not json"), /not valid JSON/);
});

test("parseFeed: empty input returns an empty array", () => {
  assert.deepEqual(parseFeed(""), []);
  assert.deepEqual(parseFeed("   "), []);
});

function validItem(overrides = {}) {
  return {
    id: "sku-1",
    title: "Blue Cotton T-Shirt",
    description: "A soft, breathable blue cotton t-shirt in unisex sizing.",
    link: "https://shop.example.test/products/blue-tee",
    image_link: "https://shop.example.test/images/blue-tee.jpg",
    availability: "in stock",
    price: "19.99 USD",
    brand: "Examplewear",
    gtin: "4006381333931",
    google_product_category: "Apparel & Accessories > Clothing",
    ...overrides,
  };
}

test("checkItem: a fully valid item has no errors or warnings", () => {
  const { errors, warnings } = checkItem(validItem());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("checkItem: flags every missing required field", () => {
  const { errors } = checkItem({});
  const codes = errors.map((e) => e.code);
  for (const field of REQUIRED_CORE_FIELDS) {
    assert.ok(
      errors.some((e) => e.message.includes(`"${field}"`)),
      `expected an error naming missing field "${field}"`,
    );
  }
  assert.equal(codes.filter((c) => c === "missing-required").length, REQUIRED_CORE_FIELDS.length);
});

test("checkItem: title over 150 characters is an error", () => {
  const { errors } = checkItem(validItem({ title: "x".repeat(151) }));
  assert.ok(errors.some((e) => e.code === "title-too-long"));
});

test("checkItem: description over 5000 characters is an error", () => {
  const { errors } = checkItem(validItem({ description: "x".repeat(5001) }));
  assert.ok(errors.some((e) => e.code === "description-too-long"));
});

test("checkItem: promotional phrase in title is a warning, not an error", () => {
  const { errors, warnings } = checkItem(validItem({ title: "Blue Cotton T-Shirt - 50% off Free Shipping" }));
  assert.equal(errors.length, 0);
  assert.ok(warnings.some((w) => w.code === "promotional-text"));
});

test("checkItem: all-caps title is a warning", () => {
  const { warnings } = checkItem(validItem({ title: "BLUE COTTON T-SHIRT DELUXE" }));
  assert.ok(warnings.some((w) => w.code === "title-all-caps"));
});

test("checkItem: non-URL link and image_link are errors", () => {
  const { errors } = checkItem(validItem({ link: "not a url", image_link: "javascript:alert(1)" }));
  assert.ok(errors.some((e) => e.code === "invalid-link"));
  assert.ok(errors.some((e) => e.code === "invalid-image-link"));
});

test("checkItem: invalid availability value is an error", () => {
  const { errors } = checkItem(validItem({ availability: "maybe" }));
  assert.ok(errors.some((e) => e.code === "invalid-availability"));
});

test("checkItem: availability is case-insensitive", () => {
  const { errors } = checkItem(validItem({ availability: "In Stock" }));
  assert.equal(errors.filter((e) => e.code === "invalid-availability").length, 0);
});

test("checkItem: price without a currency code is a format error", () => {
  const { errors } = checkItem(validItem({ price: "19.99" }));
  assert.ok(errors.some((e) => e.code === "invalid-price-format"));
});

test("checkItem: zero or negative price is an error", () => {
  const { errors } = checkItem(validItem({ price: "0 USD" }));
  assert.ok(errors.some((e) => e.code === "non-positive-price"));
});

test("checkItem: sale_price >= price is an error", () => {
  const { errors } = checkItem(validItem({ price: "10.00 USD", sale_price: "12.00 USD" }));
  assert.ok(errors.some((e) => e.code === "sale-price-not-lower"));
});

test("checkItem: sale_price in a different currency than price is an error", () => {
  const { errors } = checkItem(validItem({ price: "10.00 USD", sale_price: "8.00 EUR" }));
  assert.ok(errors.some((e) => e.code === "sale-price-currency-mismatch"));
});

test("checkItem: sale_price lower than price in the same currency is fine", () => {
  const { errors } = checkItem(validItem({ price: "10.00 USD", sale_price: "8.00 USD" }));
  assert.equal(errors.filter((e) => e.code.startsWith("sale-price")).length, 0);
});

test("checkItem: invalid condition value is an error", () => {
  const { errors } = checkItem(validItem({ condition: "gently loved" }));
  assert.ok(errors.some((e) => e.code === "invalid-condition"));
});

test("checkItem: malformed gtin is an error (length and checksum)", () => {
  const { errors } = checkItem(validItem({ gtin: "123" }));
  assert.ok(errors.some((e) => e.code === "invalid-gtin-length"));
  const { errors: errors2 } = checkItem(validItem({ gtin: "4006381333939" }));
  assert.ok(errors2.some((e) => e.code === "invalid-gtin-checksum"));
});

test("checkItem: missing brand+gtin/mpn pair warns unless identifier_exists is false", () => {
  const { warnings } = checkItem(validItem({ brand: undefined, gtin: undefined }));
  assert.ok(warnings.some((w) => w.code === "missing-identifier"));

  const { warnings: warnings2 } = checkItem(
    validItem({ brand: undefined, gtin: undefined, identifier_exists: "false" }),
  );
  assert.equal(warnings2.filter((w) => w.code === "missing-identifier").length, 0);
});

test("checkItem: brand+mpn without gtin satisfies the identifier pair", () => {
  const { warnings } = checkItem(validItem({ gtin: undefined, mpn: "MPN-123" }));
  assert.equal(warnings.filter((w) => w.code === "missing-identifier").length, 0);
});

test("checkItem: missing google_product_category is a warning", () => {
  const { warnings } = checkItem(validItem({ google_product_category: undefined }));
  assert.ok(warnings.some((w) => w.code === "missing-category"));
});

test("checkFeed: flags duplicate ids across the feed", () => {
  const result = checkFeed([validItem({ id: "dup" }), validItem({ id: "dup" })]);
  assert.ok(result.feedErrors.some((e) => e.code === "duplicate-id"));
  assert.equal(result.totalItems, 2);
});

test("checkFeed: an image reused across many different ids is a warning", () => {
  const items = Array.from({ length: 6 }, (_, i) => validItem({ id: `sku-${i}`, image_link: "https://shop.example.test/images/same.jpg" }));
  const result = checkFeed(items);
  assert.ok(result.feedWarnings.some((w) => w.code === "reused-image"));
});

test("checkFeed: an image reused a handful of times (real product variants) does not warn", () => {
  const items = Array.from({ length: 3 }, (_, i) => validItem({ id: `sku-${i}`, image_link: "https://shop.example.test/images/same.jpg" }));
  const result = checkFeed(items);
  assert.equal(result.feedWarnings.filter((w) => w.code === "reused-image").length, 0);
});

test("checkFeed: totals and itemsWithErrors add up across a mixed feed", () => {
  const result = checkFeed([validItem(), validItem({ id: "sku-2", price: "bad" })]);
  assert.equal(result.totalItems, 2);
  assert.equal(result.itemsWithErrors, 1);
  assert.ok(result.totalErrors >= 1);
});

// --- Red-team 2026-11-17: boundaries and totals the suite let through ------

test("checkItem: id of exactly 50 characters passes, 51 is an error", () => {
  assert.ok(!checkItem(validItem({ id: "x".repeat(50) })).errors.some((e) => e.code === "id-too-long"));
  assert.ok(checkItem(validItem({ id: "x".repeat(51) })).errors.some((e) => e.code === "id-too-long"));
});

test("checkItem: title of exactly 150 characters passes", () => {
  assert.ok(!checkItem(validItem({ title: "Shirt ".repeat(25) })).errors.some((e) => e.code === "title-too-long"));
});

test("checkItem: a 20-character description is not 'too short', 19 is", () => {
  const short = (d) => checkItem(validItem({ description: d })).warnings.some((w) => w.code === "description-too-short");
  assert.equal(short("a".repeat(20)), false);
  assert.equal(short("a".repeat(19)), true);
});

test("gtinChecksumValid: a real 12-digit UPC-A validates", () => {
  assert.equal(gtinChecksumValid("036000291452"), true);
  assert.equal(gtinChecksumValid("036000291453"), false);
});

test("checkFeed: an image shared by exactly 5 ids warns, 4 does not", () => {
  const feed = (n) => Array.from({ length: n }, (_, i) => validItem({ id: `sku-${i}`, image_link: "https://shop.example.test/images/same.jpg" }));
  assert.equal(checkFeed(feed(5)).feedWarnings.length, 1);
  assert.equal(checkFeed(feed(4)).feedWarnings.length, 0);
});

test("checkFeed: totals include feed-level errors and warnings", () => {
  const img = "https://shop.example.test/images/same.jpg";
  const items = [
    validItem({ id: "dup", image_link: img }),
    validItem({ id: "dup", image_link: img }),
    ...Array.from({ length: 5 }, (_, i) => validItem({ id: `sku-${i}`, image_link: img })),
  ];
  const result = checkFeed(items);
  assert.equal(result.feedErrors.length, 1);
  assert.equal(result.feedWarnings.length, 1);
  assert.equal(result.totalErrors, 1);
  assert.equal(result.totalWarnings, 1);
});

// --- Red-team 2026-11-17: real defects ---------------------------------------

test("checkItem: Google's underscore availability values (in_stock, out_of_stock) are valid", () => {
  for (const v of ["in_stock", "out_of_stock", "In_Stock"]) {
    assert.ok(!checkItem(validItem({ availability: v })).errors.some((e) => e.code === "invalid-availability"), v);
  }
  assert.ok(checkItem(validItem({ availability: "in-stock-ish" })).errors.some((e) => e.code === "invalid-availability"));
});

test("parseFeed: a quoted CSV field spanning lines stays one item", () => {
  const csv =
    'id,title,description,price\r\n' +
    'a1,Shirt,"Line one of the description.\r\nLine two, with a comma.",9.99 USD\r\n' +
    'a2,Hat,A warm wool hat,5.00 USD\n';
  const items = parseFeed(csv);
  assert.deepEqual(items.map((i) => i.id), ["a1", "a2"]);
  assert.equal(items[0].description, "Line one of the description.\nLine two, with a comma.");
  assert.equal(items[0].price, "9.99 USD");
});

test("parseFeed: a JSON item that is not an object is a readable error, not a TypeError", () => {
  assert.throws(() => parseFeed("[null]"), /item 1 is not an object/);
  assert.throws(() => parseFeed('[{"id":"a"}, 5]'), /item 2 is not an object/);
});
