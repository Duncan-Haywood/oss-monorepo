import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, gtinValid, paddedUpc, decodeBuffer, closestColumn, findingsCsv, sampleFile, sampleBrokenFile } from "./calc.mjs";

const H = ["sku", "product-id", "product-id-type", "price", "quantity", "item-condition", "add-delete", "item-note", "leadtime-to-ship"];
const file = (...rows) => toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const ok = { sku: "A-1", "product-id": "012345678905", "product-id-type": "3", price: "10.00", quantity: "5", "item-condition": "11", "add-delete": "a" };

test("the clean example has no errors or warnings, the broken one has both", () => {
  assert.deepEqual(validate(sampleFile()).findings.filter((f) => f.severity !== "info"), []);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error") && bad.findings.some((f) => f.severity === "warning"));
});

test("GTIN check digits: real UPC and EAN pass, a changed digit fails", () => {
  assert.ok(gtinValid("012345678905"));
  assert.ok(gtinValid("4006381333931"));
  assert.ok(gtinValid("96385074"));
  assert.ok(!gtinValid("012345678906"));
  assert.ok(!gtinValid("12345"));
});

test("an 11-digit UPC is padded only when the padded number passes its check digit", () => {
  assert.equal(paddedUpc("12345678905"), "012345678905");
  assert.equal(paddedUpc("12345678906"), null);
  assert.equal(paddedUpc("1234567890"), null);
});

test("UPC problems are reported with the right code", () => {
  assert.ok(codes(validate(file({ ...ok, "product-id": "12345678905" }))).includes("upc-short"));
  assert.ok(codes(validate(file({ ...ok, "product-id": "012345678906" }))).includes("upc-check"));
  assert.ok(codes(validate(file({ ...ok, "product-id": "0123456789" }))).includes("upc"));
  assert.ok(codes(validate(file({ ...ok, "product-id": "1.23457E+11" }))).includes("sci-pid"));
});

test("EAN, ASIN, ISBN and product-id-type", () => {
  assert.deepEqual(codes(validate(file({ ...ok, "product-id": "4006381333931", "product-id-type": "4" }))), []);
  assert.ok(codes(validate(file({ ...ok, "product-id": "4006381333932", "product-id-type": "4" }))).includes("ean-check"));
  assert.ok(codes(validate(file({ ...ok, "product-id": "B00EXAMPL", "product-id-type": "1" }))).includes("asin"));
  assert.ok(codes(validate(file({ ...ok, "product-id": "b00examplx", "product-id-type": "1" }))).includes("asin-case"));
  assert.deepEqual(codes(validate(file({ ...ok, "product-id": "0306406152", "product-id-type": "2" }))), []);
  assert.ok(codes(validate(file({ ...ok, "product-id": "0306406153", "product-id-type": "2" }))).includes("isbn"));
  assert.ok(codes(validate(file({ ...ok, "product-id-type": "" }))).includes("pid-type-blank"));
  assert.ok(codes(validate(file({ ...ok, "product-id-type": "7" }))).includes("pid-type"));
});

test("SKU: blank, too long, spaces, scientific notation, duplicates", () => {
  const c = codes(validate(file({ ...ok, sku: "" }, { ...ok, sku: "x".repeat(41) }, { ...ok, sku: " B " }, { ...ok, sku: "9.8E+11" }, { ...ok, sku: "D" }, { ...ok, sku: "D" })));
  for (const k of ["sku-blank", "sku-length", "sku-space", "sci-sku", "dup-sku"]) assert.ok(c.includes(k), k);
});

test("price and quantity formats", () => {
  const c = codes(validate(file({ ...ok, price: "$1,299.00" }, { ...ok, price: "0" }, { ...ok, quantity: "-1" }, { ...ok, quantity: "2.5" }, { ...ok, quantity: "ten" })));
  assert.equal(c.filter((x) => x === "price-format").length, 1);
  for (const k of ["price-zero", "quantity"]) assert.ok(c.includes(k), k);
  assert.equal(c.filter((x) => x === "quantity").length, 3);
});

test("min and max allowed price", () => {
  const t = toCsv([["sku", "price", "minimum-seller-allowed-price", "maximum-seller-allowed-price"], ["A", "5", "6", "20"], ["B", "30", "6", "20"], ["C", "10", "20", "6"]]);
  const c = codes(validate(t));
  for (const k of ["price-under-min", "price-over-max", "min-over-max"]) assert.ok(c.includes(k), k);
});

