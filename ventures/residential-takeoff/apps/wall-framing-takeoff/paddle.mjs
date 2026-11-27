// @ts-check
// Paddle checkout and licence-key check for a tool's paid pack, in the browser.
//
// This file has no imports so that `sync.mjs` can copy it, byte for byte, into
// each venture that sells a pack (`ventures/<slug>/paddle.mjs`): a venture's
// page is served from its own directory and cannot reach `platform/`.
// Edit it here, then run `node platform/billing/sync.mjs`.
//
// How a sale works (README.md beside this file):
//   1. The page opens Paddle's overlay checkout with a random claim code in
//      `customData`. Only this browser knows the code.
//   2. Paddle sends `transaction.completed` to the billing Worker (worker.mjs), which checks
//      the webhook signature, signs a licence key with its Ed25519 private key
//      and stores it under the SHA-256 of the claim code.
//   3. The page asks the Worker for the key by claim code and shows it.
//   4. Unlocking checks the key's signature against the public key in the
//      venture's `checkout.mjs`, offline. No Paddle API key exists anywhere in
//      the browser or the Worker.
//
// The code can be read by anyone, so a key is a convenience for
// honest buyers, not copy protection. Every value below is public: a Paddle client-side token, a price
// id and an Ed25519 public key. Until all of them are set the pack stays dark:
// no Buy button, and everything that is free today stays free.

export const KEY_PREFIX = "ms1";
const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

/** @param {string} s */
function fromB64url(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** @param {Uint8Array} u */
export function toB64url(u) {
  let s = "";
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Is this pack on sale? Every public value must be set and well formed.
 * @param {{ product?: string, priceId?: string, clientToken?: string, publicKey?: string, edge?: string, environment?: string }} cfg
 */
export function onSale(cfg) {
  if (!cfg || typeof cfg !== "object") return false;
  const https = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" && !x.username && !x.password && !x.search; } catch { return false; } };
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(String(cfg.product || ""))
    && /^pri_[a-z0-9]{10,40}$/.test(String(cfg.priceId || ""))
    && /^(live|test)_[A-Za-z0-9]{10,60}$/.test(String(cfg.clientToken || ""))
    && /^[A-Za-z0-9_-]{43}$/.test(String(cfg.publicKey || ""))
    && https(cfg.edge)
    && (cfg.environment === "production" || cfg.environment === "sandbox");
}

/** Keys are `ms1.<payload>.<signature>` in base64url; refuse anything else before decoding. @param {string} k */
export function cleanKey(k) {
  const t = String(k || "").replace(/\s+/g, "");
  return /^ms1\.[A-Za-z0-9_-]{20,600}\.[A-Za-z0-9_-]{86}$/.test(t) ? t : null;
}

/**
 * Check a licence key offline. Only a key signed by the configured public key,
 * for this product, and not past its expiry unlocks. Never throws.
 * @param {string} key
 * @param {{ product?: string, publicKey?: string, now?: number, subtle?: SubtleCrypto }} o
 * @returns {Promise<{ valid: boolean, reason: string, claims?: any }>}
 */
export async function verifyLicence(key, o = {}) {
  const k = cleanKey(key);
  if (!k) return { valid: false, reason: "that does not look like a licence key" };
  if (!o.publicKey || !/^[A-Za-z0-9_-]{43}$/.test(o.publicKey)) return { valid: false, reason: "licence check unavailable" };
  const subtle = o.subtle || (globalThis.crypto && globalThis.crypto.subtle);
  if (!subtle) return { valid: false, reason: "this browser cannot check keys; try a current browser" };
  const [, body, sig] = k.split(".");
  try {
    const pub = await subtle.importKey("raw", fromB64url(o.publicKey), { name: "Ed25519" }, false, ["verify"]);
    const ok = await subtle.verify({ name: "Ed25519" }, pub, fromB64url(sig), new TextEncoder().encode(KEY_PREFIX + "." + body));
    if (!ok) return { valid: false, reason: "key not recognised" };
  } catch { return { valid: false, reason: "this browser cannot check keys; try a current browser" }; }
  let c;
  try { c = JSON.parse(new TextDecoder().decode(fromB64url(body))); } catch { return { valid: false, reason: "key not recognised" }; }
  if (!c || c.v !== 1) return { valid: false, reason: "key not recognised" };
  if (o.product && c.p !== o.product) return { valid: false, reason: "this key is for another tool (" + String(c.p).slice(0, 40) + ")" };
  const now = typeof o.now === "number" ? o.now : Math.floor(Date.now() / 1000);
  if (typeof c.exp === "number" && now > c.exp) return { valid: false, reason: "this key has expired; renew it from the Buy button", claims: c };
  return { valid: true, reason: "", claims: c };
}

/** A random claim code: 128 bits, base64url. @param {Crypto} [cr] */
export function newClaim(cr = globalThis.crypto) {
  const u = new Uint8Array(16);
  cr.getRandomValues(u);
  return toB64url(u);
}

/** @param {any} w */
function loadPaddle(w) {
  if (w.Paddle) return Promise.resolve(w.Paddle);
  return new Promise((res, rej) => {
    const s = w.document.createElement("script");
    s.src = PADDLE_JS;
    s.onload = () => (w.Paddle ? res(w.Paddle) : rej(new Error("paddle")));
    s.onerror = () => rej(new Error("paddle"));
    w.document.head.appendChild(s);
  });
}

/**
 * Ask the billing Worker for the key a finished checkout earned. The webhook can
 * land a few seconds after the overlay closes, so this polls.
 * @param {string} claim
 * @param {{ edge: string, fetch?: typeof fetch, tries?: number, waitMs?: number }} o
 * @returns {Promise<string|null>}
 */
export async function fetchKey(claim, o) {
  const f = o.fetch || fetch;
  const tries = o.tries ?? 30, wait = o.waitMs ?? 2000;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await f(o.edge.replace(/\/$/, "") + "/billing/claim?c=" + encodeURIComponent(claim), { headers: { accept: "application/json" } });
      if (r.status === 200) {
        const j = await r.json();
        const k = cleanKey(j && j.key);
        if (k) return k;
      } else if (r.status !== 404) return null;
    } catch { /* offline for a moment; try again */ }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, wait));
  }
  return null;
}

