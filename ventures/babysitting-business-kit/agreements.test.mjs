import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { exampleDesk, normalizeDesk } from "./engine.mjs";
import * as AG from "./agreements.mjs";
import { handler } from "./server.mjs";

const NOW = Date.parse("2026-11-02T15:00:00Z");
const ISO = new Date(NOW).toISOString();
const TOKEN = "abcdefghijklmnopqrstuv";
const nodeSha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

test("sha256 matches the FIPS 180-4 vectors and node:crypto on long and non-ASCII input", () => {
  assert.equal(AG.sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(AG.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(AG.sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  for (const s of ["x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000), "Ana Riveña — “ok” 👍"]) assert.equal(AG.sha256(s), nodeSha(s), s.slice(0, 20));
});

test("the agreement covers every term from the sitter's settings and is marked a template", () => {
  const d = exampleDesk("2026-11-02");
  d.profile.agreement = { drives: true, houseRules: "Shoes off inside.", faithClause: true };
  const fam = d.families[0];
  const t = AG.agreementText(d, fam);
  for (const s of ["version 1", "Ana Rivera", "Leo, Mia", "$20 an hour", "$3 an hour", "3 hours", "after 23:00", "1.5 times", "last-minute fee", "late", "24 hours' notice", "50%", "Payment is due", "If a child is sick", "Photos and social media", "car seat", "Shoes off inside.", "Screen time", "call 911", "Grandma 555-0112", "only if you ask"]) assert.ok(t.includes(s), s);
  assert.match(AG.NOT_LEGAL_ADVICE, /template, not legal advice/);
  assert.match(AG.agreementPrintPage(d, fam), /template, not legal advice/);
});

test("optional clauses: no faith clause unless turned on, no driving unless ticked", () => {
  const d = exampleDesk("2026-11-02");
  const t = AG.agreementText(d, d.families[0]);
  assert.doesNotMatch(t, /Faith activities/);
  assert.match(t, /I do not drive your children/);
  d.profile.agreement = { faithClause: true };
  assert.match(AG.agreementText(d, d.families[0]), /Faith activities\nI offer Bible stories, simple prayers at meals and bedtime, worship songs only if you ask for them\. If you don't ask, there are none\./);
});

test("a policy change makes a new version and old signers need re-signing", () => {
  const d = exampleDesk("2026-11-02");
  assert.equal(AG.currentVersion(d).v, 1);
  assert.equal(AG.ensureVersion(d, ISO), true);
  assert.equal(AG.ensureVersion(d, ISO), false);
  d.families[0] = AG.recordPaperSignature(d, d.families[0], "Ana Rivera", ISO, "private");
  assert.equal(AG.agreementStatus(d, d.families[0]).status, "signed");
  assert.equal(AG.agreementStatus(d, d.families[1]).status, "unsigned");
  d.families[1].name = "Changed family name"; // a family detail is not a policy change
  assert.equal(AG.currentVersion(d).v, 1);
  d.profile.rates.hourly = 22;
  assert.equal(AG.currentVersion(d).v, 2);
  assert.equal(AG.agreementStatus(d, d.families[0]).status, "needs re-signing");
  AG.ensureVersion(d, "2026-11-03T00:00:00.000Z");
  assert.deepEqual(d.agreements.versions.map((v) => v.v), [1, 2]);
  d.profile.rates.hourly = 20; // back to the old terms: the old version is current again
  assert.equal(AG.currentVersion(d).v, 1);
  assert.equal(AG.agreementStatus(d, d.families[0]).status, "signed");
  assert.deepEqual(normalizeDesk(JSON.parse(JSON.stringify(d))).agreements, d.agreements);
});

test("photo consent: only a recorded public choice lets photos be shown", () => {
  assert.equal(AG.canShowPhotos({}), false);
  assert.equal(AG.canShowPhotos(null), false);
  assert.equal(AG.canShowPhotos({ photoConsent: "private" }), false);
  assert.equal(AG.canShowPhotos({ photoConsent: "yes" }), false);
  assert.equal(AG.canShowPhotos(AG.recordPhotoConsent({}, "public", ISO)), true);
  assert.throws(() => AG.recordPhotoConsent({}, "maybe", ISO));
});

function signDesk() {
  const d = exampleDesk("2026-11-02");
  d.families[0] = AG.createInvite(d.families[0], ISO, { token: TOKEN });
  return d;
}
const form = (o) => new URLSearchParams(o).toString();

test("signing records name, time, version and the hash of the exact text; the link is single-use", () => {
  const d = signDesk();
  const get = AG.handleAgreement(d, "GET", TOKEN, null, NOW);
  assert.equal(get.code, 200);
  assert.equal(get.versionAdded, true);
  assert.equal(get.headers["cache-control"], "no-store");
  const hash = /name="hash" value="([0-9a-f]{64})"/.exec(get.html)[1];
  assert.equal(hash, nodeSha(AG.agreementText(d, d.families[0])));
  const bad = AG.handleAgreement(d, "POST", TOKEN, { name: "Ana", agree: "yes", photos: "none", hash }, NOW);
  assert.equal(bad.code, 400);
  assert.match(bad.html, /full name/);
  const out = AG.handleAgreement(d, "POST", TOKEN, { name: "  Ana   Rivera ", agree: "yes", photos: "public", hash }, NOW + 1000);
  assert.equal(out.code, 200);
  const sig = out.family.agreementSignatures[0];
  assert.equal(sig.name, "Ana Rivera");
  assert.equal(sig.version, 1);
  assert.equal(sig.hash, hash);
  assert.equal(nodeSha(sig.text), hash);
  assert.equal(sig.at, new Date(NOW + 1000).toISOString());
  assert.equal(AG.canShowPhotos(out.family), true);
  d.families[0] = out.family;
  assert.equal(AG.agreementStatus(d, d.families[0]).status, "signed");
  assert.equal(AG.inviteState(d.families[0], NOW), "used");
  const again = AG.handleAgreement(d, "POST", TOKEN, { name: "Someone Else", agree: "yes", photos: "none", hash }, NOW + 2000);
  assert.equal(again.family, undefined);
  assert.match(again.html, /Already signed/);
  const print = AG.agreementPrintPage(d, d.families[0]);
  assert.match(print, /Signed electronically by <b>Ana Rivera<\/b>/);
  assert.ok(print.includes(hash));
});

test("a changed policy, a missing tick, a bad photo choice, expiry and bad tokens are refused", () => {
  const d = signDesk();
  const hash = /name="hash" value="([0-9a-f]{64})"/.exec(AG.handleAgreement(d, "GET", TOKEN, null, NOW).html)[1];
  assert.match(AG.handleAgreement(d, "POST", TOKEN, { name: "Ana Rivera", photos: "none", hash }, NOW).html, /tick/);
  assert.match(AG.handleAgreement(d, "POST", TOKEN, { name: "Ana Rivera", agree: "yes", photos: "all", hash }, NOW).html, /photo options/);
  d.profile.rates.cancelFeePct = 100;
  const changed = AG.handleAgreement(d, "POST", TOKEN, { name: "Ana Rivera", agree: "yes", photos: "none", hash }, NOW);
  assert.equal(changed.code, 400);
  assert.match(changed.html, /changed after you opened/);
  assert.equal(AG.handleAgreement(d, "GET", TOKEN, null, NOW + 15 * 864e5).code, 410);
  assert.equal(AG.handleAgreement(d, "GET", "short", null, NOW).code, 404);
  assert.equal(AG.handleAgreement(d, "GET", "zzzzzzzzzzzzzzzzzzzzzz", null, NOW).code, 404);
  assert.equal(AG.handleAgreement(d, "POST", TOKEN, { website: "spam", name: "A B", agree: "yes", photos: "none", hash }, NOW).family, undefined);
});

test("output is escaped", () => {
  const d = signDesk();
  d.profile.name = `<script>x</script>`;
  d.profile.agreement = { houseRules: `<img src=x onerror=alert(1)>` };
  d.families[0].name = `"><b>`;
  const html = AG.handleAgreement(d, "GET", TOKEN, null, NOW).html + AG.agreementPrintPage(d, d.families[0]);
  assert.doesNotMatch(html, /<script>x|<img src=x|"><b>/);
});

test("sync keeps server-side signatures, used links, photo choices and versions", () => {
  const server = signDesk();
  const hash = /name="hash" value="([0-9a-f]{64})"/.exec(AG.handleAgreement(server, "GET", TOKEN, null, NOW).html)[1];
  server.families[0] = AG.handleAgreement(server, "POST", TOKEN, { name: "Ana Rivera", agree: "yes", photos: "private", hash }, NOW).family;
  const app = signDesk(); // the app's copy: link made, nothing signed, no versions
  const merged = AG.mergeAgreements(server, JSON.parse(JSON.stringify(app)));
  const f = merged.families[0];
  assert.equal(f.agreementSignatures.length, 1);
  assert.equal(f.agreementInvite.used, ISO);
  assert.equal(f.photoConsent, "private");
  assert.equal(merged.agreements.versions.length, 1);
  assert.equal(AG.mergeAgreements(server, merged).families[0].agreementSignatures.length, 1);
});

function fakeRes() {
  return { code: 0, headers: {}, body: "", writeHead(c, h) { this.code = c; this.headers = h; }, end(b) { this.body = String(b ?? ""); } };
}
async function call(h, method, url, body = "") {
  const req = { method, url, headers: { "content-type": "application/x-www-form-urlencoded" }, socket: {}, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); } };
  const res = fakeRes();
  await h(req, res);
  return res;
}

test("server: /agree/<token> signs once, saves, caps the body, and PUT /api/desk keeps the signature", async () => {
  const state = { desk: signDesk() };
  let saves = 0;
  const h = handler(state, () => saves++, { ADMIN_KEY: "k".repeat(20) }, () => NOW, async () => ({ ok: true }));
  const got = await call(h, "GET", `/agree/${TOKEN}`);
  assert.equal(got.code, 200);
  assert.match(got.headers["content-security-policy"], /default-src 'none'/);
  const hash = /name="hash" value="([0-9a-f]{64})"/.exec(got.body)[1];
  assert.equal((await call(h, "POST", `/agree/${TOKEN}`, "x=" + "a".repeat(AG.LIMITS.body))).code, 413);
  const signed = await call(h, "POST", `/agree/${TOKEN}`, form({ name: "Ana Rivera", agree: "yes", photos: "public", hash }));
  assert.equal(signed.code, 200);
  assert.ok(saves >= 2);
  assert.equal(state.desk.families[0].agreementSignatures.length, 1);
  assert.match((await call(h, "GET", `/agree/${TOKEN}`)).body, /Already signed/);
  const app = signDesk();
  const put = { method: "PUT", url: "/api/desk", headers: { authorization: `Bearer ${"k".repeat(20)}` }, socket: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(app)); } };
  const res = fakeRes();
  await h(put, res);
  assert.equal(res.code, 200);
  assert.equal(state.desk.families[0].agreementSignatures[0].name, "Ana Rivera");
  assert.equal(AG.canShowPhotos(state.desk.families[0]), true);
  assert.equal(state.desk.agreements.versions.length, 1);
  assert.equal((await call(h, "GET", "/agreements.mjs")).code, 200);
});
