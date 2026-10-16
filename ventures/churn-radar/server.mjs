#!/usr/bin/env node
// Self-hosted churn prediction. Zero dependencies; state in one JSON file.
//   API_KEY=... ADMIN_KEY=... [STRIPE_WEBHOOK_SECRET=whsec_...] [ALERT_WEBHOOK_URL=https://...] node server.mjs
// Events come from your app (POST /v1/events); cancellations from your app or a Stripe webhook.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual, createHmac } from "node:crypto";
import * as E from "./engine.mjs";
import { verifySignature } from "./stripe.mjs";

const env = process.env;
const RETRAIN_MS = 6 * 3_600_000;

const readBody = (req, max = 1_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => { const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`); return Boolean(key) && a.length === b.length && timingSafeEqual(a, b); };

/** POSTs an at-risk alert to your own URL, signed: x-radar-signature = sha256=HMAC(secret, body). 2xx is delivered. */
export function webhookSender({ url, secret, fetchImpl = fetch }) {
  return async (alert) => {
    const body = JSON.stringify(alert), headers = { "content-type": "application/json", "user-agent": "churn-radar" };
    if (secret) headers["x-radar-signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const r = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  };
}

/** Retrain when stale. The fitted result lives in state so a restart does not lose it. */
export function ensureModel(state, now, force = false) {
  if (force || !state.model || now - state.modelAt > RETRAIN_MS) { state.model = E.train(state.accounts, now); state.modelAt = now; }
  return state.model;
}

/** Alert once per account per 14 days when it first crosses the threshold. Failures keep the account un-alerted for the next pass. */
export async function runAlerts(state, send, now) {
  const trained = ensureModel(state, now), th = E.threshold(trained), sent = [];
  for (const r of E.score(state.accounts, trained, now)) {
    if (r.risk < th || (state.alerted[r.id] && now - state.alerted[r.id] < 14 * E.DAY)) continue;
    try { await send({ type: "account.at_risk", account: r.id, risk: Number(r.risk.toFixed(3)), calibrated: r.calibrated, reasons: r.reasons, at: new Date(now).toISOString() }); state.alerted[r.id] = now; sent.push(r.id); }
    catch (e) { console.error("alert failed:", e.message); break; }
  }
  return sent;
}

// cfg: {state, save, apiKey, adminKey, stripeSecret, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname, q = url.searchParams;
    const json = (code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body, null, 2)); };
    try {
      if (path === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok\n"); }
      if (req.method === "GET" && path === "/sdk.mjs" && cfg.sdk) { res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" }); return res.end(cfg.sdk); }
      if (path === "/") return json(200, { name: "churn-radar", accounts: Object.keys(cfg.state.accounts).length, docs: "https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/churn-radar" });

      if (req.method === "POST" && path === "/stripe/webhook") {
        const raw = await readBody(req);
        if (!cfg.stripeSecret) return json(404, { error: "STRIPE_WEBHOOK_SECRET is not set" });
        if (!verifySignature(raw, req.headers["stripe-signature"], cfg.stripeSecret, Math.floor(now() / 1000))) return json(400, { error: "bad signature" });
        const ev = JSON.parse(raw), sub = ev.data?.object || {};
        const account = sub.metadata?.account_id || sub.customer;
        if (account && ev.type === "customer.subscription.deleted") { E.setOutcome(cfg.state, String(account), (sub.ended_at || sub.canceled_at || Math.floor(now() / 1000)) * 1000, now()); cfg.save(); }
        else if (account && ev.type === "customer.subscription.created") { E.clearOutcome(cfg.state, String(account)); cfg.save(); }
        return json(200, { received: true });
      }

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        if (req.method === "POST" && path === "/v1/admin/retrain") { const t = ensureModel(cfg.state, now(), true); cfg.save(); return json(200, summary(t)); }
        return json(404, { error: "not found" });
      }

      if (path.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.apiKey)) return json(401, { error: "bad API key" });
        if (req.method === "POST" && path === "/v1/events") {
          const b = JSON.parse((await readBody(req)) || "{}");
          const list = Array.isArray(b.events) ? b.events : b.id ? [b] : null;
          if (!list || list.length === 0 || list.length > 500) return json(400, { error: "send {events:[...]} with 1 to 500 events, or a single event" });
          const results = list.map((ev) => { try { return { id: ev?.id, status: E.ingest(cfg.state, ev, now()) }; } catch (e) { if (e.status !== 400) throw e; return { id: ev?.id, status: "rejected", error: e.message }; } });
          cfg.save();
          return json(results.every((r) => r.status === "rejected") ? 400 : 200, { results });
        }
        if (req.method === "POST" && path === "/v1/outcomes") {
          const b = JSON.parse((await readBody(req)) || "{}");
          if (b.churned === false) E.clearOutcome(cfg.state, b.account); else E.setOutcome(cfg.state, b.account, b.churnedAt, now());
          cfg.save(); return json(200, { ok: true });
        }
        if (req.method === "GET" && path === "/v1/at-risk") {
          const t = ensureModel(cfg.state, now()), th = E.threshold(t), limit = Math.max(1, Math.min(500, Number(q.get("limit")) || 20));
          const rows = E.score(cfg.state.accounts, t, now());
          return json(200, { mode: t.mode, threshold: th, note: t.note, accounts: rows.filter((r) => r.risk >= th).slice(0, limit).map(round) });
        }
        if (req.method === "GET" && path === "/v1/digest") {
          const t = ensureModel(cfg.state, now()), th = E.threshold(t), limit = Math.max(1, Math.min(50, Number(q.get("limit")) || 10));
          const risky = E.score(cfg.state.accounts, t, now()).filter((r) => r.risk >= th).slice(0, limit).map(round);
          const d = digest(risky, t);
          if (q.get("format") === "text") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); return res.end(d.text + "\n"); }
          return json(200, d);
        }
        let m;
        if (req.method === "GET" && (m = path.match(/^\/v1\/accounts\/([^/]+)$/))) {
          const id = decodeURIComponent(m[1]), t = ensureModel(cfg.state, now()), a = cfg.state.accounts[id];
          if (!a) return json(404, { error: "unknown account" });
          if (a.churnedAt != null) return json(200, { id, churned: true, churnedAt: new Date(a.churnedAt).toISOString() });
          const row = E.score({ [id]: a }, t, now())[0];
          return json(200, row ? round(row) : { id, note: "account is under 14 days old; no score yet" });
        }
        if (req.method === "GET" && path === "/v1/model") return json(200, summary(ensureModel(cfg.state, now())));
      }
      return json(404, { error: "not found" });
    } catch (e) {
      const code = e instanceof SyntaxError ? 400 : e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e instanceof SyntaxError ? "body is not valid JSON" : e.message });
    }
  };
}
/** A paste-ready "talk to these people" list. `text` is also a valid Slack incoming-webhook body when sent as {text}. */
export function digest(rows, t) {
  const head = rows.length ? `Churn Radar: ${rows.length} account${rows.length === 1 ? "" : "s"} to talk to this week${t.mode !== "model" ? " (rule-based ranking, not a forecast)" : ""}` : "Churn Radar: no account is above the risk threshold this week.";
  const lines = rows.map((r, i) => `${i + 1}. ${r.id} (risk ${Math.round(r.risk * 100)}%)${r.reasons?.length ? ": " + r.reasons.join("; ") : ""}`);
  return { mode: t.mode, count: rows.length, text: [head, ...lines].join("\n"), accounts: rows };
}
const round = (r) => ({ ...r, risk: Number(r.risk.toFixed(3)) });
function summary(t) {
  return { mode: t.mode, note: t.note, info: t.info, validation: t.validation && { ...t.validation, auc: t.validation.auc == null ? null : Number(t.validation.auc.toFixed(3)), cutoff: new Date(t.validation.cutoff).toISOString() }, weights: t.model && Object.fromEntries(E.FEATURES.map((f, j) => [f.key, Number(t.model.w[j].toFixed(3))])) };
}

export function loadState(file) { try { return { ...E.newState(), ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { return E.newState(); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of ["API_KEY", "ADMIN_KEY"]) if (!env[k] || env[k].length < 16) { console.error(`Set ${k} (16+ characters).`); process.exit(1); }
  const file = env.STATE || "/tmp/state.json", state = loadState(file);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const postAlert = env.ALERT_WEBHOOK_URL ? webhookSender({ url: env.ALERT_WEBHOOK_URL, secret: env.ALERT_WEBHOOK_SECRET }) : null;
  http.createServer(handler({ state, save, apiKey: env.API_KEY, adminKey: env.ADMIN_KEY, stripeSecret: env.STRIPE_WEBHOOK_SECRET, sdk: fs.readFileSync(new URL("./sdk.mjs", import.meta.url), "utf8") })).listen(Number(env.PORT) || 8080, () => console.log(`churn-radar on :${env.PORT || 8080}`));
  setInterval(async () => { try { if (postAlert) await runAlerts(state, postAlert, Date.now()); E.prune(state, Date.now()); save(); } catch (e) { console.error("daily pass failed:", e.message); } }, 3_600_000).unref();
}
