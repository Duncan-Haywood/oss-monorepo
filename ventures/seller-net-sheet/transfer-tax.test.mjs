import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  TRANSFER_TAX_STATES,
  TRANSFER_TAX_STATE_CODES,
  transferTaxOn,
  transferTaxRateForState,
} from "./transfer-tax.mjs";

test("rates are sane percentages and every state carries a note", () => {
  for (const code of TRANSFER_TAX_STATE_CODES) {
    const s = TRANSFER_TAX_STATES[code];
    assert.match(code, /^[A-Z]{2}$/);
    assert.ok(s.rate >= 0 && s.rate <= 2, `${code} rate out of range`);
    assert.ok(s.name && s.note.length > 10, `${code} lacks name or note`);
  }
});

test("known anchors", () => {
  assert.equal(transferTaxRateForState("fl"), 0.7);
  assert.equal(transferTaxRateForState("TX"), 0);
  assert.equal(transferTaxOn(500000, "NY"), 2000);
  assert.equal(transferTaxOn(425000, "CA"), 467.5);
});

test("no-tax states are exactly zero and Pennsylvania's seller half is 1%", () => {
  for (const code of ["AK", "AZ", "ID", "IN", "KS", "MO", "OR", "TX", "UT"]) {
    assert.equal(transferTaxRateForState(code), 0, `${code} should start at 0%`);
    assert.equal(transferTaxOn(300000, code), 0);
  }
  assert.equal(transferTaxRateForState("PA"), 1);
  assert.equal(transferTaxOn(300000, "PA"), 3000);
});

test("a zero or sub-dollar sale price is allowed, negative and non-numeric are not", () => {
  assert.equal(transferTaxOn(0, "FL"), 0);
  assert.equal(transferTaxOn(0.5, "PA"), 0.005);
  assert.throws(() => transferTaxOn("abc", "FL"));
  assert.throws(() => transferTaxOn(Infinity, "FL"));
});

test("unknown state and bad price throw", () => {
  assert.throws(() => transferTaxRateForState("ZZ"));
  assert.throws(() => transferTaxOn(-1, "FL"));
});

test("calculator select offers exactly the states in the data", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const select = html.match(/<select id="transferTaxState">([\s\S]*?)<\/select>/)[1];
  const codes = [...select.matchAll(/<option value="([A-Z]{2})"/g)].map((m) => m[1]);
  assert.deepEqual(codes, TRANSFER_TAX_STATE_CODES);
});

test("reference page lists every state and defers to the title company", () => {
  const html = fs.readFileSync(new URL("./transfer-tax-by-state.html", import.meta.url), "utf8");
  for (const code of TRANSFER_TAX_STATE_CODES) assert.match(html, new RegExp(`<td>${TRANSFER_TAX_STATES[code].name}</td>`));
  assert.match(html, /<link rel="canonical" href="transfer-tax-by-state\.html">/);
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /title company/);
  assert.match(fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /transfer-tax-by-state\.html/);
});
