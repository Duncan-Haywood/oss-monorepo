// Early-access list: double opt-in subscribe, confirm, unsubscribe and the pending purge. Mirrors
// apps/grants' newsletter (docs/EMAIL_MARKETING.md there): same answer whatever the address's state,
// confirmation only on POST (link scanners fetch GETs), hashed single-use tokens with an expiry,
// derived (HMAC) unsubscribe tokens, salted IP hash, per-address resend limits.
//
// Privacy rules: never log an email address or a token.
//
// Every function takes `deps`: { db (D1Database), now: () => Date, secret: string,
// siteUrl: string, sendEmail: (msg) => Promise<void>, logger }.
import { EARLY_ACCESS_CONSENT_VERSION, PLATFORMS, SITE_NAME, VOLUME_BANDS } from "./content.mjs";

const MINUTE = 60_000;
const DAY = 86_400_000;

export const CONFIRM_LINK_DAYS = 7;
export const CONFIRM_TOKEN_TTL_MS = CONFIRM_LINK_DAYS * DAY;
export const CONFIRM_RESEND_MIN_INTERVAL_MS = 10 * MINUTE;
export const CONFIRM_MAX_SENDS_PER_DAY = 5;
export const PENDING_RETENTION_MS = 30 * DAY;
export const UNSUBSCRIBE_PREFIX = "u1.";

const PLATFORM_SLUGS = new Set(PLATFORMS.map((p) => p.slug));
const VOLUME_VALUES = new Set(VOLUME_BANDS.map((b) => b.value));

export const normalizeEmail = (email) => email.trim().toLowerCase();

/**
 * One plain address, no display name, no header-injection characters. Deliberately narrower than
 * RFC 5322: a signup form never needs quoted local parts or IP literals.
 */
export function isSafeEmailAddress(email) {
  if (typeof email !== "string" || email.length > 254) return false;
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
    email,
  );
}

/**
 * Validates a subscribe body (fields from a form post or JSON). Returns { ok: true, value } or
 * { ok: false, error } with a message that is safe to show.
 */
