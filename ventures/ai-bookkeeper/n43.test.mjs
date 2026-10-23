// Norma 43 reading. The file is built by the helpers below from the AEB layout
// (11, 22, 23, 33, 88 records, 80 columns); it is not a bank's real download.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, sniffFormat } from "./bank.mjs";
import { readN43, isN43 } from "./n43.mjs";

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const num = (v, n = 14) => String(Math.round(v)).padStart(n, "0");
const h11 = (open, cur = "978") => pad("11" + "2100" + "0418" + "0200051332" + "260101" + "260131" + (open < 0 ? "1" : "2") + num(Math.abs(open)) + cur + "3" + "EMPRESA SL", 80);
const m22 = (day, c, ref) => pad("22" + "    " + "0418" + `2601${day}` + `2601${day}` + "02" + "001" + (c < 0 ? "1" : "2") + num(Math.abs(c)) + "0000000000" + pad(ref, 28), 80);
const c23 = (n, a, b = "") => pad("23" + n + pad(a, 38) + pad(b, 38), 80);
const t33 = (close) => pad("33" + "2100" + "0418" + "0200051332" + "00002" + num(0) + "00001" + num(0) + (close < 0 ? "1" : "2") + num(Math.abs(close)) + "978", 80);
const FILE = [
  h11(100000),
  m22("05", -4599, "REF 1"), c23("01", "MERCADONA 0412 MADRID", "COMPRA TARJETA"),
  m22("07", 250000, "TRANSF"), c23("01", "CLIENTE UNO SA", "FACTURA 14"),
  m22("09", 0, "CERO"),
  m22("31", -1250, "COMISION"),
  t33(100000 - 4599 + 250000 - 1250),
  pad("88" + "9".repeat(18), 80),
].join("\r\n");

test("Norma 43 is recognised and read with signs from the debe/haber digit", () => {
  assert.ok(isN43(FILE));
  assert.equal(sniffFormat(FILE), "n43");
  const r = readStatement(FILE);
  assert.equal(r.bank, "n43");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4599, 250000, -1250]);
  assert.equal(r.rows[0].date, "2026-01-05");
  assert.equal(r.rows[0].desc, "MERCADONA 0412 MADRID COMPRA TARJETA");
  assert.equal(r.rows[2].desc, "COMISION");
  assert.deepEqual(r.problems, []);
});

test("the 33 record's final balance is the statement balance, dated by the header's end date", () => {
  const r = readN43(FILE);
  assert.deepEqual(r.statement, { cents: 100000 - 4599 + 250000 - 1250, date: "2026-01-31" });
});

test("a negative final balance, a non-euro currency and two accounts are reported", () => {
  const r = readN43([h11(-500, "840"), m22("02", -100, "X"), t33(-600)].join("\n"));
  assert.equal(r.statement.cents, -600);
  assert.match(r.problems.join(" "), /840/);
  const two = readN43([h11(0), m22("02", 100, "A"), t33(100), h11(0), m22("03", 200, "B"), t33(200)].join("\n"));
  assert.equal(two.rows.length, 2);
  assert.equal(two.statement, null);
  assert.match(two.problems.join(" "), /2 accounts/);
});

test("invert flips signs, a bad movement is skipped with a note, CSV is not mistaken for it", () => {
  assert.deepEqual(readStatement(FILE, { invert: true }).rows.map((x) => x.cents), [4599, -250000, 1250]);
  const bad = readN43([h11(0), "22" + "x".repeat(78), m22("02", 100, "OK")].join("\n"));
  assert.equal(bad.rows.length, 1);
  assert.match(bad.problems[0], /Line 2/);
  assert.equal(isN43("date,amount,desc\n2026-01-01,5,x\n"), false);
});