/**
 * Turn a button or link into a Paddle Buy button. Does nothing (and leaves the
 * element hidden) while the pack is dark. `onKey` gets the new licence key.
 * @param {HTMLElement|null} el
 * @param {{ product: string, priceId: string, clientToken: string, publicKey: string, edge: string, environment: string }} cfg
 * @param {{ onKey: (key: string) => void, onStatus?: (msg: string) => void, window?: any, storage?: Storage }} h
 * @returns {boolean} whether the button is live
 */
export function wireBuy(el, cfg, h) {
  if (!el || !onSale(cfg)) return false;
  const w = h.window || globalThis;
  const say = h.onStatus || (() => {});
  const store = h.storage || (() => { try { return w.localStorage; } catch { return null; } })();
  const pendingKey = "ms-billing-claim:" + cfg.product;
  const finish = async (claim, quiet) => {
    if (!quiet) say("Payment received. Fetching your licence key...");
    const key = await fetchKey(claim, { edge: cfg.edge, tries: quiet ? 2 : 30 });
    if (!key) { if (!quiet) say("Your payment went through but the key has not arrived yet. Reload this page in a minute; it will look again."); return; }
    try { store && store.removeItem(pendingKey); } catch { /* optional */ }
    say("Your licence key is below. Keep a copy: it unlocks this pack on any device.");
    h.onKey(key);
  };
  // A checkout finished in an earlier visit whose key had not arrived: look again, quietly.
  try { const p = store && store.getItem(pendingKey); if (p) finish(p, true); } catch { /* optional */ }
  let started = false, current = "";
  // A link with no href is not keyboard-focusable; the click handler below replaces navigation.
  if (el.tagName === "A" && !el.getAttribute("href")) el.setAttribute("href", "#");
  el.hidden = false;
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    say("Opening checkout...");
    let P;
    try { P = await loadPaddle(w); } catch { say("Checkout could not load. Check your connection or ad blocker and try again."); return; }
    const claim = newClaim();
    current = claim;
    if (!started) {
      // Paddle.js is initialised once per page; later clicks reuse it and only change the claim.
      started = true;
      if (cfg.environment === "sandbox") P.Environment.set("sandbox");
      P.Initialize({
        token: cfg.clientToken,
        eventCallback: (ev) => {
          if (!ev || ev.name !== "checkout.completed" || !current) return;
          const c = current;
          current = "";
          try { store && store.setItem(pendingKey, c); } catch { /* optional */ }
          finish(c, false);
        },
      });
    }
    P.Checkout.open({ items: [{ priceId: cfg.priceId, quantity: 1 }], customData: { claim, product: cfg.product } });
    say("");
  });
  return true;
}

/**
 * A subscription key past its expiry: ask the billing Worker for the renewal the
 * next payment earned. Returns the new key, or null when there is none yet.
 * @param {string} key @param {{ edge: string, fetch?: typeof fetch }} o
 */
export async function renewKey(key, o) {
  const k = cleanKey(key);
  if (!k || !o || !o.edge) return null;
  try {
    const r = await (o.fetch || fetch)(o.edge.replace(/\/$/, "") + "/billing/renew", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k }) });
    if (r.status !== 200) return null;
    const j = await r.json();
    return cleanKey(j && j.key);
  } catch { return null; }
}

/**
 * The check a pack's Unlock button runs: verify offline, and if a subscription
 * key has lapsed, fetch its renewal once and verify that.
 * @param {string} key
 * @param {{ product: string, publicKey: string, edge: string }} cfg
 * @param {{ fetch?: typeof fetch, now?: number, onRenewed?: (key: string) => void }} [o]
 */
export async function checkKey(key, cfg, o = {}) {
  const v = await verifyLicence(key, { product: cfg.product, publicKey: cfg.publicKey, now: o.now });
  if (v.valid || !v.claims || v.claims.t !== "subscription" || !/expired/.test(v.reason)) return v;
  const fresh = await renewKey(key, { edge: cfg.edge, fetch: o.fetch });
  if (!fresh) return v;
  const w = await verifyLicence(fresh, { product: cfg.product, publicKey: cfg.publicKey, now: o.now });
  if (w.valid && o.onRenewed) o.onRenewed(fresh);
  return w;
}
