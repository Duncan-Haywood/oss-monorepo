import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, createRequest, view, sign, decline, voidRequest, verify, status, stats, toCsv, sha256, ZERO } from "./store.mjs";

const T0 = Date.UTC(2026, 9, 15);
const BODY = "This agreement is between Acme and Ada.\r\nAda will deliver the work by 1 December.";
const mk = (extra = {}, state = newState()) => ({ state, ...createRequest(state, { title: "Services", body: BODY, ...extra }, { token: "t".repeat(22), now: T0 }) });
const ok = { name: "Ada Lovelace", consent: "on" };

test("create validates input, normalises line breaks and fingerprints the text", () => {
  const { request: r } = mk();
  assert.equal(r.body, "This agreement is between Acme and Ada.\nAda will deliver the work by 1 December.");
  assert.equal(r.docHash, sha256(r.body));
  assert.equal(r.expiresAt, T0 + 14 * 86400000);
  const s = newState();
  for (const bad of [{ title: "" }, { body: "short" }, { signerEmail: "nope" }, { days: 0 }, { days: 91 }, { days: 1.5 }]) assert.ok(createRequest(s, { title: "t", body: BODY, ...bad }, { token: "x", now: T0 }).error, JSON.stringify(bad));
});

test("signing needs a typed name, the consent tick, and a pending request", () => {
  const { state, request: r } = mk();
  const o = { now: T0 + 1000, ipKey: "k" };
  assert.match(sign(state, r, { consent: "on" }, o).error, /full name/);
  assert.match(sign(state, r, { name: "Ada Lovelace" }, o).error, /tick the box/);
  assert.equal(status(r, o.now), "pending");
  const out = sign(state, r, ok, o);
  assert.equal(out.request.signature.name, "Ada Lovelace");
  assert.equal(status(r, o.now), "signed");
  assert.match(sign(state, r, ok, o).error, /already been signed/);
  assert.match(decline(r, {}, o).error, /signed/);
  assert.match(voidRequest(r, o).error, /cannot be voided/);
});

test("a named signer must match, ignoring case and spacing; honeypot is silent", () => {
  const { state, request: r } = mk({ signerName: "Ada Lovelace" });
  const o = { now: T0, ipKey: "k" };
  assert.match(sign(state, r, { name: "Bob", consent: "on" }, o).error, /must match/);
  assert.equal(sign(state, r, { ...ok, website: "http://spam" }, o).silent, true);
  assert.ok(!r.signature);
  assert.ok(sign(state, r, { name: "  ada   LOVELACE ", consent: true }, o).request.signature);
});

test("expired, declined and voided requests cannot be signed", () => {
  const a = mk(); const late = T0 + 15 * 86400000;
  assert.equal(status(a.request, late), "expired");
  assert.match(sign(a.state, a.request, ok, { now: late, ipKey: "k" }).error, /expired/);
  const b = mk(); decline(b.request, { reason: "wrong terms" }, { now: T0 });
  assert.equal(status(b.request, T0), "declined");
  assert.match(sign(b.state, b.request, ok, { now: T0, ipKey: "k" }).error, /declined/);
  const c = mk(); voidRequest(c.request, { now: T0 });
  assert.equal(status(c.request, T0), "voided");
  assert.match(sign(c.state, c.request, ok, { now: T0, ipKey: "k" }).error, /voided/);
});

test("the audit chain verifies, and any edit to text, event or signature is detected", () => {
  const { state, request: r } = mk();
  view(r, { now: T0 + 1 }); sign(state, r, ok, { now: T0 + 2, ipKey: "k" });
  const v = verify(r);
  assert.ok(v.ok); assert.equal(v.events, 3); assert.notEqual(v.head, ZERO);
  const copy = () => JSON.parse(JSON.stringify(r));
  const t1 = copy(); t1.body += " Plus ten thousand dollars."; assert.match(verify(t1).problems[0], /document text/);
  const t2 = copy(); t2.events[1].at += 5; assert.match(verify(t2).problems.join(), /event 2/);
  const t3 = copy(); t3.events.splice(1, 1); assert.ok(!verify(t3).ok);
  const t4 = copy(); t4.signature.name = "Mallory"; assert.match(verify(t4).problems.join(), /differs/);
  const t5 = copy(); t5.body += "x"; assert.match(sign(newState(), Object.assign(t5, { signature: null, events: t5.events.slice(0, 1) }), ok, { now: T0, ipKey: "k" }).error, /fingerprint/);
});

test("views are capped, the per-visitor daily cap holds, stats and CSV neutralise formulas", () => {
  const { state, request: r } = mk({ title: "=HYPERLINK(1)" });
  for (let i = 0; i < 40; i++) view(r, { now: T0 + i });
  assert.equal(r.events.filter((e) => e.type === "viewed").length, 20);
  for (let i = 0; i < 20; i++) state.rate[`2026-10-15:k`] = (state.rate["2026-10-15:k"] || 0) + 1;
  assert.match(sign(state, r, ok, { now: T0, ipKey: "k" }).error, /Too many/);
  assert.ok(sign(state, r, ok, { now: T0, ipKey: "other" }).request);
  assert.deepEqual(stats(state, T0), { pending: 0, signed: 1, declined: 0, expired: 0, voided: 0 });
  assert.match(toCsv(state, T0), /"'=HYPERLINK\(1\)"/);
});
