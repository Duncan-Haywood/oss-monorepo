// @ts-check
// Licence-key check for the branded accountant close pack. No secret is held anywhere: the
// provider's validate endpoint takes the buyer's key and answers yes or no. The code
// is MIT, so this is a convenience for honest buyers, not copy protection; say so on
// the page. Offline or malformed answers never unlock and never throw.

/** A buy link is shown only if it is a plain https URL. @param {string} url */
export function buyLink(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

/** Keys are short ASCII tokens; refuse anything else before it reaches the network. @param {string} k */
export function cleanKey(k) {
  const t = String(k || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9-]{7,99}$/.test(t) ? t : null;
}

/** Turn the provider's JSON into a verdict. Only an explicit valid:true on a live key unlocks. @param {any} j */
export function interpret(j) {
  if (!j || typeof j !== "object") return { valid: false, reason: "unreadable answer" };
  const status = j.license_key && j.license_key.status;
  if (j.valid === true && status !== "expired" && status !== "disabled") return { valid: true, reason: "" };
  if (status === "expired") return { valid: false, reason: "this key has expired" };
  if (status === "disabled") return { valid: false, reason: "this key was disabled (refunded?)" };
  return { valid: false, reason: typeof j.error === "string" && j.error ? j.error.slice(0, 120) : "key not recognised" };
}

/**
 * @param {string} key
 * @param {{ fetch?: typeof fetch, url?: string }} [o]
 * @returns {Promise<{ valid: boolean, reason: string }>}
 */
export async function checkLicence(key, o = {}) {
  const k = cleanKey(key);
  if (!k) return { valid: false, reason: "that does not look like a licence key" };
  const f = o.fetch || (typeof fetch === "function" ? fetch : null);
  const url = buyLink(o.url || "");
  if (!f || !url) return { valid: false, reason: "licence check unavailable" };
  try {
    const r = await f(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: "license_key=" + encodeURIComponent(k) });
    return interpret(await r.json());
  } catch { return { valid: false, reason: "could not reach the licence server; try again online" }; }
}
