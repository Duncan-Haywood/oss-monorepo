import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, gtinProblem, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS } from "./calc.mjs";

const H = [...COLUMNS, "Current Quantity Main Street", "New Quantity Main Street", "Tax - Sales Tax (8%)"];
const file = (...rows) => toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const item = { "Item Name": "Mug", "Variation Name": "Regular", SKU: "MUG", Price: "10.00", Archived: "N", Sellable: "Y" };

test("the clean example has no errors or warnings, the broken one has both", () => {
  const ok = validate(sampleFile());
  assert.deepEqual(ok.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(ok.summary.products, 3);
  assert.equal(ok.summary.variants, 4);
  assert.equal(ok.summary.locations, 1);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error"));
  assert.ok(bad.findings.some((f) => f.severity === "warning"));
});

test("parser handles quotes, doubled quotes, embedded newlines and reports the line", () => {
  const p = parseCsv('a,b\n"x, ""y""","line1\nline2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "line1\nline2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("empty file, missing key column and unterminated quote stop early", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.equal(validate("SKU,Price\nA,1\n").findings.at(-1).code, "no-key");
  assert.equal(validate('Item Name,SKU\n"A,1\n').findings[0].code, "quote");
});

test("semicolon files are reported and repaired", () => {
  const text = "Item Name;Variation Name;SKU;Price\nMug;Regular;M;10\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  const fixed = repair(text);
  assert.match(fixed.text, /^Item Name,Variation Name,SKU,Price\r\n/);
  assert.match(fixed.changes[0], /semicolon/);
});

test("headers: duplicates, wrong case and unknown columns with a suggestion", () => {
  const r = validate("Item Name,item name,SKU,Pirce\nMug,Mug,A,1\n");
  assert.ok(codes(r).includes("dup-header"));
  const u = r.findings.find((f) => f.code === "unknown-header");
  assert.match(u.detail, /Did you mean "Price"/);
  assert.ok(codes(validate("item name,SKU\nMug,A\n")).includes("header-case"));
  assert.equal(closestColumn("Variaton Name"), "Variation Name");
});

test("location and tax columns are accepted, with or without brackets", () => {
  const r = validate("Item Name,Price [Main],Current Quantity [Main],Tax - GST (10%)\nMug,5,3,Y\n");
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(r.summary.locations, 1);
});

test("rows with more or fewer cells than the header are reported", () => {
  assert.ok(codes(validate("Item Name,SKU\nMug,A,extra\n")).includes("extra-cells"));
  assert.ok(codes(validate("Item Name,SKU,Price\nMug,A\n")).includes("short-row"));
});

test("duplicate tokens and SKUs name the earlier line; Excel damage is an error", () => {
  const r = validate(file({ ...item, Token: "ABCDEFGHIJKLMNOPQRSTUVWX" }, { ...item, "Variation Name": "Other", Token: "ABCDEFGHIJKLMNOPQRSTUVWX" }));
  const d = r.findings.find((f) => f.code === "dup-sku");
  assert.equal(d.line, 3);
  assert.match(d.title, /line 2/);
  assert.ok(codes(r).includes("dup-token"));
  const sci = validate(file({ ...item, SKU: "1.23E+12", GTIN: "4.0E+12", Token: "1E+23" }));
  for (const c of ["sci-sku", "sci-gtin", "sci-token"]) assert.ok(codes(sci).includes(c), c);
  assert.ok(codes(validate(file({ ...item, Token: "short" }))).includes("token-shape"));
});

test("GTIN check digits are warnings", () => {
  assert.equal(gtinProblem("036000291452"), null);
  assert.match(gtinProblem("036000291453"), /should be 2/);
  assert.match(gtinProblem("03600029145"), /leading zero/);
  assert.ok(codes(validate(file({ ...item, GTIN: "036000291453" }))).includes("gtin"));
});

test("prices: format, decimal comma, sale above price, sale without price, blank is info", () => {
  assert.ok(codes(validate(file({ ...item, Price: "$1,299.00" }))).includes("price-format"));
  assert.ok(codes(validate(file({ ...item, Price: "free" }))).includes("price-format"));
  assert.ok(codes(validate(file({ ...item, "Online Sale Price": "12" }))).includes("sale-price"));
  assert.ok(codes(validate(file({ ...item, Price: "", "Online Sale Price": "2" }))).includes("sale-no-price"));
  const blank = validate(file({ ...item, Price: "" }));
  assert.equal(blank.findings.find((f) => f.code === "price-blank").severity, "info");
});

test("Y/N columns must be capitalised Y or N, and the message names the likely value", () => {
  const r = validate(file({ ...item, Archived: "yes", Sellable: "n", "Tax - Sales Tax (8%)": "true" }));
  const flags = r.findings.filter((f) => f.code === "flag" || f.code === "tax-flag");
  assert.equal(flags.length, 3);
  assert.match(flags[0].detail, /looks like Y/);
});

test("quantities, stock-alert counts, weights and conflicting stockable", () => {
  const r = validate(file({ ...item, "New Quantity Main Street": "ten", "Weight (lb)": "1,5" }));
  assert.ok(codes(r).includes("quantity"));
  assert.ok(codes(r).includes("decimal-comma"));
  assert.ok(codes(validate(file({ ...item, "Weight (lb)": "2 lb" }))).includes("weight"));
  assert.ok(codes(validate(file({ ...item, Stockable: "N", "New Quantity Main Street": "5" }))).includes("stock-conflict"));
  assert.ok(codes(validate(file({ ...item, "New Quantity Main Street": "-3" }))).includes("quantity-negative"));
});

test("multi-variation items: names required, unique, option pairs complete and unique", () => {
  const a = { ...item, SKU: "A", "Variation Name": "Small", "Option Name 1": "Size", "Option Value 1": "S" };
  const r = validate(file(a, { ...a, SKU: "B" }, { ...a, SKU: "C", "Variation Name": "", "Option Value 1": "L" }));
  assert.ok(codes(r).includes("dup-variation"));
  assert.ok(codes(r).includes("dup-options"));
  assert.ok(codes(r).includes("variation-name-blank"));
  const half = validate(file({ ...item, "Option Name 1": "Size" }, { ...item, SKU: "Z", "Item Name": "Other", "Option Value 1": "L" }));
  assert.ok(codes(half).includes("option-value"));
  assert.ok(codes(half).includes("option-name"));
  const ok = validate(file(a, { ...a, SKU: "B", "Variation Name": "Large", "Option Value 1": "L" }));
  assert.deepEqual(ok.findings.filter((f) => f.severity !== "info"), []);
});

test("items grouped by name ignoring case; categories that disagree are flagged", () => {
  const r = validate(file({ ...item, Category: "A", "Variation Name": "One" }, { ...item, "Item Name": "MUG", SKU: "M2", Category: "B", "Variation Name": "Two" }));
  assert.equal(r.summary.products, 1);
  assert.ok(codes(r).includes("category-mismatch"));
});

test("row with no name and no token is an error; a token alone is a warning", () => {
  assert.ok(codes(validate("Item Name,Token,Price\n,,5\n")).includes("name-blank"));
  assert.ok(codes(validate("Item Name,Token,Price\n,ABCDEFGHIJKLMNOPQRSTUVWX,5\n")).includes("name-blank-token"));
});

test("permalinks must be clean slugs and unique", () => {
  assert.ok(codes(validate(file({ ...item, Permalink: "Big Mug" }))).includes("permalink"));
  const r = validate(file({ ...item, Permalink: "mug" }, { ...item, "Item Name": "Cup", SKU: "C", Permalink: "mug" }));
  assert.ok(codes(r).includes("dup-permalink"));
});

test("encoding damage is reported", () => {
  assert.ok(codes(validate("Item Name,SKU\nCafé,A\n".replace("Café", "Caf�"))).includes("encoding"));
  assert.ok(codes(validate("Item Name,SKU\nCafÃ©,A\n")).includes("mojibake"));
});

test("repair changes only the safe things and lists each change", () => {
  const text = toCsv([H, ...[{ ...item, SKU: " MUG ", Price: "$1,299.00", Archived: "no", "Weight (lb)": "0,5", "Item Name": " Mug ", Description: "  keep  " }].map((o) => H.map((h) => o[h] ?? ""))]);
  const r = repair(text);
  const parsed = parseCsv(r.text).rows[1].cells;
  const get = (h) => parsed[H.indexOf(h)];
  assert.equal(get("SKU"), "MUG");
  assert.equal(get("Price"), "1299.00");
  assert.equal(get("Archived"), "N");
  assert.equal(get("Weight (lb)"), "0.5");
  assert.equal(get("Item Name"), " Mug ");
  assert.equal(get("Description"), "  keep  ");
  assert.equal(r.changes.length, 4);
  assert.equal(repair(sampleFile()).changes.length, 0);
});

test("repair refuses an unterminated quote and an empty file", () => {
  assert.ok(repair('Item Name\n"x').error);
  assert.ok(repair("  ").error);
});

test("findingsCsv round-trips severity, line and code", () => {
  const rows = parseCsv(findingsCsv(validate(sampleBrokenFile()))).rows;
  assert.deepEqual(rows[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.ok(rows.length > 5);
});
