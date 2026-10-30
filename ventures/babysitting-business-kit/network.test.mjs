import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import * as N from "./network.mjs";
import * as NS from "./network-server.mjs";
import { handler } from "./server.mjs";
import { exampleDesk, normalizeDesk, addDays } from "./engine.mjs";
import { referralCode, creditReferral } from "./print.mjs";

const TODAY = "2026-11-02"; // a Monday
const sitters = () => [
  { id: "sit_beth", name: "Beth Ortiz", contact: "555-0190", ages: "6 months-12", maxKids: 3, area: "Riverside", availability: "Mon-Sun 8-23", cprSeen: true, cprSeenOn: "2026-09-01" },
  { id: "sit_kim", name: "Kim Lee", contact: "kim@example.com", ages: "5+", maxKids: 2, area: "Springfield", availability: "Sat 8-18" },
];
const deskWith = () => { const d = exampleDesk(TODAY); d.network = { sitters: sitters(), sent: [] }; return d; };

test("age ranges read the way sitters write them", () => {
  assert.deepEqual(N.parseAgeRange("6 months-12"), [6, 155]);
  assert.deepEqual(N.parseAgeRange("6-18 months"), [6, 18]);
  assert.deepEqual(N.parseAgeRange("2 to 10"), [24, 131]);
  assert.deepEqual(N.parseAgeRange("5+"), [60, Infinity]);
  assert.deepEqual(N.parseAgeRange("infants to 8"), [0, 107]);
  assert.equal(N.parseAgeRange(""), null);
  assert.equal(N.monthsOld("2023-09-10", "2026-11-02"), 37);
  assert.equal(N.monthsOld("2023-11-10", "2026-11-02"), 35);
});

test("backups are ranked by ages, availability, kid count and a seen CPR card, with reasons", () => {
  const d = deskWith();
  const req = N.requestFromLead({ id: "l1", name: "Hannah Brooks", contact: "555-0133", kids: ["3", "18 months"], schedule: "Fri 18-23" });
  const [first, second] = N.suggestBackups(d, req);
  assert.equal(first.sitter.id, "sit_beth");
  assert.equal(first.score, 95);
  assert.ok(first.reasons.some((r) => /CPR card/.test(r)));
  assert.equal(second.sitter.id, "sit_kim");
  assert.ok(second.cautions.some((c) => /18 months/.test(c)));
  assert.ok(second.cautions.some((c) => /not usually free/.test(c)));
  assert.ok(second.cautions.includes("you have not seen their CPR card"));
  d.network.sitters[0].active = false;
  assert.equal(N.suggestBackups(d, req).length, 1);
});

