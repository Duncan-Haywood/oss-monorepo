#!/usr/bin/env node
// Self-hosted usage metering that feeds Stripe Billing Meters. Zero dependencies.
//   API_KEY=... ADMIN_KEY=... CONFIG=./meter-config.json STRIPE_SECRET_KEY=rk_live_... DRY_RUN=false node server.mjs
// DRY_RUN defaults to true: events are metered and priced locally, nothing is sent to Stripe.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import * as E from "./engine.mjs";

const env = process.env;

const readBody = (req, max = 200_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => { const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`); return Boolean(key) && a.length === b.length && timingSafeEqual(a, b); };

/** Sends one meter event to Stripe. 4xx (except 429) is permanent; the event id is Stripe's idempotency identifier. */
export function stripeSender({ apiKey, fetchImpl = fetch }) {
  return async (o) => {
    const body = new URLSearchParams({ event_name: o.event, identifier: o.id, timestamp: String(Math.floor(o.ts / 1000)), "payload[stripe_customer_id]": o.stripeCustomerId, "payload[value]": String(o.value) });
    const r = await fetchImpl("https://api.stripe.com/v1/billing/meter_events", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/x-www-form-urlencoded" }, body });
    if (r.ok) return;
    let detail = ""; try { detail = (await r.json()).error?.message || ""; } catch { /* body is not JSON */ }
    throw Object.assign(new Error(`stripe ${r.status}${detail ? `: ${detail}` : ""}`), { retry: r.status === 429 || r.status >= 500 });
  };
}

// cfg: {state, save, config, apiKey, adminKey, send, dryRun, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname, q = url.searchParams;
    const json = (code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body, null, 2)); };
    try {
      if (path === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok\n"); }
      if (path === "/") return json(200, { name: "meter-keeper", dryRun: cfg.dryRun, meters: Object.keys(cfg.config.meters || {}), docs: "https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/meter-keeper" });

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice(9); let m;
        if (req.method === "GET" && a === "/outbox") return json(200, { pending: cfg.state.outbox.length, dead: cfg.state.dead.slice(-50), dryRun: cfg.dryRun });
        if (req.method === "POST" && a === "/flush") { const r = cfg.dryRun || !cfg.send ? { skipped: "dry run or no STRIPE_SECRET_KEY", pending: cfg.state.outbox.length } : await E.flush(cfg.state, cfg.send, now()); cfg.save(); return json(200, r); }
        if (req.method === "GET" && a === "/export.csv") { res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="usage.csv"' }); return res.end(E.toCsv(cfg.state, cfg.config, now())); }
        if (req.method === "GET" && a === "/customers") return json(200, cfg.state.customers);
        if (req.method === "PUT" && (m = a.match(/^\/customers\/([^/]+)$/))) {
          const b = JSON.parse((await readBody(req)) || "{}");
          if (b.plan && !cfg.config.plans?.[b.plan]) return json(400, { error: `unknown plan "${b.plan}"` });
          const c = E.setCustomer(cfg.state, decodeURIComponent(m[1]), b); cfg.save(); return json(200, c);
        }
        return json(404, { error: "not found" });
      }

      if (path.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.apiKey)) return json(401, { error: "bad API key" });
        if (req.method === "POST" && path === "/v1/events") {
          const b = JSON.parse((await readBody(req)) || "{}");
          const list = Array.isArray(b.events) ? b.events : b.id ? [b] : null;
          if (!list || list.length === 0 || list.length > 100) return json(400, { error: "send {events:[...]} with 1 to 100 events" });
          const results = list.map((ev) => { try { return { id: ev?.id, ...E.ingest(cfg.state, cfg.config, ev, now()), forward: undefined }; } catch (e) { if (e.status !== 400) throw e; return { id: ev?.id, status: "rejected", error: e.message }; } });
          cfg.save();
          return json(results.every((r) => r.status === "rejected") ? 400 : 200, { results });
        }
        const customer = q.get("customer") || "";
        if (req.method === "GET" && path === "/v1/usage") {
          const p = E.periodOf(now()), from = q.get("from") ? Date.parse(q.get("from")) : p.from, to = q.get("to") ? Date.parse(q.get("to")) : p.to;
          if (!Number.isFinite(from) || !Number.isFinite(to)) return json(400, { error: "from and to must be ISO dates" });
          const meters = q.get("meter") ? [q.get("meter")] : Object.keys(cfg.config.meters || {});
          return json(200, { customer, from: new Date(from).toISOString(), to: new Date(to).toISOString(), usage: Object.fromEntries(meters.map((mt) => [mt, E.usage(cfg.state, cfg.config, customer, mt, from, to)])) });
        }
        if (req.method === "GET" && path === "/v1/check") return json(200, E.check(cfg.state, cfg.config, customer, q.get("meter") || "", Number(q.get("quantity") ?? 1), now()));
        if (req.method === "GET" && path === "/v1/invoice-preview") return json(200, E.invoice(cfg.state, cfg.config, customer, now()));
        if (req.method === "GET" && path === "/v1/projection") return json(200, E.projection(cfg.state, cfg.config, customer, now()));
      }
      return json(404, { error: "not found" });
    } catch (e) {
      const code = e instanceof SyntaxError ? 400 : e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e instanceof SyntaxError ? "body is not valid JSON" : e.message });
    }
  };
}

export function loadState(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return E.newState(); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of ["API_KEY", "ADMIN_KEY"]) if (!env[k] || env[k].length < 16) { console.error(`Set ${k} (16+ characters).`); process.exit(1); }
  let config; try { config = env.CONFIG_JSON ? JSON.parse(env.CONFIG_JSON) : JSON.parse(fs.readFileSync(env.CONFIG || "./meter-config.json", "utf8")); } catch (e) { console.error(`Cannot read the meter config: ${e.message}`); process.exit(1); }
  const errors = E.validateConfig(config); if (errors.length) { console.error("Config problems:\n- " + errors.join("\n- ")); process.exit(1); }
  const file = env.STATE || "/tmp/state.json", state = loadState(file);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const dryRun = env.DRY_RUN !== "false";
  const send = env.STRIPE_SECRET_KEY ? stripeSender({ apiKey: env.STRIPE_SECRET_KEY }) : null;
  http.createServer(handler({ state, save, config, apiKey: env.API_KEY, adminKey: env.ADMIN_KEY, send, dryRun })).listen(Number(env.PORT) || 8080, () => console.log(`meter-keeper on :${env.PORT || 8080} (dry run: ${dryRun})`));
  setInterval(async () => { try { if (!dryRun && send) await E.flush(state, send, Date.now()); E.prune(state, Date.now()); save(); } catch (e) { console.error("flush failed:", e.message); } }, 30_000).unref();
}
