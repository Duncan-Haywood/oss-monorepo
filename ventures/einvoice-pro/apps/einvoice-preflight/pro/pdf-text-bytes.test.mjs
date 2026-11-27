import test from "node:test";
import assert from "node:assert/strict";
import { latin1 } from "./pdf-text.mjs";

// A subset font's glyph codes 0x80-0x9F must read back as those bytes, not as windows-1252's
// characters (TextDecoder("latin1") gives U+20AC for 0x80).
test("latin1 maps every byte to the character with the same code", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const s = latin1(all);
  assert.equal(s.length, 256);
  for (let i = 0; i < 256; i++) assert.equal(s.charCodeAt(i), i);
});

test("latin1 handles input longer than one chunk", () => {
  const big = new Uint8Array(0x8000 * 2 + 5).fill(0x9f);
  const s = latin1(big);
  assert.equal(s.length, big.length);
  assert.equal(s.charCodeAt(big.length - 1), 0x9f);
});