test("a family's contact reaches the backup only after the family said so, and the OK is recorded", () => {
  const d = deskWith();
  const req = N.requestFromLead({ id: "l1", name: "Hannah Brooks", contact: "555-0133", kids: ["3", "6"], schedule: "Fri 18-23" });
  const s = d.network.sitters[0];
  const fam = N.familyMessage(d, req, s);
  assert.match(fam, /^Hi Hannah,/);
  assert.match(fam, /my friend Beth Ortiz is wonderful/);
  assert.match(fam, /seen Beth's current CPR card/);
  assert.match(fam, /only give Beth your number if you say so/);
  let entry = N.passOn(d, req, s.id, TODAY, "net_1");
  assert.equal(entry.status, "suggested");
  assert.doesNotMatch(N.backupMessage(d, req, s, entry), /555-0133/);
  assert.match(N.backupMessage(d, req, s, entry), /haven't shared their details/);
  entry = N.recordConsent(entry, { share: true, contact: false, how: "text" }, "2026-11-02T16:00:00Z");
  assert.ok(N.canShare(entry) && !N.canShareContact(entry));
  assert.doesNotMatch(N.backupMessage(d, req, s, entry), /555-0133/);
  entry = N.recordConsent(entry, { share: true, contact: true, how: "call" }, "2026-11-02T16:05:00Z");
  assert.deepEqual(entry.consent, { share: true, contact: true, how: "call", note: "", at: "2026-11-02T16:05:00Z" });
  assert.match(N.backupMessage(d, req, s, entry), /Hannah, 555-0133/);
  assert.equal(N.recordConsent(entry, { share: false, contact: true }).consent.contact, false, "no contact without the share OK");
  // religion never enters: a lead asking for prayers ranks the same backups the same way
  const faith = N.requestFromLead({ id: "l2", name: "Hannah", kids: ["3", "6"], schedule: "Fri 18-23", faithActivities: true, notes: "bedtime prayers" });
  assert.deepEqual(N.suggestBackups(d, faith).map((x) => [x.sitter.id, x.score]), N.suggestBackups(d, req).map((x) => [x.sitter.id, x.score]));
});

test("overflow lists inquiries the sitter has to turn down", () => {
  const d = deskWith();
  d.leads.push({ id: "l_far", name: "Far Away", kids: ["4"], schedule: "Sun 9-12", status: "new" }); // Sunday is off
  const ids = N.overflowLeads(d).map((x) => x.lead.id);
  assert.ok(ids.includes("l_far"));
  assert.ok(ids.includes("lead_2"), "the 4-month-old full-time lead is under the sitter's youngest age");
  assert.ok(!ids.includes("lead_1"));
});

test("sub-for-me lists booked sits in the next N days with a backup offer or a no-fee cancel", () => {
  const d = deskWith();
  const subs = N.subForMe(d, TODAY, 3);
  assert.equal(subs.length, 1); // bk_4 repeats weekly from tomorrow
  const s = subs[0];
  assert.equal(s.sit.date, addDays(TODAY, 1));
  assert.equal(s.backup.sitter.id, "sit_beth");
  assert.deepEqual(s.req.kids, [67, 37]);
  assert.match(s.offer, /I'm sick and can't safely sit/);
  assert.match(s.offer, /no fee/);
  assert.match(s.cancel, /There's no cancellation fee/);
  assert.equal(N.subForMe(d, TODAY, 8).length, 1);
  assert.equal(N.subForMe(d, TODAY, 9).length, 2); // the next weekly repeat is 8 days out
  // cancelling one date of a repeat skips just that date
  const b = N.cancelNoFee(d.bookings, s.sit.key, TODAY);
  assert.deepEqual(b.find((x) => x.id === "bk_4").skip, [addDays(TODAY, 1)]);
  assert.equal(N.subForMe({ ...d, bookings: b }, TODAY, 3).length, 0);
  const single = N.cancelNoFee([{ id: "x", date: TODAY, start: "18:00", end: "21:00", status: "scheduled" }], "x", TODAY)[0];
  assert.equal(single.status, "cancelled");
  assert.equal(single.cancelFee, 0);
  // no backups: the cancel draft stands alone
  const lone = exampleDesk(TODAY);
  assert.equal(N.subForMe(lone, TODAY, 3)[0].backup, null);
});

test("referrals both ways: sent out, from sitters (handoff or named), from families (print.mjs codes)", () => {
  const d = deskWith();
  d.network.sent.push({ id: "n1", sitterId: "sit_beth", status: "booked" }, { id: "n2", sitterId: "sit_beth", status: "asked" }, { id: "n3", sitterId: "sit_kim", status: "declined" });
  d.leads.push({ id: "a", name: "A", source: "Beth Ortiz sent me", status: "booked" });
  d.leads.push({ id: "b", name: "B", source: "my friend kim", status: "new" });
  d.leads.push({ id: "c", name: "C", source: "sitter network: Beth", referredBySitter: "sit_beth", status: "new" });
  d.leads.push(creditReferral({ id: "e", name: "E", source: `card ${referralCode(d.families[0])}`, status: "booked" }, d));
  const st = N.networkStats(d);
  assert.deepEqual(st.sentOut.map((r) => [r.sitter, r.sent, r.booked]), [["Beth Ortiz", 2, 1], ["Kim Lee", 1, 0]]);
  assert.deepEqual(st.fromSitters.map((r) => [r.sitter, r.leads, r.booked]), [["Beth Ortiz", 2, 1], ["Kim Lee", 1, 0]]);
  assert.deepEqual(st.fromFamilies.map((r) => [r.family, r.leads]), [["Rivera family", 1]]);
  assert.deepEqual(st.totals, { sent: 3, sentBooked: 1, received: 3, receivedBooked: 1 });
});

test("HMAC signatures verify, and stale or altered ones do not", () => {
  const sec = "0123456789abcdef0123", ts = "1793635200000", body = '{"v":1}';
  const sig = NS.signHandoff(sec, ts, body);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.ok(NS.verifyHandoff(sec, ts, body, sig, Number(ts) + 1000));
  assert.ok(!NS.verifyHandoff(sec, ts, body + " ", sig, Number(ts)));
  assert.ok(!NS.verifyHandoff("another-secret-xxxxx", ts, body, sig, Number(ts)));
  assert.ok(!NS.verifyHandoff(sec, ts, body, sig, Number(ts) + 6 * 60 * 1000));
  const peers = NS.peerSecrets({ NETWORK_PEERS: "beth=" + sec + ", short=abc" }, { network: { sitters: [{ peerId: "Kim", peerSecret: "k".repeat(20) }] } });
  assert.deepEqual([...peers.keys()].sort(), ["beth", "kim"]);
});

async function serve(state, env, now) {
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, env, now));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, saves: () => saves, close: () => new Promise((r) => srv.close(r)) };
}

