// CFONB 120 reading. The file is built by the helpers below from the 120-character
// layout (01, 04, 05, 07 records); it is not a bank's real download.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, sniffFormat } from "./bank.mjs";
import { readCfonb, isCfonb } from "./cfonb.mjs";

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const OVER = "{ABCDEFGHI}JKLMNOPQR";
const amt = (c) => { const s = String(Math.abs(c)).padStart(14, "0"); return s.slice(0, 13) + OVER[(c < 0 ? 10 : 0) + Number(s[13])]; };
const base = (code, cur = "EUR") => code + "30004" + "    " + "00123" + cur + "2" + " " + "00012345678";
const r01 = (open) => pad(base("01") + "  " + "310125" + " ".repeat(50) + amt(open), 120);
const r07 = (close) => pad(base("07") + "  " + "310126" + " ".repeat(50) + amt(close), 120);
const r04 = (day, c, label, ref = "") => pad(base("04") + "30" + `${day}0126` + "  " + `${day}0126` + pad(label, 31) + " ".repeat(11) + amt(c) + pad(ref, 16), 120);
const r05 = (q, info) => pad(base("05") + "30" + "050126" + "     " + q + pad(info, 70), 120);
const FILE = [
  r01(100000),
  r04("05", -4599, "CB CARREFOUR 0412", "REF1"), r05("LIB", "PARIS FR"),
  r04("07", 250000, "VIR SEPA CLIENT"), r05("NPY", "SARL DUPONT"), r05("MMO", "VIREMENT"), r05("RCN", "FACTURE 14"),
  r04("09", 0, "ZERO"),
  r04("31", -1250, "FRAIS TENUE COMPTE"),
  r07(100000 - 4599 + 250000 - 1250),
].join("\r\n");

test("CFONB 120 is recognised and read with signs from the overpunched amount", () => {
  assert.ok(isCfonb(FILE));
  assert.equal(sniffFormat(FILE), "cfonb");
  const r = readStatement(FILE);
  assert.equal(r.bank, "cfonb");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4599, 250000, -1250]);
  assert.equal(r.rows[0].date, "2026-01-05");
  assert.equal(r.rows[0].desc, "CB CARREFOUR 0412 PARIS FR");
  assert.equal(r.rows[1].desc, "VIR SEPA CLIENT SARL DUPONT FACTURE 14");
  assert.equal(r.rows[2].desc, "FRAIS TENUE COMPTE");
  assert.deepEqual(r.problems, []);
});

test("the 07 record's balance is the statement balance, with its date", () => {
  assert.deepEqual(readCfonb(FILE).statement, { cents: 100000 - 4599 + 250000 - 1250, date: "2026-01-31" });
});

test("a non-euro currency and two accounts are reported", () => {
  const usd = readCfonb([r01(0).replace("EUR", "USD"), r04("02", -100, "X").replace("EUR", "USD"), r07(-100)].join("\n"));
  assert.match(usd.problems.join(" "), /USD/);
  const two = readCfonb([r01(0), r04("02", 100, "A"), r07(100), r01(0), r04("03", 200, "B"), r07(200)].join("\n"));
  assert.equal(two.rows.length, 2);
  assert.equal(two.statement, null);
  assert.match(two.problems.join(" "), /2 accounts/);
});

test("invert flips signs, a bad movement is skipped, CSV is not mistaken for it", () => {
  assert.deepEqual(readStatement(FILE, { invert: true }).rows.map((x) => x.cents), [4599, -250000, 1250]);
  const bad = readCfonb([r01(0), r04("02", 100, "OK"), r04("02", 1, "BAD").replace(/\d{6}  \d{6}/, "999999  999999")].join("\n"));
  assert.equal(bad.rows.length, 1);
  assert.match(bad.problems[0], /Line 3/);
  assert.equal(isCfonb("date,amount,desc\n2026-01-01,5,x\n"), false);
});
