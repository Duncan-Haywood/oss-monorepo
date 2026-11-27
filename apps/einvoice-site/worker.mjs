// Cloudflare Worker for the marketing site: serves dist/ (static assets binding) and the
// early-access form with double opt-in, in the spirit of apps/grants docs/EMAIL_MARKETING.md.
//
//   POST /api/early-access            form post (Origin-checked) -> 303 to the check-inbox page
//   GET  /api/early-access/confirm    page with one "Confirm" button (scanners must not confirm)
//   POST /api/early-access/confirm    confirms -> 303 to the confirmed page
//   GET  /api/early-access/delete     page with one "Delete" button
//   POST /api/early-access/delete     deletes the row -> 303; also RFC 8058 one-click (no Origin)
//   GET  /api/admin/metrics|accounts  owner console only (admin.mjs; service token)
//   scheduled (daily)                 deletes unconfirmed rows after 7 days, confirmed after 24 months
//
// What is stored is exactly what the privacy pages list (content/i18n/*.mjs, "privacy"): no IP
// address, no user agent, only a SHA-256 of the confirmation token. Delete links are HMAC-signed
// (SIGNING_SECRET) and not stored. Every response says the same thing whether or not the address
// is already known, and the email is sent after the response (waitUntil), so neither the answer
// nor its timing reveals who signed up.
import { handleAdmin } from "./admin.mjs";
import { COUNTRIES } from "./content/deadlines.mjs";
import { CONSENT_VERSION, esc, ROLES } from "./content/format.mjs";
import de from "./content/i18n/de.mjs";
import en from "./content/i18n/en.mjs";
import fr from "./content/i18n/fr.mjs";
import { pathOf } from "./content/routes.mjs";
import { LANGS, SITE_NAME } from "./site.config.mjs";

const I18N = { de, fr, en };
const DAY = 86_400_000;
export const LIMITS = {
  tokenTtlMs: 7 * DAY,
  resendGapMs: 10 * 60_000,
  maxSendsPerDay: 5,
  pendingTtlMs: 7 * DAY,
  confirmedTtlMs: 730 * DAY, // 24 months
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer", // pages carry tokens in the URL
  "Cache-Control": "no-store",
};

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)

const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function sha256(s) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export async function deleteToken(secret, id) {
  return `d1.${id}.${await hmac(secret, `delete:${id}`)}`;
}

/** Returns the row id if the token is genuine, else null (constant-time compare). */
export async function verifyDeleteToken(secret, token) {
  const m = /^d1\.([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{43})$/.exec(token || "");
  if (!m) return null;
  const want = await hmac(secret, `delete:${m[1]}`);
  if (want.length !== m[2].length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0 ? m[1] : null;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Validates the form; returns { ok, value } or { ok: false, reason }. Strict: unknown values fail. */
export function parseSignup(form) {
  const get = (k) => (form.get(k) ?? "").toString();
  const email = get("email").trim().toLowerCase();
  const lang = get("lang");
  const role = get("role");
  const countries = form.getAll("countries").map(String);
  const known = COUNTRIES.map((c) => c.key);
  if (get("website")) return { ok: false, reason: "honeypot" };
  if (!LANGS.includes(lang)) return { ok: false, reason: "lang" };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reason: "email" };
  if (!ROLES.includes(role)) return { ok: false, reason: "role" };
  if (countries.some((c) => !known.includes(c)) || new Set(countries).size !== countries.length) {
    return { ok: false, reason: "countries" };
  }
  if (get("consent") !== "yes") return { ok: false, reason: "consent" };
  if (get("consentVersion") !== CONSENT_VERSION) return { ok: false, reason: "consentVersion" };
  return { ok: true, value: { email, lang, role, countries: countries.sort().join(",") } };
}

/** CSRF: a browser form post from our own pages carries our Origin (or Sec-Fetch-Site). */
export function sameOrigin(request, siteUrl) {
  const origin = request.headers.get("Origin");
  const own = new URL(request.url).origin;
  const allowed = new Set([own, siteUrl && new URL(siteUrl).origin].filter(Boolean));
  if (origin) return allowed.has(origin);
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

// ---------------------------------------------------------------------------------------------
// Responses

const langOf = (v) => (LANGS.includes(v) ? v : "en");

function redirect(base, pageId, lang) {
  return new Response(null, {
    status: 303,
    headers: { Location: `${base}${pathOf(pageId, lang)}`, ...SECURITY_HEADERS },
  });
}

function buttonPage(lang, kind, action, token) {
  const t = I18N[lang].ui[kind === "confirm" ? "confirmPage" : "deletePage"];
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(t.title)} | ${esc(SITE_NAME)}</title><link rel="stylesheet" href="/site.css"></head>
<body><main id="main"><h1>${esc(t.title)}</h1><p>${esc(t.text)}</p>
<form method="post" action="${action}"><input type="hidden" name="token" value="${esc(token)}">
<input type="hidden" name="lang" value="${lang}"><button type="submit">${esc(t.button)}</button></form>
</main></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
  });
}

