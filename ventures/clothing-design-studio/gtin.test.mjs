import test from "node:test";
import assert from "node:assert/strict";
import { checkDigit, validate, modules, barcodeSvg, assignCodes, csv, restrictedReason, labelSheetHtml } from "./gtin.mjs";

test("check digit: published examples", () => {
  assert.equal(checkDigit("400638133393"), 1);   // 4006381333931
  assert.equal(checkDigit("590123412345"), 7);   // 5901234123457
  assert.equal(checkDigit("629104150021"), 3);   // 6291041500213
});

test("validate catches a wrong digit and offers the fix", () => {
  assert.equal(validate("4006381333931").ok, true);
  assert.equal(validate("4006 3813-33931").ok, true);
  const bad = validate("4006381333932");
  assert.equal(bad.ok, false);
  assert.equal(bad.expected, "4006381333931");
  assert.equal(validate("123").ok, false);
});

test("modules: 95 wide, guards, and a hand-read digit (5901234123457)", () => {
  const m = modules("5901234123457");
  assert.equal(m.length, 95);
  assert.equal(m.slice(0, 3), "101");
  assert.equal(m.slice(45, 50), "01010");
  assert.equal(m.slice(92), "101");
  // first digit 5 -> LGGLLG: 9 in L = 0001011, 0 in G = 0100111
  assert.equal(m.slice(3, 10), "0001011");
  assert.equal(m.slice(10, 17), "0100111");
  // right-hand R-set digit 7 = 1000100 is the last digit
  assert.equal(m.slice(85, 92), "1000100");
});

test("every module string is 95 long and starts and ends with a bar", () => {
  for (let d = 0; d < 10; d++) {
    const f = String(d) + "12345678901".slice(0, 11);
    const code = f + checkDigit(f);
    const m = modules(code);
    assert.equal(m.length, 95);
    assert.ok(m.startsWith("1") && m.endsWith("1"));
  }
});

test("svg draws the bars and the human-readable digits", () => {
  const s = barcodeSvg("5901234123457");
  assert.match(s, /<svg/);
  assert.ok(s.includes(">5<") && s.includes("901234") && s.includes("123457"));
  assert.throws(() => barcodeSvg("5901234123450"));
});

test("assign: 7-digit prefix, variants numbered in order, all valid and unique", () => {
  const r = assignCodes({ prefix: "5901234", start: 1, styles: [
    { sku: "TEE", name: "Tee", colours: "Black, White", sizes: "S, M" },
    { name: "Cap" }] });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 5);
  assert.equal(r.rows[0].gtin, "5901234" + "00001" + checkDigit("590123400001"));
  assert.equal(r.rows[0].gtin.length, 13);
  assert.equal(new Set(r.rows.map(x => x.gtin)).size, 5);
  assert.ok(r.rows.every(x => validate(x.gtin).ok));
  assert.equal(r.next, 6);
  assert.equal(r.itemNumbersLeft, 100000 - 6);
});

test("assign: skips codes already in use, refuses a prefix out of range, and runs out", () => {
  const first = assignCodes({ prefix: "5901234", start: 0, styles: [{ name: "A" }] }).rows[0].gtin;
  const r = assignCodes({ prefix: "5901234", start: 0, existing: first, styles: [{ name: "A" }] });
  assert.notEqual(r.rows[0].gtin, first);
  assert.equal(assignCodes({ prefix: "12345" , styles: [{ name: "A" }] }).ok, false);
  const small = assignCodes({ prefix: "5901234567", start: 98, styles: [{ name: "A", sizes: "S,M,L" }] }); // room = 2 digits
  assert.equal(small.ok, false);
  assert.match(small.error, /100 item numbers/);
});

test("restricted prefixes warn", () => {
  assert.ok(restrictedReason("2001234000000"));
  assert.ok(restrictedReason("9781234567890"));
  assert.equal(restrictedReason("5901234000000"), null);
  const r = assignCodes({ prefix: "2001234", styles: [{ name: "A" }] });
  assert.equal(r.ok, true);
  assert.match(r.warnings[0], /in-store use/);
});

test("csv keeps gtin plain and neutralises formulas in text", () => {
  const rows = [{ gtin: "5901234123457", sku: "=1+1", style: 'He said "hi", ok', colour: "", size: "S" }];
  const lines = csv(rows).trim().split("\n");
  assert.equal(lines[1], `5901234123457,'=1+1,"He said ""hi"", ok",,S`);
});

test("label sheet escapes text", () => {
  const h = labelSheetHtml([{ style: "<b>x</b>", colour: "R", size: "S", gtin: "5901234123457" }], { brand: "A&B" });
  assert.ok(!h.includes("<b>x</b>") && h.includes("A&amp;B") && h.includes("&lt;b&gt;"));
});