test("two kit servers: a signed handoff after the family's OK arrives as a lead with only first name, ages and time", async () => {
  const now = () => Date.parse("2026-11-02T16:00:00Z");
  const secret = "s3cret-shared-by-grace-and-beth";
  const beth = { desk: normalizeDesk({ profile: { name: "Beth Ortiz" }, network: { sitters: [{ id: "sit_grace", name: "Grace Example", peerId: "grace" }], sent: [] } }) };
  const B = await serve(beth, { ADMIN_KEY: "b".repeat(32), NETWORK_ID: "beth", NETWORK_PEERS: `grace=${secret}`, TZ: "UTC" }, now);
  const grace = { desk: deskWith() };
  grace.desk.network.sitters[0] = { ...grace.desk.network.sitters[0], peerId: "beth", peerUrl: B.base };
  const A = await serve(grace, { ADMIN_KEY: "a".repeat(32), NETWORK_ID: "grace", NETWORK_PEERS: `beth=${secret}`, TZ: "UTC" }, now);
  const post = (body, key = "a".repeat(32)) => fetch(`${A.base}/api/network/handoff`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const req = N.requestFromLead(grace.desk.leads[0]);
    const entry = { ...N.passOn(grace.desk, req, "sit_beth", "2026-11-02", "net_h1"), contactOnFile: req.contact };
    assert.equal((await post({ entry }, "wrong")).status, 401);
    let r = await post({ entry });
    assert.equal(r.status, 409, "refused without the family's OK");
    assert.equal(beth.desk.leads.length, 0);
    r = await post({ entry: N.recordConsent(entry, { share: true, how: "text" }, "2026-11-02T15:55:00Z") });
    const out = await r.json();
    assert.equal(r.status, 200, JSON.stringify(out));
    assert.equal(beth.desk.leads.length, 1);
    const lead = beth.desk.leads[0];
    assert.equal(lead.name, "Hannah");
    assert.deepEqual(lead.kids, ["3 years", "6 years"]);
    assert.equal(lead.schedule, "Fri 18-23");
    assert.equal(lead.contact, "");
    assert.equal(lead.referredBySitter, "sit_grace");
    assert.equal(lead.source, "sitter network: Grace Example");
    assert.doesNotMatch(JSON.stringify(lead), /Brooks|555-0133|prayer/i, "no surname, contact or notes cross over");
    assert.equal(out.handoff.leadId, lead.id);
    assert.equal(grace.desk.network.sent[0].status, "passed on");
    // sending again is idempotent
    await post({ entry: grace.desk.network.sent[0] });
    assert.equal(beth.desk.leads.length, 1);
    // Beth's stats credit Grace
    assert.deepEqual(N.networkStats(beth.desk).fromSitters.map((x) => [x.sitter, x.leads]), [["Grace Example", 1]]);
    // a forged or unknown-peer request is refused
    const body = JSON.stringify({ v: 1, ref: "x", firstName: "Eve", kids: [], when: "" });
    const ts = String(now());
    const forged = await fetch(`${B.base}/network/handoff`, { method: "POST", headers: { "x-kit-peer": "grace", "x-kit-timestamp": ts, "x-kit-signature": NS.signHandoff("wrong-secret-xxxxxxxx", ts, body) }, body });
    assert.equal(forged.status, 401);
    const unknown = await fetch(`${B.base}/network/handoff`, { method: "POST", headers: { "x-kit-peer": "mallory", "x-kit-timestamp": ts, "x-kit-signature": NS.signHandoff(secret, ts, body) }, body });
    assert.equal(unknown.status, 404);
    assert.equal(beth.desk.leads.length, 1);
    // the app's next sync keeps the handoff the server recorded
    const appNet = structuredClone(grace.desk.network);
    delete appNet.sent[0].handoff; appNet.sent[0].status = "asked";
    const put = await fetch(`${A.base}/api/desk`, { method: "PUT", headers: { authorization: `Bearer ${"a".repeat(32)}`, "content-type": "application/json" }, body: JSON.stringify({ ...grace.desk, network: appNet }) });
    assert.equal(put.status, 200);
    assert.equal(grace.desk.network.sent[0].handoff.leadId, lead.id);
    assert.equal(grace.desk.network.sent[0].status, "passed on");
  } finally { await A.close(); await B.close(); }
});

