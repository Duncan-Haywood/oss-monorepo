import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, sampleFile, sampleBrokenFile, closestColumn, findingsCsv, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const hdr = ["Product Type [Non Editable]", "Product URL", "Title", "SKU", "Option Name 1", "Option Value 1", "Option Name 2", "Option Value 2", "Price", "Sale Price", "On Sale", "Stock", "Weight", "Visible", "Hosted Image URLs"];
const row = (o) => hdr.map((c) => q(o[c] ?? "")).join(",");
const file = (...rows) => [hdr.map(q).join(","), ...rows.map(row)].join("\n");
const prod = (o = {}) => ({ "Product Type [Non Editable]": "PHYSICAL", "Product URL": "tote", Title: "Tote", SKU: "T", Price: "10", Stock: "5", Visible: "Yes", "Hosted Image URLs": "https://x.com/a.jpg", ...o });
const variant = (o = {}) => ({ "Product Type [Non Editable]": "PHYSICAL", "Product URL": "tote", SKU: "T-M", "Option Value 1": "M", Price: "10", Stock: "5", Visible: "Yes", ...o });

test("the clean sample has no findings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.products, 2);
  assert.equal(r.summary.variants, 1);
  assert.equal(r.summary.images, 3);
});

test("the broken sample trips the headline faults", () => {
  const c = codes(validate(sampleBrokenFile()));
  for (const want of ["price-format", "dim-format", "dup-combo", "stock", "dup-sku", "price-blank", "flag", "sci-sku", "image-scheme", "image-sep", "title-blank", "url", "html-balance", "option-no-name", "product-type-case", "on-sale-no-price", "stock-case"]) assert.ok(c.includes(want), want);
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
  const t = "Title;Price\nA;1.00\n";
  assert.ok(codes(validate(t)).includes("delimiter"));
  const fx = repair(t);
  assert.match(fx.text, /^Title,Price\r\n/);
  assert.ok(fx.changes.some((c) => /semicolon/.test(c)));
});

test("empty input and a missing Title column are refused", () => {
  assert.deepEqual(codes(validate("")), ["empty"]);
  assert.ok(codes(validate("SKU,Price\nA,1\n")).includes("no-title"));
});

test("a blank-title row with the same Product URL is a variant, not a product", () => {
  const r = validate(file(prod({ "Option Name 1": "Size", "Option Value 1": "S" }), variant()));
  assert.equal(r.summary.products, 1);
  assert.equal(r.summary.variants, 1);
  assert.ok(!codes(r).includes("title-blank"));
});

test("a blank-title row under a different Product URL is a title error", () => {
  const r = validate(file(prod(), variant({ "Product URL": "other", "Option Value 1": "" })));
  assert.ok(codes(r).includes("title-blank"));
});

test("two products on one Product URL are an error", () => {
  const r = validate(file(prod(), prod({ SKU: "T2" })));
  assert.ok(codes(r).includes("dup-url"));
});

test("duplicate SKUs name every line; duplicate option combinations are errors", () => {
  const r = validate(file(prod({ "Option Name 1": "Size", "Option Value 1": "M" }), variant()));
  assert.ok(codes(r).includes("dup-combo"));
  const d = validate(file(prod({ SKU: "A" }), prod({ SKU: "A", "Product URL": "mug", Title: "Mug" })));
  assert.match(d.findings.find((f) => f.code === "dup-sku").detail, /Lines 2, 3/);
});

test("an option value with no option name is an error", () => {
  const r = validate(file(prod({ "Option Name 1": "Size", "Option Value 1": "S" }), variant({ "Option Value 2": "Red", "Option Value 1": "M" })));
  assert.ok(codes(r).includes("option-no-name"));
});

test("prices must be plain numbers; a sale not below the price is a warning", () => {
  assert.ok(codes(validate(file(prod({ Price: "$1,299.00" })))).includes("price-format"));
  assert.ok(codes(validate(file(prod({ Price: "" })))).includes("price-blank"));
  assert.ok(codes(validate(file(prod({ Price: "10", "Sale Price": "12", "On Sale": "Yes" })))).includes("sale-price"));
  assert.ok(!codes(validate(file(prod({ Price: "10", "Sale Price": "8", "On Sale": "Yes" })))).includes("sale-price"));
  assert.ok(codes(validate(file(prod({ "On Sale": "Yes" })))).includes("on-sale-no-price"));
});

test("stock accepts whole numbers and Unlimited only", () => {
  assert.ok(codes(validate(file(prod({ Stock: "lots" })))).includes("stock"));
  assert.ok(!codes(validate(file(prod({ Stock: "Unlimited" })))).includes("stock"));
  assert.ok(codes(validate(file(prod({ Stock: "unlimited" })))).includes("stock-case"));
});

test("images: separators, local paths and relative names", () => {
  assert.ok(codes(validate(file(prod({ "Hosted Image URLs": "https://x.com/a.jpg, https://x.com/b.jpg" })))).includes("image-sep"));
  assert.ok(!codes(validate(file(prod({ "Hosted Image URLs": "https://x.com/a.jpg https://x.com/b.jpg" })))).includes("image-sep"));
  assert.ok(codes(validate(file(prod({ "Hosted Image URLs": "C:\\a.jpg" })))).includes("image-scheme"));
  assert.ok(codes(validate(file(prod({ "Hosted Image URLs": "a.jpg" })))).includes("image-relative"));
});

test("scientific-notation SKUs are errors", () => {
  assert.ok(codes(validate(file(prod({ SKU: "1.23457E+12" })))).includes("sci-sku"));
});

test("header typos get a suggestion", () => {
  assert.equal(closestColumn("Hosted Image URL"), "Hosted Image URLs");
  const r = validate("Title,Wieght\nA,1\n");
  assert.ok(r.findings.find((f) => f.code === "unknown-header").detail.includes("Weight"));
});

test("a row with too many cells is an error, too few a warning", () => {
  assert.ok(codes(validate(file(prod()) + ",extra,cells")).includes("extra-cells"));
  assert.ok(codes(validate(`${hdr.join(",")}\nPHYSICAL,tote`)).includes("short-row"));
});

test("repair changes only formatting and lists every change", () => {
  const fx = repair(sampleBrokenFile());
  assert.ok(fx.changes.length >= 5);
  const after = parseCsv(fx.text).rows;
  const before = parseCsv(sampleBrokenFile()).rows;
  const keep = ["Title", "SKU", "Description", "Categories", "Tags", "Stock", "Option Value 1"].map((c) => COLUMNS.indexOf(c));
  for (let i = 1; i < before.length; i++) for (const c of keep) {
    if (COLUMNS[c] === "Stock" && /^unlimited$/i.test(before[i].cells[c])) continue;
    assert.equal(after[i].cells[c] ?? "", before[i].cells[c] ?? "");
  }
  assert.ok(fx.changes.some((c) => /\$24\.00/.test(c)));
  assert.equal(repair(sampleFile()).changes.length, 0);
});

test("repair joins comma-separated image addresses with spaces and nothing else", () => {
  const fx = repair(file(prod({ "Hosted Image URLs": "https://x.com/a.jpg, https://x.com/b.jpg" })));
  assert.match(fx.text, /https:\/\/x\.com\/a\.jpg https:\/\/x\.com\/b\.jpg/);
});

test("repair refuses a file with an unclosed quote", () => {
  assert.match(repair(`${hdr.join(",")}\n"a`).error, /unclosed quote/);
});

test("findingsCsv round-trips through parseCsv", () => {
  const r = validate(sampleBrokenFile());
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.equal(toCsv([["a", "b,c"]]), 'a,"b,c"\r\n');
});
