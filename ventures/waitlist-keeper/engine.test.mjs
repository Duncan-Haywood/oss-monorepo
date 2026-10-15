import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

let n = 0;
const add = (s, email, o = {}) => { n++; const r = E.join(s, email, { code: "c" + n, token: "t" + n, now: n * 1000, ...o }); if (o.confirm !== false) E.confirm(s, "t" + n, n * 1000 + 1); return r.person; };

test("emails are canonicalised so aliases cannot join twice", () => {
  assert.equal(E.normalizeEmail(" J.Doe+launch@Gmail.com "), "jdoe@gmail.com");
  assert.equal(E.normalizeEmail("a@googlemail.com"), "a@gmail.com");
  assert.equal(E.normalizeEmail("x.y@corp.com"), "x.y@corp.com");
  assert.equal(E.normalizeEmail("nope"), null);
  const s = E.newState(); const a = add(s, "j.doe@gmail.com"); const again = E.join(s, "jdoe+2@gmail.com", { code: "z", token: "z", now: 5 });
  assert.equal(again.created, false); assert.equal(again.person.id, a.id);
});

test("disposable domains are refused", () => assert.throws(() => E.join(E.newState(), "a@mailinator.com", { code: "c", token: "t", now: 1 }), /permanent/));

test("a confirmed referral moves the referrer up by the boost", () => {
  const s = E.newState(); const ps = [];
  for (let i = 0; i < 10; i++) ps.push(add(s, `p${i}@x.com`, { ip: "ip" + i }));
  assert.equal(E.position(s, ps[9]), 10);
  for (let k = 0; k < 2; k++) add(s, `friend${k}@x.com`, { ref: ps[9].code, ip: "f" + k });
  assert.equal(ps[9].referrals, 2);
  assert.equal(E.position(s, ps[9], { boost: 5 }), 1); // 10 - 10 = 0 beats everyone
  assert.equal(E.position(s, ps[9], { boost: 0 }), 10);
});

test("unconfirmed referrals earn nothing until the friend confirms", () => {
  const s = E.newState(); const a = add(s, "a@x.com", { ip: "a" });
  add(s, "b@x.com", { ref: a.code, confirm: false, ip: "b" });
  assert.equal(a.referrals, 0);
  E.confirm(s, "t" + n, 99_999);
  assert.equal(a.referrals, 1);
  E.confirm(s, "t" + n, 100_000); // confirming twice does not double count
  assert.equal(a.referrals, 1);
});

test("same-network referrals and the per-referrer cap stop gaming", () => {
  const s = E.newState(); const a = add(s, "a@x.com", { ip: "1.1.1.1" });
  const self = add(s, "a2@x.com", { ref: a.code, ip: "1.1.1.1" });
  assert.equal(a.referrals, 0); assert.equal(self.referredBy, null);
  for (let i = 0; i < 5; i++) add(s, `f${i}@x.com`, { ref: a.code, ip: "9." + i });
  E.confirm(s, "nothing", 1);
  const s2 = E.newState(); const b = add(s2, "b@x.com", { ip: "b" });
  for (let i = 0; i < 5; i++) { const t = "tt" + i; E.join(s2, `g${i}@x.com`, { ref: b.code, code: "gc" + i, token: t, now: 1, ip: "g" + i }); E.confirm(s2, t, 2, { cap: 3 }); }
  assert.equal(b.referrals, 3);
});

test("inviting takes the front of the line and removes them from the queue", () => {
  const s = E.newState(); const ps = [1, 2, 3, 4].map((i) => add(s, `q${i}@x.com`, { ip: "i" + i }));
  const got = E.nextInvites(s, 2, 7);
  assert.deepEqual(got.map((p) => p.email), ["q1@x.com", "q2@x.com"]);
  assert.equal(E.position(s, ps[2]), 1);
  assert.equal(E.stats(s).invited, 2);
});

test("tiers pick the highest reached reward", () => {
  const tiers = [{ referrals: 1, reward: "early access" }, { referrals: 5, reward: "lifetime discount" }];
  assert.equal(E.tierFor(tiers, 0), null);
  assert.equal(E.tierFor(tiers, 5).reward, "lifetime discount");
});

test("CSV export neutralises formula injection and quotes commas", () => {
  const s = E.newState(); const p = add(s, "ok@x.com"); p.email = "=cmd,x@x.com";
  const csv = E.toCsv(s);
  assert.match(csv, /"'=cmd,x@x.com"/);
});

test("remove cuts the referral link and frees the email to join again", () => {
  const s = E.newState(); const a = add(s, "ra@x.com"); const b = add(s, "rb@x.com", { ref: a.code });
  assert.equal(E.remove(s, { email: "RA@x.com" }).id, a.id);
  assert.equal(s.people[b.id].referredBy, null);
  assert.equal(E.remove(s, { email: "ra@x.com" }), null);
  assert.equal(E.join(s, "ra@x.com", { code: "new", token: "new", now: 9 }).created, true);
});
