import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { dueStep, runWinback, buildWinback, unsubToken, readUnsubToken, mergeWinback, summarizeWinback } from "./winback.mjs";
import { handler, newState } from "./server.mjs";
import { signPayload } from "./stripe.mjs";

const DAY = 86400000, T0 = Date.UTC(2026, 8, 1);
const churned = (o = {}) => ({ id: "j1", sub: "sub_1", customer: "cus_1", reason: "too_expensive", outcome: "canceled", churned: true, churnedAt: T0, ...o });
const steps = mergeWinback().steps;

test("due: nothing before the first delay, step 0 after 14 days, step 1 only after 60", () => {
  const s = churned();
  assert.equal(dueStep(s, { now: T0 + 13 * DAY, steps }), null);
  assert.equal(dueStep(s, { now: T0 + 14 * DAY, steps }), 0);
  s.winback = { sent: [{ step: 0, at: T0 }] };
  assert.equal(dueStep(s, { now: T0 + 30 * DAY, steps }), null);
  assert.equal(dueStep(s, { now: T0 + 60 * DAY, steps }), 1);
  s.winback.sent.push({ step: 1, at: T0 });
  assert.equal(dueStep(s, { now: T0 + 400 * DAY, steps }), null);
});

test("due: never for opt-outs, saved or unfinished sessions, or people who came back", () => {
  const now = T0 + 90 * DAY;
  assert.equal(dueStep(churned(), { now, steps, optedOut: 1 }), null);
  assert.equal(dueStep(churned({ outcome: "saved" }), { now, steps }), null);
  assert.equal(dueStep(churned({ churned: false, churnedAt: null }), { now, steps }), null);
  assert.equal(dueStep(churned({ winback: { sent: [], won: true } }), { now, steps }), null);
});

test("due: a dry-run mark does not block a live send", () => {
  const s = churned({ winback: { sent: [{ step: 0, at: T0, dry: true }] } });
  assert.equal(dueStep(s, { now: T0 + 20 * DAY, steps, live: false }), null);
  assert.equal(dueStep(s, { now: T0 + 20 * DAY, steps, live: true }), 0);
});

test("mergeWinback clamps delays and step count", () => {
  const m = mergeWinback({ steps: [{ afterDays: 9999 }, { afterDays: -5 }, {}, {}, {}, {}], maxPerRun: 9999 });
  assert.equal(m.steps.length, 4);
  assert.ok(m.steps.every((x) => x.afterDays >= 1 && x.afterDays <= 365));
  assert.equal(m.maxPerRun, 200);
});

test("email: reason-specific, plain text, unsubscribe and address always present, code only on the last", () => {
  const base = { reason: "too_expensive", company: "Acme", url: "https://a.example/pricing", address: "1 Main St, Town", unsubUrl: "https://c.example/u/x", code: "COMEBACK" };
  const first = buildWinback({ ...base, step: { last: false } });
  assert.match(first.text, /price was the reason/);
  assert.ok(first.text.includes("https://c.example/u/x") && first.text.includes("1 Main St, Town") && first.text.includes(base.url));
  assert.ok(!first.text.includes("COMEBACK"));
  const last = buildWinback({ ...base, step: { last: true } });
  assert.match(last.text, /COMEBACK/);
  assert.match(last.text, /last note/);
  assert.ok(!/<[a-z]/i.test(last.text));
});

test("unsubscribe tokens bind to the customer and reject tampering", () => {
  const t = unsubToken("s", "cus_1");
  assert.equal(readUnsubToken("s", t), "cus_1");
  assert.equal(readUnsubToken("other", t), null);
  assert.equal(readUnsubToken("s", unsubToken("s", "cus_2").replace(/^[^.]+/, t.split(".")[0])), null);
  assert.equal(readUnsubToken("s", "junk"), null);
});

const mkDeps = (over = {}) => {
  const sent = [];
  return { sent, deps: { stripe: { hasActiveSubscription: async () => false, getCustomer: async () => ({ email: "a@b.co" }) }, sendEmail: async (m) => sent.push(m), dryRun: false, publicUrl: "https://c.example", linkSecret: "ls", company: "Acme", address: "1 Main St", url: "https://a.example", ...over } };
};

