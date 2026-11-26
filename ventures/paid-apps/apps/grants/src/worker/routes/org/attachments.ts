// OWNER: attachments module — attachments checklist and letters of support per application.
// Mounted on the org router at /applications (next to applications.ts):
//   GET   /:id/attachments                      checklist (syncs + deterministic auto-match)
//   PATCH /:id/attachments/:itemId              { action: pick|uploaded|waive|clear, ... }
//   POST  /:id/attachments/suggest              optional AI suggestions (validated ids only)
//   GET   /:id/support-letters
//   POST  /:id/support-letters                  { partnerName, partnerEmail, dueAt?, factIds?, note? }
//   POST  /:id/support-letters/:letterId/send
//   PATCH /:id/support-letters/:letterId
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  getChecklist,
  suggestWithAi,
  updateChecklistItem,
} from "../../services/attachments/checklist";
import {
  createSupportLetter,
  listSupportLetters,
  sendSupportLetter,
  updateSupportLetter,
} from "../../services/attachments/letters";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const docId = z.string().trim().min(1).max(64);

const AttachmentPatch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pick"), documentId: docId }),
  z.object({ action: z.literal("uploaded"), documentId: docId }),
  z.object({ action: z.literal("waive"), reason: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("clear") }),
]);

const dueAt = z.string().trim().max(40);

const LetterCreate = z.object({
  partnerName: z.string().trim().min(2).max(200),
  partnerEmail: z.string().trim().min(3).max(320),
  dueAt: dueAt.optional(),
  factIds: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  note: z.string().trim().max(2000).optional(),
});

const LetterPatch = z
  .object({
    partnerName: z.string().trim().min(2).max(200).optional(),
    partnerEmail: z.string().trim().min(3).max(320).optional(),
    dueAt: dueAt.nullable().optional(),
    emailIntro: z.string().trim().min(1).max(6000).optional(),
    outline: z.array(z.string().trim().min(1).max(400)).min(1).max(10).optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["declined", "received"]).optional(),
    documentId: docId.optional(),
  })
  .strict();

routes.get("/:id/attachments", async (c) => {
  const { ctx, tenant } = c.var;
  return c.json(await getChecklist(ctx, tenant.orgId, c.req.param("id")));
});

routes.post("/:id/attachments/suggest", requireRole("editor"), async (c) => {
  const { ctx, tenant } = c.var;
  return c.json(
    await suggestWithAi(ctx, {
      orgId: tenant.orgId,
      applicationId: c.req.param("id"),
      userId: tenant.userId,
      requestId: c.var.requestId,
    }),
  );
});

routes.patch(
  "/:id/attachments/:itemId",
  requireRole("editor"),
  validate("json", AttachmentPatch),
  async (c) => {
    const { ctx, tenant } = c.var;
    return c.json(
      await updateChecklistItem(ctx, {
        orgId: tenant.orgId,
        applicationId: c.req.param("id"),
        itemId: c.req.param("itemId"),
        userId: tenant.userId,
        patch: c.req.valid("json"),
        requestId: c.var.requestId,
      }),
    );
  },
);

routes.get("/:id/support-letters", async (c) => {
  const { ctx, tenant } = c.var;
  return c.json({ items: await listSupportLetters(ctx, tenant.orgId, c.req.param("id")) });
});

routes.post(
  "/:id/support-letters",
  requireRole("editor"),
  validate("json", LetterCreate),
  async (c) => {
    const { ctx, tenant } = c.var;
    const letter = await createSupportLetter(ctx, {
      orgId: tenant.orgId,
      applicationId: c.req.param("id"),
      userId: tenant.userId,
      data: c.req.valid("json"),
      requestId: c.var.requestId,
    });
    return c.json(letter, 201);
  },
);

routes.post("/:id/support-letters/:letterId/send", requireRole("editor"), async (c) => {
  const { ctx, tenant } = c.var;
  return c.json(
    await sendSupportLetter(ctx, {
      orgId: tenant.orgId,
      applicationId: c.req.param("id"),
      id: c.req.param("letterId"),
      userId: tenant.userId,
      requestId: c.var.requestId,
    }),
  );
});

routes.patch(
  "/:id/support-letters/:letterId",
  requireRole("editor"),
  validate("json", LetterPatch),
  async (c) => {
    const { ctx, tenant } = c.var;
    return c.json(
      await updateSupportLetter(ctx, {
        orgId: tenant.orgId,
        applicationId: c.req.param("id"),
        id: c.req.param("letterId"),
        userId: tenant.userId,
        data: c.req.valid("json"),
        requestId: c.var.requestId,
      }),
    );
  },
);

export default routes;
