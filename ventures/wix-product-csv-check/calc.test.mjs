import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS } from "./calc.mjs";

const file = (...rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const P = { handleId: "mug", fieldType: "Product", name: "Mug", description: "A mug.", productImageUrl: "https://example.com/a.jpg", price: "10.00", visible: "TRUE", inventory: "InStock" };
const WITH_SIZE = { ...P, productOptionName1: "Size", productOptionType1: "DROP_DOWN", productOptionDescription1: "S;M" };
const V = (choice, extra = {}) => ({ handleId: "mug", fieldType: "Variant", productOptionName1: "Size", productOptionDescription1: choice, ...extra });

test("the clean example has no errors or warnings, the broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.products, 2);
  assert.equal(good.summary.variants, 6);
  assert.equal(good.summary.groups[0].variants, 6);
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

test("empty file, missing key columns and unterminated quote stop early", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("name,price\nA,1\n")).includes("missing-column"));
  assert.equal(validate('handleId,fieldType\n"A,1\n').findings[0].code, "quote");
});

test("semicolon files are reported and repaired", () => {
  const text = "handleId;fieldType;name;price\nmug;Product;Mug;10\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  const fixed = repair(text);
  assert.match(fixed.text, /^handleId,fieldType,name,price\r\n/);
  assert.match(fixed.changes[0], /semicolon/);
});

test("headers: duplicates, wrong case and unknown columns", () => {
  const r = validate("handleId,fieldType,name,price,PRICE,Handleid,discountMod\nm,Product,A,1,1,x,x\n");
  assert.ok(codes(r).includes("dup-header"));
  assert.ok(codes(r).includes("header-case"));
  assert.equal(r.findings.find((f) => f.code === "unknown-header").detail.includes('"discountMode"'), true);
  assert.equal(closestColumn("producOptionName1"), "productOptionName1");
});

test("fieldType and handleId", () => {
  assert.ok(codes(validate(file({ ...P, fieldType: "Item" }))).includes("field-type"));
  assert.ok(codes(validate(file({ ...P, fieldType: "product" }))).includes("field-type-case"));
  assert.ok(codes(validate(file({ ...P, handleId: "" }))).includes("handle-blank"));
  assert.ok(codes(validate(file(P, { ...P, name: "Other" }))).includes("dup-handle"));
});

test("product name: required, length limit, capitals", () => {
  assert.ok(codes(validate(file({ ...P, name: "" }))).includes("name-blank"));
  assert.ok(codes(validate(file({ ...P, name: "A".repeat(81) }))).includes("name-length"));
  assert.ok(!codes(validate(file({ ...P, name: "A".repeat(80) }))).includes("name-length"));
  assert.ok(codes(validate(file({ ...P, name: "HANDMADE CERAMIC MUG" }))).includes("name-caps"));
});

test("price, surcharge, weight, visible, inventory", () => {
  assert.ok(codes(validate(file({ ...P, price: "$10" }))).includes("price-format"));
  assert.ok(codes(validate(file({ ...P, price: "" }))).includes("price-blank"));
  assert.ok(codes(validate(file({ ...P, weight: "2kg" }))).includes("weight"));
  assert.ok(codes(validate(file({ ...P, visible: "yes" }))).includes("visible"));
  assert.equal(validate(file({ ...P, visible: "true" })).findings.find((f) => f.code === "visible").severity, "warning");
  assert.ok(codes(validate(file({ ...P, inventory: "In stock" }))).includes("inventory"));
  assert.ok(codes(validate(file({ ...P, inventory: "3.5" }))).includes("inventory"));
  assert.ok(!codes(validate(file({ ...P, inventory: "40" }))).includes("inventory"));
  assert.ok(codes(validate(file({ ...P, surcharge: "2" }))).includes("surcharge-on-product"));
});

test("discounts: mode, value and percent cap", () => {
  assert.ok(codes(validate(file({ ...P, discountMode: "OFF", discountValue: "5" }))).includes("discount-mode"));
  assert.ok(codes(validate(file({ ...P, discountMode: "PERCENT", discountValue: "10%" }))).includes("discount-value"));
  assert.ok(codes(validate(file({ ...P, discountValue: "10" }))).includes("discount-orphan"));
  assert.ok(codes(validate(file({ ...P, discountMode: "PERCENT" }))).includes("discount-blank"));
  assert.ok(codes(validate(file({ ...P, discountMode: "PERCENT", discountValue: "101" }))).includes("discount-percent"));
  assert.ok(!codes(validate(file({ ...P, discountMode: "AMOUNT", discountValue: "101" }))).includes("discount-percent"));
});

