// Logic behind the Cloudflare Worker (src/worker.mjs) for apps/cmmc-site: serves the static build (ASSETS) under BASE_PATH and runs the
// double opt-in early-access list in D1, modelled on apps/grants' newsletter
// (services/marketing/subscribers.ts):
//
//   POST {base}/api/early-access          sign up -> one confirmation email -> 303 check-email page
//   GET  {base}/api/early-access/confirm  page with a button (link scanners must not confirm by GET)
//   POST {base}/api/early-access/confirm  confirm -> 303 confirmed / link-expired
//   GET  {base}/api/early-access/leave    page with a button
//   POST {base}/api/early-access/leave    delete the entry -> 303 left / link-expired
//   GET  {base}/api/admin/metrics|accounts  owner console only (admin.mjs; service token)
//   scheduled (daily)                     delete never-confirmed rows older than 30 days
//
// Privacy: never log an email address or a token; IPs are stored only as a salted hash. A valid
// sign-up gets the same answer whatever the address's state, so the form cannot be used to learn who
// is on the list.
import { handleAdmin } from "./admin.mjs";
import { CONSENT_VERSION } from "./site.mjs";
import { applyToPage } from "./sprs.mjs";

const SPRS_PATH = "/sprs-score-calculator";

export const DAY = 86_400_000;
export const MINUTE = 60_000;
export const CONFIRM_TOKEN_TTL_MS = 7 * DAY;
export const RESEND_MIN_INTERVAL_MS = 10 * MINUTE;
export const MAX_SENDS_PER_DAY = 5;
export const PENDING_RETENTION_MS = 30 * DAY;
/** New sign-ups per IP hash per hour. */
export const MAX_SIGNUPS_PER_IP_PER_HOUR = 10;
export const MAX_BODY_BYTES = 4096;

const LEVELS = new Set(["l1", "l2", "unsure"]);
const SIZES = new Set(["", "1-9", "10-49", "50-249", "250+"]);
const EMAIL_RE =
  /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ID_RE = /^eas_[0-9a-f]{24}$/;

/** Headers on every response (pages too). No scripts at all: the form posts without JavaScript and
 * JSON-LD is a data block, which CSP does not execute. */
export const BASE_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
/** API responses: never cached, never send the token-bearing URL as a referrer. */
const SECURITY_HEADERS = {
  ...BASE_HEADERS,
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function withHeaders(res, status = res.status) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status, statusText: res.statusText, headers });
}

// ---------- small helpers (exported for tests) ----------

export const normalizeEmail = (email) => String(email).trim().toLowerCase();

export function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

