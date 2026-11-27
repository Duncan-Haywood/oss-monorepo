// Cloudflare Worker: serves the prerendered site from static assets and handles the early-access API.
// Only `${BASE_PATH}/api/*` runs this code first (wrangler.jsonc run_worker_first); every other path
// is a static asset.
//
//   POST /api/early-access/subscribe        form or JSON → 303 to /early-access/thanks (form) or 202 JSON
//   GET  /api/early-access/confirm?token=   page with a "Confirm" button (scanner-safe: GET never confirms)
//   POST /api/early-access/confirm          token in the form body → result page / JSON
//   GET  /api/early-access/unsubscribe?token=  page with an "Unsubscribe" button
//   POST /api/early-access/unsubscribe?token=  one-click (RFC 8058, no Origin) or the page button
//   GET  /api/admin/metrics | /api/admin/accounts  owner console only (admin.mjs; ADMIN_SERVICE_TOKEN)
//
// Bindings (wrangler.jsonc): ASSETS, DB (D1), EMAIL (send_email, optional), EARLY_ACCESS_LIMITER
// (rate limit, optional). Vars: APP_ENV, SITE_URL, EMAIL_FROM. Secret: TOKEN_SECRET.
import { handleAdmin } from "./admin.mjs";
import { BASE_PATH, EARLY_ACCESS_SUBSCRIBE_MESSAGE, SITE_NAME, SITE_URL } from "./content.mjs";
import {
  confirm,
  isConfirmTokenShape,
  parseSubscribe,
  purgePending,
  subscribe,
  UNSUBSCRIBE_PREFIX,
  unsubscribe,
} from "./early-access.mjs";
import { SECURITY_HEADERS } from "./headers.mjs";
import { API, esc, href, layout } from "./html.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const MAX_BODY_BYTES = 8 * 1024;

const logger = {
  info: (event, data = {}) => console.log(JSON.stringify({ level: "info", event, ...data })),
  warn: (event, data = {}) => console.warn(JSON.stringify({ level: "warn", event, ...data })),
};

/** Secret for token HMACs and IP hashes. Production without TOKEN_SECRET fails closed. */
function tokenSecret(env) {
  if (env.TOKEN_SECRET) return env.TOKEN_SECRET;
  return env.APP_ENV === "production" ? null : "development-only-secret";
}

function deps(env) {
  const siteUrl = (env.SITE_URL || SITE_URL).replace(/\/+$/, "");
  return {
    db: env.DB,
    now: () => new Date(),
    secret: tokenSecret(env),
    siteUrl,
    logger,
    sendEmail: async (msg) => {
      if (!env.EMAIL) {
        // Local dev without the binding: nothing is sent, and the link is not logged (it's a credential).
        logger.info("early_access.email_skipped", { reason: "no EMAIL binding" });
        return;
      }
      await env.EMAIL.send({
        from: env.EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        headers: msg.headers,
      });
    },
  };
}

const withHeaders = (res, extra = {}) => {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...NO_STORE, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
};

const htmlPage = (status, title, bodyHtml) =>
  withHeaders(
    new Response(
      layout({
        path: "/early-access",
        title,
        description: title,
        noindex: true,
        body: `<section class="wrap narrow">${bodyHtml}</section>`,
      }),
      { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
    ),
  );

const json = (status, data) =>
  withHeaders(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );

const wantsJson = (req) =>
  (req.headers.get("Content-Type") ?? "").includes("application/json") ||
  (req.headers.get("Accept") ?? "").startsWith("application/json");

/** CSRF: state-changing browser requests must come from this site's origin. */
function sameOrigin(req, env) {
  const origin = req.headers.get("Origin");
  if (!origin) return false;
  const allowed = new Set([new URL(req.url).origin, new URL(env.SITE_URL || SITE_URL).origin]);
  return allowed.has(origin);
}

/** Form or JSON body as { field: string | string[] }; null when unreadable or too large. */
async function readFields(req) {
  const length = Number(req.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) return null;
  const type = req.headers.get("Content-Type") ?? "";
  try {
    if (type.includes("application/json")) {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) return null;
      const data = JSON.parse(text);
      return data && typeof data === "object" && !Array.isArray(data) ? data : null;
    }
    if (
      type.includes("application/x-www-form-urlencoded") ||
      type.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      const out = {};
      for (const [k, v] of form.entries()) {
        if (typeof v !== "string") continue;
        if (k === "platforms") out[k] = [...(out[k] ?? []), v];
        else out[k] = v;
      }
      return out;
    }
  } catch {
    return null;
  }
  return null;
}

