import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, notesCsv, sampleShopifyFile, parseCsv, toCsv, WOO_COLUMNS } from "./converter.mjs";

const H = ["Handle", "Title", "Body (HTML)", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Variant Image", "Status"];
const shop = (...rows) => toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]);
const out = (r) => { const p = parseCsv(r.csv).rows; const h = p[0].cells; return p.slice(1).map((x) => Object.fromEntries(h.map((c, i) => [c, x.cells[i] ?? ""]))); };
const simple = { Handle: "mug", Title: "Mug", "Option1 Name": "Title", "Option1 Value": "Default Title", "Variant SKU": "MUG", "Variant Price": "10.00" };

test("the sample converts to one variable product with variations and one simple product", () => {
  const r = convert(sampleShopifyFile());
  assert.equal(r.error, null);
  assert.deepEqual(r.stats, { products: 2, simple: 1, variable: 1, variations: 2, images: 3, skuGenerated: 0 });
  const rows = out(r);
  assert.deepEqual(rows.map((x) => x.Type), ["variable", "variation", "variation", "simple"]);
  assert.equal(rows[0].SKU, "CANVAS-TOTE-BAG");
  assert.equal(rows[1].Parent, "CANVAS-TOTE-BAG");
  assert.equal(rows[0]["Attribute 1 name"], "Color");
  assert.equal(rows[0]["Attribute 1 value(s)"], "Natural, Black");
  assert.equal(rows[1]["Attribute 1 value(s)"], "Natural");
});

test("the output header is exactly the WooCommerce column list", () => {
  const r = convert(sampleShopifyFile());
  assert.deepEqual(parseCsv(r.csv).rows[0].cells, WOO_COLUMNS);
});

test("Compare At Price above Price becomes Regular and Sale price", () => {
  const rows = out(convert(shop({ ...simple, "Variant Price": "19.00", "Variant Compare At Price": "24" })));
  assert.equal(rows[0]["Regular price"], "24");
  assert.equal(rows[0]["Sale price"], "19");
  const flat = out(convert(shop({ ...simple, "Variant Compare At Price": "5.00" })));
  assert.equal(flat[0]["Regular price"], "10.00");
  assert.equal(flat[0]["Sale price"], "");
});

test("currency symbols and decimal commas in prices are cleaned", () => {
  assert.equal(out(convert(shop({ ...simple, "Variant Price": "$1,299.00" })))[0]["Regular price"], "1299.00");
  assert.equal(out(convert(shop({ ...simple, "Variant Price": "12,50" })))[0]["Regular price"], "12.50");
});

test("an unusable price is blank and noted", () => {
  const r = convert(shop({ ...simple, "Variant Price": "call us" }));
  assert.equal(out(r)[0]["Regular price"], "");
  assert.ok(r.notes.some((n) => /no usable price/.test(n)));
});

test("inventory: tracked quantity, untracked, and continue selling", () => {
  const rows = out(convert(shop(
    { ...simple, "Variant Inventory Tracker": "shopify", "Variant Inventory Qty": "7" },
    { ...simple, Handle: "b", "Variant SKU": "B", "Variant Inventory Tracker": "shopify", "Variant Inventory Qty": "0" },
    { ...simple, Handle: "c", "Variant SKU": "C", "Variant Inventory Tracker": "shopify", "Variant Inventory Qty": "0", "Variant Inventory Policy": "continue" },
    { ...simple, Handle: "d", "Variant SKU": "D" },
  )));
  assert.deepEqual(rows.map((x) => [x.Stock, x["In stock?"], x["Backorders allowed?"]]), [["7", "1", "0"], ["0", "0", "0"], ["0", "1", "1"], ["", "1", "0"]]);
});

test("grams become kilograms; taxable and shipping flags map", () => {
  const rows = out(convert(shop({ ...simple, "Variant Grams": "1250", "Variant Taxable": "FALSE", "Variant Requires Shipping": "FALSE" })));
  assert.equal(rows[0]["Weight (kg)"], "1.25");
  assert.equal(rows[0]["Tax status"], "none");
  assert.equal(rows[0].Type, "simple, virtual");
});

