// CFONB 120 reading. The file is built by the helpers below from the layout as
// described in cfonb120.mjs; it is not a bank's real download.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, sniffFormat } from "./bank.mjs";
import { readCfonb120, isCfonb120 } from "./cfonb120.mjs";

const pad = (s, n = 120) => String(s).padEnd(n).slice(0, n);
const OVER = { pos: "{ABCDEFGHI", neg: "}JKLMNOPQR" };
const amt = (c) => { const s = String(Math.abs(c)).padStart(14, "0"); return s.slice(0, 13) + OVER[c < 0 ? "neg" : "pos"][+s[13]]; };
const base = (code, tail = "") => code + "30003" + "    " + "01234" + "EUR2" + " " + "00012345678" + tail;
const r01 = (c) => pad(base("01", "  " + "311225") + " ".repeat(50) + amt(c));
const r04 = (date, c, label) => pad(base("04", "05" + date) + "  " + date + pad(label, 31) + " " + "0000123" + "  " + " ".repeat(0)).slice(0, 90) + amt(c) + " ".repeat(16);
const r05 = (date, q, text) => pad(base("05", "05" + date) + " ".repeat(4) + q + pad(text, 72));
const r07 = (date, c) => pad(base("07", "  " + date) + " ".repeat(50) + amt(c));
const FILE = [
  r01(100000),
  r04("050126", -4599, "CB MERCADONA 0412"), r05("050126", "LIB", "ACHAT CARTE"),
  r04("070126", 250000, "VIR CLIENT UN"), r05("070126", "NPY", "CLIENT UN SARL"), r05("070126", "RCN", "REF99"),
  r04("090126", 0, "ZERO"),
  r04("310126", -1250, "FRAIS TENUE DE COMPTE"),
  r07("310126", 100000 - 4599 + 250000 - 1250),
].join("\r\n");

test("CFONB 120 is recognised and read with signs from the overpunched last digit", () => {
  assert.ok(isCfonb120(FILE));
  assert.equal(sniffFormat(FILE), "cfonb120");
  const r = readStatement(FILE);
  assert.equal(r.bank, "cfonb120");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4599, 250000, -1250]);
  assert.equal(r.rows[0].date, "2026-01-05");
  assert.equal(r.rows[0].desc, "CB MERCADONA 0412 ACHAT CARTE");
  assert.equal(r.rows[1].desc, "VIR CLIENT UN CLIENT UN SARL");
  assert.deepEqual(r.problems, []);
});

test("the 07 record is the statement balance", () => {
  assert.deepEqual(readCfonb120(FILE).statement, { cents: 100000 - 4599 + 250000 - 1250, date: "2026-01-31" });
});

test("all ten overpunch digits round-trip, both signs", () => {
  for (let d = 0; d < 10; d++) for (const s of [1, -1]) {
    const f = [r01(0), r04("050126", s * (1000 + d), "X"), r07("050126", 0)].join("\n");
    assert.equal(readCfonb120(f).rows[0].cents, s * (1000 + d));
  }
});

test("a non-EUR account and two accounts are warned about; invert flips signs", () => {
  const usd = FILE.replaceAll("EUR2", "USD2");
  assert.match(readCfonb120(usd).problems[0], /USD/);
  assert.match(readCfonb120(FILE + "\n" + r01(0)).problems.join(), /2 accounts/);
  assert.equal(readStatement(FILE, { invert: true }).rows[0].cents, 4599);
});

test("an N43 or CSV file is not mistaken for CFONB", () => {
  assert.ok(!isCfonb120("date,description,amount\n2026-01-01,x,1.00"));
});
