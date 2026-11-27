// The early-access API. Mounted at /api; when the site has a base path (/payapps), index.ts strips
// it before routing.
//
//   POST /api/early-access              form post → 303 to the check-your-email page; JSON → 202
//                                       (same answer for every address; double opt-in)
//   GET  /api/early-access/confirm?token=   page with a "Confirm" button (GET never confirms, so
//   POST /api/early-access/confirm?token=   link scanners can't) → 303 to the confirmed page
//   GET  /api/early-access/remove?token=    page with a "Delete my sign-up" button
//   POST /api/early-access/remove?token=    deletes the row → 303 to the removed page
//   GET  /api/health
//   GET  /api/admin/metrics, /api/admin/accounts   owner console only (admin.ts; service token)
import { basePathOf, PAGES, PRODUCT_NAME, type PublicPage } from "@shared/site";
import { href, html, pageShell, type SiteContext } from "@site/html";
import { type Context, Hono } from "hono";
import { adminRoutes } from "./admin";
import { type EmailSender, senderFromEnv } from "./email";
import { parseSignup } from "./input";
import { confirmSignup, removeSignup, signUp } from "./signups";

export type Bindings = CloudflareBindings;
type AppEnv = { Bindings: Bindings };
type C = Context<AppEnv>;

export interface AppDeps {
  sender?: (env: Bindings) => EmailSender;
  now?: () => Date;
}

/** Applied to every Worker response; public/_headers sets the same for static files. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // "same-origin", not "no-referrer": with no-referrer browsers send `Origin: null` on our own
  // form posts, which the origin check refuses. Tokens in the URL still never leave the site.
  "Referrer-Policy": "same-origin",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export const SIGNUP_MESSAGE =
  "Thanks. If that address can receive mail, a confirmation link is on its way.";

const site = (c: C): SiteContext => ({ siteUrl: c.env.SITE_URL.replace(/\/+$/, "") });

/** Same-origin check for state-changing requests (a missing Origin is allowed, as in grants). */
function originAllowed(c: C): boolean {
  const origin = c.req.header("Origin");
  if (!origin || origin === "null") return origin !== "null";
  return origin === new URL(c.env.SITE_URL).origin;
}

const tokenOf = (c: C) => (c.req.query("token") ?? "").trim().slice(0, 300);

function workerPage(
  c: C,
  status: 200 | 400 | 403 | 404 | 429,
  title: string,
  body: ReturnType<typeof html>,
) {
  const page: PublicPage = {
    path: "/early-access",
    file: "",
    title: `${title} · ${PRODUCT_NAME}`,
    description: title,
    indexable: false,
    label: title,
  };
  const main = html`<section class="page-head"><div class="wrap narrow">${body}</div></section>`;
  return c.html(pageShell(site(c), { page, main }), status);
}

function actionPage(c: C, kind: "confirm" | "remove") {
  const token = tokenOf(c);
  const action = `${href(site(c), `/api/early-access/${kind}`)}?token=${encodeURIComponent(token)}`;
  const copy =
    kind === "confirm"
      ? {
          title: "Confirm your sign-up",
          lede: "One click to join the early-access list.",
          button: "Confirm my sign-up",
        }
      : {
          title: "Delete your sign-up",
          lede: "This deletes your email address and answers straight away.",
          button: "Delete my sign-up",
        };
  return workerPage(
    c,
    200,
    copy.title,
    html`<h1>${copy.title}</h1><p class="lede">${copy.lede}</p>
<form method="post" action="${action}"><button class="btn" type="submit">${copy.button}</button></form>`,
  );
}

function badLink(c: C, expired: boolean) {
  return workerPage(
    c,
    400,
    expired ? "This link has expired" : "This link doesn't work",
    html`<h1>${expired ? "This link has expired" : "This link doesn't work"}</h1>
<p class="lede">${expired ? "Confirmation links work for 7 days." : "It may have been used already, or copied incompletely."} You can <a href="${href(site(c), PAGES.earlyAccess.path)}">sign up again</a>.</p>`,
  );
}