export function parseSubscribe(fields) {
  const one = (k) => {
    const v = fields[k];
    return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "";
  };
  const email = normalizeEmail(one("email"));
  if (!isSafeEmailAddress(email)) return { ok: false, error: "Enter a valid email address." };
  const source = one("source").trim();
  if (source.length > 200 || !/^\/[A-Za-z0-9/_-]*$/.test(source)) {
    return { ok: false, error: "The form was sent from an unknown page. Please try again." };
  }
  if (one("consentVersion") !== EARLY_ACCESS_CONSENT_VERSION) {
    return {
      ok: false,
      error: "The signup wording has changed since this page loaded. Reload it and try again.",
    };
  }
  const rawPlatforms = fields.platforms;
  const list = Array.isArray(rawPlatforms)
    ? rawPlatforms
    : typeof rawPlatforms === "string" && rawPlatforms
      ? [rawPlatforms]
      : [];
  if (list.length > PLATFORM_SLUGS.size || list.some((p) => !PLATFORM_SLUGS.has(p))) {
    return { ok: false, error: "Choose platforms from the list." };
  }
  const volume = one("volume");
  if (volume && !VOLUME_VALUES.has(volume)) {
    return { ok: false, error: "Choose an order range from the list." };
  }
  const website = one("website");
  return {
    ok: true,
    value: {
      email,
      source,
      platforms: [...new Set(list)].sort(),
      volume: volume || null,
      honeypot: website.length > 0,
    },
  };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hashIp(secret, ip) {
  if (!ip) return null;
  return sha256Hex(`${secret}:ip:${ip.trim()}`);
}

/** 32 random bytes, base64url. Only its SHA-256 is stored. */
export function generateConfirmToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export const isConfirmTokenShape = (token) => /^[A-Za-z0-9_-]{43}$/.test(token);

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** `u1.{id}.{hmac}`: derived, never stored, so nothing in the database can be replayed. */
export async function unsubscribeToken(secret, id) {
  return `${UNSUBSCRIBE_PREFIX}${id}.${await hmac(secret, `early-access-unsubscribe:${id}`)}`;
}

/** The signup id the token names, or null when the token is malformed or the signature is wrong. */
export async function verifyUnsubscribeToken(secret, token) {
  if (typeof token !== "string" || !token.startsWith(UNSUBSCRIBE_PREFIX)) return null;
  const [id, sig] = token.slice(UNSUBSCRIBE_PREFIX.length).split(".");
  if (!id || !sig || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return null;
  const expected = await hmac(secret, `early-access-unsubscribe:${id}`);
  // Constant-time comparison of equal-length strings.
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? id : null;
}

/** Whether another confirmation email may go to this row now (per-address resend limits). */
export function canResendConfirmation(row, nowMs) {
  const last = row.confirm_sent_at;
  if (last === null || last === undefined) return { allowed: true, countInWindow: 0 };
  const since = nowMs - last;
  const countInWindow = since >= DAY ? 0 : row.confirm_send_count;
  return {
    allowed: since >= CONFIRM_RESEND_MIN_INTERVAL_MS && countInWindow < CONFIRM_MAX_SENDS_PER_DAY,
    countInWindow,
  };
}

export const confirmPageUrl = (siteUrl, token) =>
  `${siteUrl}/api/early-access/confirm?token=${encodeURIComponent(token)}`;
export const unsubscribePageUrl = (siteUrl, token) =>
  `${siteUrl}/api/early-access/unsubscribe?token=${encodeURIComponent(token)}`;

export function renderConfirmEmail(siteUrl, confirmUrl, unsubscribeUrl) {
  return {
    subject: `Confirm your ${SITE_NAME} early-access signup`,
    text: `Someone (we hope you) asked to join the ${SITE_NAME} early-access list with this address.

Confirm here (the link works for ${CONFIRM_LINK_DAYS} days):
${confirmUrl}

If it wasn't you, ignore this email and you won't hear from us again.

After you confirm, we'll only email you about early access to ${SITE_NAME}: an invite when it's ready, and the occasional progress note.

Unsubscribe: ${unsubscribeUrl}
${siteUrl}/
`,
  };
}

/**
 * Subscribe. Outcomes: "confirmation_sent" | "already_confirmed" | "throttled" | "send_failed".
 * Never changes a confirmed row from an unconfirmed request (anyone can type anyone's address).
 */
export async function subscribe(deps, input) {
  const { db, secret, siteUrl } = deps;
  const now = deps.now().getTime();
  const row = await db
    .prepare("SELECT * FROM early_access_signups WHERE email = ?")
    .bind(input.email)
    .first();
  if (row?.status === "confirmed") return "already_confirmed";
  if (row && !canResendConfirmation(row, now).allowed) return "throttled";

  const token = generateConfirmToken();
  const tokenHash = await sha256Hex(token);
  const ipHash = await hashIp(secret, input.ip);
  const platforms = JSON.stringify(input.platforms);
  let id;
  if (!row) {
    id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO early_access_signups (id, email, status, platforms, volume, consent_source,
          consent_text_version, consent_ip_hash, confirm_token_hash, confirm_token_expires_at,
          confirm_sent_at, confirm_send_count, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (email) DO NOTHING`,
      )
      .bind(
        id,
        input.email,
        platforms,
        input.volume,
        input.source,
        EARLY_ACCESS_CONSENT_VERSION,
        ipHash,
        tokenHash,
        now + CONFIRM_TOKEN_TTL_MS,
        now,
        now,
        now,
      )
      .run();
    // A concurrent request may have inserted first: the row we can read is the one that counts.
    const stored = await db
      .prepare("SELECT id, confirm_token_hash FROM early_access_signups WHERE email = ?")
      .bind(input.email)
      .first();
    if (!stored || stored.confirm_token_hash !== tokenHash) return "throttled";
  } else {
    id = row.id;
    const { countInWindow } = canResendConfirmation(row, now);
    // Status stays as it is (pending or unsubscribed) until the new link is confirmed.
    await db
      .prepare(
        `UPDATE early_access_signups SET platforms = ?, volume = ?, consent_source = ?,
          consent_text_version = ?, consent_ip_hash = ?, confirm_token_hash = ?,
          confirm_token_expires_at = ?, confirm_sent_at = ?, confirm_send_count = ?, updated_at = ?
         WHERE id = ? AND status != 'confirmed'`,
      )
      .bind(
        platforms,
        input.volume,
        input.source,
        EARLY_ACCESS_CONSENT_VERSION,
        ipHash,
        tokenHash,
        now + CONFIRM_TOKEN_TTL_MS,
        now,
        countInWindow + 1,
        now,
        id,
      )
      .run();
  }

  const unsub = await unsubscribeToken(secret, id);
  const msg = renderConfirmEmail(
    siteUrl,
    confirmPageUrl(siteUrl, token),
    unsubscribePageUrl(siteUrl, unsub),
  );
  try {
    await deps.sendEmail({
      to: input.email,
      subject: msg.subject,
      text: msg.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribePageUrl(siteUrl, unsub)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    deps.logger.warn("early_access.confirm_send_failed", { error: String(e).slice(0, 200) });
    return "send_failed";
  }
  return "confirmation_sent";
}

/** Confirm with the raw token from the email: "confirmed" | "invalid" | "expired". */
export async function confirm(deps, token) {
  if (!isConfirmTokenShape(token)) return "invalid";
  const now = deps.now().getTime();
  const tokenHash = await sha256Hex(token);
  const row = await deps.db
    .prepare(
      "SELECT id, status, confirm_token_expires_at FROM early_access_signups WHERE confirm_token_hash = ?",
    )
    .bind(tokenHash)
    .first();
  if (!row) return "invalid";
  if (row.confirm_token_expires_at === null || row.confirm_token_expires_at < now) return "expired";
  await deps.db
    .prepare(
      `UPDATE early_access_signups SET status = 'confirmed', confirmed_at = ?, unsubscribed_at = NULL,
        confirm_token_hash = NULL, confirm_token_expires_at = NULL, updated_at = ?
       WHERE id = ? AND confirm_token_hash = ?`,
    )
    .bind(now, now, row.id, tokenHash)
    .run();
  return "confirmed";
}

/**
 * Unsubscribe with a `u1.` token: "unsubscribed" | "invalid". Idempotent. Keeps the address as the
 * suppression record and deletes the rest (survey answers, IP hash), as the privacy page says.
 */
export async function unsubscribe(deps, token) {
  const id = await verifyUnsubscribeToken(deps.secret, token);
  if (!id) return "invalid";
  const now = deps.now().getTime();
  const res = await deps.db
    .prepare(
      `UPDATE early_access_signups SET status = 'unsubscribed',
        unsubscribed_at = COALESCE(unsubscribed_at, ?), platforms = '[]', volume = NULL,
        consent_ip_hash = NULL, confirm_token_hash = NULL, confirm_token_expires_at = NULL,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, now, id)
    .run();
  return res.meta.changes > 0 ? "unsubscribed" : "invalid";
}

/** Deletes never-confirmed signups older than PENDING_RETENTION_MS. Returns rows deleted. */
export async function purgePending(deps) {
  const cutoff = deps.now().getTime() - PENDING_RETENTION_MS;
  const res = await deps.db
    .prepare("DELETE FROM early_access_signups WHERE status = 'pending' AND created_at < ?")
    .bind(cutoff)
    .run();
  return res.meta.changes;
}
