import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "./server.mjs";
import { exampleDesk, buildSite, publishableTestimonials } from "./engine.mjs";
import * as R from "./references.mjs";

const NOW = Date.parse("2026-11-02T15:00:00Z");
const ISO = new Date(NOW).toISOString();
// Sentinels: if any of these show up somewhere public, consent leaked.
const SECRET_QUOTE = "SECRET-QUOTE-never-public";
const SECRET_PHONE = "555-0199-NOCONSENT";

function desk() {
  const d = exampleDesk("2026-11-02");
  d.references.push(
    { id: "ref_q", name: "Quinn Private", relationship: "neighbor", contact: SECRET_PHONE, quote: SECRET_QUOTE, received: "2026-10-30" },
    { id: "ref_n", name: "Nora No", relationship: "mom", contact: "555-0177-NO", quote: "NO-SAID-NO", received: "2026-10-30", consentPublic: false, consentContact: false },
    R.createInvite({ id: "ref_t", name: "Teresa Teacher", relationship: "my 10th grade teacher" }, ISO, { token: "tok_teresa_aaaaaaaaaaaaaaaa" }),
  );
  return d;
}

async function serve(state, fetchImpl = async () => ({ ok: true })) {
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adminkey123", NOTIFY_WEBHOOK_URL: "https://ntfy.example/x" }, () => NOW, fetchImpl));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => new Promise((r) => srv.close(r)) };
}
const post = (base, path, fields) => fetch(base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });

test("tokens are random, URL-safe and long enough to guess-proof", () => {
  const seen = new Set(Array.from({ length: 200 }, () => R.newToken()));
  assert.equal(seen.size, 200);
  for (const t of seen) assert.match(t, /^[A-Za-z0-9_-]{24}$/);
  const r = R.createInvite({ id: "x", name: "A B" }, ISO);
  assert.equal(r.invite.expires, "2026-12-02T15:00:00.000Z");
  assert.equal(R.inviteState(r, NOW), "open");
  assert.equal(R.inviteState(r, Date.parse("2026-12-03T00:00:00Z")), "expired");
  assert.equal(R.inviteLink(r, "https://desk.example/"), `https://desk.example/ref/${r.invite.token}`);
  assert.equal(R.findByToken({ references: [r] }, "short"), null);
  assert.equal(R.findByToken({ references: [r] }, r.invite.token).id, "x");
});

test("a referee's answer is stored with time, exact wording and two separate consents", () => {
  const d = desk();
  const ref = d.references.find((r) => r.id === "ref_t");
  const out = R.handleRef(d, "POST", ref.invite.token, { words: "Kind and <b>reliable</b>.", howLong: "2 years", contact: "t@example.com", consentContact: "yes" }, NOW);
  assert.equal(out.code, 200);
  const saved = out.ref;
  assert.equal(saved.quote, "Kind and <b>reliable</b>.");
  assert.equal(saved.consentContact, true);
  assert.equal(saved.consentPublic, false, "only the contact box was ticked");
  assert.equal(saved.invite.used, ISO);
  assert.equal(saved.received, "2026-11-02");
  const pub = saved.consentLog.find((e) => e.scope === "public");
  assert.equal(pub.at, ISO);
  assert.equal(pub.by, "referee");
  assert.equal(pub.wording, R.consentWording("public", "Grace Example", "Teresa Teacher"));
  assert.match(pub.wording, /first name and last initial.*"Teresa T\."/);
  assert.equal(saved.submission.formVersion, R.FORM_VERSION);
  assert.doesNotMatch(out.html, /<b>reliable/, "output is escaped");
  assert.match(out.notice, /Teresa T\./);
  assert.doesNotMatch(out.notice, /t@example|Kind and/, "the push notice carries no words or contact");
});

test("the link is single-purpose: once used it only offers withdrawal; expired and unknown links do nothing", () => {
  const d = desk();
  const i = d.references.findIndex((r) => r.id === "ref_t");
  const tok = d.references[i].invite.token;
  d.references[i] = R.handleRef(d, "POST", tok, { words: "Great with kids.", consentPublic: "yes", consentContact: "yes", contact: "t@example.com" }, NOW).ref;
  const again = R.handleRef(d, "POST", tok, { words: "Overwritten!", consentPublic: "yes" }, NOW + 1000);
  assert.equal(again.ref, undefined, "a second submission is not stored");
  const page = R.handleRef(d, "GET", tok, null, NOW + 1000).html;
  assert.match(page, /withdraw/i);
  assert.doesNotMatch(page, /Great with kids|t@example/, "revisiting the link does not show the words or contact");
  const expired = R.createInvite({ id: "ref_e", name: "Ed Expired" }, "2026-09-01T00:00:00.000Z", { token: "tok_expired_aaaaaaaaaaaaaa" });
  d.references.push(expired);
  const ex = R.handleRef(d, "POST", expired.invite.token, { words: "late", consentPublic: "yes" }, NOW);
  assert.equal(ex.code, 410);
  assert.equal(ex.ref, undefined);
  assert.equal(R.handleRef(d, "GET", "tok_nobody_aaaaaaaaaaaaaaa", null, NOW).code, 404);
});

