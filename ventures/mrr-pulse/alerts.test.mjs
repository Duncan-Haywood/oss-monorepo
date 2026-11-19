import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, churnAlert, notify, validWebhook, post } from "./alerts.mjs";

const row = (o = {}) => ({ month: "2026-10", mrr: 9000, customers: 9, startMrr: 10000, startCustomers: 10, new: 0, expansion: 0, contraction: 0, churn: 0, churnCount: 0, reactivation: 0, ...o });
const prior = row({ month: "2026-09", mrr: 10000, startMrr: 9000, new: 1000 });
const NOW = Date.UTC(2026, 9, 15);

test("digest names MRR, growth and rates", () => {
  const months = [prior, row({ churn: 1000 })];
  const summary = { month: "2026-10", mrr: 9000, arr: 108000, customers: 9, netNew: -1000, growthPct: -0.1, rates: { basis: "2026-09", logoChurn: 0, nrr: 1.1, grr: 1, quickRatio: null } };
  const t = buildDigest({ company: "Acme", summary, currency: "usd" });
  assert.match(t, /Acme: MRR \$90 .*-10\.0% vs last month/);
  assert.match(t, /quick ratio n\/a/);
  assert.equal(buildDigest({ summary: null }), null);
  assert.equal(months.length, 2);
});

test("churn alert fires over the threshold, once per increase", () => {
  const months = [prior, row({ churn: 600 })];
  assert.equal(churnAlert({ months, currency: "usd", thresholdPct: 0.05 }).churn, 600);
  assert.equal(churnAlert({ months: [prior, row({ churn: 400 })], currency: "usd" }), null);
  assert.equal(churnAlert({ months, currency: "usd", alerted: { month: "2026-10", churn: 600 } }), null);
  assert.ok(churnAlert({ months: [prior, row({ churn: 900 })], currency: "usd", alerted: { month: "2026-10", churn: 600 } }));
  assert.ok(churnAlert({ months, currency: "usd", alerted: { month: "2026-09", churn: 9999 } }));
});

test("notify does nothing without a webhook, and posts a digest at most once per period", async () => {
  const sent = []; const fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true }; };
  const state = { currency: "usd" }; let saves = 0;
  const cfg = { state, save: () => saves++, now: () => NOW, fetch, company: "Acme" };
  const months = [prior, row()];
  assert.deepEqual(await notify(cfg, months), { digest: false, alert: false });
  cfg.webhook = "https://hooks.example/x";
  assert.deepEqual(await notify(cfg, months), { digest: true, alert: false });
  assert.deepEqual(await notify(cfg, months), { digest: false, alert: false });
  cfg.now = () => NOW + 7 * 86400000;
  assert.equal((await notify(cfg, months)).digest, true);
  assert.equal(sent.length, 2); assert.ok(sent[0].text && sent[0].content === sent[0].text); assert.equal(saves, 2);
});

test("a failing webhook throws without recording the send", async () => {
  const state = { currency: "usd" };
  const cfg = { state, save() {}, now: () => NOW, webhook: "https://h/x", fetch: async () => ({ ok: false, status: 500 }) };
  await assert.rejects(() => notify(cfg, [prior, row()]), /500/);
  assert.equal(state.lastDigestAt, undefined);
  await assert.rejects(() => post("https://h", "x", async () => ({ ok: false, status: 404 })), /404/);
});

test("only https webhooks are accepted", () => {
  assert.ok(validWebhook("https://hooks.slack.com/services/x"));
  assert.ok(!validWebhook("http://x")); assert.ok(!validWebhook("nope"));
});

// Red team 2026-11-18: both tests fail with a mutant that used to pass.
test("churn alert stays quiet with no months, or a month that started with no MRR", () => {
  assert.equal(churnAlert({ months: [], currency: "usd" }), null);
  assert.equal(churnAlert({ months: [prior, row({ startMrr: 0, churn: 100 })], currency: "usd" }), null);
});

test("notify formats alerts in the synced currency, not always dollars", async () => {
  const sent = []; const fetch = async (u, o) => { sent.push(JSON.parse(o.body).text); return { ok: true }; };
  const cfg = { state: { currency: "eur" }, save() {}, now: () => NOW, fetch, webhook: "https://hooks.example/x", digestDays: 0 };
  assert.equal((await notify(cfg, [prior, row({ churn: 600 })])).alert, true);
  assert.match(sent[0], /€/);
  assert.doesNotMatch(sent[0], /\$/);
});

// Red team 2026-11-19: two mutants escaped this file's tests.
test("digest signs ordinary growth with a plus", () => {
  const summary = { month: "2026-10", mrr: 10000, arr: 120000, customers: 10, netNew: 1000, growthPct: 0.111, rates: { basis: "2026-09", logoChurn: 0, nrr: 1, grr: 1, quickRatio: null } };
  assert.match(buildDigest({ summary, currency: "usd" }), /\(\+11\.1% vs last month\)/);
});

test("churn alert works from any positive starting MRR, even one cent", () => {
  const a = churnAlert({ months: [row({ startMrr: 1, churn: 1 })], currency: "usd" });
  assert.ok(a);
  assert.equal(a.churn, 1);
});
