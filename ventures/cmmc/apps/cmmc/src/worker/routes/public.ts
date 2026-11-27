// Account-level routes: health, me (and accepting the legal documents), create/list orgs.
// The documents themselves are public at /api/legal (routes/legal.ts).
import { Hono } from "hono";
import { z } from "zod";
import { AppError, badRequest } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireUser } from "../middleware/session";
import { createBillingProvider } from "../ports/billing";
import { fileStoreKind } from "../ports/file-store";
import { acceptLegal, legalStatus } from "../services/legal";
import { createOrg, listOrgsForUser } from "../services/orgs";
import type { AppEnv } from "../types";

/**
 * `app` lets the deploy's smoke test tell this Worker from another one on the same host; `billing` says
 * whether paid plans are on sale (false while they ship dark); `email` whether account mail leaves the
 * Worker (without it nobody can confirm an address, so nobody can finish signing up); `files` where new
 * evidence goes, "r2", or "d1" until the bucket is bound (ports/file-store.ts). Nothing secret: no key,
 * id or address is shown.
 */
export const health = new Hono<AppEnv>().get("/", (c) =>
  c.json({
    ok: true,
    app: "cmmc-workspace",
    billing: createBillingProvider(c.env) !== null,
    email: c.var.ctx.email.delivers,
    files: fileStoreKind(c.env),
  }),
);

export const me = new Hono<AppEnv>()
  .get("/", requireUser, async (c) => {
    const u = c.var.user;
    if (!u) throw new Error("unreachable");
    const memberships = await listOrgsForUser(c.var.ctx, u.id);
    return c.json({ user: u, memberships, legal: await legalStatus(c.var.ctx, u.id) });
  })
  /** Accept the current Terms, Privacy, Refund and Acceptable Use documents (the version shown). */
  .post(
    "/legal/accept",
    requireUser,
    validate("json", z.object({ version: z.string().min(1).max(20) })),
    async (c) => {
      const status = await acceptLegal(
        c.var.ctx,
        c.var.user?.id ?? "",
        c.req.valid("json").version,
      );
      if (!status) throw badRequest("These documents have changed. Reload the page and try again.");
      return c.json(status);
    },
  );

export const orgs = new Hono<AppEnv>()
  .use("*", requireUser)
  .get("/", async (c) => c.json({ items: await listOrgsForUser(c.var.ctx, c.var.user?.id ?? "") }))
  .post(
    "/",
    validate(
      "json",
      z.object({
        name: z.string().trim().min(1).max(200),
        legalName: z.string().trim().max(200).optional(),
        targetLevel: z.union([z.literal(1), z.literal(2)]).default(2),
      }),
    ),
    async (c) => {
      const userId = c.var.user?.id ?? "";
      // Whoever creates an organization agrees to the documents first (the SPA shows them).
      if (!(await legalStatus(c.var.ctx, userId)).acceptedAt) {
        throw new AppError(
          403,
          "legal_not_accepted",
          "Accept the Terms of Service, Privacy Policy, Refund Policy and Acceptable Use Policy first.",
        );
      }
      const res = await createOrg(c.var.ctx, userId, c.req.valid("json"));
      return c.json(res, 201);
    },
  );
