// Licence check for the branded bid package, with no secret on our side: the
// provider's public validate endpoint takes the buyer's key and the
// organisation id and says whether the key is granted. Everything here is dark
// unless a checkout link and organisation id are configured, and the free tools
// never call it. A network failure never locks a buyer out of a key that last
// validated (the caller keeps the result), it only refuses an unchecked key.

/** @param {{CHECKOUT_URL?: string, LICENCE_ORG_ID?: string}} cfg */
export function paidPathOn(cfg) {
  return /^https:\/\/[^\s"'<>]+$/.test(cfg.CHECKOUT_URL || "") && !!(cfg.LICENCE_ORG_ID || "").trim();
}

/** @param {string} key */
export function cleanKey(key) {
  const k = String(key || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(k) ? k : "";
}

/** @param {string} key @param {{LICENCE_ORG_ID: string, VALIDATE_URL: string}} cfg */
export function validateRequest(key, cfg) {
  return { url: cfg.VALIDATE_URL, init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, organization_id: cfg.LICENCE_ORG_ID }) } };
}

/**
 * @param {number} status HTTP status
 * @param {any} body parsed JSON or null
 * @param {number} [now] ms epoch
 */
export function interpretValidation(status, body, now = Date.now()) {
  if (status === 404 || status === 422) return { valid: false, reason: "That key was not recognised." };
  if (status !== 200 || !body || typeof body !== "object") return { valid: false, reason: "The licence service could not be reached; try again.", retry: true };
  if (body.status && body.status !== "granted") return { valid: false, reason: `That key is ${String(body.status)}.` };
  if (body.expires_at) {
    const t = Date.parse(body.expires_at);
    if (Number.isFinite(t) && t < now) return { valid: false, reason: "That key has expired. Renew it from your receipt." };
  }
  return { valid: true, reason: "", expires: body.expires_at || null };
}

/** @param {string} rawKey @param {any} cfg @param {typeof fetch} [fetchImpl] */
export async function checkLicence(rawKey, cfg, fetchImpl = globalThis.fetch) {
  if (!paidPathOn(cfg)) return { valid: false, reason: "The paid export is not on sale yet.", off: true };
  const key = cleanKey(rawKey);
  if (!key) return { valid: false, reason: "Paste the licence key from your receipt." };
  try {
    const { url, init } = validateRequest(key, cfg);
    const res = await fetchImpl(url, init);
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }
    return interpretValidation(res.status, body);
  } catch {
    return { valid: false, reason: "The licence service could not be reached; try again.", retry: true };
  }
}
