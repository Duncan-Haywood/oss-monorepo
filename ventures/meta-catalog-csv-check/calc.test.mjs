import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, repair, parseCsv, toCsv, decodeBuffer, canonHeader, closestColumn, findingsCsv, sampleFile, sampleBrokenFile,
  parsePrice, gtinValid, paddedGtin, checkUrl, detectDelim, COLUMNS, REQUIRED,
} from "./calc.mjs";

const K = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "sale_price", "sale_price_effective_date", "item_group_id", "gtin", "color", "size", "google_product_category", "quantity_to_sell_on_facebook"];
const ok = { id: "TEE-1", title: "Harbor Tee", description: "Soft cotton tee.", availability: "in stock", condition: "new", price: "24.00 USD", link: "https://example.com/p/1", image_link: "https://example.com/i/1.jpg", brand: "Harbor", google_product_category: "Apparel & Accessories > Clothing" };
const file = (...rows) => toCsv([K, ...rows.map((o) => K.map((k) => o[k] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const has = (rows, code) => codes(validate(file(...rows))).includes(code);

test("the clean example has no findings, the broken one has errors and warnings", () => {
  assert.deepEqual(validate(sampleFile()).findings.filter((f) => f.severity !== "info"), []);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error") && bad.findings.some((f) => f.severity === "warning"));
  assert.equal(bad.summary.delimiter, ";");
});

test("a clean single row passes", () => {
  assert.deepEqual(validate(file(ok)).findings.filter((f) => f.severity !== "info"), []);
});

test("headers: near misses, missing required, duplicates, case", () => {
  assert.equal(canonHeader(" Image_Link "), "imagelink");
  assert.equal(closestColumn("UPC"), "gtin");
  assert.equal(closestColumn("SKU"), "id");
  assert.equal(closestColumn("avalability"), "availability");
  const r = validate("sku,name\nA,B\n");
  assert.ok(r.findings.some((f) => f.code === "unknown-header" && /id/.test(f.detail)));
  const miss = validate("id,title\nA,B\n");
  for (const c of ["description", "price", "image_link", "brand"]) assert.ok(miss.findings.some((f) => f.code === "missing-column" && f.severity === "error" && f.title.includes(c)), c);
  assert.ok(codes(validate("id,title,id\nA,B,C\n")).includes("dup-header"));
  assert.ok(codes(validate(file(ok).replace("id,", "ID,"))).includes("header-case"));
  assert.ok(REQUIRED.every((c) => COLUMNS.includes(c)));
});

test("encoding, BOM and delimiter detection", () => {
  assert.equal(detectDelim("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelim("a\tb\n"), "\t");
  assert.ok(codes(validate(file(ok).replace(/,/g, ";"))).includes("delimiter"));
  assert.ok(codes(validate("﻿" + file(ok))).includes("bom"));
  assert.ok(codes(validate("i\u0000d\u0000")).includes("utf16"));
  assert.ok(codes(validate(file({ ...ok, title: "CafÃ© tee" }))).includes("mojibake"));
  const u16 = Uint8Array.from([0xff, 0xfe, ...[..."a,b\n"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16), "a,b\n");
  assert.ok(!validate(file(ok).replace(/,/g, "\t")).findings.some((f) => f.severity !== "info"));
});

test("unterminated quote stops the run with a line number", () => {
  const r = validate('id,title\nA,"12 inch ruler\nB,x\n');
  assert.equal(r.findings[0].code, "quote");
  assert.equal(r.findings[0].line, 2);
});

test("ids: blank, scientific notation, .0, duplicates, length", () => {
  assert.ok(has([{ ...ok, id: "" }], "id-blank"));
  assert.ok(has([{ ...ok, id: "1.2346E+09" }], "id-sci"));
  assert.ok(has([{ ...ok, id: "1001.0" }], "id-dot0"));
  assert.ok(has([{ ...ok, id: "x".repeat(101) }], "id-long"));
  const r = validate(file(ok, { ...ok, link: "https://example.com/p/2" }));
  const d = r.findings.find((f) => f.code === "id-dup");
  assert.equal(d.line, 3);
  assert.match(d.detail, /line 2/);
});

test("title and description rules", () => {
  assert.ok(has([{ ...ok, title: "" }], "title-blank"));
  assert.ok(has([{ ...ok, title: "x".repeat(201) }], "title-long"));
  assert.ok(has([{ ...ok, title: "HARBOR STREET COTTON TEE" }], "title-caps"));
  assert.ok(!has([{ ...ok, title: "UV Mug" }], "title-caps"));
  assert.ok(has([{ ...ok, title: "Harbor Tee free shipping" }], "title-promo"));
  assert.ok(has([{ ...ok, title: "Harbor Tee 20% off" }], "title-promo"));
  assert.ok(has([{ ...ok, description: "<p>Soft</p>" }], "desc-html"));
  assert.ok(has([{ ...ok, description: "x".repeat(10000) }], "desc-long"));
  assert.ok(has([{ ...ok, description: "Harbor Tee" }], "desc-same"));
});

test("availability and condition values", () => {
  assert.ok(has([{ ...ok, availability: "In Stock" }], "avail-value"));
  assert.ok(has([{ ...ok, availability: "available" }], "avail-value"));
  assert.ok(!has([{ ...ok, availability: "preorder" }], "avail-value"));
  assert.ok(has([{ ...ok, condition: "New" }], "cond-value"));
  assert.ok(has([{ ...ok, condition: "mint" }], "cond-value"));
  assert.ok(!has([{ ...ok, condition: "refurbished" }], "cond-value"));
});

test("price parsing", () => {
  assert.deepEqual(parsePrice("19.99 USD"), { amount: 19.99, currency: "USD", raw: "19.99" });
  assert.equal(parsePrice("19.99USD").fix, "19.99 USD");
  assert.equal(parsePrice("usd 19.99").fix, "19.99 USD");
  assert.equal(parsePrice("$19.99").problem, "symbol");
  assert.equal(parsePrice("19.99").problem, "no-currency");
  assert.equal(parsePrice("1,299.00 USD").problem, "thousands");
  assert.equal(parsePrice("12,50 EUR").problem, "comma-decimal");
  assert.equal(parsePrice("19.99 ZZZ").problem, "currency");
  assert.equal(parsePrice("free").problem, "shape");
  assert.equal(parsePrice("").problem, "empty");
});

test("price and sale price findings", () => {
  assert.ok(has([{ ...ok, price: "$24.00" }], "price-symbol"));
  assert.ok(has([{ ...ok, price: "24" }], "price-no-currency"));
  assert.ok(has([{ ...ok, price: "0.00 USD" }], "price-zero"));
  assert.ok(has([{ ...ok, price: "24.00USD" }], "price-format"));
  assert.ok(has([{ ...ok, sale_price: "30.00 USD" }], "sale-not-lower"));
  assert.ok(!has([{ ...ok, sale_price: "20.00 USD" }], "sale-not-lower"));
  assert.ok(has([{ ...ok, sale_price: "20.00 EUR" }], "sale-currency"));
  assert.ok(has([{ ...ok, sale_price: "2.00 USD" }], "sale-deep"));
  assert.ok(has([{ ...ok, sale_price: "20.00 USD", sale_price_effective_date: "Nov 20" }], "sale-date-format"));
  assert.ok(has([{ ...ok, sale_price: "20.00 USD", sale_price_effective_date: "2026-11-30T00:00-08:00/2026-11-20T00:00-08:00" }], "sale-date-order"));
  assert.ok(!has([{ ...ok, sale_price: "20.00 USD", sale_price_effective_date: "2026-11-20T00:00-08:00/2026-11-30T23:59-08:00" }], "sale-date-format"));
  assert.ok(has([{ ...ok }, { ...ok, id: "B", link: "https://example.com/p/2", price: "10.00 EUR" }], "mixed-currency"));
});

test("links and images", () => {
  assert.ok(has([{ ...ok, link: "" }], "link-blank"));
  assert.ok(has([{ ...ok, link: "www.example.com/p" }], "link-bad"));
  assert.ok(has([{ ...ok, link: "https://example.com/my product" }], "link-bad"));
  assert.ok(has([{ ...ok, link: "http://example.com/p" }], "link-http"));
  assert.ok(has([{ ...ok, image_link: "" }], "image-blank"));
  assert.ok(has([{ ...ok, image_link: "https://example.com/a.webp" }], "image-format"));
  assert.ok(has([{ ...ok, image_link: "https://cdn.example.com/a" }], "image-ext"));
  assert.ok(!has([{ ...ok, image_link: "https://example.com/a.PNG?v=2" }], "image-format"));
  assert.equal(checkUrl("ftp://x.com"), "is not a web address");
  const r = validate(file(ok, { ...ok, id: "B", link: "https://other.com/p" }));
  assert.ok(codes(r).includes("domains"));
});

test("GTIN check digits, Excel damage and restoring leading zeros", () => {
  assert.ok(gtinValid("036000291452"));
  assert.ok(gtinValid("4006381333931"));
  assert.ok(!gtinValid("036000291453"));
  assert.equal(paddedGtin("36000291452"), "036000291452");
  assert.equal(paddedGtin("36000291453"), null);
  assert.ok(has([{ ...ok, gtin: "4.00638E+12" }], "gtin-sci"));
  assert.ok(has([{ ...ok, gtin: "4006381333931.0" }], "gtin-dot0"));
  assert.ok(has([{ ...ok, gtin: "36000291452" }], "gtin-zero"));
  assert.ok(has([{ ...ok, gtin: "036000291453" }], "gtin-check"));
  assert.ok(has([{ ...ok, gtin: "12345" }], "gtin-check"));
  assert.ok(has([{ ...ok, gtin: "ABC123" }], "gtin-chars"));
  assert.ok(!has([{ ...ok, gtin: "036000291452" }], "gtin-check"));
});

test("brand, enumerations, stock and numbers", () => {
  assert.ok(has([{ ...ok, brand: "" }], "brand-blank"));
  assert.ok(has([{ ...ok, brand: "N/A" }], "brand-placeholder"));
  assert.ok(has([{ ...ok, quantity_to_sell_on_facebook: "-2" }], "quantity_to_sell_on_facebook-value"));
  const r = validate(file({ ...ok, quantity_to_sell_on_facebook: "0" }));
  assert.ok(codes(r).includes("stock-conflict"));
});

test("item groups: identical options and missing options", () => {
  const a = { ...ok, id: "A", item_group_id: "G", color: "Red", size: "S" };
  assert.ok(has([a, { ...a, id: "B", link: "https://example.com/p/b" }], "variant-dup"));
  assert.ok(!has([a, { ...a, id: "B", size: "M" }], "variant-dup"));
  assert.ok(has([{ ...ok, id: "A", item_group_id: "G" }, { ...ok, id: "B", item_group_id: "G" }], "variant-nokey"));
});

test("ragged rows and Excel error cells are caught with their line", () => {
  const r = validate("id,title,description,availability,condition,price,link,image_link,brand\nA,B\n");
  assert.ok(r.findings.some((f) => f.code === "ragged" && f.line === 2));
  assert.ok(has([{ ...ok, description: "#NAME?" }], "excel-error"));
});

test("empty and header-only files", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate(K.join(",") + "\n")).includes("no-rows"));
});

test("repair converts the delimiter, spells values and restores only provable barcode zeros", () => {
  const bad = file({ ...ok, availability: "InStock", condition: "New", price: "24.00USD", gtin: "36000291452", id: "55.0" }, { ...ok, id: "B", link: "https://example.com/p/2", gtin: "36000291453", price: "$24.00" });
  const fx = repair(bad.replace(/,/g, ";"));
  assert.match(fx.changes[0], /semicolon/);
  const out = parseCsv(fx.text).rows;
  const col = (n) => out[0].cells.indexOf(n);
  assert.equal(out[1].cells[col("availability")], "in stock");
  assert.equal(out[1].cells[col("condition")], "new");
  assert.equal(out[1].cells[col("price")], "24.00 USD");
  assert.equal(out[1].cells[col("gtin")], "036000291452");
  assert.equal(out[1].cells[col("id")], "55");
  assert.equal(out[2].cells[col("gtin")], "036000291453".slice(1));
  assert.equal(out[2].cells[col("price")], "$24.00");
});