const clientIp = (req) =>
  req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;

async function rateLimited(env, key) {
  if (!env.EARLY_ACCESS_LIMITER) return false;
  const { success } = await env.EARLY_ACCESS_LIMITER.limit({ key });
  return !success;
}

async function handleSubscribe(req, env, ctx) {
  const asJson = wantsJson(req);
  if (!sameOrigin(req, env)) {
    return asJson
      ? json(403, { ok: false, error: "Forbidden" })
      : htmlPage(
          403,
          "Sign-up not accepted",
          "<h1>Sign-up not accepted</h1><p>Please use the form on our site.</p>",
        );
  }
  const d = deps(env);
  if (!d.secret || !env.DB) {
    logger.warn("early_access.misconfigured", { secret: Boolean(d.secret), db: Boolean(env.DB) });
    return asJson
      ? json(503, { ok: false, error: "Sign-ups are paused. Please try again later." })
      : htmlPage(
          503,
          "Sign-ups are paused",
          "<h1>Sign-ups are paused</h1><p>Please try again later.</p>",
        );
  }
  const ip = clientIp(req);
  if (await rateLimited(env, `ip:${ip ?? "unknown"}`)) {
    const msg = "Too many sign-up attempts. Please wait a minute and try again.";
    return asJson
      ? json(429, { ok: false, error: msg })
      : htmlPage(429, "Too many attempts", `<h1>Too many attempts</h1><p>${esc(msg)}</p>`);
  }
  const fields = await readFields(req);
  const parsed = fields
    ? parseSubscribe(fields)
    : { ok: false, error: "The form could not be read." };
  if (!parsed.ok) {
    return asJson
      ? json(400, { ok: false, error: parsed.error })
      : htmlPage(
          400,
          "Check the form",
          `<h1>Check the form</h1><p>${esc(parsed.error)}</p><p><a href="${href("/early-access")}">Back to the sign-up form</a></p>`,
        );
  }
  const input = parsed.value;
  if (input.honeypot) {
    logger.info("early_access.subscribe", { outcome: "honeypot" });
  } else {
    // Deferred so the response (and its timing) is the same whether or not the address is already
    // on the list. Failures are logged, never shown.
    ctx.waitUntil(
      subscribe(d, { ...input, ip })
        .then((outcome) => logger.info("early_access.subscribe", { outcome }))
        .catch((e) =>
          logger.warn("early_access.subscribe_failed", { error: String(e).slice(0, 200) }),
        ),
    );
  }
  if (asJson) return json(202, { ok: true, message: EARLY_ACCESS_SUBSCRIBE_MESSAGE });
  return withHeaders(
    new Response(null, { status: 303, headers: { Location: href("/early-access/thanks") } }),
  );
}

const tokenFromQuery = (url) => (url.searchParams.get("token") ?? "").trim().slice(0, 300);

function buttonPage(title, lead, action, token, label) {
  return htmlPage(
    200,
    title,
    `<h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p>
<form method="post" action="${action}"><input type="hidden" name="token" value="${esc(token)}"><button class="button" type="submit">${esc(label)}</button></form>`,
  );
}

const CONFIRM_RESULTS = {
  confirmed: [
    "You're on the list",
    `Thanks for confirming. We'll email you when there's an early-access invite for you. Every email has an unsubscribe link.`,
  ],
  expired: [
    "This link has expired",
    "Confirmation links work for 7 days. Sign up again and we'll send a fresh one.",
  ],
  invalid: [
    "This link doesn't work",
    "It may have been used already, or copied incompletely. If you've already confirmed, you're on the list.",
  ],
};

