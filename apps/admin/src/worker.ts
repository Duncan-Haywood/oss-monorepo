// Owner console (apps/admin): one dashboard over every product's platform-admin API.
// Zero dependencies: plain fetch handler + static SPA in public/ (served by Workers Assets).
//
//   GET /api/health                → { ok }                         (no auth; no data)
//   GET /api/me                    → { email, products, digest }    (owner only)
//   GET /api/dashboard?days=30     → Dashboard (src/aggregate.ts)   (owner only)
//   GET /api/digest/preview        → { subject, text } (not sent)   (owner only)
//   cron (wrangler.jsonc)          → daily digest email when DIGEST_ENABLED=on
//
// Owner only: Cloudflare Access JWT + PLATFORM_ADMIN_EMAILS (src/access.ts). Products are read with
// the service credential (src/products.ts). Nothing is stored here; the products audit each read.
import { ownerRecipients } from "../../../packages/admin-metrics/src/index.ts";
import { checkOwner } from "./access.ts";
import { buildDashboard, type ProductReading } from "./aggregate.ts";
import { type ProductConfig, parseProducts } from "./config.ts";
import { buildDigest } from "./digest.ts";
import { type EmailSendBinding, ownerMailer } from "./email.ts";
import { productClient } from "./products.ts";

export interface Env {
  APP_ENV?: string;
  /** JSON product list (src/config.ts); set at deploy from the ADMIN_CONSOLE_PRODUCTS variable. */
  PRODUCTS?: string;
  PLATFORM_ADMIN_EMAILS?: string;
  ADMIN_SERVICE_TOKEN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  /** "on" = send the daily digest (also needs EMAIL + EMAIL_FROM). */
  DIGEST_ENABLED?: string;
  EMAIL?: EmailSendBinding;
  EMAIL_FROM?: string;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  [secret: string]: unknown;
}

export interface Deps {
  fetch?: typeof fetch;
  now?: () => Date;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS });
const error = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ app: "admin-console", event, ...data }));

function products(env: Env) {
  return parseProducts(env.PRODUCTS, { allowHttp: env.APP_ENV === "test" });
}

async function read(p: ProductConfig, env: Env, deps: Deps, days: number): Promise<ProductReading> {
  const c = productClient(p, env, deps.fetch);
  if (p.kind === "early_access") {
    const [metrics, recent] = await Promise.all([c.metrics(days), c.accounts("recent", 50)]);
    return {
      config: p,
      metrics,
      recent: recent as ProductReading["recent"],
      trials: null,
      churn: null,
    };
  }
  const [metrics, recent, trials, churn] = await Promise.all([
    c.metrics(days),
    c.accounts("recent", 50),
    c.accounts("trials", 50),
    c.accounts("churn", 50),
  ]);
  return {
    config: p,
    metrics,
    recent: recent as ProductReading["recent"],
    trials: trials as ProductReading["trials"],
    churn: churn as ProductReading["churn"],
  };
}

function digestState(env: Env) {
  const senderConfigured = ownerMailer(env) !== null;
  const on = (env.DIGEST_ENABLED ?? "").trim().toLowerCase() === "on";
  const recipients = ownerRecipients(
    { OWNER_NOTIFICATIONS: on ? "on" : "off", PLATFORM_ADMIN_EMAILS: env.PLATFORM_ADMIN_EMAILS },
    senderConfigured,
  );
  return { enabled: on, senderConfigured, recipients };
}

export async function handleApi(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/health") return json({ ok: true, app: "admin-console" });
  if (request.method !== "GET") return error(405, "method_not_allowed", "Read-only API");

  const owner = await checkOwner(request, env, { fetch: deps.fetch, now: deps.now?.().getTime() });
  if (!owner.ok) {
    log("access.denied", { reason: owner.reason, path });
    return error(
      owner.status,
      owner.reason,
      owner.status === 503 ? "Access is not configured or unavailable" : "Owner access required",
    );
  }
  const cfg = products(env);
  if (!cfg.ok) return error(500, "config_error", cfg.error);
  const now = deps.now?.() ?? new Date();

  if (path === "/api/me") {
    const d = digestState(env);
    return json({
      email: owner.email,
      products: cfg.products.map((p) => ({ key: p.key, name: p.name, kind: p.kind })),
      digest: {
        enabled: d.enabled,
        senderConfigured: d.senderConfigured,
        willSend: d.recipients.length > 0,
      },
    });
  }
  if (path === "/api/dashboard") {
    const raw = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isInteger(raw) && raw >= 1 && raw <= 366 ? raw : 30;
    const readings = await Promise.all(cfg.products.map((p) => read(p, env, deps, days)));
    log("dashboard.read", {
      products: readings.length,
      unreadable: readings.filter((r) => !r.metrics.ok).length,
    });
    return json(buildDashboard(readings, now, days));
  }
  if (path === "/api/digest/preview") {
    const mail = await buildDigest(
      cfg.products.map((config) => ({ config, client: productClient(config, env, deps.fetch) })),
      now,
    );
    return json(mail);
  }
  return error(404, "not_found", "Not found");
}

/** The cron: send the digest if it is switched on and a sender is configured. */
export async function runDigest(
  env: Env,
  deps: Deps = {},
): Promise<"sent" | "off" | "config_error"> {
  const d = digestState(env);
  const mailer = ownerMailer(env);
  if (!d.recipients.length || !mailer) {
    log("digest.off", { enabled: d.enabled, senderConfigured: d.senderConfigured });
    return "off";
  }
  const cfg = products(env);
  if (!cfg.ok) {
    log("digest.config_error", { error: cfg.error });
    return "config_error";
  }
  const mail = await buildDigest(
    cfg.products.map((config) => ({ config, client: productClient(config, env, deps.fetch) })),
    deps.now?.() ?? new Date(),
  );
  await mailer.send(d.recipients, mail.subject, mail.text);
  log("digest.sent", { recipients: d.recipients.length });
  return "sent";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        log("unhandled_error", { error: String(e) });
        return error(500, "internal_error", "Something went wrong");
      }
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      runDigest(env).catch((e) => {
        log("digest.failed", { error: String(e) });
      }),
    );
  },
};