test("images are semicolon-separated web addresses", () => {
  assert.ok(codes(validate(file({ ...P, productImageUrl: "mug.jpg" }))).includes("image-url"));
  const r = validate(file({ ...P, productImageUrl: "https://example.com/a.jpg;mug2.jpg" }));
  assert.equal(r.findings.filter((f) => f.code === "image-url").length, 1);
  assert.ok(!codes(validate(file({ ...P, productImageUrl: "https://example.com/a.jpg;https://example.com/b.jpg" }))).includes("image-url"));
});

test("options on the product row: type, values, separators, duplicates", () => {
  assert.ok(codes(validate(file({ ...WITH_SIZE, productOptionType1: "SWATCH" }))).includes("option-type"));
  assert.equal(validate(file({ ...WITH_SIZE, productOptionType1: "drop down" })).findings.find((f) => f.code === "option-type").severity, "warning");
  assert.ok(codes(validate(file({ ...WITH_SIZE, productOptionDescription1: "" }))).includes("option-values"));
  assert.ok(codes(validate(file({ ...WITH_SIZE, productOptionDescription1: "S,M,L" }))).includes("option-comma"));
  assert.ok(codes(validate(file({ ...WITH_SIZE, productOptionDescription1: "S;s" }))).includes("option-dup-choice"));
  assert.ok(codes(validate(file({ ...WITH_SIZE, productOptionName1: "" }))).includes("option-name"));
  assert.ok(codes(validate(file({ ...WITH_SIZE, productOptionName2: "size", productOptionType2: "DROP_DOWN", productOptionDescription2: "x" }))).includes("option-dup-name"));
});

test("variants: orphan, unknown choice, duplicates, several choices, missing choice", () => {
  assert.ok(codes(validate(file(V("S")))).includes("orphan-variant"));
  const ok = validate(file(WITH_SIZE, V("S"), V("M")));
  assert.deepEqual(ok.findings.filter((f) => f.severity !== "info"), []);
  const unknown = validate(file(WITH_SIZE, V("XL")));
  assert.equal(unknown.findings.find((f) => f.code === "variant-unknown-choice").line, 3);
  assert.ok(codes(validate(file(WITH_SIZE, V("S"), V("s")))).includes("dup-variant"));
  assert.ok(codes(validate(file(WITH_SIZE, V("S;M")))).includes("variant-multi"));
  assert.ok(codes(validate(file(WITH_SIZE, V("")))).includes("variant-choice-blank"));
  assert.ok(codes(validate(file(WITH_SIZE))).includes("no-variants"));
  assert.ok(codes(validate(file(WITH_SIZE, V("S", { surcharge: "$4" })))).includes("surcharge-format"));
  assert.ok(!codes(validate(file(WITH_SIZE, V("S", { surcharge: "-2.50" })))).includes("surcharge-format"));
});

test("SKU: scientific notation and repeats", () => {
  assert.ok(codes(validate(file({ ...P, sku: "1.23457E+12" }))).includes("sci-sku"));
  const d = validate(file({ ...P, sku: "A" }, { ...P, handleId: "cup", name: "Cup", sku: "A" }));
  assert.equal(d.findings.find((f) => f.code === "dup-sku").line, 3);
});

test("extra cells from an unquoted comma are an error with the line", () => {
  const r = validate("handleId,fieldType,name,price\nm,Product,A mug, large,10\n");
  assert.equal(r.findings.find((f) => f.code === "extra-cells").line, 2);
});

test("repair changes only formatting and lists each change", () => {
  const input = file({ ...WITH_SIZE, fieldType: "product", price: "$1,299.00", visible: "true", discountMode: "percent", discountValue: "5", inventory: "instock", productOptionType1: "drop down", sku: " X1 ", name: "  Keep My Words  " });
  const r = repair(input);
  assert.equal(r.error, null);
  const out = parseCsv(r.text).rows[1].cells;
  const col = (n) => out[COLUMNS.indexOf(n)];
  assert.equal(col("fieldType"), "Product");
  assert.equal(col("price"), "1299.00");
  assert.equal(col("visible"), "TRUE");
  assert.equal(col("discountMode"), "PERCENT");
  assert.equal(col("inventory"), "InStock");
  assert.equal(col("productOptionType1"), "DROP_DOWN");
  assert.equal(col("sku"), "X1");
  assert.equal(col("name"), "  Keep My Words  ");
  assert.equal(col("productOptionDescription1"), "S;M");
  assert.ok(r.changes.length >= 7);
  assert.deepEqual(repair(sampleFile()).changes, []);
});

test("the broken example's safe fixes leave its real faults in place", () => {
  const fixed = repair(sampleBrokenFile());
  const after = validate(fixed.text);
  assert.ok(codes(after).includes("variant-unknown-choice"));
  assert.ok(codes(after).includes("name-length"));
  assert.ok(!codes(after).includes("price-format"));
  assert.ok(!codes(after).includes("field-type-case"));
});

test("findings CSV round trips", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  const rows = parseCsv(csv).rows;
  assert.deepEqual(rows[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.ok(rows.length > 10);
});
