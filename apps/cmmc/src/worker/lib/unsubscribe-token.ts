// Signed one-click unsubscribe links for the affirmation reminder email
// (services/affirmations/reminders.ts). Ported from apps/payapps/src/worker/lib/unsubscribe-token.ts
// (2026-11-25). The token is an HMAC-SHA256 of the list, the organization and the member ids under
// AUTH_SECRET, so a link turns off only that email for that member in that organization. It never
// expires: RFC 8058 asks that an unsubscribe link keep working, and all it can do is stop an email.
// Verification goes through crypto.subtle.verify, which compares in constant time.

export type UnsubscribeList = "affirmation_reminders";
const LABELS: Record<UnsubscribeList, string> = {
  affirmation_reminders: "cmmc:affirmation-reminders-unsubscribe:v1",
};
const enc = new TextEncoder();

/** The secret the links are signed with, or null when none is set (local dev): then no link. */
export function unsubscribeSecret(env: { AUTH_SECRET?: string | undefined }): string | null {
  const s = env.AUTH_SECRET;
  return s && s.length >= 32 ? s : null;
}

async function key(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

const message = (list: UnsubscribeList, orgId: string, userId: string) =>
  enc.encode(`${LABELS[list]}\n${orgId}\n${userId}`);

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(s)) return null; // 32 bytes, unpadded
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  // Only the canonical spelling: the last character's two spare bits are ignored by atob, so
  // without this four different strings decode to the same signature.
  return toBase64Url(out.buffer) === s ? out : null;
}

export async function signUnsubscribe(
  secret: string,
  orgId: string,
  userId: string,
  list: UnsubscribeList = "affirmation_reminders",
) {
  return toBase64Url(
    await crypto.subtle.sign("HMAC", await key(secret, "sign"), message(list, orgId, userId)),
  );
}

export async function verifyUnsubscribe(
  secret: string,
  orgId: string,
  userId: string,
  token: string,
  list: UnsubscribeList = "affirmation_reminders",
): Promise<boolean> {
  const sig = fromBase64Url(token);
  if (!sig || !orgId || !userId) return false;
  return crypto.subtle.verify(
    "HMAC",
    await key(secret, "verify"),
    sig,
    message(list, orgId, userId),
  );
}

/** Query string for both links (the page and the RFC 8058 POST target). */
export async function unsubscribeQuery(
  secret: string,
  orgId: string,
  userId: string,
  list: UnsubscribeList = "affirmation_reminders",
) {
  const t = await signUnsubscribe(secret, orgId, userId, list);
  return new URLSearchParams({ o: orgId, u: userId, t }).toString();
}
