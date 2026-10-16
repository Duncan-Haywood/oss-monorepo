#!/usr/bin/env node
// Self-hosted sales pipeline with a learned forecast. Zero dependencies; state in one JSON file.
//   API_KEY=... ADMIN_KEY=... [ALERT_WEBHOOK_URL=https://...] node server.mjs
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual, createHmac } from "node:crypto";
import * as E from "./engine.mjs";
import { configFromEnv } from "./byok.mjs";
import { draftFollowUp } from "./ai.mjs";

const env = process.env;
const RETRAIN_MS = 6 * 3_600_000;

const readBody = (req, max = 1_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => { const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`); return Boolean(key) && a.length === b.length && timingSafeEqual(a, b); };

/** POSTs an alert to your own URL, signed: x-keeper-signature = sha256=HMAC(secret, body). 2xx is delivered. */
export function webhookSender({ url, secret, fetchImpl = fetch }) {
  return async (alert) => {
    const body = JSON.stringify(alert), headers = { "content-type": "application/json", "user-agent": "deal-keeper" };
    if (secret) headers["x-keeper-signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const r = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  };
}

/** Retrain when stale. The fitted result lives in state so a restart does not lose it. */
export function ensureModel(state, now, force = false) {
  if (force || !state.model || now - state.modelAt > RETRAIN_MS) { state.model = E.train(state, now); state.modelAt = now; }
  return state.model;
}

/** Send each new stale/overdue/slipped flag once. A failed send leaves the flag un-alerted for the next pass. */
export async function runAlerts(state, send, now) {
  const model = ensureModel(state, now), sent = [];
  for (const a of E.newAlerts(state, model, now)) {
    const { key, ...body } = a;
    try { await send({ ...body, at: new Date(now).toISOString() }); state.alerted[key] = now; sent.push(key); }
    catch (e) { console.error("alert failed:", e.message); break; }
  }
  return sent;
}

const iso = (t) => (t == null ? null : new Date(t).toISOString().slice(0, 10));
const shape = (r) => ({ ...r, probability: Number(r.probability.toFixed(3)), weighted: Math.round(r.weighted), atRisk: Math.round(r.atRisk), closeDate: iso(r.closeDate) });
const dateParam = (v, fallback) => { if (v == null || v === "") return fallback; const t = /^\d+$/.test(v) ? Number(v) : Date.parse(v); if (!Number.isFinite(t)) throw Object.assign(new Error("dates must be ISO dates or epoch milliseconds"), { status: 400 }); return t; };

// cfg: {state, save, apiKey, adminKey, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname, q = url.searchParams;
    const json = (code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body, null, 2)); };
    try {
      if (path === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok\n"); }
      if (req.method === "GET" && path === "/sdk.mjs" && cfg.sdk) { res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" }); return res.end(cfg.sdk); }
      if (path === "/") return json(200, { name: "deal-keeper", deals: Object.keys(cfg.state.deals).length, docs: "https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/deal-keeper" });

      if (path.startsWith("/v1/admin")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        if (req.method === "POST" && path === "/v1/admin/retrain") { const m = ensureModel(cfg.state, now(), true); cfg.save(); return json(200, summary(m)); }
        return json(404, { error: "not found" });
      }

      if (path.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.apiKey)) return json(401, { error: "bad API key" });
        const st = cfg.state;
        if (req.method === "POST" && path === "/v1/deals") {
          const b = JSON.parse((await readBody(req)) || "{}"), list = Array.isArray(b.deals) ? b.deals : b.id ? [b] : null;
          if (!list || list.length === 0 || list.length > 500) return json(400, { error: "send {deals:[...]} with 1 to 500 deals, or a single deal" });
          const results = list.map((d) => { try { E.upsertDeal(st, d, now()); return { id: d?.id, status: "ok" }; } catch (e) { if (e.status !== 400) throw e; return { id: d?.id, status: "rejected", error: e.message }; } });
          cfg.save();
          return json(results.every((r) => r.status === "rejected") ? 400 : 200, { results });
        }
        let m;
        if ((m = path.match(/^\/v1\/deals\/([^/]+)(\/activity|\/followup)?$/))) {
          const id = decodeURIComponent(m[1]);
          if (m[2] === "/followup" && req.method === "POST") { // AI follow-up draft on the operator's own key; falls back to a template
            if (!st.deals[id]) return json(404, { error: "unknown deal" });
            const row = E.pipeline(st, ensureModel(st, now()), now()).find((r) => r.id === id);
            if (!row) return json(409, { error: "only open deals get a follow-up draft" });
            return json(200, { id, ...(await draftFollowUp(cfg.llm || {}, row, cfg.fetch)), note: "A draft for you to check and send yourself. Nothing was sent." });
          }
          if (m[2] === "/activity" && req.method === "POST") { const b = JSON.parse((await readBody(req)) || "{}"); E.addActivity(st, id, b.at, now()); cfg.save(); return json(200, { ok: true }); }
          if (!m[2] && req.method === "DELETE") { E.removeDeal(st, id); cfg.save(); return json(200, { ok: true }); }
          if (!m[2] && req.method === "GET") {
            const row = E.pipeline(st, ensureModel(st, now()), now()).find((r) => r.id === id);
            return st.deals[id] ? json(200, row ? shape(row) : { id, status: st.deals[id].status }) : json(404, { error: "unknown deal" });
          }
        }
        if (req.method === "GET" && path === "/v1/pipeline") {
          const rows = E.pipeline(st, ensureModel(st, now()), now()).map(shape);
          return json(200, { deals: rows, fixFirst: rows.filter((r) => r.atRisk > 0).slice(0, 10).map((r) => r.id) });
        }
        if (req.method === "GET" && path === "/v1/forecast") {
          const target = q.get("target") == null ? null : Number(q.get("target"));
          if (target != null && !Number.isFinite(target)) return json(400, { error: "target must be a number" });
          const f = E.forecast(st, ensureModel(st, now()), now(), { from: dateParam(q.get("from"), now()), to: dateParam(q.get("to"), now() + 90 * E.DAY), target });
          return json(200, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "number" && k !== "coverage" ? Math.round(v) : v])));
        }
        if (req.method === "GET" && path === "/v1/model") return json(200, summary(ensureModel(st, now())));
      }
      return json(404, { error: "not found" });
    } catch (e) {
      const code = e instanceof SyntaxError ? 400 : e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e instanceof SyntaxError ? "body is not valid JSON" : e.message });
    }
  };
}
function summary(m) {
  const v = m.validation;
  return { mode: m.mode, note: m.note, closedDeals: m.closed, won: m.wins, lost: m.losses, medianCycleDays: m.medianCycleDays == null ? null : Math.round(m.medianCycleDays), staleAfterDays: m.staleDays, stages: m.stages.map((s) => ({ ...s, p: Number(s.p.toFixed(3)) })),
    validation: v && { ...v, cutoff: iso(v.cutoff), predictedWins: Number(v.predictedWins.toFixed(1)), brier: Number(v.brier.toFixed(3)), brierBaseline: Number(v.brierBaseline.toFixed(3)), skill: v.skill == null ? null : Number(v.skill.toFixed(3)) } };
}

export function loadState(file) { try { return { ...E.newState(), ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { return E.newState(env.STAGES ? env.STAGES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : undefined); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of ["API_KEY", "ADMIN_KEY"]) if (!env[k] || env[k].length < 16) { console.error(`Set ${k} (16+ characters).`); process.exit(1); }
  const file = env.STATE || "/tmp/state.json", state = loadState(file);
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); };
  const postAlert = env.ALERT_WEBHOOK_URL ? webhookSender({ url: env.ALERT_WEBHOOK_URL, secret: env.ALERT_WEBHOOK_SECRET }) : null;
  http.createServer(handler({ state, save, apiKey: env.API_KEY, adminKey: env.ADMIN_KEY, llm: configFromEnv(env), sdk: fs.readFileSync(new URL("./sdk.mjs", import.meta.url), "utf8") })).listen(Number(env.PORT) || 8080, () => console.log(`deal-keeper on :${env.PORT || 8080}`));
  setInterval(async () => { try { if (postAlert) await runAlerts(state, postAlert, Date.now()); save(); } catch (e) { console.error("hourly pass failed:", e.message); } }, 3_600_000).unref();
}