export function normalizeBasePath(raw) {
  const segments = String(raw ?? "")
    .split("/")
    .filter(Boolean);
  if (segments.some((s) => !/^[A-Za-z0-9._~-]+$/.test(s) || s === "." || s === ".."))
    throw new Error("BASE_PATH must be a plain path like /cmmc");
  return segments.length ? `/${segments.join("/")}` : "";
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export function randomToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `eas_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashConfirmToken = (token) => sha256Hex(`early-access-confirm:${token}`);

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Leave link token: derived, not stored, so it works in every email: `l1.{id}.{hmac}`. */
export async function leaveToken(secret, id) {
  return `l1.${id}.${await hmac(secret, `early-access-leave:v1:${id}`)}`;
}

/** The signup id a valid leave token names, or null. */
export async function verifyLeaveToken(secret, token) {
  const [v, id, sig, ...rest] = String(token).split(".");
  if (v !== "l1" || !id || !sig || rest.length || !ID_RE.test(id)) return null;
  const expected = await hmac(secret, `early-access-leave:v1:${id}`);
  return timingSafeEqual(sig, expected) ? id : null;
}

/** Whether another confirmation email may go to this pending row now. */
export function canResend(row, now) {
  if (row.confirm_sent_at == null) return true;
  const since = now - row.confirm_sent_at;
  const countInWindow = since >= DAY ? 0 : row.confirm_send_count;
  return since >= RESEND_MIN_INTERVAL_MS && countInWindow < MAX_SENDS_PER_DAY;
}

/** Validate a sign-up form. Returns the clean fields, "bot" for a filled honeypot, or null. */
export function parseSignup(fields) {
  if (fields.website) return "bot";
  const email = normalizeEmail(fields.email ?? "");
  const level = fields.level || "unsure";
  const size = fields.size ?? "";
  if (!isValidEmail(email) || fields.consent !== "yes") return null;
  if (!LEVELS.has(level) || !SIZES.has(size)) return null;
  return { email, level, size };
}

const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function config(env) {
  const base = normalizeBasePath(env.BASE_PATH ?? "/cmmc");
  const siteUrl = String(env.SITE_URL ?? "https://marisstella.app/cmmc").replace(/\/+$/, "");
  return { base, siteUrl };
}

const redirect = (location) =>
  new Response(null, { status: 303, headers: { Location: location, ...SECURITY_HEADERS } });

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });

const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));

async function readFields(request) {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  const type = request.headers.get("Content-Type") ?? "";
  if (type.includes("application/json")) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object") return null;
      return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
    } catch {
      return null;
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

function buttonPage(base, title, action, token, label) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><link rel="stylesheet" href="${base}/styles.css"></head>
<body><main id="main"><h1>${escapeHtml(title)}</h1>
<form method="post" action="${base}${action}"><input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit" class="button">${escapeHtml(label)}</button></form></main></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
  });
}

// ---------- email ----------

export function renderConfirmEmail({ confirmUrl, leaveUrl, siteUrl }) {
  const subject = "Confirm your early-access sign-up";
  const text = `Someone (hopefully you) asked to join the early-access list for the Shop Compliance Workspace at ${siteUrl}/.

Confirm your address (the link works for 7 days):
${confirmUrl}

If you did not ask for this, ignore this email: nothing more is sent and the address is deleted after 30 days.
Remove it now: ${leaveUrl}
`;
  const html = `<p>Someone (hopefully you) asked to join the early-access list for the
<a href="${escapeHtml(siteUrl)}/">Shop Compliance Workspace</a>.</p>
<p><a href="${escapeHtml(confirmUrl)}">Confirm your address</a> (the link works for 7 days).</p>
<p>If you did not ask for this, ignore this email: nothing more is sent and the address is deleted after 30 days.
<a href="${escapeHtml(leaveUrl)}">Remove it now</a>.</p>`;
  return { subject, text, html };
}

async function sendConfirmation(env, row, token) {
  const { siteUrl } = config(env);
  const confirmUrl = `${siteUrl}/api/early-access/confirm?token=${encodeURIComponent(token)}`;
  const leaveUrl = `${siteUrl}/api/early-access/leave?token=${encodeURIComponent(await leaveToken(env.TOKEN_SECRET, row.id))}`;
  const msg = renderConfirmEmail({ confirmUrl, leaveUrl, siteUrl });
  await env.EMAIL.send({
    from: env.EMAIL_FROM,
    to: [row.email],
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

// ---------- list operations ----------

/**
 * Start (or restart) double opt-in. Returns the outcome for logs; callers answer the same either way.
 * @returns {Promise<"confirmation_sent" | "already_confirmed" | "throttled" | "send_failed">}
 */
export async function signup(env, input, { ip, now = Date.now() } = {}) {
  const db = env.DB;
  const ipHash = ip && env.IP_HASH_SALT ? await sha256Hex(`${env.IP_HASH_SALT}:${ip}`) : null;
  const existing = await db
    .prepare("SELECT * FROM early_access_signups WHERE email = ?")
    .bind(input.email)
    .first();
  if (existing?.status === "confirmed") return "already_confirmed";

  const token = randomToken();
  const tokenHash = await hashConfirmToken(token);
  const expires = now + CONFIRM_TOKEN_TTL_MS;
  let row;
  if (!existing) {
    if (ipHash) {
      const recent = await db
        .prepare(
          "SELECT COUNT(*) AS n FROM early_access_signups WHERE ip_hash = ? AND created_at > ?",
        )
        .bind(ipHash, now - 60 * MINUTE)
        .first();
      if ((recent?.n ?? 0) >= MAX_SIGNUPS_PER_IP_PER_HOUR) return "throttled";
    }
    row = { id: newId(), email: input.email };
    const res = await db
      .prepare(
        `INSERT INTO early_access_signups
          (id, email, status, cmmc_level, shop_size, source, consent_text_version, ip_hash,
           confirm_token_hash, confirm_token_expires_at, confirm_sent_at, confirm_send_count,
           created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(email) DO NOTHING`,
      )
      .bind(
        row.id,
        row.email,
        input.level,
        input.size || null,
        "/early-access",
        CONSENT_VERSION,
        ipHash,
        tokenHash,
        expires,
        now,
        now,
        now,
      )
      .run();
    // Lost a race with a concurrent sign-up for the same address: that one sends the email.
    if (!res.meta?.changes) return "throttled";
  } else {
    if (!canResend(existing, now)) return "throttled";
    const countInWindow =
      existing.confirm_sent_at != null && now - existing.confirm_sent_at < DAY
        ? existing.confirm_send_count
        : 0;
    await db
      .prepare(
        `UPDATE early_access_signups SET confirm_token_hash = ?, confirm_token_expires_at = ?,
           confirm_sent_at = ?, confirm_send_count = ?, cmmc_level = ?, shop_size = ?,
           consent_text_version = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(
        tokenHash,
        expires,
        now,
        countInWindow + 1,
        input.level,
        input.size || null,
        CONSENT_VERSION,
        now,
        existing.id,
      )
      .run();
    row = existing;
  }
  try {
    await sendConfirmation(env, row, token);
    return "confirmation_sent";
  } catch (err) {
    log("early_access.send_failed", { error: String(err?.message ?? err).slice(0, 200) });
    return "send_failed";
  }
}