test("honeypot, size limits and empty answers store nothing", () => {
  const d = desk();
  const tok = d.references.find((r) => r.id === "ref_t").invite.token;
  const hp = R.handleRef(d, "POST", tok, { words: "spam", consentPublic: "yes", website: "http://spam" }, NOW);
  assert.equal(hp.code, 200);
  assert.equal(hp.ref, undefined);
  assert.equal(R.handleRef(d, "POST", tok, { words: "x".repeat(R.LIMITS.words + 1), consentPublic: "yes" }, NOW).code, 400);
  assert.equal(R.handleRef(d, "POST", tok, { words: "", consentPublic: "yes" }, NOW).code, 400);
  // ticking "publish" with no words publishes nothing
  const contactOnly = R.handleRef(d, "POST", tok, { words: "", consentContact: "yes", consentPublic: "yes" }, NOW).ref;
  assert.equal(contactOnly.consentPublic, false);
});

test("withdrawal by the referee takes the quote off the site, and the sitter cannot override it", () => {
  const d = desk();
  const i = d.references.findIndex((r) => r.id === "ref_t");
  const tok = d.references[i].invite.token;
  d.references[i] = R.handleRef(d, "POST", tok, { words: "TERESA-WORDS", consentPublic: "yes", consentContact: "yes" }, NOW).ref;
  assert.match(buildSite(d), /TERESA-WORDS/);
  assert.match(buildSite(d), /Teresa T\./);
  assert.doesNotMatch(buildSite(d), /Teresa Teacher/, "the site shows first name and last initial only");
  const w = R.handleRef(d, "POST", tok, { action: "withdraw", withdrawPublic: "1" }, NOW + 60000);
  d.references[i] = w.ref;
  assert.doesNotMatch(buildSite(d), /TERESA-WORDS/);
  assert.equal(R.consentNow(d.references[i], "contact"), true, "contact consent is separate and stays");
  // the sitter ticks "yes, publish" in the app afterwards: ignored, the referee said no
  d.references[i] = R.recordSitterConsent(d.references[i], { ...d.references[i], consentPublic: true }, new Date(NOW + 120000).toISOString());
  assert.equal(d.references[i].consentPublic, false);
  assert.doesNotMatch(buildSite(d), /TERESA-WORDS/);
  // a sitter's own "no" works too
  const r2 = R.withdrawConsent(d.references[i], ["contact"], ISO, "sitter");
  assert.equal(R.consentNow(r2, "contact"), false);
});

test("sync keeps answers that arrived while the app was offline, including withdrawals", () => {
  const server = desk();
  const app = structuredClone(server);
  const i = server.references.findIndex((r) => r.id === "ref_t");
  server.references[i] = R.handleRef(server, "POST", server.references[i].invite.token, { words: "SYNCED-WORDS", consentPublic: "yes", consentContact: "yes" }, NOW).ref;
  let merged = R.mergeReferences(server, app.references);
  const m = merged.find((r) => r.id === "ref_t");
  assert.equal(m.quote, "SYNCED-WORDS");
  assert.equal(m.consentPublic, true);
  assert.equal(m.invite.used, ISO);
  // referee withdraws on the server; the app still has the old "yes" and syncs
  const appCopy = structuredClone(merged);
  server.references = merged;
  server.references[i] = R.withdrawConsent(server.references[i], ["public"], new Date(NOW + 5000).toISOString(), "referee");
  merged = R.mergeReferences(server, appCopy);
  assert.equal(merged.find((r) => r.id === "ref_t").consentPublic, false);
  assert.equal(publishableTestimonials({ references: merged }).some((q) => q.quote === "SYNCED-WORDS"), false);
});

test("the packet lists only people who agreed to be contacted, with no tokens", () => {
  const d = desk();
  const i = d.references.findIndex((r) => r.id === "ref_t");
  d.references[i] = R.handleRef(d, "POST", d.references[i].invite.token, { words: "PACKET-WORDS", howLong: "3 years", contact: "teresa@example.com", consentContact: "yes" }, NOW).ref;
  d.references[0] = R.recordSitterConsent(d.references[0], { ...d.references[0], consentContact: true }, ISO);
  const html = R.referencePacket(d, "2026-11-02", { forFamily: "Park family" });
  assert.match(html, /Teresa Teacher/);
  assert.match(html, /teresa@example\.com/);
  assert.match(html, /3 years/);
  assert.match(html, /CPR and First Aid/, "certifications");
  assert.match(html, /Ana Rivera/);
  assert.match(html, /555-0111|Grace is calm/, "Ana: sitter-recorded contact consent, and she agreed to the quote earlier");
  assert.doesNotMatch(html, /PACKET-WORDS/, "Teresa did not agree to her words being shown");
  for (const s of [SECRET_QUOTE, SECRET_PHONE, "Quinn", "Nora", "555-0177-NO", "NO-SAID-NO", "David Chen", "tok_"]) assert.ok(!html.includes(s), `packet leaked ${s}`);
  assert.equal(R.packetEntries(d).length, 2);
});

