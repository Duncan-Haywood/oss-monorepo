// Merchant names with a phone, store or reference number glued on (README "Glued numbers in
// payee names", 2026-11-14). Descriptions are written here in the shapes seen in real US Bank,
// Chase and Mint exports (eval/us-bank-exports.mjs, eval/mint-labelled.mjs); none is copied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { payeeKey, legacyPayeeKey, buildMemory, suggest } from "./categorize.mjs";
import { contractors1099 } from "./taxforms.mjs";

test("a merchant glued to its number keeps its name as the payee", () => {
  assert.equal(payeeKey("WEB AUTHORIZED PMT PHONECO8005551234"), "phoneco");
  assert.equal(payeeKey("SQ *TACOSTAND210"), "tacostand");
  assert.equal(payeeKey("555-123-4567BRIGHTMIND"), "brightmind");
  assert.equal(payeeKey("NGRID37          NGRID37WEB"), "ngrid");
  assert.equal(payeeKey("SIREN53313 CHICAGO IL"), "siren chicago");
  // before: every one of these had no payee, or only the city
  assert.equal(legacyPayeeKey("WEB AUTHORIZED PMT PHONECO8005551234"), "");
  assert.equal(legacyPayeeKey("SIREN53313 CHICAGO IL"), "chicago");
});

test("after the merchant's name, glued store and city codes stay out of the key", () => {
  assert.equal(payeeKey("MARATHON PETRO13 11-20-24 MONROE6537 DEBIT CARD PURCHASE-PIN"), "marathon");
  assert.equal(payeeKey("WALGREENS #1234 00CINCINNATI OH"), "walgreens");
  assert.equal(payeeKey("CITY OF SPRINGFIELD DES:UTILITIES ID:QWERTYUI99"), "city of");
});

test("glued dates, short runs and random references are not payees", () => {
  assert.equal(payeeKey("Pending DEBIT PURCHASE Jan29 05:21p 6352 AT 17:21 LUCKY STAR BUS"), "lucky star");
  assert.equal(payeeKey("AMZN MKTP US*2K3AB"), "amzn mktp");
  assert.equal(payeeKey("PB1 xx7730"), "");
  assert.equal(payeeKey("XXXXXX7625 PAYMENT"), "");
  assert.equal(payeeKey("ONLINE TRANSFER REF #ABCDEFGH2 FROM SAVINGS"), "transfer savings");
});

test("memory saved under the old key still answers", () => {
  // Books filed before the change hold the old key ("chicago" for this line).
  const memory = buildMemory([{ key: "chicago", dir: "out", account: "6130" }]);
  const s = suggest({ desc: "SIREN53313 CHICAGO IL", cents: -1250 }, { memory, rules: [] });
  assert.equal(s.source, "memory");
  assert.equal(s.account, "6130");
  // and the new key is used once a line is filed under it
  const fresh = buildMemory([{ key: "siren chicago", dir: "out", account: "6060" }]);
  assert.equal(suggest({ desc: "SIREN53313 CHICAGO IL", cents: -1250 }, { memory: fresh, rules: [] }).account, "6060");
});

test("an airline glued to its ticket number reads as travel", () => {
  const s = suggest({ desc: "AMERICANAIR0012345678901 800-555-0100 TX", cents: -42000 }, { memory: new Map(), rules: [] });
  assert.equal(s.source, "built-in");
  assert.equal(s.account, "6120");
});

test("a W-9 flag saved under the old key is still found", () => {
  const books = {
    accounts: [{ code: "1000", name: "Checking", type: "asset" }, { code: "6020", name: "Contract labor", type: "expense" }],
    transactions: [{ date: "2026-03-01", desc: "FRAMINGCREW8005550100 SPRINGFIELD", cents: -300000, account: "1000", posted: "6020", status: "posted" }],
    vendors: { springfield: { w9: true } }, // the old key dropped the glued name
  };
  assert.equal(legacyPayeeKey(books.transactions[0].desc), "springfield");
  const r = contractors1099(books, { year: 2026 });
  assert.equal(r.payees.length, 1);
  assert.equal(r.payees[0].w9, true);
  // a new flag goes under the new key and is found the same way
  const fresh = { ...books, vendors: { "framingcrew springfield": { w9: true } } };
  assert.equal(contractors1099(fresh, { year: 2026 }).payees[0].w9, true);
});