test("the handoff is off until configured", async () => {
  const now = () => Date.parse("2026-11-02T16:00:00Z");
  const S = await serve({ desk: deskWith() }, { ADMIN_KEY: "a".repeat(32) }, now);
  try {
    const body = JSON.stringify({ v: 1, ref: "x", firstName: "A" }), ts = String(now());
    const r = await fetch(`${S.base}/network/handoff`, { method: "POST", headers: { "x-kit-peer": "beth", "x-kit-timestamp": ts, "x-kit-signature": NS.signHandoff("x".repeat(20), ts, body) }, body });
    assert.equal(r.status, 404);
    const d = deskWith();
    d.network.sent.push(N.recordConsent({ id: "n", sitterId: "sit_beth", firstName: "A", kids: [] }, {}, "t"));
    d.network.sitters[0].peerId = "beth"; d.network.sitters[0].peerUrl = "https://beth.example";
    assert.equal((await NS.sendHandoff(d, "n", {}, now(), async () => assert.fail("must not fetch"))).status, 503);
    d.network.sitters[0].peerUrl = "http://beth.example";
    assert.equal((await NS.sendHandoff(d, "n", { NETWORK_ID: "g", NETWORK_PEERS: "beth=" + "x".repeat(20) }, now(), async () => assert.fail("must not fetch"))).status, 400, "plain http only to localhost");
  } finally { await S.close(); }
});

test("normalizeDesk keeps the network, the app and image ship the files, the env vars are documented", () => {
  assert.deepEqual(normalizeDesk({ network: { sitters: [{ id: "s" }], sent: [] } }).network.sitters, [{ id: "s" }]);
  const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const html = read("./index.html");
  assert.match(html, /data-tab="network"/);
  assert.match(html, /import \{ mountNetwork \} from "\.\/network-ui\.mjs"/);
  for (const f of ["network.mjs", "network-server.mjs", "network-ui.mjs"]) assert.ok(read("./Dockerfile").includes(` ${f}`), f);
  for (const k of ["NETWORK_ID", "NETWORK_PEERS"]) assert.ok(read("./self-host.html").includes(`<code>${k}</code>`), k);
  assert.doesNotMatch(read("./network.mjs"), /node:/, "the browser half has no Node imports");
});
