// aliasColumns finds each column by one pass over the header's cells. It must give
// exactly what the older loop gave: for each key, try its aliases in order and take
// the first one h.indexOf finds. Random headers mix every alias (so cross-key and
// repeated names collide), unknown words and repeats, in shuffled order.
import test from "node:test";
import assert from "node:assert/strict";
import { aliasColumns, COLUMN_ALIASES, detectColumns } from "./bank.mjs";

const scan = (h) => Object.fromEntries(Object.keys(COLUMN_ALIASES).map((k) => {
  for (const a of COLUMN_ALIASES[k]) { const i = h.indexOf(a); if (i !== -1) return [k, i]; }
  return [k, -1];
}));

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

test("aliasColumns matches the alias-by-alias indexOf scan", () => {
  const words = [...new Set(Object.values(COLUMN_ALIASES).flat())];
  const junk = ["", "x", "notes", "id", "amount usd", "date2", "betrag eur"];
  const r = rng(20261114);
  assert.deepEqual(aliasColumns([]), scan([]));
  for (let n = 0; n < 4000; n++) {
    const len = 1 + Math.floor(r() * 14), h = [];
    for (let j = 0; j < len; j++) {
      const p = r();
      h.push(p < 0.7 ? words[Math.floor(r() * words.length)] : p < 0.85 && h.length ? h[Math.floor(r() * h.length)] : junk[Math.floor(r() * junk.length)]);
    }
    assert.deepEqual(aliasColumns(h), scan(h), JSON.stringify(h));
  }
  // every alias alone, and every alias behind every key's first alias
  for (const w of words) {
    assert.deepEqual(aliasColumns([w]), scan([w]), w);
    for (const k of Object.keys(COLUMN_ALIASES)) { const h = [w, COLUMN_ALIASES[k][0], w]; assert.deepEqual(aliasColumns(h), scan(h), h.join("|")); }
  }
});

test("a sparse header row is read as before", () => {
  const h = ["Date", , "Amount"]; // eslint-disable-line no-sparse-arrays
  const c = detectColumns(h);
  assert.equal(c.date, 0);
  assert.equal(c.amount, 2);
});