test("no quote or contact without consent reaches any public route", async () => {
  const state = { desk: desk() };
  const calls = [];
  const s = await serve(state, async (url, init) => { calls.push(String(init.body)); return { ok: true }; });
  try {
    const tok = "tok_teresa_aaaaaaaaaaaaaaaa";
    const form = await (await fetch(`${s.base}/ref/${tok}`)).text();
    assert.match(form, /New families may contact me/);
    assert.match(form, /My words may appear on the website, as first name and last initial/);
    assert.match(form, /name="website"/, "honeypot present");
    const r = await post(s.base, `/ref/${tok}`, { words: "ROUTE-WORDS <script>x</script>", consentContact: "yes", contact: "route@example.com" });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(state.desk.references.find((x) => x.id === "ref_t").quote, "ROUTE-WORDS <script>x</script>");
    assert.equal(calls.length, 1);
    assert.doesNotMatch(calls[0], /ROUTE-WORDS|route@example/);
    assert.equal((await post(s.base, `/ref/${tok}`, { words: "x".repeat(20000) })).status, 413);
    const publicPaths = ["/", "/site", `/ref/${tok}`, "/ref/tok_nobody_aaaaaaaaaaaaaaa", "/ref/", "/references.mjs", "/api/desk"];
    for (const p of publicPaths) {
      const body = await (await fetch(s.base + p)).text();
      for (const leak of [SECRET_QUOTE, SECRET_PHONE, "NO-SAID-NO", "555-0177-NO", "ROUTE-WORDS", "route@example.com"]) assert.ok(!body.includes(leak), `${p} leaked ${leak}`);
      if (p !== `/ref/${tok}`) assert.ok(!body.includes(tok), `${p} leaked a token`);
    }
    assert.match(await (await fetch(`${s.base}/site`)).text(), /Grace is calm/, "the consented quote still shows");
    // the app syncs a stale copy; the server-side answer survives
    const stale = desk();
    const put = await fetch(`${s.base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer adminkey123", "content-type": "application/json" }, body: JSON.stringify(stale) });
    const back = (await put.json()).desk.references.find((x) => x.id === "ref_t");
    assert.equal(back.quote, "ROUTE-WORDS <script>x</script>");
    assert.equal(back.consentContact, true);
    assert.equal(back.consentPublic, false);
  } finally { await s.close(); }
});

test("request templates fit the relationship and follow up twice, then stop", () => {
  const p = { name: "Grace Example" };
  const kinds = { "mom of two": "parent", "my 10th grade teacher": "teacher", "children's ministry director": "church", "soccer coach": "coach", "store manager": "employer", "neighbor": "other" };
  for (const [rel, kind] of Object.entries(kinds)) assert.equal(R.relationshipKind({ relationship: rel }), kind, rel);
  const msgs = Object.keys(R.RELATIONSHIPS).map((k) => R.requestMessage({ name: "Pat Lee" }, p, { kind: k }));
  assert.equal(new Set(msgs).size, 6);
  for (const m of msgs) { assert.match(m, /^Hi Pat!/); assert.match(m, /A yes to one is not a yes to the other/); }
  const withLink = R.requestMessage({ name: "Pat Lee" }, p, { link: "https://d.example/ref/abc", kind: "teacher" });
  assert.match(withLink, /https:\/\/d\.example\/ref\/abc/);
  assert.match(withLink, /30 days/);
  const ref = { name: "Pat Lee", requested: "2026-11-01" };
  assert.equal(R.nextStep({ name: "Pat" }, "2026-11-02", p).action, "ask");
  assert.equal(R.nextStep(ref, "2026-11-02", p).action, "wait");
  assert.equal(R.nextStep(ref, "2026-11-04", p).due, "2026-11-06");
  const f1 = R.nextStep(ref, "2026-11-06", p);
  assert.equal(f1.action, "follow up");
  assert.equal(f1.step, 1);
  assert.equal(R.nextStep({ ...ref, followUps: 1 }, "2026-11-12", p).action, "wait");
  assert.match(R.nextStep({ ...ref, followUps: 1 }, "2026-11-13", p).message, /last nudge/);
  assert.equal(R.nextStep({ ...ref, followUps: 2 }, "2026-12-30", p).action, "stop");
  assert.equal(R.nextStep({ ...ref, received: "2026-11-03" }, "2026-11-05", p).action, "done");
});
