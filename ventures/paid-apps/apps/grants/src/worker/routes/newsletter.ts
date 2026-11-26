// OWNER: marketing — public newsletter routes at /api/newsletter (docs/EMAIL_MARKETING.md).
// Mounted BEFORE the global Origin check and the session middleware: the RFC 8058 one-click POST
// comes from mail providers, not our pages. subscribe/confirm run originCheck themselves.
//
//   POST /subscribe                 { email, source, consentVersion, website? } → 202, same body always
//   GET  /confirm?token=            → 303 to the confirm page (scanner-safe: GET never confirms)
//   POST /confirm?token=            → { ok, status: confirmed | invalid | expired }
//   GET  /unsubscribe?token=        → 303 to the unsubscribe page
//   POST /unsubscribe?token=        → { ok, status: unsubscribed | invalid } (one-click or page button)
import {
  NEWSLETTER_CONFIRM_PATH,
  NEWSLETTER_CONSENT_VERSION,
  NEWSLETTER_SUBSCRIBE_MESSAGE,
  type NewsletterActionResponse,
  type NewsletterSubscribeResponse,
  UNSUBSCRIBE_PATH,
} from "@shared/newsletter";
import type { Context } from "hono";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { sha256Hex } from "../lib/hash";
import { validate } from "../lib/validate";
import { clientIp, rateLimit, TEST_RATE_LIMIT_HEADER } from "../middleware/rate-limit";
import { originCheck } from "../middleware/security";
import { isSafeEmailAddress } from "../ports/email";
import { ONE_CLICK_BODY } from "../services/marketing/headers";
import {
  confirmSubscription,
  normalizeEmail,
  subscribe,
  type UnsubscribeMethod,
  unsubscribeWithToken,
} from "../services/marketing/subscribers";
import type { AppEnv } from "../types";

declare module "hono" {
  interface ContextVariableMap {
    /** SHA-256 of the normalized subscribe address (rate-limit key). Never the address. */
    newsletterEmailKey: string | undefined;
  }
}

/** Per client IP and per address (keep wrangler.jsonc NEWSLETTER_LIMITER identical). */
export const NEWSLETTER_LIMIT = { binding: "NEWSLETTER_LIMITER", limit: 5, periodSeconds: 60 };

const enforced = (c: Context<AppEnv>) =>
  !(c.env?.APP_ENV === "test" && c.req.header(TEST_RATE_LIMIT_HEADER) !== "enforce");

const tooMany = "Too many signup attempts. Please wait a minute and try again.";

const ipLimiter = rateLimit({
  ...NEWSLETTER_LIMIT,
  name: "newsletter_ip",
  when: enforced,
  key: (c) => `ip:${clientIp(c)}`,
  message: tooMany,
});

const emailLimiter = rateLimit({
  ...NEWSLETTER_LIMIT,
  name: "newsletter_email",
  when: enforced,
  key: (c) => {
    const k = c.get("newsletterEmailKey");
    return k ? `email:${k}` : null;
  },
  message: tooMany,
});

export const subscribeSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .transform(normalizeEmail)
      .refine(isSafeEmailAddress, { message: "Enter a valid email address" }),
    /** Site path of the form, e.g. "/resources/need-statement-funders-trust". */
    source: z
      .string()
      .trim()
      .max(200)
      .regex(/^\/[A-Za-z0-9/_-]*$/, { message: "Invalid source page" }),
    consentVersion: z.literal(NEWSLETTER_CONSENT_VERSION),
    /** Honeypot: hidden from people; bots that fill it get the normal answer and nothing happens. */
    website: z.string().max(500).optional(),
  })
  .strict();

type SubscribeInput = {
  in: { json: z.input<typeof subscribeSchema> };
  out: { json: z.output<typeof subscribeSchema> };
};

/** Runs after validation: the per-address limiter's key. */
const emailKey = createMiddleware<AppEnv, string, SubscribeInput>(async (c, next) => {
  const { email } = c.req.valid("json");
  c.set("newsletterEmailKey", await sha256Hex(`newsletter:${email}`));
  await next();
});

const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

const generic = (): NewsletterSubscribeResponse => ({
  ok: true,
  message: NEWSLETTER_SUBSCRIBE_MESSAGE,
});

const tokenOf = (c: Context<AppEnv>) => (c.req.query("token") ?? "").trim().slice(0, 300);

const pageRedirect = (c: Context<AppEnv>, path: string) => {
  const token = tokenOf(c);
  return c.redirect(token ? `${path}?token=${encodeURIComponent(token)}` : path, 303);
};

/** "one_click" when the body is the RFC 8058 form post; "link" for the page button. */
async function unsubscribeMethod(c: Context<AppEnv>): Promise<UnsubscribeMethod> {
  const type = c.req.header("Content-Type") ?? "";
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(type)) return "link";
  try {
    const body = await c.req.parseBody();
    const [name, value] = ONE_CLICK_BODY.split("=");
    return name && body[name] === value ? "one_click" : "link";
  } catch {
    return "link";
  }
}

const routes = new Hono<AppEnv>()
  .post(
    "/subscribe",
    originCheck,
    ipLimiter,
    validate("json", subscribeSchema),
    emailKey,
    emailLimiter,
    async (c) => {
      const ctx = c.var.ctx;
      const body = c.req.valid("json");
      if (!body.website) {
        // Deferred so the response (and its timing) is the same whether or not the address is
        // already on the list; failures are logged, never shown.
        ctx.defer(
          subscribe(ctx, {
            email: body.email,
            source: body.source,
            consentVersion: body.consentVersion,
            ip: c.req.header("cf-connecting-ip") ?? null,
          })
            .then((outcome) => ctx.logger.info("newsletter.subscribe", { outcome }))
            .catch((e) => ctx.logger.warn("newsletter.subscribe_failed", { error: String(e) })),
        );
      } else {
        ctx.logger.info("newsletter.subscribe", { outcome: "honeypot" });
      }
      return c.json(generic(), 202, noStore);
    },
  )
  .get("/confirm", (c) => pageRedirect(c, NEWSLETTER_CONFIRM_PATH))
  .post("/confirm", originCheck, async (c) => {
    const status = await confirmSubscription(c.var.ctx, tokenOf(c));
    const res: NewsletterActionResponse = { ok: status === "confirmed", status };
    return c.json(res, 200, noStore);
  })
  .get("/unsubscribe", (c) => pageRedirect(c, UNSUBSCRIBE_PATH))
  .post("/unsubscribe", async (c) => {
    const method = await unsubscribeMethod(c);
    const status = await unsubscribeWithToken(c.var.ctx, tokenOf(c), method);
    c.var.ctx.logger.info("newsletter.unsubscribe", { status, method });
    const res: NewsletterActionResponse = { ok: status === "unsubscribed", status };
    return c.json(res, 200, noStore);
  });

export default routes;