test("a variant with no SKU, or a repeated SKU, gets a generated unique SKU and a note", () => {
  const r = convert(shop(
    { Handle: "tee", Title: "Tee", "Option1 Name": "Size", "Option1 Value": "S", "Variant SKU": "TEE", "Variant Price": "9" },
    { Handle: "tee", "Option1 Value": "M", "Variant SKU": "TEE", "Variant Price": "9" },
    { Handle: "tee", "Option1 Value": "L", "Variant Price": "9" },
  ));
  const skus = out(r).map((x) => x.SKU);
  assert.equal(new Set(skus).size, skus.length);
  assert.deepEqual(skus, ["TEE-PARENT", "TEE", "TEE-M", "TEE-L"]);
  assert.equal(r.stats.skuGenerated, 2);
  assert.equal(r.notes.filter((n) => /generated/.test(n)).length, 2);
});

test("images are ordered by Image Position and variant images go on the variation", () => {
  const rows = out(convert(shop(
    { Handle: "p", Title: "P", "Option1 Name": "Color", "Option1 Value": "Red", "Variant SKU": "R", "Variant Price": "1", "Image Src": "https://x.com/two.jpg", "Image Position": "2", "Variant Image": "https://x.com/red.jpg" },
    { Handle: "p", "Option1 Value": "Blue", "Variant SKU": "B", "Variant Price": "1" },
    { Handle: "p", "Image Src": "https://x.com/one.jpg", "Image Position": "1" },
  )));
  assert.equal(rows[0].Images, "https://x.com/one.jpg, https://x.com/two.jpg");
  assert.equal(rows[1].Images, "https://x.com/red.jpg");
  assert.equal(rows.length, 3);
});

test("draft and archived products become unpublished with a note", () => {
  const r = convert(shop({ ...simple, Status: "draft" }, { ...simple, Handle: "z", "Variant SKU": "Z", Status: "archived" }));
  assert.deepEqual(out(r).map((x) => x.Published), ["0", "0"]);
  assert.equal(r.notes.filter((n) => /imported as a draft/.test(n)).length, 2);
});

test("attribute values with commas are escaped", () => {
  const rows = out(convert(shop(
    { Handle: "p", Title: "P", "Option1 Name": "Pack", "Option1 Value": "Small, 3 pcs", "Variant SKU": "A", "Variant Price": "1" },
    { Handle: "p", "Option1 Value": "Large", "Variant SKU": "B", "Variant Price": "1" },
  )));
  assert.equal(rows[0]["Attribute 1 value(s)"], "\"Small\\, 3 pcs, Large\"".slice(1, -1));
});

test("two options become two attributes; tags and categories carry over", () => {
  const rows = out(convert(shop(
    { Handle: "p", Title: "P", Type: "Shirts", Tags: "a, b", "Option1 Name": "Size", "Option1 Value": "S", "Option2 Name": "Color", "Option2 Value": "Red", "Variant SKU": "1", "Variant Price": "1" },
    { Handle: "p", "Option1 Value": "M", "Option2 Value": "Red", "Variant SKU": "2", "Variant Price": "1" },
  )));
  assert.equal(rows[0]["Attribute 2 name"], "Color");
  assert.equal(rows[2]["Attribute 2 value(s)"], "Red");
  assert.equal(rows[0].Categories, "Shirts");
  assert.equal(rows[0].Tags, "a, b");
});

test("semicolon files and BOMs are read", () => {
  const t = "﻿" + "Handle;Title;Variant SKU;Variant Price\nmug;Mug;M;5.00\n";
  const r = convert(t);
  assert.equal(r.error, null);
  assert.equal(out(r)[0].SKU, "M");
  assert.ok(r.notes.some((n) => /semicolon/.test(n)));
});

test("bad input is refused with a reason", () => {
  assert.equal(convert("").error, "The file is empty.");
  assert.match(convert("Foo,Bar\n1,2\n").error, /no "Handle" column/);
  assert.match(convert('Handle,Title\n"a,b').error, /never closed/);
});

test("notes export as CSV", () => {
  const r = convert(shop({ ...simple, Status: "draft" }));
  assert.match(notesCsv(r), /^note\r\n/);
});
