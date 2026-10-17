import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, sampleFile, sampleBrokenFile, gtinProblem, closestColumn, findingsCsv, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const hdr = COLUMNS.map(q).join(",");
const row = (o) => COLUMNS.map((c) => q(o[c] ?? "")).join(",");
const file = (...rows) => [hdr, ...rows.map(row)].join("\n");
const parent = { Type: "variable", SKU: "P", Name: "P", "Attribute 1 name": "Size", "Attribute 1 value(s)": "S, M" };
const kid = (sku, size, extra = {}) => ({ Type: "variation", SKU: sku, Parent: "P", "Regular price": "5", "Attribute 1 name": "Size", "Attribute 1 value(s)": size, ...extra });
const simple = { Type: "simple", SKU: "A", Name: "A", "Regular price": "1.00" };

test("the clean sample has no findings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.products, 2);
  assert.equal(r.summary.variants, 2);
  assert.equal(r.summary.images, 2);
});

test("the broken sample trips the headline faults", () => {
  const c = codes(validate(sampleBrokenFile()));
  for (const want of ["price-format", "image-space", "dup-sku", "sci-sku", "name-blank", "sale-price", "gtin", "html-balance", "image-url", "parent-missing", "decimal-comma", "date", "published", "type-case", "stock-conflict", "variation-value"]) assert.ok(c.includes(want), want);
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
  const t = "Type;SKU;Name;Regular price\nsimple;A;A;1.00\n";
  assert.ok(codes(validate(t)).includes("delimiter"));
  const fx = repair(t);
  assert.match(fx.text, /^Type,SKU,Name,Regular price\r\n/);
  assert.ok(fx.changes.some((c) => /semicolon/.test(c)));
});

test("empty input and a file with no Name, SKU or ID column are refused", () => {
  assert.deepEqual(codes(validate("")), ["empty"]);
  assert.deepEqual(codes(validate("Type,Regular price\nsimple,1\n")), ["no-key"]);
});

test("a variation whose Parent matches no row, or only differs by a space, is an error", () => {
  const miss = validate(file(parent, kid("K1", "S", { Parent: "Q" })));
  assert.ok(codes(miss).includes("parent-missing"));
  const sp = validate(file(parent, kid("K1", "S", { Parent: "P " })));
  assert.ok(!codes(sp).includes("parent-missing"));
});

test("a parent below its variation, or not of Type variable, is an error", () => {
  assert.ok(codes(validate(file(kid("K1", "S"), parent))).includes("parent-order"));
  const notVar = validate(file({ ...parent, Type: "simple" }, kid("K1", "S")));
  assert.ok(codes(notVar).includes("parent-type"));
});

test("id:NN parents are accepted when present and noted when absent", () => {
  const withId = validate(file({ ...parent, ID: "42" }, kid("K1", "S", { Parent: "id:42" })));
  assert.ok(!codes(withId).some((c) => c.startsWith("parent-")));
  const absent = validate(file(kid("K1", "S", { Parent: "id:99" })));
  assert.ok(codes(absent).includes("parent-external"));
  assert.ok(!codes(absent).includes("parent-missing"));
});

test("variation values must be among the parent's, and duplicates are caught", () => {
  const r = validate(file(parent, kid("K1", "L"), kid("K2", "S"), kid("K3", "s")));
  assert.ok(codes(r).includes("variation-value"));
  assert.ok(codes(r).includes("dup-variation"));
  const ok = validate(file(parent, kid("K1", "S"), kid("K2", "M")));
  assert.deepEqual(ok.findings, []);
});

test("a variable product with no attributes or no variations is reported", () => {
  assert.ok(codes(validate(file({ Type: "variable", SKU: "P", Name: "P" }))).includes("variable-no-attr"));
  assert.ok(codes(validate(file(parent))).includes("variable-no-variations"));
});

test("duplicate SKUs name the earlier line; duplicate IDs name both", () => {
  const r = validate(file(simple, { ...simple, Name: "B" }));
  const d = r.findings.find((f) => f.code === "dup-sku");
  assert.equal(d.line, 3);
  assert.match(d.title, /line 2/);
  assert.ok(codes(validate(file({ ...simple, ID: "7" }, { ...simple, SKU: "B", ID: "7" }))).includes("dup-id"));
});

test("scientific-notation SKUs and GTINs are errors; GTIN check digits are warnings", () => {
  const r = validate(file({ ...simple, SKU: "1.23E+12", "GTIN, UPC, EAN, or ISBN": "4.0E+12" }));
  assert.ok(codes(r).includes("sci-sku"));
  assert.ok(codes(r).includes("sci-gtin"));
  assert.equal(gtinProblem("036000291452"), null);
  assert.match(gtinProblem("036000291453"), /should be 2/);
  assert.match(gtinProblem("03600029145"), /leading zero/);
});

