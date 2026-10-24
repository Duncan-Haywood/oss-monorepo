import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBytes } from "./textcodec.mjs";
import { readStatement } from "./bank.mjs";

// Rows are made up; the bytes are what a real Shift_JIS/GBK/EUC-KR download
// would hold. The legacy-codepage encoders below come from the same
// WHATWG tables the decoder uses, so this proves the detection and the header
// aliases, not any one bank's layout.
const table = (enc) => {
  const dec = new TextDecoder(enc);
  const m = new Map();
  for (let a = 0x81; a <= 0xfe; a++) for (let b = 0x40; b <= 0xfe; b++) {
    const ch = dec.decode(Uint8Array.of(a, b));
    if (ch.length === 1 && ch !== "�" && !m.has(ch)) m.set(ch, [a, b]);
  }
  return m;
};
const encode = (enc, s) => {
  const t = table(enc);
  const out = [];
  for (const ch of s) {
    if (ch.charCodeAt(0) < 0x80) out.push(ch.charCodeAt(0));
    else out.push(...t.get(ch));
  }
  return Uint8Array.from(out);
};
const rows = (t) => readStatement(t).rows.map((r) => [r.date, r.cents, r.desc]);

const cases = [
  ["shift_jis", "取引日,摘要,出金金額,入金金額,残高\n2026/03/15,スーパー,540,,99460\n2026/03/12,給与,,100000,100000",
    [["2026-03-15", -54000, "スーパー"], ["2026-03-12", 10000000, "給与"]]],
  ["gbk", "交易日期,摘要,支出,收入,余额\n2026-03-15,超市购物,54.00,,994.60\n2026-03-12,工资,,1000.00,1000.00",
    [["2026-03-15", -5400, "超市购物"], ["2026-03-12", 100000, "工资"]]],
  ["euc-kr", "거래일자,적요,출금금액,입금금액,잔액\n2026.03.15,편의점,5400,,94600\n2026.03.12,급여,,100000,100000",
    [["2026-03-15", -540000, "편의점"], ["2026-03-12", 10000000, "급여"]]],
];

for (const [enc, text, want] of cases) {
  test(`${enc} file is recognised without a flag and its headers read`, () => {
    const bytes = encode(enc, text);
    assert.throws(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const t = decodeBytes(bytes);
    assert.equal(t, text);
    assert.deepEqual(rows(t), want);
  });
}

test("Western Windows-1252 text is not mistaken for an East Asian codepage", () => {
  const s = "Date,Description,Amount\n2026-03-15,Société Générale « frais » d’agios,-12.50\n2026-03-16,Café Müller – Zürich,-4.20";
  const b = Uint8Array.from([...s].map((c) => ({ "é": 0xe9, "«": 0xab, "»": 0xbb, "’": 0x92, "–": 0x96, "ü": 0xfc }[c] ?? c.charCodeAt(0))));
  assert.equal(decodeBytes(b), s.replace("’", "’"));
});