test("FBA offers with a quantity are noted, add-delete and condition codes", () => {
  const t = toCsv([["sku", "price", "quantity", "fulfillment-center-id", "add-delete", "condition-type", "item-condition"], ["A", "5", "3", "AMAZON_NA", "q", "NEW", ""], ["B", "5", "3", "DEFAULT", "a", "Mint", ""], ["C", "5", "3", "DEFAULT", "a", "Used", "3"]]);
  const c = codes(validate(t));
  for (const k of ["fba-quantity", "add-delete", "condition-type-case", "condition-type", "condition-note"]) assert.ok(c.includes(k), k);
});

test("handling time and note length", () => {
  const c = codes(validate(file({ ...ok, "leadtime-to-ship": "45" }, { ...ok, "item-note": "n".repeat(2001) })));
  assert.ok(c.includes("handling") && c.includes("note-length"));
});

test("comma and semicolon files are reported and converted to tabs", () => {
  const t = "sku,price,quantity\nA,10,5\n";
  assert.ok(codes(validate(t)).includes("delimiter"));
  const f = repair(t);
  assert.match(f.text, /^sku\tprice\tquantity\r\n/);
  assert.match(f.changes[0], /comma/);
  assert.ok(codes(validate("sku;price\nA;1\n")).includes("delimiter"));
});

test("headers: wrong case, underscores, unknown and missing columns", () => {
  assert.ok(codes(validate("SKU\tPrice\nA\t1\n")).includes("header-case"));
  assert.ok(codes(validate("sku\tprise\nA\t1\n")).includes("unknown-header"));
  assert.equal(closestColumn("prise"), "price");
  assert.ok(codes(validate("price\tquantity\n1\t1\n")).includes("missing-column"));
  assert.ok(codes(validate("sku\tnote\nA\tb\n")).includes("missing-column"));
  assert.ok(codes(validate("sku\tproduct-id\nA\t1\n")).includes("missing-column"));
  assert.equal(repair("SKU\tPrice\nA\t1\n").changes.length, 2);
});

test("empty file, stray tab, short row and unterminated quote", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("sku\tprice\nA\t1\t2\n")).includes("extra-cells"));
  assert.ok(codes(validate("sku\tprice\tquantity\nA\t1\n")).includes("short-row"));
  assert.equal(validate('sku\tprice\n"A\t1\n').findings[0].code, "quote");
});

test("UTF-16 text from Excel is decoded and a NUL-filled paste is flagged", () => {
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."sku\tprice\nA\t1\n"].flatMap((ch) => [ch.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16), "sku\tprice\nA\t1\n");
  assert.ok(codes(validate("s\u0000k\u0000u\u0000\tprice\nA\t1\n")).includes("utf16"));
});

test("repair changes only formatting and never an id digit unless the check digit proves it", () => {
  const r = repair(file({ ...ok, sku: " A-1 ", "product-id": "12345678905", price: "€10,50", quantity: "5.0", "add-delete": "A" }, { ...ok, sku: "B", "product-id": "12345678906" }));
  assert.equal(r.error, null);
  const back = parseCsv(r.text, "\t").rows.map((x) => x.cells);
  assert.deepEqual(back[1].slice(0, 7), ["A-1", "012345678905", "3", "10.50", "5", "11", "a"]);
  assert.equal(back[2][1], "12345678906");
  assert.deepEqual(validate(r.text).findings.filter((f) => f.code === "sku-space" || f.code === "upc-short" && f.line === 2), []);
});

test("repair refuses an unterminated quote and an empty file", () => {
  assert.ok(repair('sku\tprice\n"A\t1\n').error);
  assert.ok(repair("").error);
});

test("findings export is comma CSV with a header", () => {
  const out = findingsCsv(validate(sampleBrokenFile()));
  assert.match(out, /^severity,line,code,title,detail\r\n/);
});

test("parser handles quotes, embedded newlines and reports lines", () => {
  const p = parseCsv('a\tb\n"x\ty ""q"""\t"l1\nl2"\nz\tw\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x\ty "q"', "l1\nl2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
});