test("runner sends once per step, then waits for the next delay", async () => {
  const state = { sessions: { j1: churned() }, optouts: {} };
  const { sent, deps } = mkDeps();
  await runWinback(state, T0 + 15 * DAY, deps);
  await runWinback(state, T0 + 16 * DAY, deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "a@b.co");
  assert.match(sent[0].unsubUrl, /\/u\//);
  await runWinback(state, T0 + 61 * DAY, deps);
  assert.equal(sent.length, 2);
});

test("runner dry run sends nothing but remembers, and goes live later", async () => {
  const state = { sessions: { j1: churned() }, optouts: {} };
  const { sent, deps } = mkDeps({ dryRun: true });
  const log = await runWinback(state, T0 + 15 * DAY, deps);
  assert.match(log[0], /would send/);
  assert.equal(sent.length, 0);
  await runWinback(state, T0 + 16 * DAY, deps);
  assert.equal(state.sessions.j1.winback.sent.length, 1);
  deps.dryRun = false;
  await runWinback(state, T0 + 17 * DAY, deps);
  assert.equal(sent.length, 1);
});

test("runner skips opted-out customers and marks resubscribed ones as won without emailing", async () => {
  const a = { sessions: { j1: churned() }, optouts: { cus_1: 1 } };
  const x = mkDeps();
  await runWinback(a, T0 + 20 * DAY, x.deps);
  assert.equal(x.sent.length, 0);
  const b = { sessions: { j1: churned() }, optouts: {} };
  const y = mkDeps({ stripe: { hasActiveSubscription: async () => true, getCustomer: async () => ({ email: "a@b.co" }) } });
  await runWinback(b, T0 + 20 * DAY, y.deps);
  assert.equal(y.sent.length, 0);
  assert.equal(b.sessions.j1.winback.won, true);
});

test("runner survives a failing send and keeps going; respects maxPerRun", async () => {
  const state = { sessions: { j1: churned(), j2: churned({ id: "j2", customer: "cus_2" }), j3: churned({ id: "j3", customer: "cus_3" }) }, optouts: {} };
  let n = 0;
  const { deps } = mkDeps({ sendEmail: async () => { if (++n === 1) throw new Error("boom"); }, winback: { maxPerRun: 1 } });
  const log = await runWinback(state, T0 + 20 * DAY, deps);
  assert.match(log[0], /failed: boom/);
  assert.equal(state.sessions.j1.winback, undefined);
  assert.equal(log.filter((l) => /sent/.test(l)).length, 1);
});

test("summary counts only real sends; resubscribe rate is among emailed", () => {
  const s = summarizeWinback([
    churned({ winback: { sent: [{ step: 0, dry: false }], won: true } }),
    churned({ winback: { sent: [{ step: 0, dry: false }, { step: 1, dry: false }] } }),
    churned({ winback: { sent: [{ step: 0, dry: true }] } }),
  ], { cus_9: 1 });
  assert.deepEqual(s, { emailed: 2, sent: 3, optedOut: 1, resubscribed: 1, resubscribeRate: 50 });
});

async function boot() {
  const saves = [];
  const cfg = { state: newState(), save: () => saves.push(1), stripe: {}, webhookSecret: "whsec", linkSecret: "ls", adminKey: "adm", publicUrl: "https://c.example", dryRun: false, now: () => T0 + 5 * DAY };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const hook = (event) => { const raw = JSON.stringify(event); return fetch(`${base}/webhook/stripe`, { method: "POST", headers: { "stripe-signature": signPayload(raw, "whsec", Math.floor((T0 + 5 * DAY) / 1000)) }, body: raw }); };
  return { cfg, base, hook, close: () => server.close() };
}

test("webhook stamps churnedAt, and a later subscription.created marks the win-back", async () => {
  const s = await boot();
  s.cfg.state.sessions.j1 = { id: "j1", sub: "sub_1", customer: "cus_1", reason: "other", outcome: "canceled" };
  await s.hook({ id: "evt_1", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
  assert.equal(s.cfg.state.sessions.j1.churnedAt, T0 + 5 * DAY);
  await s.hook({ id: "evt_2", type: "customer.subscription.created", data: { object: { id: "sub_9", customer: "cus_1" } } });
  assert.equal(s.cfg.state.sessions.j1.winback, undefined, "not emailed yet, so not a win-back");
  s.cfg.state.sessions.j1.winback = { sent: [{ step: 0, at: T0, dry: false }] };
  await s.hook({ id: "evt_3", type: "customer.subscription.created", data: { object: { id: "sub_10", customer: "cus_1" } } });
  assert.equal(s.cfg.state.sessions.j1.winback.won, true);
  s.close();
});

test("unsubscribe: GET only shows a button, POST records the opt-out, bad token is 410", async () => {
  const s = await boot();
  const tok = unsubToken("ls", "cus_1");
  const get = await fetch(`${s.base}/u/${tok}`);
  assert.equal(get.status, 200);
  assert.match(await get.text(), /<button>/);
  assert.equal(s.cfg.state.optouts.cus_1, undefined);
  const post = await fetch(`${s.base}/u/${tok}`, { method: "POST" });
  assert.match(await post.text(), /unsubscribed/);
  assert.ok(s.cfg.state.optouts.cus_1);
  assert.equal((await fetch(`${s.base}/u/bad.token`)).status, 410);
  s.close();
});
