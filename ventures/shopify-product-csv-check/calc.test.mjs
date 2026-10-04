import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, sampleFile, sampleBrokenFile, gtinProblem, closestColumn, slugify, findingsCsv, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const hdr = COLUMNS.join(",");
const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const row = (o) => COLUMNS.map((c) => q(o[c] ?? "")).join(",");
const file = (...rows) => [hdr, ...rows.map(row)].join("\n");
const ok = { Handle: "a", Title: "A", "Variant Price": "1.00" };

test("the clean sample has no findings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.products, 2);
  assert.equal(r.summary.variants, 3);
  assert.equal(r.summary.images, 3);
});

test("the broken sample trips the headline faults", () => {
  const c = codes(validate(sampleBrokenFile()));
  for (const want of ["price-format", "image-space", "dup-variant", "sci-sku", "title-blank", "split-product", "compare-at", "barcode", "html-balance", "image-url", "qty-untracked", "handle-format"]) assert.ok(c.includes(want), want);
});

test("parseCsv handles quotes, doubled quotes and newlines in cells, with start lines", () => {
  const { rows } = parseCsv('a,b\n"x, y","he said ""hi""\nover two lines"\nz,1\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].cells[0], "x, y");
  assert.equal(rows[1].cells[1], 'he said "hi"\nover two lines');
  assert.equal(rows[2].line, 4);
});

test("an unterminated quote is reported with its line and stops the run", () => {
  const r = validate(`${hdr}\n"a,b`);
  assert.deepEqual(codes(r), ["quote"]);
  assert.equal(r.findings[0].line, 2);
});

test("semicolon files are flagged and repaired to commas", () => {
  const t = "Handle;Title;Variant Price\na;A;1.00\n";
  assert.ok(codes(validate(t)).includes("delimiter"));
  const f = repair(t);
  assert.equal(f.text, "Handle,Title,Variant Price\r\na,A,1.00\r\n");
});

test("missing Handle column is an error", () => {
  assert.ok(codes(validate("Title,Variant Price\nA,1\n")).includes("no-handle"));
});

test("unknown header suggests the nearest real column", () => {
  const r = validate("Handle,Title,Varient Price\na,A,1\n");
  const f = r.findings.find((x) => x.code === "unknown-header");
  assert.match(f.detail, /Variant Price/);
  assert.equal(closestColumn("Cost Per Item"), "Cost per item");
  assert.equal(closestColumn("zzzz qqqq"), null);
});

test("metafield and Google Shopping columns are accepted", () => {
  const r = validate("Handle,Title,Google Shopping / Gender,Care (product.metafields.custom.care)\na,A,male,wash\n");
  assert.ok(!codes(r).includes("unknown-header"));
});

test("a row with too many cells (unquoted comma) is an error", () => {
  const r = validate(`${hdr}\na,A,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,extra,extra`);
  assert.ok(codes(r).includes("extra-cells"));
});

test("blank handle is an error and blank rows are only info", () => {
  const r = validate(file(ok, { Title: "x" }) + "\n,,,\n");
  assert.ok(codes(r).includes("blank-handle"));
});

test("duplicate option combination is an error naming the earlier line", () => {
  const t = file(
    { Handle: "a", Title: "A", "Option1 Name": "Size", "Option1 Value": "S", "Variant Price": "1" },
    { Handle: "a", "Option1 Value": "S", "Variant Price": "1" });
  const f = validate(t).findings.find((x) => x.code === "dup-variant");
  assert.equal(f.line, 3);
  assert.match(f.detail, /Shopify rejects/);
  assert.match(f.title, /line 2/);
});

test("option value with no option name is an error", () => {
  assert.ok(codes(validate(file({ ...ok, "Option1 Value": "S" }))).includes("option-name"));
});

test("prices: symbols, thousands commas and decimal commas are errors with the fix", () => {
  const t = file({ ...ok, "Variant Price": "$24.00" }, { Handle: "b", Title: "B", "Variant Price": "1,299.00" }, { Handle: "c", Title: "C", "Variant Price": "12,50" });
  const fs = validate(t).findings.filter((f) => f.code === "price-format");
  assert.equal(fs.length, 3);
  assert.match(fs[0].detail, /24\.00/);
  assert.match(fs[1].detail, /1299\.00/);
  assert.match(fs[2].detail, /12\.50/);
});

test("compare-at at or below price is a warning", () => {
  assert.ok(codes(validate(file({ ...ok, "Variant Price": "10", "Variant Compare At Price": "10" }))).includes("compare-at"));
  assert.ok(!codes(validate(file({ ...ok, "Variant Price": "10", "Variant Compare At Price": "12" }))).includes("compare-at"));
});

test("scientific-notation SKU and barcode are errors", () => {
  const c = codes(validate(file({ ...ok, "Variant SKU": "1.23E+11", "Variant Barcode": "4.0E+12" })));
  assert.ok(c.includes("sci-sku") && c.includes("sci-barcode"));
});

test("GTIN check digits", () => {
  assert.equal(gtinProblem("036000291452"), null);
  assert.match(gtinProblem("036000291453"), /should be 2/);
  assert.match(gtinProblem("36000291452"), /leading zero/);
  assert.equal(gtinProblem("ABC"), null);
  assert.equal(gtinProblem("4006381333931"), null);
});

test("booleans, status, tracker, policy and unit are case-checked", () => {
  const t = file({ ...ok, Published: "true", Status: "Active", "Variant Inventory Tracker": "Shopify", "Variant Inventory Policy": "Deny", "Variant Weight Unit": "KG" });
  const c = codes(validate(t));
  for (const w of ["boolean", "status", "tracker", "policy", "weight-unit"]) assert.ok(c.includes(w), w);
});

test("quantity needs a tracker; grams that look like kg are flagged", () => {
  const c = codes(validate(file({ ...ok, "Variant Inventory Qty": "5", "Variant Grams": "0.5" })));
  assert.ok(c.includes("qty-untracked") && c.includes("grams-kg"));
});

test("image URL rules: relative path, space, repeated URL, repeated position", () => {
  const t = file(
    { ...ok, "Image Src": "pic.png", "Image Position": "1" },
    { Handle: "a", "Image Src": "https://x.com/a b.png", "Image Position": "1" },
    { Handle: "a", "Image Src": "https://x.com/p.png", "Image Position": "1" },
    { Handle: "a", "Image Src": "https://x.com/p.png", "Image Position": "0" });
  const c = codes(validate(t));
  for (const w of ["image-url", "image-space", "image-pos-dup", "image-dup", "image-pos"]) assert.ok(c.includes(w), w);
});

test("duplicate SKUs across variants are one warning", () => {
  const t = file({ ...ok, "Variant SKU": "X" }, { Handle: "b", Title: "B", "Variant Price": "1", "Variant SKU": "X" });
  assert.equal(validate(t).findings.filter((f) => f.code === "dup-sku").length, 1);
});

test("non-contiguous handle rows are flagged", () => {
  const t = file(ok, { Handle: "b", Title: "B", "Variant Price": "1" }, { Handle: "a", "Option1 Name": "", "Variant Price": "2", "Image Src": "https://x.com/i.png" });
  assert.ok(codes(validate(t)).includes("split-product"));
});

test("handle format warning names the slug and collision risk", () => {
  const f = validate(file({ ...ok, Handle: "My Product!" })).findings.find((x) => x.code === "handle-format");
  assert.match(f.detail, /my-product/);
});

test("more than 250 tags is an error", () => {
  const tags = Array.from({ length: 251 }, (_, i) => `t${i}`).join(",");
  assert.ok(codes(validate(file({ ...ok, Tags: tags }))).includes("tags-count"));
});

test("BOM is tolerated; empty input is an error", () => {
  assert.deepEqual(validate("﻿" + sampleFile()).findings, []);
  assert.deepEqual(codes(validate("")), ["empty"]);
});

test("replacement characters and mojibake are warned about", () => {
  assert.ok(codes(validate(file({ ...ok, Title: "Caf�" }))).includes("encoding"));
  assert.ok(codes(validate(file({ ...ok, Title: "CafÃ© â€™s" }))).includes("mojibake"));
});

test("repair applies only safe fixes and leaves titles, SKUs and barcodes alone", () => {
  const t = file({ Handle: " My Mug ", Title: " My Mug ", "Variant SKU": " S1 ", "Variant Price": "$1,299.00", Published: "true", "Variant Inventory Tracker": "Shopify", "Variant Barcode": "1.2E+12" });
  const f = repair(t);
  assert.equal(f.error, null);
  const r = parseCsv(f.text).rows;
  const h = r[0].cells, v = r[1].cells, col = (n) => h.indexOf(n);
  assert.equal(v[col("Handle")], "my-mug");
  assert.equal(v[col("Title")], " My Mug ");
  assert.equal(v[col("Variant SKU")], "S1");
  assert.equal(v[col("Variant Price")], "1299.00");
  assert.equal(v[col("Published")], "TRUE");
  assert.equal(v[col("Variant Inventory Tracker")], "shopify");
  assert.equal(v[col("Variant Barcode")], "1.2E+12");
  assert.ok(f.changes.length >= 5);
});

test("repair will not slugify handles when two would collide", () => {
  const t = file({ ...ok, Handle: "My Mug" }, { Handle: "my-mug", Title: "B", "Variant Price": "1" });
  const f = repair(t);
  assert.ok(!f.changes.some((c) => /lowercase-hyphen/.test(c)));
});

test("repair of the broken sample makes its price faults disappear and invents nothing", () => {
  const t = sampleBrokenFile();
  const f = repair(t);
  assert.equal(f.error, null);
  const before = validate(t).findings.filter((x) => x.code === "price-format").length;
  const after = validate(f.text).findings.filter((x) => x.code === "price-format").length;
  assert.ok(before >= 2 && after === 0);
  assert.equal(parseCsv(f.text).rows.length, parseCsv(t).rows.length);
});

test("repair refuses a broken quote or a missing Handle", () => {
  assert.match(repair(`${hdr}\n"a`).error, /never closed/);
  assert.match(repair("Title\nA\n").error, /Handle/);
});

test("toCsv round-trips cells with commas, quotes and newlines", () => {
  const rows = [["a", 'b,"c"', "d\ne"]];
  assert.deepEqual(parseCsv(toCsv(rows)).rows[0].cells, rows[0]);
});

test("slugify and the findings CSV", () => {
  assert.equal(slugify("Café Au Lait — 12oz"), "cafe-au-lait-12oz");
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^severity,line,code,title,detail/);
});
