// Go-live preflight: `node doctor.mjs` with the same env vars as server.mjs.
// Checks the config and, with a Stripe key, what Stripe can tell us: key
// permissions (read probes only; nothing is written), the webhook endpoint and
// its events, and the customer portal. Exit 1 if any check fails.
import { createStripe } from "./stripe.mjs";

export const REQUIRED_EVENTS = [
  "invoice.payment_failed", "invoice.paid", "invoice.payment_succeeded", "invoice.voided",
  "invoice.marked_uncollectible", "customer.subscription.deleted", "payment_method.attached",
];

const ok = (name, detail) => ({ level: "ok", name, detail });
const warn = (name, detail) => ({ level: "warn", name, detail });
const fail = (name, detail) => ({ level: "fail", name, detail });

export function checkEnv(env) {
  const out = [];
  const key = env.STRIPE_SECRET_KEY || "";
  if (!key) out.push(fail("STRIPE_SECRET_KEY", "not set"));
  else if (!/^(sk|rk)_(test|live)_/.test(key)) out.push(fail("STRIPE_SECRET_KEY", "does not look like a Stripe secret or restricted key"));
  else out.push(ok("STRIPE_SECRET_KEY", `${key.slice(0, 8)}... (${key.includes("_live_") ? "live" : "test"} mode)`));
  if (!/^whsec_/.test(env.STRIPE_WEBHOOK_SECRET || "")) out.push(fail("STRIPE_WEBHOOK_SECRET", "missing or not a whsec_ signing secret (Stripe, Developers, Webhooks, your endpoint)"));
  else out.push(ok("STRIPE_WEBHOOK_SECRET", "set"));
  for (const k of ["ADMIN_KEY", "LINK_SECRET"]) {
    const v = env[k] || "";
    if (!v) out.push(fail(k, "not set"));
    else if (v.length < 16) out.push(warn(k, "shorter than 16 characters; use `openssl rand -hex 16`"));
    else out.push(ok(k, "set"));
  }
  const url = env.PUBLIC_URL || "";
  if (!url) out.push(fail("PUBLIC_URL", "not set; emails would fall back to a Stripe hosted-invoice link that expires"));
  else if (!/^https:\/\//.test(url)) out.push(env.DRY_RUN === "false" ? fail("PUBLIC_URL", "must be https:// before going live") : warn("PUBLIC_URL", "not https://"));
  else out.push(ok("PUBLIC_URL", url));
  const live = env.DRY_RUN === "false";
  if (!live) out.push(ok("DRY_RUN", "on (default): nothing is sent or charged"));
  else {
    out.push(warn("DRY_RUN", "off: this will email customers and retry charges"));
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) out.push(fail("RESEND_API_KEY / MAIL_FROM", "both are required when DRY_RUN=false"));
    else out.push(ok("RESEND_API_KEY / MAIL_FROM", "set"));
    if (!env.COMPANY_ADDRESS) out.push(warn("COMPANY_ADDRESS", "not set; many countries expect a postal address in the footer of customer email"));
    if (env.STATE && !/^\/(data|var|mnt)\//.test(env.STATE)) out.push(warn("STATE", `${env.STATE} may not survive a restart; open cases live in this file, so put it on a volume`));
    if (!env.STATE) out.push(warn("STATE", "unset, so state.json in the working directory; make sure that is on a volume"));
  }
  if (env.POLICY_JSON) {
    try { JSON.parse(env.POLICY_JSON); out.push(ok("POLICY_JSON", "valid JSON")); } catch { out.push(fail("POLICY_JSON", "not valid JSON")); }
  }
  if (env.HOLDOUT_PCT && !(Number(env.HOLDOUT_PCT) >= 0 && Number(env.HOLDOUT_PCT) <= 50)) out.push(fail("HOLDOUT_PCT", "must be 0 to 50"));
  return out;
}

export async function checkStripe(env, fetchImpl = fetch, base = "https://api.stripe.com") {
  const out = [];
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return out;
  const get = async (path) => {
    const res = await fetchImpl(`${base}${path}`, { headers: { authorization: `Bearer ${key}` } });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, json };
  };
  // Read probes only. Write permissions (Invoices write, Customer portal write)
  // cannot be tested without changing something, so they are not claimed.
  for (const [label, path] of [["Invoices read", "/v1/invoices?limit=1"], ["Customers read", "/v1/customers?limit=1"],
    ["Subscriptions read", "/v1/subscriptions?limit=1"], ["PaymentIntents read", "/v1/payment_intents?limit=1"]]) {
    try {
      const r = await get(path);
      if (r.ok) out.push(ok(label, "key can read"));
      else if (r.status === 401) { out.push(fail("Stripe key", "rejected (401): wrong or revoked key")); return out; }
      else if (r.status === 403 || r.status === 400) out.push(label === "Subscriptions read" ? warn(label, "missing; expiry notices need it (or set EXPIRY_NOTICES=false)") : fail(label, r.json?.error?.message || `HTTP ${r.status}`));
      else out.push(warn(label, `HTTP ${r.status}`));
    } catch (e) { out.push(fail(label, `network error: ${e.message}`)); return out; }
  }
  try {
    const r = await get("/v1/billing_portal/configurations?limit=10");
    if (!r.ok) out.push(warn("Customer portal", r.json?.error?.message || `could not read (HTTP ${r.status}); check Settings, Billing, Customer portal is enabled`));
    else if (!r.json.data?.some((c) => c.active)) out.push(fail("Customer portal", "no active configuration; the /update/ link needs one (Settings, Billing, Customer portal)"));
    else out.push(ok("Customer portal", "an active configuration exists"));
  } catch (e) { out.push(warn("Customer portal", e.message)); }
  const want = env.PUBLIC_URL ? `${env.PUBLIC_URL.replace(/\/$/, "")}/webhook/stripe` : null;
  try {
    const r = await get("/v1/webhook_endpoints?limit=100");
    if (!r.ok) out.push(warn("Webhook endpoint", `could not list endpoints (${r.json?.error?.message || r.status}); check them by hand`));
    else if (!want) out.push(warn("Webhook endpoint", "PUBLIC_URL unset, so the endpoint URL cannot be matched"));
    else {
      const ep = r.json.data.find((e) => e.url === want);
      if (!ep) out.push(fail("Webhook endpoint", `none points at ${want}`));
      else {
        if (ep.status !== "enabled") out.push(fail("Webhook endpoint", `${want} is ${ep.status}`));
        else out.push(ok("Webhook endpoint", want));
        const ev = ep.enabled_events || [];
        const missing = ev.includes("*") ? [] : REQUIRED_EVENTS.filter((e) => !ev.includes(e));
        out.push(missing.length ? fail("Webhook events", `missing: ${missing.join(", ")}`) : ok("Webhook events", "all seven required events are enabled"));
      }
    }
  } catch (e) { out.push(warn("Webhook endpoint", e.message)); }
  out.push(warn("Smart Retries", "cannot be read through the API: turn it off in Settings, Billing, Subscriptions and emails, or Stripe and this service will both retry"));
  return out;
}