// ---------------------------------------------------------------------------------------------
// Handlers

function newId() {
  return `ea_${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
}

async function sendConfirmation(env, base, row, token) {
  const t = I18N[row.lang].ui;
  const confirmUrl = `${base}/api/early-access/confirm?token=${encodeURIComponent(token)}&lang=${row.lang}`;
  const del = await deleteToken(env.SIGNING_SECRET, row.id);
  const deleteUrl = `${base}/api/early-access/delete?token=${encodeURIComponent(del)}&lang=${row.lang}`;
  const message = {
    from: env.EMAIL_FROM,
    to: [row.email],
    subject: t.mail.subject,
    text: t.mail.body(confirmUrl, deleteUrl, SITE_NAME),
    headers: {
      "List-Unsubscribe": `<${deleteUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  if (!env.EMAIL) {
    // Local development only: no email binding. Never configured in production (wrangler.jsonc).
    if (env.DEV_LOG_EMAILS === "true")
      console.log(`[dev] confirmation for ${row.id}: ${confirmUrl}`);
    return;
  }
  await env.EMAIL.send(message);
}

export async function handleSignup(request, env, ctx, now = Date.now()) {
  const base = env.SITE_URL || new URL(request.url).origin;
  if (!sameOrigin(request, env.SITE_URL)) return new Response("Forbidden", { status: 403 });
  let form;
  try {
    form = await request.formData();
  } catch {
    return redirect(base, "form-error", "en");
  }
  const lang = langOf(form.get("lang"));
  const parsed = parseSignup(form);
  // Honeypot: same answer as success, nothing stored.
  if (!parsed.ok) {
    return redirect(base, parsed.reason === "honeypot" ? "check-inbox" : "form-error", lang);
  }
  const v = parsed.value;
  const work = async () => {
    const existing = await env.DB.prepare("SELECT * FROM early_access WHERE email = ?1")
      .bind(v.email)
      .first();
    if (existing?.status === "confirmed") return; // nothing to do, and say nothing
    if (existing) {
      const dayStart = existing.send_window_start ?? 0;
      const inWindow = now - dayStart < DAY;
      if (existing.confirm_sent_at && now - existing.confirm_sent_at < LIMITS.resendGapMs) return;
      if (inWindow && existing.confirm_send_count >= LIMITS.maxSendsPerDay) return;
    }
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256(token);
    let row;
    if (existing) {
      const inWindow = now - (existing.send_window_start ?? 0) < DAY;
      row = { ...existing, ...v };
      await env.DB.prepare(
        `UPDATE early_access SET lang = ?2, role = ?3, countries = ?4, consent_version = ?5,
           consent_at = ?6, token_hash = ?7, token_expires_at = ?8, confirm_sent_at = ?6,
           confirm_send_count = ?9, send_window_start = ?10 WHERE id = ?1`,
      )
        .bind(
          existing.id,
          v.lang,
          v.role,
          v.countries,
          CONSENT_VERSION,
          now,
          tokenHash,
          now + LIMITS.tokenTtlMs,
          inWindow ? existing.confirm_send_count + 1 : 1,
          inWindow ? existing.send_window_start : now,
        )
        .run();
    } else {
      row = { id: newId(), ...v };
      await env.DB.prepare(
        `INSERT INTO early_access (id, email, lang, role, countries, consent_version, consent_at,
           status, token_hash, token_expires_at, confirm_sent_at, confirm_send_count,
           send_window_start, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, ?7, 1, ?7, ?7)`,
      )
        .bind(
          row.id,
          v.email,
          v.lang,
          v.role,
          v.countries,
          CONSENT_VERSION,
          now,
          tokenHash,
          now + LIMITS.tokenTtlMs,
        )
        .run();
    }
    await sendConfirmation(env, base, row, token);
  };
  ctx.waitUntil(
    work().catch((e) => console.error("early-access signup failed:", e?.message ?? "unknown")),
  );
  return redirect(base, "check-inbox", lang);
}

export async function handleConfirm(request, env, now = Date.now()) {
  const base = env.SITE_URL || new URL(request.url).origin;
  const url = new URL(request.url);
  if (request.method === "GET") {
    const lang = langOf(url.searchParams.get("lang"));
    return buttonPage(
      lang,
      "confirm",
      "/api/early-access/confirm",
      url.searchParams.get("token") || "",
    );
  }
  if (!sameOrigin(request, env.SITE_URL)) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const lang = langOf(form.get("lang"));
  const token = (form.get("token") || "").toString();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return redirect(base, "form-error", lang);
  const row = await env.DB.prepare(
    "SELECT id, token_expires_at FROM early_access WHERE token_hash = ?1",
  )
    .bind(await sha256(token))
    .first();
  if (!row || row.token_expires_at < now) return redirect(base, "form-error", lang);
  await env.DB.prepare(
    `UPDATE early_access SET status = 'confirmed', confirmed_at = ?2, token_hash = NULL,
       token_expires_at = NULL WHERE id = ?1`,
  )
    .bind(row.id, now)
    .run();
  return redirect(base, "confirmed", lang);
}

export async function handleDelete(request, env) {
  const base = env.SITE_URL || new URL(request.url).origin;
  const url = new URL(request.url);
  if (request.method === "GET") {
    const lang = langOf(url.searchParams.get("lang"));
    return buttonPage(
      lang,
      "delete",
      "/api/early-access/delete",
      url.searchParams.get("token") || "",
    );
  }
  // POST: from our page (form body has token) or RFC 8058 one-click from the mail provider
  // (token in the URL, body "List-Unsubscribe=One-Click", no Origin). The token is the credential.
  const form = await request.formData().catch(() => new FormData());
  const lang = langOf(form.get("lang") || url.searchParams.get("lang"));
  const token = (form.get("token") || url.searchParams.get("token") || "").toString();
  const id = await verifyDeleteToken(env.SIGNING_SECRET, token);
  if (!id) return redirect(base, "form-error", lang);
  await env.DB.prepare("DELETE FROM early_access WHERE id = ?1").bind(id).run();
  return redirect(base, "deleted", lang);
}

export async function purge(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM early_access WHERE status = 'pending' AND consent_at < ?1")
    .bind(now - LIMITS.pendingTtlMs)
    .run();
  await env.DB.prepare("DELETE FROM early_access WHERE status = 'confirmed' AND confirmed_at < ?1")
    .bind(now - LIMITS.confirmedTtlMs)
    .run();
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const m = request.method;
    if (pathname.startsWith("/api/admin/")) {
      // Needs only its own token, not SIGNING_SECRET.
      return handleAdmin(request, env, pathname.slice("/api/admin".length));
    }
    if (pathname.startsWith("/api/")) {
      if (!env.SIGNING_SECRET) return new Response("Not configured", { status: 503 });
      if (pathname === "/api/early-access" && m === "POST") return handleSignup(request, env, ctx);
      if (pathname === "/api/early-access/confirm" && (m === "GET" || m === "POST")) {
        return handleConfirm(request, env);
      }
      if (pathname === "/api/early-access/delete" && (m === "GET" || m === "POST")) {
        return handleDelete(request, env);
      }
      return new Response("Not found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purge(env));
  },
};
