import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const file = (head, ...rows) => toCsv([head, ...rows]);
const H = ["Handle", "Option1 Name", "Option1 Value", "SKU", "Location", "On hand (current)", "On hand (new)"];
const row = (handle, sku, loc, cur, next, ov = "Default Title") => [handle, "Title", ov, sku, loc, cur, next];

test("clean example has no errors or warnings, broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.rows, 3);
  assert.equal(good.summary.withNewQty, 2);
  assert.equal(good.summary.unchanged, 1);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error"));
  assert.ok(bad.findings.some((f) => f.severity === "warning"));
});

test("parser handles quotes, embedded newlines and reports lines", () => {
  const p = parseCsv('a,b\n"x, ""y""","l1\nl2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "l1\nl2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("empty file, no Handle, no quantity column, unterminated quote", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("Title,SKU\nA,B\n")).includes("missing-column"));
  assert.ok(codes(validate("Handle,Location\na,Main\n")).includes("missing-column"));
  assert.equal(validate('Handle,Title\n"a,1\n').findings[0].code, "quote");
});

test("near-miss quantity header is a warning and is still read", () => {
  const r = validate("Handle,Location,Quantity\na-b,Main,5\n");
  assert.ok(codes(r).includes("near-header"));
  assert.ok(!codes(r).includes("missing-column"));
  assert.equal(closestColumn("Locaton"), "Location");
});

test("legacy Available (new) header is accepted", () => {
  const r = validate("Handle,Location,Available (new)\na-b,Main,5\n");
  assert.ok(!codes(r).includes("missing-column"));
  assert.ok(!codes(r).includes("near-header"));
});

test("quantities: text, fractions, thousands, negative, blank", () => {
  const r = validate(file(H,
    row("a", "S1", "Main", "5", "12 pcs"),
    row("b", "S2", "Main", "5", "7.5"),
    row("c", "S3", "Main", "5", "1,200"),
    row("d", "S4", "Main", "5", "-3"),
    row("e", "S5", "Main", "5", "")));
  assert.ok(codes(r).includes("qty-nan"));
  assert.ok(codes(r).includes("qty-fraction"));
  assert.ok(codes(r).includes("qty-thousands"));
  assert.ok(codes(r).includes("qty-negative"));
  assert.equal(r.summary.unchanged, 1);
});

test("a tenfold jump is flagged, a small one is not", () => {
  assert.ok(codes(validate(file(H, row("a", "S", "Main", "40", "400")))).includes("qty-jump"));
  assert.ok(!codes(validate(file(H, row("a", "S", "Main", "4", "40")))).includes("qty-jump"));
});

test("same variant and location twice is an error; different location is fine", () => {
  const dup = validate(file(H, row("a", "S", "Main", "1", "2"), row("A", "S", "main", "1", "3")));
  assert.equal(dup.findings.find((f) => f.code === "dup-row").line, 3);
  assert.ok(!codes(validate(file(H, row("a", "S", "Main", "1", "2"), row("a", "S", "Shop", "1", "3")))).includes("dup-row"));
  assert.ok(!codes(validate(file(H, row("a", "S1", "Main", "1", "2", "Red"), row("a", "S2", "Main", "1", "3", "Blue")))).includes("dup-row"));
});

test("handle shape, missing handle, missing location, location spelled two ways", () => {
  const r = validate(file(H, row("Blue Mug", "S", "Main", "1", "2"), row("", "S", "Main", "1", "2"), row("ok", "S", "", "1", "2"), row("ok2", "S", "MAIN", "1", "2")));
  assert.ok(codes(r).includes("handle-shape"));
  assert.ok(codes(r).includes("no-handle"));
  assert.ok(codes(r).includes("no-location-value"));
  assert.ok(codes(r).includes("location-case"));
});

test("Excel damage in SKU and quantity", () => {
  const r = validate(file(H, row("a", "4.01E+12", "Main", "1", "2"), row("b", "S", "Main", "1", "#REF!")));
  assert.ok(codes(r).includes("sku-excel"));
  assert.ok(codes(r).includes("excel-error"));
});

test("a file with no quantities to apply says so", () => {
  assert.ok(codes(validate(file(H, row("a", "S", "Main", "1", "")))).includes("nothing-to-apply"));
});

test("an unquoted comma in a cell shifts the row and is an error", () => {
  assert.ok(codes(validate("Handle,Title,Location,On hand (new)\na,Mug, large,Main,5\n")).includes("extra-cells"));
});

test("semicolon file is reported and repaired", () => {
  const text = "Handle;Location;On hand (new)\na;Main;5\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  assert.match(repair(text).text, /^Handle,Location,On hand \(new\)\r\n/);
});

test("safe fixes trim and spell headers but never change a quantity's value", () => {
  const out = repair("handle,location,on hand (new)\n a-b ,Main , 5.0 \nc,Main,1200\nd,Main,1,200\n");
  assert.match(out.text, /^Handle,Location,On hand \(new\)\r\n/);
  assert.match(out.text, /a-b,Main,5\r\n/);
  assert.match(out.text, /c,Main,1200\r\n/);
  const odd = repair(file(H, row("a", "S", "Main", "1", "7.5"), row("b", "S", "Main", "1", "-3"), row("c", "S", "Main", "1", "12 pcs")));
  assert.match(odd.text, /,7\.5\r\n/);
  assert.match(odd.text, /,-3\r\n/);
  assert.match(odd.text, /,12 pcs\r\n/);
  assert.equal(repair("").error, "The file is empty.");
});

test("findings CSV round-trips and COLUMNS match the sample header", () => {
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,code,title,detail/);
  const head = sampleFile().split("\r\n")[0];
  for (const c of COLUMNS) assert.ok(head.includes(c), c);
});
