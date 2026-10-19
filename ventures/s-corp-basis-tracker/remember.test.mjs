import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packEntries, unpackEntries, saveEntries, loadEntries, forgetEntries, REMEMBER_KEY } from "./remember.mjs";

const fake = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const entries = { opening: { stock: "20000", debtBasis: "", debtFace: "", suspended: "5,000" }, years: "2024,0,0,0,90000,0,60000,0,0" };

test("entries round-trip through the store exactly as typed", () => {
  const s = fake();
  assert.equal(saveEntries(s, entries), true);
  assert.deepEqual(loadEntries(s), entries);
});

test("nothing stored means nothing loaded", () => assert.equal(loadEntries(fake()), null));

test("forget removes the entries", () => {
  const s = fake();
  saveEntries(s, entries);
  assert.equal(forgetEntries(s), true);
  assert.equal(s.m.has(REMEMBER_KEY), false);
  assert.equal(loadEntries(s), null);
});

test("corrupt, foreign-version or wrongly typed data is ignored, not trusted", () => {
  for (const raw of ["", "{", "null", "[]", '{"v":2,"opening":{},"years":""}', '{"v":1,"opening":{},"years":5}', '{"v":1,"opening":null,"years":""}'])
    assert.equal(unpackEntries(raw), null, raw);
  // A non-string opening field is dropped to blank rather than reaching an input.
  assert.equal(unpackEntries('{"v":1,"opening":{"stock":{"x":1}},"years":"a"}').opening.stock, "");
});

test("a blocked or full store never throws", () => {
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(saveEntries(bad, entries), false);
  assert.equal(loadEntries(bad), null);
  assert.equal(forgetEntries(bad), false);
});

test("the page offers the box unticked and says what it stores; the FAQ and privacy text match", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /<input type="checkbox" id="remember">/);
  assert.doesNotMatch(html, /id="remember"[^>]*checked/);
  assert.match(html, /import \{[^}]*\} from "\.\/remember\.mjs"/);
  assert.doesNotMatch(html, /nothing you enter is saved, so/);
  assert.match(html, /unless you tick the remember box/);
});