/** Confirm by token. Returns true when a pending row was confirmed. */
export async function confirm(env, token, now = Date.now()) {
  if (!TOKEN_RE.test(token)) return false;
  const res = await env.DB.prepare(
    `UPDATE early_access_signups SET status = 'confirmed', confirmed_at = ?, confirm_token_hash = NULL,
       confirm_token_expires_at = NULL, updated_at = ?
     WHERE confirm_token_hash = ? AND status = 'pending' AND confirm_token_expires_at > ?`,
  )
    .bind(now, now, await hashConfirmToken(token), now)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Delete the entry a leave token names. Returns true when the token was valid. */
export async function leave(env, token) {
  const id = await verifyLeaveToken(env.TOKEN_SECRET, token);
  if (!id) return false;
  await env.DB.prepare("DELETE FROM early_access_signups WHERE id = ?").bind(id).run();
  return true;
}

export async function purgePending(env, now = Date.now()) {
  const res = await env.DB.prepare(
    "DELETE FROM early_access_signups WHERE status = 'pending' AND created_at < ?",
  )
    .bind(now - PENDING_RETENTION_MS)
    .run();
  return res.meta?.changes ?? 0;
}

// ---------- routing ----------

async function handleApi(request, env, path) {
  // Before the sign-up configuration check: the admin API needs only its own token.
  if (path.startsWith("/api/admin/"))
    return handleAdmin(request, env, path.slice("/api/admin".length));
  const { base } = config(env);
  const wantsJson = (request.headers.get("Accept") ?? "").includes("application/json");
  const page = (p) => redirect(`${base}${p}`);
  if (!env.TOKEN_SECRET || !env.EMAIL_FROM) {
    log("early_access.not_configured");
    return json(503, { ok: false, error: "not_configured" });
  }

  if (path === "/api/early-access" && request.method === "POST") {
    const fields = await readFields(request);
    if (!fields)
      return wantsJson ? json(400, { ok: false, error: "invalid" }) : page("/early-access/invalid");
    const input = parseSignup(fields);
    if (input === null)
      return wantsJson ? json(400, { ok: false, error: "invalid" }) : page("/early-access/invalid");
    if (input !== "bot") {
      const outcome = await signup(env, input, { ip: request.headers.get("CF-Connecting-IP") });
      log("early_access.signup", { outcome });
    } else {
      log("early_access.signup", { outcome: "honeypot" });
    }
    return wantsJson ? json(202, { ok: true }) : page("/early-access/check-email");
  }

  const url = new URL(request.url);
  if (path === "/api/early-access/confirm" || path === "/api/early-access/leave") {
    const isConfirm = path.endsWith("/confirm");
    if (request.method === "GET") {
      const token = url.searchParams.get("token") ?? "";
      return isConfirm
        ? buttonPage(base, "Confirm your early-access sign-up", path, token, "Confirm my address")
        : buttonPage(base, "Leave the early-access list", path, token, "Delete my entry");
    }
    if (request.method === "POST") {
      const fields = (await readFields(request)) ?? {};
      const token = fields.token ?? "";
      if (isConfirm) {
        const ok = await confirm(env, token);
        log("early_access.confirm", { ok });
        return page(ok ? "/early-access/confirmed" : "/early-access/link-expired");
      }
      const ok = await leave(env, token);
      log("early_access.leave", { ok });
      return page(ok ? "/early-access/left" : "/early-access/link-expired");
    }
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }
  return json(404, { ok: false, error: "not_found" });
}

export const handler = {
  async fetch(request, env) {
    const { base } = config(env);
    const url = new URL(request.url);
    if (base && url.pathname === base) return Response.redirect(`${url.origin}${base}/`, 301);
    if (base && !url.pathname.startsWith(`${base}/`))
      return new Response("Not Found", { status: 404 });
    const path = url.pathname.slice(base.length) || "/";
    if (path === "/api" || path.startsWith("/api/")) return handleApi(request, env, path);
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    const assetUrl = new URL(url);
    assetUrl.pathname = path;
    const res = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (res.status === 200 && path === SPRS_PATH && url.search) {
      // The calculator: score the GET form's query and write the result into the static page.
      const html = applyToPage(await res.text(), url.searchParams);
      const headers = new Headers(res.headers);
      headers.delete("Content-Length");
      headers.delete("ETag");
      headers.set("Cache-Control", "no-store");
      return withHeaders(
        new Response(request.method === "HEAD" ? null : html, { status: 200, headers }),
      );
    }
    if (res.status !== 404) return withHeaders(res);
    const notFound = await env.ASSETS.fetch(new Request(new URL("/404", url), request));
    return withHeaders(notFound, 404);
  },

  async scheduled(_event, env) {
    const purged = await purgePending(env);
    log("early_access.purge", { purged });
  },
};
