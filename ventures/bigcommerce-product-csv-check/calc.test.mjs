import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, sampleFile, sampleBrokenFile, gtinCheck, closestColumn, findingsCsv, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const hdr = ["Item Type", "Product Name", "Product Type", "Product Code/SKU", "Option Set", "Price", "Sale Price", "Product Weight", "Current Stock Level", "Product Image File - 1", "Product Image Is Thumbnail - 1"];
const row = (o) => hdr.map((c) => q(o[c] ?? "")).join(",");
const file = (...rows) => [hdr.map(q).join(","), ...rows.map(row)].join("\n");
const prod = (o = {}) => ({ "Item Type": "Product", "Product Name": "Tote", "Product Type": "P", "Product Code/SKU": "T", Price: "10", "Product Weight": "1", ...o });
const sku = (o = {}) => ({ "Item Type": "SKU", "Product Name": "[RB]Size=M", "Product Code/SKU": "T-M", ...o });

test("the clean sample has no findings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.products, 2);
  assert.equal(r.summary.variants, 2);
  assert.equal(r.summary.images, 2);
});

test("the broken sample trips the headline faults", () => {
  const c = codes(validate(sampleBrokenFile()));
  for (const want of ["price-format", "dim-format", "image-url", "sku-dup-combo", "stock", "dup-sku", "name-blank", "price-blank", "flag", "sci-sku", "image-scheme", "category-sep", "url", "gtin", "html-balance", "sku-options-format"]) assert.ok(c.includes(want), want);
});

test("parseCsv handles quotes, doubled quotes and newlines in cells, with start lines", () => {
  const { rows } = parseCsv('a,b\n"x, y","he said ""hi""\nover two lines"\nz,1\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].cells[0], "x, y");
  assert.equal(rows[2].line, 4);
});

test("an unterminated quote is reported with its line and stops the run", () => {
  const r = validate(`${hdr.join(",")}\n"a,b`);
  assert.deepEqual(codes(r), ["quote"]);
  assert.equal(r.findings[0].line, 2);
});

test("semicolon files are flagged and repaired to commas", () => {
  const t = "Item Type;Product Name;Price\nProduct;A;1.00\n";
  assert.ok(codes(validate(t)).includes("delimiter"));
  const fx = repair(t);
  assert.match(fx.text, /^Item Type,Product Name,Price\r\n/);
  assert.ok(fx.changes.some((c) => /semicolon/.test(c)));
});

test("empty input and a missing Product Name column are refused", () => {
  assert.deepEqual(codes(validate("")), ["empty"]);
  assert.ok(codes(validate("Item Type,Price\nProduct,1\n")).includes("no-name"));
});

test("a SKU row before any product, or without an option set, is flagged", () => {
  assert.ok(codes(validate(file(sku()))).includes("sku-orphan"));
  assert.ok(codes(validate(file(prod(), sku()))).includes("sku-no-option-set"));
  assert.ok(!codes(validate(file(prod({ "Option Set": "Sizes" }), sku()))).includes("sku-no-option-set"));
});

test("duplicate SKUs name every line; duplicate option combinations are errors", () => {
  const r = validate(file(prod({ "Option Set": "S" }), sku(), sku({ "Product Code/SKU": "T-M" })));
  const d = r.findings.find((f) => f.code === "dup-sku");
  assert.match(d.detail, /Lines 3, 4/);
  assert.ok(codes(r).includes("sku-dup-combo"));
});

test("prices must be plain numbers; a sale above the price is a warning", () => {
  assert.ok(codes(validate(file(prod({ Price: "$1,299.00" })))).includes("price-format"));
  assert.ok(codes(validate(file(prod({ Price: "" })))).includes("price-blank"));
  assert.ok(codes(validate(file(prod({ Price: "10", "Sale Price": "12" })))).includes("sale-price"));
  assert.ok(!codes(validate(file(prod({ Price: "10", "Sale Price": "8" })))).includes("sale-price"));
});

test("Item Type values are checked and capitalisation is a warning only", () => {
  assert.ok(codes(validate(file(prod({ "Item Type": "Widget" })))).includes("item-type"));
  const r = validate(file(prod({ "Item Type": "product" })));
  assert.ok(r.findings.some((f) => f.code === "item-type-case" && f.severity === "warning"));
});

test("images: spaces, local paths, relative names and thumbnail counts", () => {
  assert.ok(codes(validate(file(prod({ "Product Image File - 1": "https://x.com/a b.jpg", "Product Image Is Thumbnail - 1": "Y" })))).includes("image-url"));
  assert.ok(codes(validate(file(prod({ "Product Image File - 1": "C:\\a.jpg", "Product Image Is Thumbnail - 1": "Y" })))).includes("image-scheme"));
  assert.ok(codes(validate(file(prod({ "Product Image File - 1": "a.jpg", "Product Image Is Thumbnail - 1": "Y" })))).includes("image-relative"));
  assert.ok(codes(validate(file(prod({ "Product Image File - 1": "https://x.com/a.jpg" })))).includes("no-thumb"));
});

test("gtinCheck validates check digits and the lost leading zero", () => {
  assert.equal(gtinCheck("036000291452"), null);
  assert.match(gtinCheck("036000291453"), /should be 2/);
  assert.match(gtinCheck("36000291452"), /leading zero/);
  assert.equal(gtinCheck("abc"), null);
});

test("header typos get a suggestion", () => {
  assert.equal(closestColumn("Product Wieght"), "Product Weight");
  const r = validate("Item Type,Product Name,Product Wieght\nProduct,A,1\n");
  assert.ok(r.findings.find((f) => f.code === "unknown-header").detail.includes("Product Weight"));
});

test("a row with too many cells is an error, too few a warning", () => {
  assert.ok(codes(validate(file(prod()) + ",extra,cells")).includes("extra-cells"));
  assert.ok(codes(validate(`${hdr.join(",")}\nProduct,A`)).includes("short-row"));
});

test("repair changes only formatting and lists every change", () => {
  const fx = repair(sampleBrokenFile());
  assert.ok(fx.changes.length >= 4);
  const after = parseCsv(fx.text).rows;
  const before = parseCsv(sampleBrokenFile()).rows;
  const name = COLUMNS.indexOf("Product Name"), sk = COLUMNS.indexOf("Product Code/SKU"), desc = COLUMNS.indexOf("Product Description"), cat = COLUMNS.indexOf("Category");
  for (let i = 1; i < before.length; i++) for (const c of [name, sk, desc, cat]) assert.equal(after[i].cells[c] ?? "", before[i].cells[c] ?? "");
  assert.ok(fx.changes.some((c) => /\$24\.00/.test(c)));
  assert.equal(repair(sampleFile()).changes.length, 0);
});

test("repair refuses a file with an unclosed quote", () => {
  assert.match(repair(`${hdr.join(",")}\n"a`).error, /unclosed quote/);
});

test("findingsCsv round-trips through parseCsv", () => {
  const r = validate(sampleBrokenFile());
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a", "b,c"]]), 'a,"b,c"\r\n');
});
