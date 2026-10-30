import assert from "node:assert/strict";
import test from "node:test";
import { checkBrazilId, cnpjCheckDigits } from "./brazil.mjs";

test("pinned on CNPJs and CPFs of known good shape", () => {
  for (const c of ["11.222.333/0001-81", "00.000.000/0001-91", "12.ABC.345/01DE-35", "111.444.777-35"]) {
    assert.equal(checkBrazilId(c).ok, true, c);
  }
});

test("kinds: numeric CNPJ, alphanumeric CNPJ, CPF", () => {
  assert.equal(checkBrazilId("11222333000181").kind, "cnpj");
  assert.equal(checkBrazilId("12ABC34501DE35").kind, "cnpj-alphanumeric");
  assert.equal(checkBrazilId("11144477735").kind, "cpf");
});

test("wrong check digits name the expected ones", () => {
  const x = checkBrazilId("11222333000182");
  assert.equal(x.ok, false);
  assert.match(x.problems[0], /should be 81/);
  assert.equal(checkBrazilId("11144477736").ok, false);
});

test("shape problems and repeated digits", () => {
  assert.equal(checkBrazilId("123").ok, false);
  assert.equal(checkBrazilId("12abc34501de3x").ok, false);
  assert.equal(checkBrazilId("11111111111").ok, false);
  assert.equal(checkBrazilId("00000000000000").ok, false);
});

test("lower case and punctuation are ignored", () => {
  assert.equal(checkBrazilId("12.abc.345/01de-35").ok, true);
});

test("single-character substitutions in the first 12 characters: the blind spot is measured", () => {
  // Replacing any character with any of the 35 other digits or letters:
  // 420 substitutions per sample. A digit swapped for another digit is always
  // caught (108 on the numeric sample, 63 on the alphanumeric one); letters
  // have values 17..42, so a swap whose value differs by a multiple of 11
  // at the same weight leaves both digits unchanged.
  const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const [base, want] of [["11222333000181", 24], ["12ABC34501DE35", 27]]) {
    const first = base.slice(0, 12);
    let total = 0, missed = 0, digitSwapMissed = 0;
    for (let i = 0; i < 12; i++) for (const c of A) {
      if (c === first[i]) continue;
      total++;
      const t = first.slice(0, i) + c + first.slice(i + 1);
      const same = cnpjCheckDigits(t) === base.slice(12);
      if (same) { missed++; if (/\d/.test(c) && /\d/.test(first[i])) digitSwapMissed++; }
    }
    assert.equal(total, 420);
    assert.equal(missed, want, base);
    assert.equal(digitSwapMissed, 0, base);
  }
});