async function handleConfirm(req, env) {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const token = tokenFromQuery(url);
    if (!isConfirmTokenShape(token)) {
      const [t, l] = CONFIRM_RESULTS.invalid;
      return htmlPage(400, t, `<h1>${esc(t)}</h1><p>${esc(l)}</p>`);
    }
    return buttonPage(
      "Confirm your sign-up",
      `One click to join the ${SITE_NAME} early-access list.`,
      API.confirm,
      token,
      "Confirm my sign-up",
    );
  }
  const asJson = wantsJson(req);
  if (!sameOrigin(req, env))
    return asJson
      ? json(403, { ok: false, error: "Forbidden" })
      : htmlPage(
          403,
          "Not accepted",
          "<h1>Not accepted</h1><p>Please use the link in your email.</p>",
        );
  const fields = (await readFields(req)) ?? {};
  const token =
    typeof fields.token === "string" ? fields.token.trim().slice(0, 300) : tokenFromQuery(url);
  const d = deps(env);
  const status = d.secret && env.DB ? await confirm(d, token) : "invalid";
  logger.info("early_access.confirm", { status });
  if (asJson) return json(200, { ok: status === "confirmed", status });
  const [t, l] = CONFIRM_RESULTS[status];
  const again =
    status === "expired" ? `<p><a href="${href("/early-access")}">Sign up again</a></p>` : "";
  return htmlPage(
    status === "confirmed" ? 200 : 400,
    t,
    `<h1>${esc(t)}</h1><p>${esc(l)}</p>${again}`,
  );
}

async function handleUnsubscribe(req, env) {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const token = tokenFromQuery(url);
    if (!token.startsWith(UNSUBSCRIBE_PREFIX)) {
      return htmlPage(
        400,
        "This link doesn't work",
        "<h1>This link doesn't work</h1><p>Use the unsubscribe link in one of our emails, or email hello@marisstella.app.</p>",
      );
    }
    return buttonPage(
      "Unsubscribe",
      `Stop all ${SITE_NAME} early-access emails to this address.`,
      `${API.unsubscribe}?token=${encodeURIComponent(token)}`,
      token,
      "Unsubscribe",
    );
  }
  // No Origin check: RFC 8058 one-click posts come from mail providers. The HMAC token is the guard.
  const fields = (await readFields(req)) ?? {};
  const token =
    tokenFromQuery(url) || (typeof fields.token === "string" ? fields.token.trim() : "");
  const d = deps(env);
  const status = d.secret && env.DB ? await unsubscribe(d, token) : "invalid";
  const oneClick = fields["List-Unsubscribe"] === "One-Click";
  logger.info("early_access.unsubscribe", { status, method: oneClick ? "one_click" : "link" });
  if (wantsJson(req) || oneClick) return json(200, { ok: status === "unsubscribed", status });
  return status === "unsubscribed"
    ? htmlPage(
        200,
        "You're unsubscribed",
        `<h1>You're unsubscribed</h1><p>We won't email this address about ${esc(SITE_NAME)} again.</p>`,
      )
    : htmlPage(
        400,
        "This link doesn't work",
        "<h1>This link doesn't work</h1><p>Email hello@marisstella.app and we'll remove your address.</p>",
      );
}

export async function handleRequest(req, env, ctx) {
  const url = new URL(req.url);
  const api = `${BASE_PATH}/api/early-access/`;
  if (url.pathname.startsWith(api)) {
    const route = url.pathname.slice(api.length);
    if (route === "subscribe" && req.method === "POST") return handleSubscribe(req, env, ctx);
    if (route === "confirm" && (req.method === "GET" || req.method === "POST"))
      return handleConfirm(req, env);
    if (route === "unsubscribe" && (req.method === "GET" || req.method === "POST"))
      return handleUnsubscribe(req, env);
    return json(404, { ok: false, error: "Not found" });
  }
  const admin = `${BASE_PATH}/api/admin/`;
  if (url.pathname.startsWith(admin)) {
    return withHeaders(await handleAdmin(req, env, url.pathname.slice(admin.length - 1)));
  }
  if (url.pathname.startsWith(`${BASE_PATH}/api/`))
    return json(404, { ok: false, error: "Not found" });
  if (url.pathname === "/" || url.pathname === BASE_PATH) {
    return withHeaders(
      new Response(null, { status: 301, headers: { Location: `${BASE_PATH}/` } }),
      {
        "Cache-Control": "public, max-age=3600",
      },
    );
  }
  return env.ASSETS.fetch(req);
}

export default {
  fetch: handleRequest,
  async scheduled(_event, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil(
      purgePending({ db: env.DB, now: () => new Date() }).then((deleted) =>
        logger.info("early_access.purge", { deleted }),
      ),
    );
  },
};
