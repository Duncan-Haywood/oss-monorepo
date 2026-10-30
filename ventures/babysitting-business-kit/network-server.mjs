// Babysitting Business Kit: the server-to-server handoff for the sitter network
// (network.mjs holds the browser-safe part). Node only.
//
// Each pair of sitters shares one secret. NETWORK_ID is this server's name for itself;
// NETWORK_PEERS lists "peerName=secret" pairs (comma or space separated), or a backup
// sitter's record holds peerId + peerSecret. The sender signs `${timestamp}.${body}`
// with HMAC-SHA256 and sends X-Kit-Peer (its NETWORK_ID), X-Kit-Timestamp (ms) and
// X-Kit-Signature (hex). Nothing is accepted or sent until a secret is configured.

import { createHmac, timingSafeEqual } from "node:crypto";
import { newId } from "./engine.mjs";
import { networkOf, normalizeNetwork, canShare } from "./network.mjs";

const str = (x, n = 200) => String(x ?? "").trim().slice(0, n);
const firstWord = (s) => str(s).split(/\s+/)[0] || "";

export const HANDOFF = { maxBody: 4096, skewMs: 5 * 60 * 1000, minSecret: 16, perPeerPerDay: 50 };
const PEER_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export function peerSecrets(env = {}, desk = {}) {
  const map = new Map();
  for (const s of networkOf(desk).sitters) if (s.peerId && PEER_ID.test(s.peerId) && String(s.peerSecret || "").length >= HANDOFF.minSecret) map.set(String(s.peerId).toLowerCase(), String(s.peerSecret));
  for (const pair of String(env.NETWORK_PEERS || "").split(/[,\s]+/).filter(Boolean)) {
    const i = pair.indexOf("=");
    const id = pair.slice(0, i).toLowerCase(), secret = pair.slice(i + 1);
    if (i > 0 && PEER_ID.test(id) && secret.length >= HANDOFF.minSecret) map.set(id, secret); // env wins
  }
  return map;
}
export const signHandoff = (secret, ts, body) => createHmac("sha256", String(secret)).update(`${ts}.${body}`).digest("hex");
export function verifyHandoff(secret, ts, body, sig, nowMs) {
  if (!secret || !/^\d{10,16}$/.test(String(ts)) || !/^[0-9a-f]{64}$/i.test(String(sig || ""))) return false;
  if (Math.abs(nowMs - Number(ts)) > HANDOFF.skewMs) return false;
  const a = Buffer.from(signHandoff(secret, ts, body), "hex"), b = Buffer.from(String(sig), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Only these fields cross between servers, and only after the family agreed.
export function handoffPayload(desk, entry, nowMs) {
  if (!canShare(entry)) return { ok: false, why: "Record the family's OK first." };
  return { ok: true, payload: { v: 1, ref: str(entry.id, 40), from: str(desk.profile && desk.profile.name, 80), firstName: firstWord(entry.firstName).slice(0, 40), kids: (entry.kids || []).slice(0, 8).map((k) => str(k, 20)), when: str(entry.when, 120), consentAt: str(entry.consent.at, 40), sentAt: new Date(nowMs).toISOString() } };
}

const okUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname)); } catch { return false; } };

export async function sendHandoff(desk, entryId, env, nowMs, fetchImpl = globalThis.fetch) {
  const net = networkOf(desk);
  const entry = net.sent.find((e) => e.id === entryId);
  if (!entry) return { ok: false, status: 404, why: "No such pass-on." };
  const sitter = net.sitters.find((s) => s.id === entry.sitterId);
  if (!sitter || !sitter.peerId || !okUrl(sitter.peerUrl)) return { ok: false, status: 400, why: "This backup has no kit server address (https) and peer name." };
  if (!env.NETWORK_ID || !PEER_ID.test(env.NETWORK_ID)) return { ok: false, status: 503, why: "Set NETWORK_ID on your server first." };
  const secret = peerSecrets(env, desk).get(String(sitter.peerId).toLowerCase());
  if (!secret) return { ok: false, status: 503, why: `No shared secret for ${sitter.peerId}: set NETWORK_PEERS or the backup's secret.` };
  const p = handoffPayload(desk, entry, nowMs);
  if (!p.ok) return { ok: false, status: 409, why: p.why };
  const body = JSON.stringify(p.payload), ts = String(nowMs);
  let res;
  try {
    res = await fetchImpl(`${String(sitter.peerUrl).replace(/\/+$/, "")}/network/handoff`, { method: "POST", headers: { "content-type": "application/json", "x-kit-peer": env.NETWORK_ID, "x-kit-timestamp": ts, "x-kit-signature": signHandoff(secret, ts, body) }, body, signal: AbortSignal.timeout(8000) });
  } catch (e) { return { ok: false, status: 502, why: `Could not reach ${sitter.peerUrl}: ${e && e.message}` }; }
  let json = {};
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) return { ok: false, status: 502, why: `Their server said ${res.status}${json.error ? `: ${json.error}` : ""}.` };
  return { ok: true, status: 200, handoff: { sentAt: p.payload.sentAt, peer: sitter.peerId, leadId: str(json.leadId, 40), status: "delivered" } };
}

