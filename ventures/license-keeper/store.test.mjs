import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, issue, revoke, extend, activate, deactivate, status, summary, findBy } from "./store.mjs";

const T = Date.UTC(2026, 0, 1);
const mk = (s, o = {}) => issue(s, { product: "app", email: "Buyer@Example.com", machines: 2, ...o }, T);

test("issue validates input and lowercases the email", () => {
  const s = newState();
  assert.equal(mk(s).email, "buyer@example.com");
  assert.throws(() => issue(s, { product: "app", email: "nope" }, T));
  assert.throws(() => issue(s, { email: "a@b.co" }, T));
});

test("activation enforces the machine limit, is idempotent per machine, and deactivation frees a slot", () => {
  const s = newState(); const l = mk(s);
  assert.equal(activate(s, l.id, "machine-aaaa", "Mac", T).ok, true);
  assert.equal(activate(s, l.id, "machine-aaaa", "Mac", T + 1).ok, true);
  assert.equal(activate(s, l.id, "machine-bbbb", "PC", T).ok, true);
  assert.equal(activate(s, l.id, "machine-cccc", "Linux", T).reason, "machine-limit");
  assert.equal(deactivate(s, l.id, "machine-aaaa", T), true);
  assert.equal(activate(s, l.id, "machine-cccc", "Linux", T).ok, true);
  assert.equal(activate(s, l.id, "x", "", T).reason, "bad-fingerprint");
  assert.equal(activate(s, "lic_none", "machine-aaaa", "", T).reason, "unknown");
});

test("revoked and expired licenses cannot activate", () => {
  const s = newState(); const a = mk(s), b = mk(s, { expiresAt: T + 1000 });
  revoke(s, a.id, "test", T);
  assert.equal(activate(s, a.id, "machine-aaaa", "", T).reason, "revoked");
  assert.equal(status(b, T), "active");
  assert.equal(activate(s, b.id, "machine-aaaa", "", T + 5000).reason, "expired");
});

test("extend only moves a fixed-term expiry forward, never a perpetual or revoked one", () => {
  const s = newState(); const sub = mk(s, { expiresAt: T + 10_000 }), perp = mk(s), gone = mk(s, { expiresAt: T + 10_000 });
  revoke(s, gone.id, "x", T);
  extend(s, sub.id, T + 50_000, T); assert.equal(sub.exp, (T + 50_000) / 1000);
  extend(s, sub.id, T + 20_000, T); assert.equal(sub.exp, (T + 50_000) / 1000);
  assert.equal(extend(s, perp.id, T + 1, T), null);
  assert.equal(extend(s, gone.id, T + 90_000, T), null);
});

test("summary and findBy", () => {
  const s = newState(); const a = mk(s, { stripe: { paymentIntent: "pi_1" } }); mk(s); revoke(s, mk(s).id, "x", T);
  activate(s, a.id, "machine-aaaa", "", T);
  assert.deepEqual(summary(s, T), { licenses: 3, active: 2, expired: 0, revoked: 1, machines: 1 });
  assert.equal(findBy(s, "paymentIntent", "pi_1").length, 1);
});
