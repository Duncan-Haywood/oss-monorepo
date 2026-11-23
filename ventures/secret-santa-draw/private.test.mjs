import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGroup, encodePrivate, decodePrivate, privateLinks, privateLinksText,
  encodeWish, decodeWish, WISH_MAX,
} from "./calc.mjs";

const group = (n, seed) => ({ title: "Family", names: Array.from({ length: n }, (_, i) => `Person ${i} ✨`), groups: [], previous: [], mode: "noswap", seed, budget: "€30", date: "2026-12-20", note: "Wrap it" });

test("each private link decodes to its own giver and the draw's receiver, and holds nothing else", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const n = 3 + (seed % 40);
    const g = group(n, seed);
    const r = resolveGroup(g);
    assert.ok(r.ok);
    const links = privateLinks(g, r.assign);
    assert.equal(links.length, n);
    links.forEach((l, i) => {
      const d = decodePrivate(l.fragment);
      assert.equal(d.error, undefined);
      assert.equal(d.giver, g.names[i]);
      assert.equal(d.receiver, g.names[r.assign[i]]);
      assert.equal(d.budget, "€30");
      assert.equal(d.date, "2026-12-20");
      // No other participant's name and no seed: the link cannot reveal anyone else's person.
      const raw = Buffer.from(l.fragment.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      const o = JSON.parse(raw);
      assert.deepEqual(Object.keys(o).sort(), ["b", "d", "f", "r", "t", "v", "x"]);
      for (const other of g.names) if (other !== d.giver && other !== d.receiver) assert.ok(!raw.includes(other));
    });
  }
});

test("private links are stable for the same group and differ from person to person", () => {
  const g = group(8, 42);
  const a = privateLinks(g, resolveGroup(g).assign).map((l) => l.fragment);
  const b = privateLinks(g, resolveGroup(g).assign).map((l) => l.fragment);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test("damaged or forged private links are refused with a plain message", () => {
  assert.match(decodePrivate("p=!!!").error, /damaged/);
  assert.match(decodePrivate("p=" + Buffer.from(JSON.stringify({ v: 1, f: "Ann", r: "Ann" })).toString("base64url")).error, /understands/);
  assert.match(decodePrivate("p=" + Buffer.from(JSON.stringify({ v: 2, f: "Ann", r: "Ben" })).toString("base64url")).error, /understands/);
  const d = decodePrivate("p=" + Buffer.from(JSON.stringify({ v: 1, f: "Ann", r: "Ben", d: "<script>", t: 5 })).toString("base64url"));
  assert.equal(d.date, "");
  assert.equal(d.title, "");
});

test("the organizer's message has one line per person with their own link", () => {
  const g = group(5, 7);
  const links = privateLinks(g, resolveGroup(g).assign);
  const text = privateLinksText("https://x.test/secret-santa-draw/", links);
  const lines = text.split("\n");
  assert.equal(lines.length, 5);
  lines.forEach((line, i) => {
    assert.ok(line.startsWith(`${g.names[i]}: https://x.test/secret-santa-draw/#p=`));
    assert.equal(decodePrivate(line.slice(line.indexOf("#") + 1)).giver, g.names[i]);
  });
});

test("wish list links round-trip, cap their length and refuse empty lists", () => {
  const w = decodeWish("w=" + encodeWish({ name: "Ann", wish: "Wool socks (size 7)\nAnything with cats", title: "Family" }));
  assert.deepEqual(w, { name: "Ann", wish: "Wool socks (size 7)\nAnything with cats", title: "Family" });
  assert.equal(decodeWish(encodeWish({ name: "Ann", wish: "x".repeat(2000) })).wish.length, WISH_MAX);
  assert.match(decodeWish(encodeWish({ name: "Ann", wish: "   " })).error, /understands/);
  assert.match(decodeWish("w=%%%").error, /damaged/);
});