async function readBody(c: C): Promise<{ body: Record<string, unknown>; json: boolean } | null> {
  const type = c.req.header("Content-Type") ?? "";
  try {
    if (type.startsWith("application/json")) {
      const body: unknown = await c.req.json();
      return body && typeof body === "object" && !Array.isArray(body)
        ? { body: body as Record<string, unknown>, json: true }
        : null;
    }
    if (/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(type)) {
      const form = await c.req.parseBody();
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) if (typeof v === "string") body[k] = v;
      return { body, json: false };
    }
  } catch {
    return null;
  }
  return null;
}

export function createApp(deps: AppDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const senderFor = deps.sender ?? senderFromEnv;
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    await next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/early-access", async (c) => {
    if (!originAllowed(c))
      return c.json({ error: { code: "forbidden", message: "Bad origin" } }, 403);
    const parsed = await readBody(c);
    if (!parsed) {
      return c.json({ error: { code: "bad_request", message: "Send a form or JSON body" } }, 400);
    }
    const { body, json } = parsed;

    const limiter = (c.env as Partial<Bindings>).EARLY_ACCESS_LIMITER;
    if (limiter) {
      const ip = c.req.header("cf-connecting-ip") ?? "unknown";
      const { success } = await limiter.limit({ key: `ip:${ip}` });
      if (!success) {
        const message = "Too many sign-up attempts. Please wait a minute and try again.";
        return json
          ? c.json({ error: { code: "rate_limited", message } }, 429)
          : workerPage(
              c,
              429,
              "Please wait a minute",
              html`<h1>Please wait a minute</h1><p class="lede">${message}</p>`,
            );
      }
    }

    const result = parseSignup(body);
    if (!result.ok) {
      return json
        ? c.json(
            {
              error: { code: "invalid", message: result.message, details: { field: result.field } },
            },
            400,
          )
        : workerPage(
            c,
            400,
            "Please check the form",
            html`<h1>Please check the form</h1><p class="lede">${result.message}</p>
<p><a class="btn" href="${href(site(c), PAGES.earlyAccess.path)}">Back to the form</a></p>`,
          );
    }

    if (!result.honeypot) {
      // Deferred so the answer (and its timing) is the same whatever the address's state.
      const work = signUp(
        { db: c.env.DB, sender: senderFor(c.env), siteUrl: site(c).siteUrl, now: now() },
        result.value,
      )
        .then((outcome) => console.log(JSON.stringify({ event: "early_access.signup", outcome })))
        .catch((e: unknown) =>
          console.warn(JSON.stringify({ event: "early_access.signup_failed", error: String(e) })),
        );
      c.executionCtx.waitUntil(work);
    }
    return json
      ? c.json({ ok: true, message: SIGNUP_MESSAGE }, 202)
      : c.redirect(href(site(c), PAGES.checkEmail.path), 303);
  });

  app.get("/api/early-access/confirm", (c) => actionPage(c, "confirm"));
  app.post("/api/early-access/confirm", async (c) => {
    if (!originAllowed(c)) return c.text("Bad origin", 403);
    const outcome = await confirmSignup(c.env.DB, tokenOf(c), now());
    if (outcome !== "confirmed") return badLink(c, outcome === "expired");
    return c.redirect(href(site(c), PAGES.confirmed.path), 303);
  });

  app.get("/api/early-access/remove", (c) => actionPage(c, "remove"));
  app.post("/api/early-access/remove", async (c) => {
    if (!originAllowed(c)) return c.text("Bad origin", 403);
    const outcome = await removeSignup(c.env.DB, tokenOf(c));
    if (outcome !== "removed") return badLink(c, false);
    return c.redirect(href(site(c), PAGES.removed.path), 303);
  });

  app.route("/api/admin", adminRoutes(now));

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  return app;
}

/** Strips the site's base path (e.g. /payapps) so routes match at /api/*. */
export function stripBasePath(request: Request, siteUrl: string): Request {
  const base = basePathOf(siteUrl);
  const url = new URL(request.url);
  if (!base || !url.pathname.startsWith(`${base}/`)) return request;
  url.pathname = url.pathname.slice(base.length);
  return new Request(url, request);
}
