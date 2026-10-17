import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS } from "./calc.mjs";

const file = (...rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const ok = { TITLE: "Mug", DESCRIPTION: "A mug.", PRICE: "10.00", CURRENCY_CODE: "USD", QUANTITY: "5", TAGS: "mug,ceramic", IMAGE1: "https://example.com/a.jpg" };

test("the clean example has no errors or warnings, the broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.listings, 3);
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

test("empty file, missing title column and unterminated quote stop early", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("PRICE,QUANTITY\n1,1\n")).includes("missing-column"));
  assert.equal(validate('TITLE,PRICE\n"A,1\n').findings[0].code, "quote");
});

test("semicolon files are reported and repaired", () => {
  const text = "TITLE;PRICE;QUANTITY\nMug;10;5\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  const fixed = repair(text);
  assert.match(fixed.text, /^TITLE,PRICE,QUANTITY\r\n/);
  assert.match(fixed.changes[0], /semicolon/);
});

test("headers: duplicates, wrong case, spaces for underscores and unknown columns", () => {
  const r = validate("TITLE,title,PRICE,QUANTITY,Currency Code,TAGZ\nA,A,1,1,USD,x\n");
  assert.ok(codes(r).includes("dup-header"));
  assert.ok(codes(r).includes("header-case"));
  assert.equal(r.findings.find((f) => f.code === "unknown-header").detail.includes('"TAGS"'), true);
  assert.equal(closestColumn("Quantiy"), "QUANTITY");
});

test("title: length limit, all capitals, duplicates", () => {
  const long = "A".repeat(141);
  assert.ok(codes(validate(file({ ...ok, TITLE: long }))).includes("title-length"));
  assert.ok(!codes(validate(file({ ...ok, TITLE: "A".repeat(140) }))).includes("title-length"));
  assert.ok(codes(validate(file({ ...ok, TITLE: "HANDMADE CERAMIC MUG" }))).includes("title-caps"));
  const d = validate(file(ok, { ...ok, TITLE: "mug" }));
  assert.equal(d.findings.find((f) => f.code === "dup-title").line, 3);
});

test("tags: count, length, characters, duplicates, semicolons", () => {
  const many = Array.from({ length: 14 }, (_, i) => `tag${i}`).join(",");
  assert.ok(codes(validate(file({ ...ok, TAGS: many }))).includes("tags-count"));
  assert.ok(!codes(validate(file({ ...ok, TAGS: many.split(",").slice(0, 13).join(",") }))).includes("tags-count"));
  assert.ok(codes(validate(file({ ...ok, TAGS: "x".repeat(21) }))).includes("tag-length"));
  assert.ok(!codes(validate(file({ ...ok, TAGS: "x".repeat(20) }))).includes("tag-length"));
  assert.ok(codes(validate(file({ ...ok, TAGS: "great!,mug" }))).includes("tag-chars"));
  assert.ok(codes(validate(file({ ...ok, TAGS: "Mug,mug" }))).includes("tag-dup"));
  assert.ok(codes(validate(file({ ...ok, TAGS: "a;b;c" }))).includes("tag-semicolon"));
  assert.ok(!codes(validate(file({ ...ok, TAGS: "men's gift,hand-made" }))).includes("tag-chars"));
});

test("price, currency and quantity", () => {
  assert.ok(codes(validate(file({ ...ok, PRICE: "$10" }))).includes("price-format"));
  assert.ok(codes(validate(file({ ...ok, PRICE: "0.10" }))).includes("price-min"));
  assert.ok(codes(validate(file({ ...ok, PRICE: "" }))).includes("price-blank"));
  assert.ok(codes(validate(file({ ...ok, CURRENCY_CODE: "usd" }))).includes("currency"));
  assert.ok(codes(validate(file({ ...ok, CURRENCY_CODE: "$" }))).includes("currency"));
  assert.ok(codes(validate(file(ok, { ...ok, TITLE: "Cup", CURRENCY_CODE: "GBP" }))).includes("mixed-currency"));
  assert.ok(codes(validate(file({ ...ok, QUANTITY: "1000" }))).includes("quantity-max"));
  assert.ok(!codes(validate(file({ ...ok, QUANTITY: "999" }))).includes("quantity-max"));
  assert.ok(codes(validate(file({ ...ok, QUANTITY: "2.5" }))).includes("quantity"));
  assert.ok(codes(validate(file({ ...ok, QUANTITY: "0" }))).includes("quantity-zero"));
});

test("images: not a URL, wrong type, gap, none", () => {
  assert.ok(codes(validate(file({ ...ok, IMAGE1: "mug.jpg" }))).includes("image-url"));
  assert.ok(codes(validate(file({ ...ok, IMAGE1: "https://drive.example.com/view?id=3" }))).includes("image-type"));
  assert.ok(codes(validate(file({ ...ok, IMAGE1: "", IMAGE2: "https://example.com/b.png" }))).includes("image-gap"));
  assert.ok(codes(validate(file({ ...ok, IMAGE1: "" }))).includes("no-images"));
});

test("variations: values required, duplicates, order", () => {
  assert.ok(codes(validate(file({ ...ok, "VARIATION 1 NAME": "Size" }))).includes("variation-values"));
  assert.ok(codes(validate(file({ ...ok, "VARIATION 1 VALUES": "S,M" }))).includes("variation-label"));
  assert.ok(codes(validate(file({ ...ok, "VARIATION 1 NAME": "Size", "VARIATION 1 VALUES": "S,s" }))).includes("variation-dup"));
  assert.ok(codes(validate(file({ ...ok, "VARIATION 2 NAME": "Size", "VARIATION 2 VALUES": "S" }))).includes("variation-order"));
});

test("SKU: scientific notation and repeats", () => {
  assert.ok(codes(validate(file({ ...ok, SKU: "1.23457E+12" }))).includes("sci-sku"));
  const d = validate(file({ ...ok, SKU: "A" }, { ...ok, TITLE: "Cup", SKU: "A" }));
  assert.equal(d.findings.find((f) => f.code === "dup-sku").line, 3);
});

test("extra cells from an unquoted comma are an error with the line", () => {
  const r = validate("TITLE,PRICE,QUANTITY\nA mug, large,10,5\n");
  assert.equal(r.findings.find((f) => f.code === "extra-cells").line, 2);
});

test("repair changes only formatting and lists each change", () => {
  const input = file({ ...ok, PRICE: "$1,299.00", CURRENCY_CODE: "usd", TAGS: "a, b ,,c", SKU: " X1 ", TITLE: "  Keep My Words  " });
  const r = repair(input);
  assert.equal(r.error, null);
  const out = parseCsv(r.text).rows[1].cells;
  const col = (n) => out[COLUMNS.indexOf(n)];
  assert.equal(col("PRICE"), "1299.00");
  assert.equal(col("CURRENCY_CODE"), "USD");
  assert.equal(col("TAGS"), "a,b,c");
  assert.equal(col("SKU"), "X1");
  assert.equal(col("TITLE"), "  Keep My Words  ");
  assert.equal(col("DESCRIPTION"), "A mug.");
  assert.ok(r.changes.length >= 4);
  assert.deepEqual(repair(sampleFile()).changes, []);
});

test("findings CSV round trips", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  const rows = parseCsv(csv).rows;
  assert.deepEqual(rows[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.ok(rows.length > 5);
});
