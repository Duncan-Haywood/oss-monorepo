// Org root, members and the rate card. Mounted under /api/orgs/:orgId behind requireOrg("viewer").
import {
  cutSpeedImportSchema,
  cutSpeedInputSchema,
  drillFeedInputSchema,
  finishingOpFieldsSchema,
  finishingOpInputSchema,
  inboundNotifySchema,
  inboundSendersSchema,
  invitationSchema,
  machineFieldsSchema,
  machineInputSchema,
  materialInputSchema,
  materialRateImportSchema,
  memberRoleSchema,
  quoteExpiryEmailsSchema,
  rateCardImportSchema,
  removalRateInputSchema,
  shopSettingsPatchSchema,
} from "@shared/api";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { organization } from "../../db/schema";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  disableInboundEmail,
  getInboundEmail,
  rotateInboundEmail,
  setAllowedSenders,
  setRfqArrivalNotify,
} from "../../services/inbound";
import {
  changeMemberRole,
  createInvitation,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
} from "../../services/orgs";
import {
  quoteExpiryEmailsFor,
  saveQuoteExpiryEmails,
} from "../../services/quotes/expiry-reminders";
import {
  createFinishingOp,
  createMachine,
  createMaterial,
  deleteCutSpeed,
  deleteDrillFeed,
  deleteRemovalRate,
  getRateCardDto,
  importCutSpeeds,
  importMaterialRates,
  importRateCard,
  retireRateItem,
  setCutSpeed,
  setDrillFeed,
  setRemovalRate,
  updateFinishingOp,
  updateMachine,
  updateMaterial,
  updateSettings,
} from "../../services/ratecard";
import type { AppEnv } from "../../types";

export const orgRootRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const { orgId, role } = c.var.tenant;
    const org = await c.var.ctx.db
      .select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get();
    const card = await getRateCardDto(c.var.ctx, orgId);
    return c.json({ org, role, settings: card.settings });
  })
  .patch(
    "/settings",
    requireRole("admin"),
    validate("json", shopSettingsPatchSchema),
    async (c) => {
      const { orgId } = c.var.tenant;
      await updateSettings(c.var.ctx, orgId, c.req.valid("json"));
      return c.json((await getRateCardDto(c.var.ctx, orgId)).settings);
    },
  );

