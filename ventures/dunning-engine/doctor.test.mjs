import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnv, checkStripe, checkReachable, run, render, REQUIRED_EVENTS } from "./doctor.mjs";

const good = { STRIPE_SECRET_KEY: "rk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_x", ADMIN_KEY: "a".repeat(32), LINK_SECRET: "b".repeat(32), PUBLIC_URL: "https://dd.example.com" };
const levels = (rs) => Object.fromEntries(rs.map((r) => [r.name, r.level]));

function stripeFake(routes) {
  return async (url) => {
    const u = new URL(url);
    const r = routes[u.pathname];
    if (!r) return { ok: false, status: 403, json: async () => ({ error: { message: "no permission" } }) };
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body };
  };
}
const allReads = {
  "/v1/invoices": { body: { data: [] } }, "/v1/customers": { body: { data: [] } },
  "/v1/subscriptions": { body: { data: [] } }, "/v1/payment_intents": { body: { data: [] } },
  "/v1/billing_portal/configurations": { body: { data: [{ active: true }] } },
};
const endpoint = (over = {}) => ({ url: "https://dd.example.com/webhook/stripe", status: "enabled", enabled_events: REQUIRED_EVENTS, ...over });

test("a complete dry-run config has no failures", () => {
  assert.equal(checkEnv(good).filter((r) => r.level === "fail").length, 0);
});

test("missing and malformed settings fail", () => {
  const l = levels(checkEnv({ STRIPE_SECRET_KEY: "pk_live_x", HOLDOUT_PCT: "80", POLICY_JSON: "{" }));
  assert.equal(l.STRIPE_SECRET_KEY, "fail"); assert.equal(l.STRIPE_WEBHOOK_SECRET, "fail");
  assert.equal(l.ADMIN_KEY, "fail"); assert.equal(l.PUBLIC_URL, "fail");
  assert.equal(l.HOLDOUT_PCT, "fail"); assert.equal(l.POLICY_JSON, "fail");
});

test("going live needs https, mail settings, and warns about state location", () => {
  const l = levels(checkEnv({ ...good, PUBLIC_URL: "http://x.test", DRY_RUN: "false" }));
  assert.equal(l.PUBLIC_URL, "fail");
  assert.equal(l["RESEND_API_KEY / MAIL_FROM"], "fail");
  assert.equal(l.STATE, "warn");
  assert.equal(levels(checkEnv({ ...good, DRY_RUN: "false", RESEND_API_KEY: "re_1", MAIL_FROM: "a@b.co", STATE: "/data/state.json", COMPANY_ADDRESS: "1 Main" })).STATE, undefined);
});

test("Stripe: healthy account passes, Smart Retries is always a warning", async () => {
  const rs = await checkStripe(good, stripeFake({ ...allReads, "/v1/webhook_endpoints": { body: { data: [endpoint()] } } }));
  assert.equal(rs.filter((r) => r.level === "fail").length, 0);
  assert.equal(levels(rs)["Smart Retries"], "warn");
});

test("Stripe: wrong URL, disabled endpoint and missing events are caught", async () => {
  const mk = (ep) => checkStripe(good, stripeFake({ ...allReads, "/v1/webhook_endpoints": { body: { data: ep } } }));
  assert.equal(levels(await mk([]))["Webhook endpoint"], "fail");
  assert.equal(levels(await mk([endpoint({ url: "https://other/webhook/stripe" })]))["Webhook endpoint"], "fail");
  assert.equal(levels(await mk([endpoint({ status: "disabled" })]))["Webhook endpoint"], "fail");
  const m = (await mk([endpoint({ enabled_events: ["invoice.paid"] })])).find((r) => r.name === "Webhook events");
  assert.equal(m.level, "fail"); assert.match(m.detail, /invoice\.payment_failed/);
  assert.equal(levels(await mk([endpoint({ enabled_events: ["*"] })]))["Webhook events"], "ok");
});

test("Stripe: a rejected key stops early; a missing read permission is named; no active portal fails", async () => {
  const rs = await checkStripe(good, stripeFake({ "/v1/invoices": { status: 401, body: {} } }));
  assert.deepEqual(rs.map((r) => r.name), ["Stripe key"]);
  const r2 = levels(await checkStripe(good, stripeFake({ ...allReads, "/v1/subscriptions": { status: 403, body: {} }, "/v1/billing_portal/configurations": { body: { data: [{ active: false }] } }, "/v1/webhook_endpoints": { body: { data: [endpoint()] } } })));
  assert.equal(r2["Subscriptions read"], "warn"); assert.equal(r2["Customer portal"], "fail");
});

test("reachability: ok, non-200 and network error", async () => {
  assert.equal((await checkReachable(good, async () => ({ ok: true, status: 200 })))[0].level, "ok");
  assert.equal((await checkReachable(good, async () => ({ ok: false, status: 502 })))[0].level, "fail");
  assert.equal((await checkReachable(good, async () => { throw new Error("ECONNREFUSED"); }))[0].level, "warn");
  assert.deepEqual(await checkReachable({}, async () => ({})), []);
});

test("run counts failures and render prints one line per check", async () => {
  const r = await run({ ...good, STRIPE_SECRET_KEY: "" }, async () => ({ ok: true, status: 200 }));
  assert.ok(r.failed >= 1);
  assert.equal(render(r.results).split("\n").length, r.results.length);
});