// A signed handoff arriving from a peer becomes a lead. Returns { code, json, lead? }.
export function receiveHandoff(desk, { peer, ts, sig, body }, env, nowMs, today) {
  const id = String(peer || "").toLowerCase();
  const secret = PEER_ID.test(id) ? peerSecrets(env, desk).get(id) : null;
  if (!secret) return { code: 404, json: { error: "not found" } };
  if (!verifyHandoff(secret, ts, body, sig, nowMs)) return { code: 401, json: { error: "bad signature or stale timestamp" } };
  let p;
  try { p = JSON.parse(body); } catch { return { code: 400, json: { error: "not JSON" } }; }
  if (!p || p.v !== 1 || !str(p.ref) || !firstWord(p.firstName)) return { code: 400, json: { error: "missing fields" } };
  const dup = (desk.leads || []).find((l) => l.handoff && l.handoff.peer === id && l.handoff.ref === str(p.ref, 40));
  if (dup) return { code: 200, json: { ok: true, leadId: dup.id, duplicate: true } };
  const todays = (desk.leads || []).filter((l) => l.handoff && l.handoff.peer === id && l.created === today).length;
  if (todays >= HANDOFF.perPeerPerDay) return { code: 429, json: { error: "too many today" } };
  const sitter = networkOf(desk).sitters.find((s) => String(s.peerId || "").toLowerCase() === id);
  const from = str(p.from, 80) || (sitter && sitter.name) || id;
  const lead = {
    id: newId("lead"), created: today, name: firstWord(p.firstName).slice(0, 40), contact: "",
    kids: (Array.isArray(p.kids) ? p.kids : []).slice(0, 8).map((k) => str(k, 20)).filter(Boolean), schedule: str(p.when, 120), wants: "",
    source: `sitter network: ${from}`.slice(0, 100), notes: `Passed on by ${from} through the sitter network, with the family's OK (${str(p.consentAt, 40) || "time not given"}). Ask ${from} for the family's contact.`,
    distanceMiles: "", budget: "", faithActivities: false, status: "new", followUps: 0,
    referredBySitter: sitter ? sitter.id : id, handoff: { peer: id, ref: str(p.ref, 40), from, at: new Date(nowMs).toISOString() },
  };
  return { code: 202, json: { ok: true, leadId: lead.id }, lead };
}

// Keep server-side handoff results when the app syncs a desk that has not seen them.
export function mergeNetwork(serverNet, incomingNet) {
  const s = normalizeNetwork(serverNet), inc = normalizeNetwork(incomingNet);
  const byId = new Map(s.sent.map((e) => [e.id, e]));
  inc.sent = inc.sent.map((e) => { const o = byId.get(e.id); return o && o.handoff && !e.handoff ? { ...e, handoff: o.handoff, status: e.status === "suggested" || e.status === "asked" ? "passed on" : e.status } : e; });
  const ids = new Set(inc.sent.map((e) => e.id));
  for (const e of s.sent) if (e.handoff && !ids.has(e.id)) inc.sent.push(e);
  return inc;
}

// Routes for server.mjs: POST /network/handoff (signed, from a peer) and
// POST /api/network/handoff (admin key; the app sends { entry, sitter } to upsert, then
// the server signs and sends). Returns true when it handled the request.
export function networkRoutes(state, save, env, now, fetchImpl, notify = async () => {}) {
  const read = async (req, limit) => {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > limit) return null; chunks.push(c); }
    return Buffer.concat(chunks).toString("utf8");
  };
  const json = (send, code, o) => send(code, JSON.stringify(o), "application/json");
  const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: env.TZ || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now()));
  return async (req, url, send) => {
    if (url.pathname === "/network/handoff") {
      if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain"), true;
      const body = await read(req, HANDOFF.maxBody);
      if (body === null) return json(send, 413, { error: "too large" }), true;
      const h = req.headers;
      const r = receiveHandoff(state.desk, { peer: h["x-kit-peer"], ts: h["x-kit-timestamp"], sig: h["x-kit-signature"], body }, env, now(), day());
      if (r.lead) {
        state.desk.leads.push(r.lead);
        save();
        await notify(`Sitter network: ${r.lead.handoff.from} passed on ${r.lead.name}`, [r.lead.kids.length && `Kids: ${r.lead.kids.join(", ")}`, r.lead.schedule && `When: ${r.lead.schedule}`, "It is in your Leads tab after the next Sync."].filter(Boolean).join("\n"));
      }
      return json(send, r.code, r.json), true;
    }
    if (url.pathname === "/api/network/handoff") {
      const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const a = Buffer.from(auth), b = Buffer.from(String(env.ADMIN_KEY || ""));
      if (!env.ADMIN_KEY || a.length !== b.length || !timingSafeEqual(a, b)) return send(401, "admin key required\n", "text/plain"), true;
      if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain"), true;
      const raw = await read(req, 64 * 1024);
      let body;
      try { body = JSON.parse(raw || "{}"); } catch { return json(send, 400, { error: "not JSON" }), true; }
      const net = state.desk.network = normalizeNetwork(state.desk.network);
      for (const [k, v] of [["sent", body.entry], ["sitters", body.sitter]]) {
        if (!v || typeof v !== "object" || !v.id) continue;
        const i = net[k].findIndex((x) => x.id === v.id);
        if (i >= 0) net[k][i] = { ...net[k][i], ...v }; else net[k].push(v);
      }
      const r = await sendHandoff(state.desk, body.entry && body.entry.id, env, now(), fetchImpl);
      if (r.ok) { const e = net.sent.find((x) => x.id === body.entry.id); e.handoff = r.handoff; e.status = "passed on"; }
      save();
      return json(send, r.status, r.ok ? { ok: true, handoff: r.handoff } : { error: r.why }), true;
    }
    return false;
  };
}
