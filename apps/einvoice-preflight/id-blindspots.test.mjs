import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const rows = JSON.parse(execFileSync("node", ["eval/id-blindspots.mjs", "60", "7", "--json"], { cwd: import.meta.dirname }).toString());
const by = (p) => rows.find((r) => r.name.startsWith(p));

test("Chile and Argentina digits miss no single-character typo or swap", () => {
  for (const p of ["Chile", "Argentina"]) assert.equal(by(p).subMissPct + by(p).swapMissPct, 0, p);
});

test("rules with ambiguous remainders or letter values do miss some typos", () => {
  for (const p of ["Colombia", "Peru", "Japan", "Mexico"]) assert.ok(by(p).subMissPct > 0, p);
  assert.ok(by("Brazil CNPJ (alpha").subMissPct > by("Brazil CNPJ (14").subMissPct * 10);
});

test("every generated ID passes except a few unissuable CUIT remainders", () => {
  for (const r of rows) assert.ok(r.generatedNotPassing <= 20, r.name);
});
