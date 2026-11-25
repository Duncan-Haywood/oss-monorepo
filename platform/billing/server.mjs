// @ts-check
// The server half of the Paddle licence path: check Paddle's webhook, sign a
// licence key, hand it to the browser that paid. WebCrypto only, so it runs on
// a Cloudflare Worker, on Node 20+ and on any other runtime with `crypto.subtle`.
//
// Routes (mounted by platform/edge/worker.mjs):
//   POST /billing/paddle   Paddle's webhook. Signature checked with
//                          PADDLE_WEBHOOK_SECRET; `transaction.completed`
//                          signs a key with LICENCE_SIGNING_KEY and stores it.
//   GET  /billing/claim?c= the key a checkout earned, by its claim code (the
//                          browser that paid is the only one that knows it).
//   POST /billing/renew    {key}: a subscription key's newest renewal.
//
// No Paddle API key: the Worker never calls Paddle. The two secrets are set
// with `wrangler secret put` and never committed (README.md beside this file).
// Nothing about the buyer is stored: a key names the product, a Paddle
// transaction or subscription id and dates, never an email or a name.

import { KEY_PREFIX, cleanKey, toB64url, verifyLicence } from "./client.mjs";
import { CATALOGUE, GRACE_DAYS, productForPrice } from "./catalogue.mjs";

export const TOLERANCE_SEC = 300;
const MAX_WEBHOOK_BYTES = 256 * 1024;
const enc = new TextEncoder();

/** @param {string} a @param {string} b */
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** @param {ArrayBuffer} buf */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Paddle Billing's webhook signature: `Paddle-Signature: ts=<unix>;h1=<hex>`
 * (several h1 while a secret rotates), an HMAC-SHA256 over `<ts>:<raw body>`
 * with the notification destination's secret. The same scheme
 * ventures/webhook-relay/verify.mjs checks with Node's crypto.
 * @param {string|null} header @param {string} raw @param {string} secret @param {number} [nowSec]
 * @returns {Promise<{ ok: boolean, reason: string }>}
 */
export async function verifyPaddleSignature(header, raw, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret) return { ok: false, reason: "no webhook secret configured" };
  const pairs = String(header || "").split(";").map((p) => p.trim().split("="));
  const ts = (pairs.find((p) => p[0] === "ts") || [])[1];
  const sigs = pairs.filter((p) => p[0] === "h1" && p[1]).map((p) => p[1].toLowerCase());
  if (!ts || !sigs.length) return { ok: false, reason: "missing paddle-signature" };
  if (!/^\d{1,12}$/.test(ts) || Math.abs(nowSec - Number(ts)) > TOLERANCE_SEC) return { ok: false, reason: "timestamp outside tolerance" };
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", k, enc.encode(ts + ":" + raw)));
  return sigs.some((s) => sameString(s, want)) ? { ok: true, reason: "" } : { ok: false, reason: "signature mismatch" };
}

/** @param {string} pkcs8b64url */
async function signingKey(pkcs8b64url) {
  const bin = atob(pkcs8b64url.replace(/-/g, "+").replace(/_/g, "/"));
  const u = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", u, { name: "Ed25519" }, false, ["sign"]);
}

/**
 * Sign licence claims into an `ms1.<payload>.<signature>` key.
 * @param {object} claims @param {string} pkcs8b64url
 */
export async function signLicence(claims, pkcs8b64url) {
  const body = toB64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, await signingKey(pkcs8b64url), enc.encode(KEY_PREFIX + "." + body));
  return KEY_PREFIX + "." + body + "." + toB64url(new Uint8Array(sig));
}

/** @param {string} claim */
export async function claimHash(claim) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode("ms-billing-claim:" + claim)));
}

const CLAIM_RE = /^[A-Za-z0-9_-]{22}$/;

/**
 * What a completed transaction earns: the claims to sign, the claim code it
 * came with (none on a subscription renewal) and the subscription it renews.
 * The product comes from the price id that was paid for, never from
 * `custom_data`, which the browser chose.
 * @param {any} tx Paddle's `data` for `transaction.completed`
 * @param {typeof CATALOGUE} [cat] @param {number} [nowSec]
 * @returns {{ claims: any, claim: string|null, subscription: string|null } | { skip: string }}
 */
export function licenceForTransaction(tx, cat = CATALOGUE, nowSec = Math.floor(Date.now() / 1000)) {
  if (!tx || typeof tx !== "object") return { skip: "no transaction" };
  if (tx.status !== "completed" && tx.status !== "paid") return { skip: "status " + String(tx.status).slice(0, 20) };
  const items = Array.isArray(tx.items) ? tx.items : [];
  let prod = null;
  for (const it of items) { prod = productForPrice(it && (it.price_id || (it.price && it.price.id)), cat); if (prod) break; }
  if (!prod) return { skip: "no catalogue price in this transaction" };
  const cd = tx.custom_data && typeof tx.custom_data === "object" ? tx.custom_data : {};
  const claim = typeof cd.claim === "string" && CLAIM_RE.test(cd.claim) ? cd.claim : null;
  const sub = typeof tx.subscription_id === "string" && /^sub_[a-z0-9]{10,40}$/.test(tx.subscription_id) ? tx.subscription_id : null;
  const txn = typeof tx.id === "string" && /^txn_[a-z0-9]{10,40}$/.test(tx.id) ? tx.id : null;
  if (!txn) return { skip: "no transaction id" };
  /** @type {any} */
  const claims = { v: 1, p: prod.slug, t: prod.billing, s: txn, iat: nowSec };
  if (prod.billing === "subscription") {
    if (!sub) return { skip: "subscription product paid without a subscription" };
    const ends = Date.parse(tx.billing_period && tx.billing_period.ends_at);
    if (!Number.isFinite(ends)) return { skip: "subscription transaction without a billing period" };
    claims.s = sub;
    claims.exp = Math.floor(ends / 1000) + GRACE_DAYS * 86400;
  }
  if (!claim && !sub) return { skip: "no claim code and no subscription" };
  return { claims, claim, subscription: claims.t === "subscription" ? sub : null };
}