export async function checkReachable(env, fetchImpl = fetch) {
  if (!env.PUBLIC_URL) return [];
  const url = `${env.PUBLIC_URL.replace(/\/$/, "")}/healthz`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    return [res.ok ? ok("Reachable", `${url} answered ${res.status}`) : fail("Reachable", `${url} answered ${res.status}`)];
  } catch (e) { return [warn("Reachable", `${url} did not answer (${e.message}); start the server first if you have not`)]; }
}

export function render(results) {
  const mark = { ok: "ok  ", warn: "WARN", fail: "FAIL" };
  return results.map((r) => `${mark[r.level]}  ${r.name}: ${r.detail}`).join("\n");
}

export async function run(env, fetchImpl = fetch) {
  const results = [...checkEnv(env), ...(await checkStripe(env, fetchImpl)), ...(await checkReachable(env, fetchImpl))];
  return { results, failed: results.filter((r) => r.level === "fail").length, warned: results.filter((r) => r.level === "warn").length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { results, failed, warned } = await run(process.env);
  console.log(render(results));
  console.log(`\n${failed} failed, ${warned} warnings. ${failed ? "Fix the failures before DRY_RUN=false." : "No blockers found; still test with a test-mode key and `stripe trigger invoice.payment_failed`."}`);
  process.exit(failed ? 1 : 0);
}
