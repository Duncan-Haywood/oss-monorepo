import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, gtinValid, paddedUpc, decodeBuffer, canonHeader, closestColumn, findingsCsv, sampleFile, sampleBrokenFile } from "./calc.mjs";

const H = ["*Action(SiteID=US|Country=US|Currency=USD|Version=1193)", "*Category", "*Title", "*ConditionID", "PicURL", "*Quantity", "*Format", "*StartPrice", "*Duration", "CustomLabel", "UPC", "ItemID", "Description"];
const K = ["Action", "Category", "Title", "ConditionID", "PicURL", "Quantity", "Format", "StartPrice", "Duration", "CustomLabel", "UPC", "ItemID", "Description"];
const file = (...rows) => toCsv([H, ...rows.map((o) => K.map((k) => o[k] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const ok = { Action: "Add", Category: "26395", Title: "Soy Candle 8 oz", ConditionID: "1000", PicURL: "https://x.test/a.jpg", Quantity: "5", Format: "FixedPrice", StartPrice: "10.00", Duration: "GTC", CustomLabel: "A-1", UPC: "012345678905" };

test("the clean example has no errors or warnings, the broken one has both", () => {
  assert.deepEqual(validate(sampleFile()).findings.filter((f) => f.severity !== "info"), []);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error") && bad.findings.some((f) => f.severity === "warning"));
});

test("header cleanup: required star and site clause are ignored", () => {
  assert.equal(canonHeader("*Action(SiteID=US|Country=US|Currency=USD|Version=1193)"), "action");
  assert.equal(canonHeader(" *Start Price "), "startprice");
  assert.equal(closestColumn("Custom Lable"), "CustomLabel");
});

test("a clean single row passes", () => {
  assert.deepEqual(validate(file(ok)).findings, []);
});

test("GTIN and padded UPC", () => {
  assert.ok(gtinValid("012345678905") && gtinValid("4006381333931"));
  assert.ok(!gtinValid("012345678906"));
  assert.equal(paddedUpc("12345678905"), "012345678905");
  assert.equal(paddedUpc("12345678906"), null);
});

test("UPC, EAN and Does not apply", () => {
  assert.ok(codes(validate(file({ ...ok, UPC: "12345678905" }))).includes("upc-short"));
  assert.ok(codes(validate(file({ ...ok, UPC: "012345678906" }))).includes("upc-check"));
  assert.ok(codes(validate(file({ ...ok, UPC: "1.23457E+11" }))).includes("sci-upc"));
  assert.deepEqual(codes(validate(file({ ...ok, UPC: "Does not apply" }))), []);
});

test("title length, caps and punctuation", () => {
  assert.ok(codes(validate(file({ ...ok, Title: "x".repeat(81) }))).includes("title-length"));
  assert.ok(!codes(validate(file({ ...ok, Title: "x".repeat(80) }))).includes("title-length"));
  assert.ok(codes(validate(file({ ...ok, Title: "SOY CANDLE AMBER SANDALWOOD" }))).includes("title-caps"));
  assert.ok(codes(validate(file({ ...ok, Title: "Great candle!!!" }))).includes("title-punct"));
});

test("action rules: unknown, case, and revise needs an id", () => {
  assert.ok(codes(validate(file({ ...ok, Action: "Cancel" }))).includes("action"));
  assert.ok(codes(validate(file({ ...ok, Action: "add" }))).includes("action-case"));
  assert.ok(codes(validate(file({ ...ok, Action: "Revise", CustomLabel: "" }))).includes("itemid-blank"));
  assert.ok(!codes(validate(file({ ...ok, Action: "Revise", ItemID: "123456789012" }))).includes("itemid-blank"));
  assert.ok(codes(validate(file({ ...ok, Action: "Revise", ItemID: "1.23457E+11" }))).includes("sci-itemid"));
});

test("format and duration agree", () => {
  assert.ok(codes(validate(file({ ...ok, Format: "Auction", Quantity: "1", Duration: "GTC" }))).includes("duration"));
  assert.ok(codes(validate(file({ ...ok, Duration: "Days_8" }))).includes("duration"));
  assert.ok(codes(validate(file({ ...ok, Format: "Auction", Duration: "Days_7", Quantity: "3" }))).includes("auction-quantity"));
  assert.deepEqual(codes(validate(file({ ...ok, Format: "Auction", Duration: "Days_7", Quantity: "1" }))), []);
  assert.ok(codes(validate(file({ ...ok, Format: "Fixed" }))).includes("format"));
});

test("price and quantity", () => {
  assert.ok(codes(validate(file({ ...ok, StartPrice: "$10.00" }))).includes("price-format"));
  assert.ok(codes(validate(file({ ...ok, StartPrice: "0" }))).includes("price-zero"));
  assert.ok(codes(validate(file({ ...ok, Quantity: "-1" }))).includes("quantity"));
  assert.ok(codes(validate(file({ ...ok, Quantity: "2.5" }))).includes("quantity"));
  assert.ok(codes(validate(file({ ...ok, Quantity: "" }))).includes("quantity-blank"));
});

test("pictures: pipe separator, https, local paths, count", () => {
  assert.ok(codes(validate(file({ ...ok, PicURL: "https://x.test/a.jpg,https://x.test/b.jpg" }))).includes("pic-separator"));
  assert.ok(codes(validate(file({ ...ok, PicURL: "http://x.test/a.jpg" }))).includes("pic-http"));
  assert.ok(codes(validate(file({ ...ok, PicURL: "C:\\photos\\a.jpg" }))).includes("pic-url"));
  const many = Array.from({ length: 13 }, (_, i) => `https://x.test/${i}.jpg`).join("|");
  assert.ok(codes(validate(file({ ...ok, PicURL: many }))).includes("pic-count"));
  assert.deepEqual(codes(validate(file({ ...ok, PicURL: "https://x.test/a.jpg|https://x.test/b.jpg" }))), []);
});

test("description active content and external links", () => {
  assert.ok(codes(validate(file({ ...ok, Description: "<p>Hi</p><script>alert(1)</script>" }))).includes("active-content"));
  assert.ok(codes(validate(file({ ...ok, Description: '<img src="x" onerror="x()">' }))).includes("active-content"));
  assert.ok(codes(validate(file({ ...ok, Description: '<a href="https://myshop.example/">shop</a>' }))).includes("external-link"));
  assert.ok(!codes(validate(file({ ...ok, Description: '<a href="https://www.ebay.com/str/x">store</a>' }))).includes("external-link"));
});

test("structure: semicolons, UTF-16, unterminated quote, extra cells, duplicate header", () => {
  const semi = file(ok).replace(/,/g, ";");
  assert.ok(codes(validate(semi)).includes("delimiter"));
  assert.ok(codes(validate("a\u0000b")).includes("utf16"));
  assert.ok(codes(validate('*Action,Title\nAdd,"oops')).includes("quote"));
  assert.ok(codes(validate("*Action,Title\nAdd,A,B\n")).includes("extra-cells"));
  assert.ok(codes(validate("*Action,Action,Title\nAdd,Add,T\n")).includes("dup-header"));
  assert.ok(codes(validate("")).includes("empty"));
});

test("missing and unknown columns", () => {
  assert.ok(codes(validate("Title\nx\n")).includes("missing-column"));
  assert.ok(codes(validate("*Action,Title,Custm\nAdd,T,1\n")).includes("unknown-header"));
  assert.ok(codes(validate("*Action,Title\nAdd,T\n")).includes("action-header"));
});

test("UTF-16 decoding and parser line numbers", () => {
  const u16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x2c, 0x00, 0x42, 0x00]);
  assert.equal(decodeBuffer(u16), "A,B");
  const p = parseCsv('a,b\n"x\ny",z\nq,r\n');
  assert.deepEqual(p.rows.map((r) => r.line), [1, 2, 4]);
});

test("repair: delimiter, spaces, price, zero, case, and nothing else", () => {
  const src = file({ ...ok, Action: "add", Format: "fixedprice", StartPrice: "$1,299.00", CustomLabel: " A-1 ", UPC: "12345678905", Quantity: "5.0", Title: "Keep my WORDS exactly" }).replace(/,/g, ";").replace(/1;299/, "1,299");
  const r = repair(src);
  assert.equal(r.error, null);
  const out = parseCsv(r.text).rows[1].cells;
  assert.equal(out[0], "Add"); assert.equal(out[6], "FixedPrice"); assert.equal(out[7], "1299.00");
  assert.equal(out[9], "A-1"); assert.equal(out[10], "012345678905"); assert.equal(out[5], "5");
  assert.equal(out[2], "Keep my WORDS exactly");
  assert.ok(r.changes.length >= 6);
});

test("repair never invents a UPC zero without a check digit, and reports quotes", () => {
  const r = repair(file({ ...ok, UPC: "12345678906" }));
  assert.equal(parseCsv(r.text).rows[1].cells[10], "12345678906");
  assert.ok(repair('*Action,Title\nAdd,"x').error);
  assert.equal(repair("").error, "The file is empty.");
});

test("a repaired broken sample has fewer errors than the original", () => {
  const before = validate(sampleBrokenFile()).findings.filter((f) => f.severity === "error").length;
  const after = validate(repair(sampleBrokenFile()).text).findings.filter((f) => f.severity === "error").length;
  assert.ok(after < before);
});

test("findings CSV has a header and one row per finding", () => {
  const r = validate(sampleBrokenFile());
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
});