/** @param {number} status @param {object} obj @param {Record<string,string>} [headers] */
const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

/**
 * The storage the routes need. `d1Store` adapts Cloudflare D1; tests pass a Map.
 * @typedef {{ putClaim(h: string, key: string, product: string): Promise<void>, getClaim(h: string): Promise<string|null>, putSub(id: string, key: string, exp: number): Promise<void>, getSub(id: string): Promise<{ key: string, exp: number }|null> }} Store
 */

/** @param {any} db @returns {Store} */
export function d1Store(db) {
  return {
    async putClaim(h, key, product) {
      await db.prepare("INSERT INTO licences (claim_hash, product, licence, created) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (claim_hash) DO NOTHING")
        .bind(h, product, key, new Date().toISOString().slice(0, 10)).run();
    },
    async getClaim(h) {
      const r = await db.prepare("SELECT licence FROM licences WHERE claim_hash = ?1").bind(h).first();
      return r ? String(r.licence) : null;
    },
    async putSub(id, key, exp) {
      await db.prepare("INSERT INTO licence_subs (sub_id, licence, exp) VALUES (?1, ?2, ?3) ON CONFLICT (sub_id) DO UPDATE SET licence = ?2, exp = ?3 WHERE exp < ?3")
        .bind(id, key, exp).run();
    },
    async getSub(id) {
      const r = await db.prepare("SELECT licence, exp FROM licence_subs WHERE sub_id = ?1").bind(id).first();
      return r ? { key: String(r.licence), exp: Number(r.exp) } : null;
    },
  };
}

/**
 * Handle a /billing/* request, or return null for any other path.
 * @param {Request} request
 * @param {{ PADDLE_WEBHOOK_SECRET?: string, LICENCE_SIGNING_KEY?: string }} env
 * @param {{ store: Store, cors?: Record<string,string>, catalogue?: typeof CATALOGUE, nowSec?: number }} o
 */
export async function handleBilling(request, env, o) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/billing/")) return null;
  const cat = o.catalogue || CATALOGUE;
  const cors = o.cors || {};
  const now = o.nowSec ?? Math.floor(Date.now() / 1000);

  if (request.method === "POST" && url.pathname === "/billing/paddle") {
    if (!env.PADDLE_WEBHOOK_SECRET || !env.LICENCE_SIGNING_KEY) return json(503, { error: "billing not configured" });
    const raw = await request.text();
    if (raw.length > MAX_WEBHOOK_BYTES) return json(413, { error: "size" });
    const sig = await verifyPaddleSignature(request.headers.get("paddle-signature"), raw, env.PADDLE_WEBHOOK_SECRET, now);
    if (!sig.ok) return json(401, { error: sig.reason });
    let ev;
    try { ev = JSON.parse(raw); } catch { return json(400, { error: "body" }); }
    // Paddle retries anything but a 2xx, so an event we do not act on is still a 200.
    if (!ev || ev.event_type !== "transaction.completed") return json(200, { ok: true, ignored: String(ev && ev.event_type).slice(0, 60) });
    const got = licenceForTransaction(ev.data, cat, now);
    if ("skip" in got) return json(200, { ok: true, skipped: got.skip });
    const key = await signLicence(got.claims, env.LICENCE_SIGNING_KEY);
    if (got.claim) await o.store.putClaim(await claimHash(got.claim), key, got.claims.p);
    if (got.subscription) await o.store.putSub(got.subscription, key, got.claims.exp);
    return json(200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/billing/claim") {
    const c = url.searchParams.get("c") || "";
    if (!CLAIM_RE.test(c)) return json(400, { error: "claim" }, cors);
    const key = await o.store.getClaim(await claimHash(c));
    return key ? json(200, { key }, cors) : json(404, { error: "not yet" }, cors);
  }

  if (request.method === "POST" && url.pathname === "/billing/renew") {
    let body;
    try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch { return json(400, { error: "body" }, cors); }
    const k = cleanKey(body && body.key);
    if (!k) return json(400, { error: "key" }, cors);
    // An expired key still proves which subscription it belongs to.
    const v = await verifyLicence(k, { publicKey: cat.publicKey, now: 0 });
    if (!v.valid || !v.claims || v.claims.t !== "subscription") return json(400, { error: "not a subscription key" }, cors);
    const latest = await o.store.getSub(String(v.claims.s));
    if (!latest || latest.exp <= (v.claims.exp || 0)) return json(404, { error: "no renewal yet" }, cors);
    return json(200, { key: latest.key }, cors);
  }

  return json(404, { error: "not found" }, cors);
}