test("price formats, sale above regular, sale without regular, blank price", () => {
  assert.ok(codes(validate(file({ ...simple, "Regular price": "$1,299.00" }))).includes("price-format"));
  assert.ok(codes(validate(file({ ...simple, "Sale price": "2.00" }))).includes("sale-price"));
  assert.ok(codes(validate(file({ ...simple, "Regular price": "", "Sale price": "1" }))).includes("sale-no-regular"));
  assert.ok(codes(validate(file({ ...simple, "Regular price": "" }))).includes("price-blank"));
});

test("flags, enumerations and numeric columns are checked", () => {
  const r = validate(file({ ...simple, Published: "yes", "Is featured?": "2", "Visibility in catalog": "Visible", "Tax status": "yes", "Backorders allowed?": "2", "In stock?": "yes", Stock: "1.5", "Weight (kg)": "1,2" }));
  for (const c of ["published", "flag", "visibility", "tax-status", "backorders", "in-stock", "stock", "decimal-comma"]) assert.ok(codes(r).includes(c), c);
});

test("sale dates must be ISO and in order", () => {
  assert.ok(codes(validate(file({ ...simple, "Date sale price starts": "27/11/2026" }))).includes("date"));
  const r = validate(file({ ...simple, "Date sale price starts": "2026-12-01", "Date sale price ends": "2026-11-01" }));
  assert.ok(codes(r).includes("date-order"));
  assert.deepEqual(validate(file({ ...simple, "Date sale price starts": "2026-11-27", "Date sale price ends": "2026-11-30" })).findings, []);
});

test("image lists: spaces, non-URLs and repeats", () => {
  const r = validate(file({ ...simple, Images: "https://a.example/x y.jpg, photo.png, https://a.example/z.jpg, https://a.example/z.jpg" }));
  for (const c of ["image-space", "image-url", "image-dup"]) assert.ok(codes(r).includes(c), c);
});

test("external products need a URL; unknown types are errors", () => {
  assert.ok(codes(validate(file({ ...simple, Type: "external" }))).includes("external-url"));
  assert.ok(codes(validate(file({ ...simple, Type: "bundle" }))).includes("type"));
  assert.deepEqual(validate(file({ ...simple, Type: "simple, downloadable" })).findings, []);
});

test("extra cells from an unquoted comma are reported", () => {
  const r = validate(`${hdr}\nsimple,A,A,1,x,y,z,${"q,".repeat(60)}`);
  assert.ok(codes(r).includes("extra-cells"));
});

test("unknown headers suggest the nearest real one", () => {
  assert.equal(closestColumn("Regular Prise"), "Regular price");
  const r = validate("Type,SKU,Name,Regular prise\nsimple,A,A,1\n");
  assert.match(r.findings.find((f) => f.code === "unknown-header").detail, /Regular price/);
});

test("plugin meta and download columns are not flagged as unknown", () => {
  const r = validate("Type,SKU,Name,Regular price,Meta: _yoast_wpseo_title,Download 1 URL\nsimple,A,A,1,t,\n");
  assert.ok(!codes(r).includes("unknown-header"));
});

test("repair fixes only mechanical faults and lists each change", () => {
  const fx = repair(sampleBrokenFile());
  assert.equal(fx.error, null);
  assert.ok(fx.changes.length >= 5);
  const after = validate(fx.text);
  assert.ok(!codes(after).includes("published"));
  assert.ok(!codes(after).includes("decimal-comma"));
  assert.ok(!codes(after).includes("type-case"));
  // Names, SKUs, GTINs, images and stock are untouched.
  assert.ok(fx.text.includes("1.23457E+12"));
  assert.ok(fx.text.includes("036000291453"));
  assert.ok(fx.text.includes("enamel-mug.png"));
});

test("repair never touches a clean file's content", () => {
  const fx = repair(sampleFile());
  assert.deepEqual(fx.changes, []);
  assert.deepEqual(parseCsv(fx.text).rows.map((r) => r.cells), parseCsv(sampleFile()).rows.map((r) => r.cells));
});

test("findingsCsv round-trips through the parser", () => {
  const r = validate(sampleBrokenFile());
  const back = parseCsv(findingsCsv(r)).rows;
  assert.equal(back.length, r.findings.length + 1);
  assert.deepEqual(back[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.equal(toCsv([["a,b", 'c"d']]), '"a,b","c""d"\r\n');
});
