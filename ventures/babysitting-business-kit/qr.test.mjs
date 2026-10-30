import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encode, toSVG, capacity, rsRemainder, penalty, MAX_VERSION } from "./qr.mjs";

const fixtures = JSON.parse(readFileSync(new URL("./qr.fixtures.json", import.meta.url), "utf8"));
const rowsOf = (q) => q.modules.map((r) => r.map((b) => (b ? "1" : "0")).join(""));
const unhex = (h) => BigInt(`0x${h}`).toString(2).slice(1);

test("matches an independent encoder module for module, mask choice included", () => {
  assert.ok(fixtures.cases.length >= 10);
  const versions = new Set();
  for (const c of fixtures.cases) {
    const q = encode(c.text);
    versions.add(q.version);
    assert.equal(q.version, c.version, c.text);
    assert.equal(q.mask, c.mask, `mask for ${c.text.slice(0, 30)}`);
    assert.deepEqual(rowsOf(q), c.rows.map(unhex), c.text.slice(0, 30));
  }
  for (const v of [1, 2, 3, 4, 5, 6, 8, 10]) assert.ok(versions.has(v), `fixtures cover version ${v}`);
});

test("every forced mask still matches the reference structure for that mask", () => {
  const c = fixtures.cases.find((x) => x.version === 2);
  const want = encode(c.text, { mask: c.mask });
  assert.deepEqual(rowsOf(want), c.rows.map(unhex));
  for (let m = 0; m < 8; m++) {
    const q = encode(c.text, { mask: m });
    assert.equal(q.mask, m);
    assert.equal(q.size, 25);
    // finder patterns and timing do not move with the mask
    assert.deepEqual(q.modules[0].slice(0, 7), [true, true, true, true, true, true, true]);
    assert.equal(q.modules[6].slice(8, 17).map((b) => (b ? 1 : 0)).join(""), "101010101");
  }
});

test("byte-mode capacities at level M are the ISO 18004 table values", () => {
  assert.deepEqual(Array.from({ length: MAX_VERSION }, (_, i) => capacity(i + 1)), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  assert.equal(encode("a".repeat(14)).version, 1);
  assert.equal(encode("a".repeat(15)).version, 2);
  assert.equal(encode("a".repeat(213)).version, 10);
  assert.throws(() => encode("a".repeat(214)), /too long/);
  assert.throws(() => encode("a".repeat(30), { version: 1 }), /too long/);
});

test("Reed-Solomon remainder of the ISO 18004 Annex I example", () => {
  // "01234567" at version 1-M: data and error correction codewords from the standard's worked example.
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(rsRemainder(data, 10), [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

test("penalty prefers balanced symbols", () => {
  const n = 21;
  const allDark = Array.from({ length: n }, () => new Array(n).fill(true));
  const checker = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (x + y) % 2 === 0));
  assert.ok(penalty(allDark) > penalty(checker));
});

test("SVG has a quiet zone, one path, an accessible label and escapes it", () => {
  const svg = toSVG("https://example.com/?a=1&b=2", { size: "1in", label: 'Scan "me" & <go>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 37 37" width="1in" height="1in"/);
  assert.match(svg, /aria-label="Scan &quot;me&quot; &amp; &lt;go&gt;"/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  for (const m of svg.matchAll(/M(\d+) (\d+)h(\d+)/g)) { // nothing drawn in the 4-module quiet zone of a 29-module symbol
    assert.ok(Number(m[1]) >= 4 && Number(m[2]) >= 4 && Number(m[2]) < 33 && Number(m[1]) + Number(m[3]) <= 33, m[0]);
  }
  // the dark module count in the path equals the matrix's
  const q = encode("https://example.com/?a=1&b=2");
  let dark = 0;
  for (const r of q.modules) for (const b of r) if (b) dark++;
  const drawn = [...svg.matchAll(/h(\d+)v1/g)].reduce((a, m) => a + Number(m[1]), 0);
  assert.equal(drawn, dark);
});

test("UTF-8 text is encoded as bytes", () => {
  const c = fixtures.cases.find((x) => /ü/.test(x.text));
  assert.ok(c);
  assert.equal(encode(c.text).version, c.version);
});
