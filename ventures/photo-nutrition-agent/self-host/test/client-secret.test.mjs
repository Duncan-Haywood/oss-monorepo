import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashClientSecret, verifyClientSecret, safeEqual } from "../auth.mjs";

test("client secrets are stored as salted scrypt and verify only with the right secret", () => {
  const a = hashClientSecret("correct horse");
  const b = hashClientSecret("correct horse");
  assert.match(a, /^scrypt:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b, "each hash has its own salt");
  assert.ok(!a.includes("correct horse"));
  assert.equal(verifyClientSecret("correct horse", a), true);
  assert.equal(verifyClientSecret("correct horse", b), true);
  assert.equal(verifyClientSecret("wrong", a), false);
  assert.equal(verifyClientSecret("", a), false);
});

test("a SHA-256 hash stored by an earlier version still verifies, so existing clients keep working", () => {
  const legacy = createHash("sha256").update("old secret").digest("hex");
  assert.equal(verifyClientSecret("old secret", legacy), true);
  assert.equal(verifyClientSecret("other", legacy), false);
});

test("malformed stored hashes and non-string input are refused", () => {
  assert.equal(verifyClientSecret("x", "scrypt:"), false);
  assert.equal(verifyClientSecret("x", "scrypt:onlysalt"), false);
  assert.equal(verifyClientSecret("x", null), false);
  assert.equal(verifyClientSecret(undefined, hashClientSecret("x")), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("abc", "abc"), true);
});