export const memberRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json({ items: await listMembers(c.var.ctx, c.var.tenant.orgId) }))
  .get("/invitations", requireRole("admin"), async (c) =>
    c.json({ items: await listInvitations(c.var.ctx, c.var.tenant.orgId) }),
  )
  .post("/invitations", requireRole("admin"), validate("json", invitationSchema), async (c) => {
    const t = c.var.tenant;
    const inv = await createInvitation(c.var.ctx, t.orgId, t, c.req.valid("json"));
    return c.json(inv, 201);
  })
  .delete("/invitations/:id", requireRole("admin"), async (c) => {
    await revokeInvitation(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
    return c.body(null, 204);
  })
  .patch("/:memberId", requireRole("admin"), validate("json", memberRoleSchema), async (c) => {
    const t = c.var.tenant;
    await changeMemberRole(
      c.var.ctx,
      t.orgId,
      t.role,
      c.req.param("memberId"),
      c.req.valid("json").role,
    );
    return c.json({ ok: true });
  })
  .delete("/:memberId", requireRole("admin"), async (c) => {
    const t = c.var.tenant;
    await removeMember(c.var.ctx, t.orgId, t.role, c.req.param("memberId"));
    return c.body(null, 204);
  });

/** Rate-card writes set prices: admin and owner only. */
const admin = requireRole("admin");
export const rateCardRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await getRateCardDto(c.var.ctx, c.var.tenant.orgId)))
  // Import from the shop's own sheet: all rows or none (services/ratecard importRateCard).
  .post("/import", admin, validate("json", rateCardImportSchema), async (c) =>
    c.json(await importRateCard(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
  )
  .post("/machines", admin, validate("json", machineInputSchema), async (c) =>
    c.json(await createMachine(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201),
  )
  .patch("/machines/:id", admin, validate("json", machineFieldsSchema.partial()), async (c) =>
    c.json(
      await updateMachine(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), c.req.valid("json")),
    ),
  )
  // Cut speed per material and thickness: one row per cutting machine and material (PUT replaces).
  .put("/cut-speeds", admin, validate("json", cutSpeedInputSchema), async (c) =>
    c.json(await setCutSpeed(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
  )
  // Import from the shop's cut chart, matched by machine and material name: all rows or none.
  .post("/cut-speeds/import", admin, validate("json", cutSpeedImportSchema), async (c) =>
    c.json(await importCutSpeeds(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
  )
  .delete("/cut-speeds/:id", admin, async (c) => {
    await deleteCutSpeed(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
    return c.body(null, 204);
  })
  // Removal rate per material: one row per roughing machine and material (PUT replaces).
  .put("/removal-rates", admin, validate("json", removalRateInputSchema), async (c) =>
    c.json(await setRemovalRate(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
  )
  // Import from the shop's sheet, matched by machine and material name: all rows or none.
  .post("/removal-rates/import", admin, validate("json", materialRateImportSchema), async (c) =>
    c.json(
      await importMaterialRates(
        c.var.ctx,
        c.var.tenant.orgId,
        "removal-rates",
        c.req.valid("json"),
      ),
    ),
  )
  .delete("/removal-rates/:id", admin, async (c) => {
    await deleteRemovalRate(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
    return c.body(null, 204);
  })
  // Drill feed per material: one row per drilling machine and material (PUT replaces).
  .put("/drill-feeds", admin, validate("json", drillFeedInputSchema), async (c) =>
    c.json(await setDrillFeed(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
  )
  .post("/drill-feeds/import", admin, validate("json", materialRateImportSchema), async (c) =>
    c.json(
      await importMaterialRates(c.var.ctx, c.var.tenant.orgId, "drill-feeds", c.req.valid("json")),
    ),
  )
  .delete("/drill-feeds/:id", admin, async (c) => {
    await deleteDrillFeed(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
    return c.body(null, 204);
  })
  .post("/materials", admin, validate("json", materialInputSchema), async (c) =>
    c.json(await createMaterial(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201),
  )
  // Full replacement: the per-basis price checks need the whole row.
  .put("/materials/:id", admin, validate("json", materialInputSchema), async (c) =>
    c.json(
      await updateMaterial(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), c.req.valid("json")),
    ),
  )
  .post("/finishing-ops", admin, validate("json", finishingOpInputSchema), async (c) =>
    c.json(await createFinishingOp(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201),
  )
  .patch(
    "/finishing-ops/:id",
    admin,
    validate("json", finishingOpFieldsSchema.partial()),
    async (c) =>
      c.json(
        await updateFinishingOp(
          c.var.ctx,
          c.var.tenant.orgId,
          c.req.param("id"),
          c.req.valid("json"),
        ),
      ),
  )
  .delete("/:kind{machines|materials|finishing-ops}/:id", admin, async (c) =>
    c.json(
      await retireRateItem(
        c.var.ctx,
        c.req.param("kind") as "machines" | "materials" | "finishing-ops",
        c.var.tenant.orgId,
        c.req.param("id"),
      ),
    ),
  );

/**
 * The shop's inbound RFQ address: every member sees it, admins turn it on, replace or stop it,
 * and say who may email in (`/senders`).
 * Each member turns their own arrival emails on or off (`/notify`), never anyone else's.
 */
export const inboundEmailRoutes = new Hono<AppEnv>()
  .get("/", async (c) =>
    c.json(await getInboundEmail(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId)),
  )
  .put("/notify", validate("json", inboundNotifySchema), async (c) =>
    c.json(
      await setRfqArrivalNotify(
        c.var.ctx,
        c.var.tenant.orgId,
        c.var.tenant.userId,
        c.req.valid("json").notify,
      ),
    ),
  )
  // Who may email RFQs in: the whole list, replaced (shared/sender-allowlist.ts).
  .put("/senders", admin, validate("json", inboundSendersSchema), async (c) =>
    c.json(
      await setAllowedSenders(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.valid("json").senders,
        c.var.tenant.userId,
      ),
    ),
  )
  .post("/rotate", admin, async (c) =>
    c.json(await rotateInboundEmail(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId)),
  )
  .delete("/", admin, async (c) =>
    c.json(await disableInboundEmail(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId)),
  );

/** The signed-in member's own email settings that are not about the inbound address. */
export const notificationRoutes = new Hono<AppEnv>()
  .get("/quote-expiry", async (c) =>
    c.json({
      quoteExpiry: await quoteExpiryEmailsFor(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId),
    }),
  )
  .put("/quote-expiry", validate("json", quoteExpiryEmailsSchema), async (c) =>
    c.json(
      await saveQuoteExpiryEmails(
        c.var.ctx,
        c.var.tenant.orgId,
        c.var.tenant.userId,
        c.req.valid("json").quoteExpiry,
      ),
    ),
  );
