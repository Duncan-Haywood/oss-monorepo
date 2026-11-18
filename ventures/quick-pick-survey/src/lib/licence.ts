// Licence-key check for the branded results report. No secret is held anywhere: the
// provider's validate endpoint takes the buyer's key and answers yes or no. The code
// is MIT, so this is a convenience for honest buyers, not copy protection. Offline or
// malformed answers never unlock and never throw.

/** A buy link is shown only if it is a plain https URL. */
export function buyLink(url: string): string | null {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

/** Keys are short ASCII tokens; refuse anything else before it reaches the network. */
export function cleanKey(k: string): string | null {
  const t = String(k || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9-]{7,99}$/.test(t) ? t : null;
}

/** Only an explicit valid:true on a live key unlocks. */
export function interpret(j: unknown): { valid: boolean; reason: string } {
  if (!j || typeof j !== "object") return { valid: false, reason: "unreadable answer" };
  const o = j as { valid?: unknown; error?: unknown; license_key?: { status?: unknown } };
  const status = o.license_key && o.license_key.status;
  if (o.valid === true && status !== "expired" && status !== "disabled") return { valid: true, reason: "" };
  if (status === "expired") return { valid: false, reason: "this key has expired" };
  if (status === "disabled") return { valid: false, reason: "this key was disabled (refunded?)" };
  return { valid: false, reason: typeof o.error === "string" && o.error ? o.error.slice(0, 120) : "key not recognised" };
}

export async function checkLicence(
  key: string,
  o: { fetch?: typeof fetch; url?: string } = {},
): Promise<{ valid: boolean; reason: string }> {
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
