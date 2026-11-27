// Public / account routes: health, Better Auth, /me (and accepting the legal documents), shop
// creation, invitation accept. The documents themselves are public at /api/legal (routes/legal.ts).
// Better Auth at /api/auth/*: sign-up/in/out, get-session, email verification (verify-email,
// send-verification-email) and password reset (request-password-reset, reset-password); account
// mail goes through ctx.email (services/auth/emails.ts).
import { createOrgSchema } from "@shared/api";
import { customerResponseSchema } from "@shared/customer-link";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireUser } from "../middleware/session";
import {
  authOptionsForRequest,
  createAuth,
  requiresEmailVerification,
} from "../services/auth/auth";
import { acceptLegal, legalStatus } from "../services/legal";
import { acceptInvitation, createOrg, listMemberships } from "../services/orgs";
import {
  customerQuotePdf,
  respondToQuote,
  viewCustomerQuote,
} from "../services/quotes/customer-link";
import type { AppEnv } from "../types";

// `email` says whether account mail leaves the Worker: a deploy's smoke test checks it, because
// without it nobody can verify an address and so nobody can sign in.
export const healthRoutes = new Hono<AppEnv>().get("/", (c) =>
  c.json({ ok: true, app: "jobshop-quote", email: c.var.ctx.email.delivers }),
);

export const authRoutes = new Hono<AppEnv>().on(["GET", "POST"], "/*", (c) =>
  createAuth(c.var.ctx, authOptionsForRequest(c.env, c.req.raw)).handler(c.req.raw),
);

export const meRoutes = new Hono<AppEnv>().get("/", requireUser, async (c) => {
  const user = c.var.user;
  if (!user) throw new Error("unreachable");
  const memberships = await listMemberships(c.var.ctx, user.id);
  return c.json({
    user: { id: user.id, email: user.email, name: user.name },
    memberships: memberships.map((m) => ({
      orgId: m.id,
      orgName: m.name,
      orgSlug: m.slug,
      role: m.role,
    })),
    legal: await legalStatus(c.var.ctx, user.id),
  });
});

const acceptLegalSchema = z.object({ version: z.string().min(1).max(20) });

/** Accept the current Terms, Privacy, Refund and Acceptable Use documents (the version shown). */
meRoutes.post("/legal/accept", requireUser, validate("json", acceptLegalSchema), async (c) => {
  const user = c.var.user;
  if (!user) throw new Error("unreachable");
  const status = await acceptLegal(c.var.ctx, user.id, c.req.valid("json").version);
  if (!status)
    throw badRequest(
      "These documents have changed since you opened them. Reload and read the current version.",
    );
  return c.json(status);
});

export const orgsRoutes = new Hono<AppEnv>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const user = c.var.user;
    if (!user) throw new Error("unreachable");
    return c.json({ items: await listMemberships(c.var.ctx, user.id) });
  })
  .post("/", validate("json", createOrgSchema), async (c) => {
    const user = c.var.user;
    if (!user) throw new Error("unreachable");
    return c.json(await createOrg(c.var.ctx, user.id, c.req.valid("json")), 201);
  });

export const invitationRoutes = new Hono<AppEnv>()
  .use("*", requireUser)
  .post("/:token/accept", async (c) => {
    const user = c.var.user;
    if (!user) throw new Error("unreachable");
    const requireVerifiedEmail =
      authOptionsForRequest(c.env, c.req.raw).requireEmailVerification ??
      requiresEmailVerification(c.env);
    return c.json(
      await acceptInvitation(c.var.ctx, user, c.req.param("token"), { requireVerifiedEmail }),
    );
  });

/**
 * The customer's side of a customer link (services/quotes/customer-link.ts): no session, the token
 * is the credential. Read the quote, download the exact PDF sent, accept or decline once.
 */
export const quoteLinkRoutes = new Hono<AppEnv>()
  .get("/:token", async (c) => {
    c.header("Referrer-Policy", "no-referrer");
    return c.json(await viewCustomerQuote(c.var.ctx, c.req.param("token")));
  })
  .get("/:token/pdf", async (c) => {
    const { bytes, fileName } = await customerQuotePdf(c.var.ctx, c.req.param("token"));
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-store",
      },
    });
  })
  .post("/:token/respond", validate("json", customerResponseSchema), async (c) =>
    c.json(await respondToQuote(c.var.ctx, c.req.param("token"), c.req.valid("json"))),
  );
