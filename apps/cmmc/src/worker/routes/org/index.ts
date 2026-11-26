// Tenant-scoped API under /api/orgs/:orgId. requireOrg() runs first (app.ts); every handler below uses
// c.var.tenant.orgId only.

import { AFFIRMATION_KINDS, CMMC_STATUSES } from "@shared/affirmation";
import { renderAffirmationCalendar } from "@shared/affirmation-ics";
import {
  type CmmcLevel,
  conditionalReadiness,
  IMPLEMENTATION_STATUSES,
  IMPORT_MAX_BYTES,
  LEVEL2_BASELINE,
  LIBRARY_VERIFICATION,
  PARTIAL_CREDIT_KEYS,
  scoreLevel1,
  scoreLevel2,
} from "@shared/controls";
import { MEMBER_ROLES, OBJECTIVE_RESULTS, POAM_STATUSES } from "@shared/enums";
import { QUALITY_STATUSES } from "@shared/quality";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { auditLog, poamItem } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createAffirmation,
  deleteAffirmation,
  listAffirmations,
} from "../../services/affirmations";
import {
  calendarFeedStatus,
  deleteCalendarFeed,
  resetCalendarFeed,
} from "../../services/affirmations/calendar-feed";
import { reminderSettings, saveReminderSettings } from "../../services/affirmations/reminders";
import { emailVerificationRequired } from "../../services/auth/auth";
import {
  assertCanDraft,
  assertCanRecord,
  assertEvidenceRoom,
  assertLevel2Plan,
  assertQualityPlan,
  assertSeat,
  orgPlan,
} from "../../services/billing";
import {
  acceptDraft,
  getRecord,
  listControls,
  recordsFor,
  requireControl,
  statesFrom,
  updateControl,
} from "../../services/controls";
import { applyImport, previewImport } from "../../services/controls/import";
import { draftStatement } from "../../services/drafting";
import {
  deleteEvidence,
  downloadEvidence,
  listEvidence,
  uploadEvidence,
} from "../../services/evidence";
import {
  addMember,
  getOrg,
  listMembers,
  removeMember,
  updateMemberRole,
  updateProfile,
} from "../../services/orgs";
import { createPoam, deletePoam, listPoam, poamCsv, updatePoam } from "../../services/poam";
import {
  linkEvidence,
  qualityChecklist,
  renderQualityReport,
  unlinkEvidence,
  updateClause,
} from "../../services/quality";
import { buildSsp } from "../../services/ssp";
import type { AppEnv } from "../../types";

const text = (max: number) => z.string().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const levelQuery = z.object({ level: z.enum(["1", "2"]).optional() });

const routes = new Hono<AppEnv>();

const levelOf = async (c: { var: AppEnv["Variables"] }, q?: string): Promise<CmmcLevel> => {
  if (q === "1" || q === "2") return Number(q) as CmmcLevel;
  const { profile } = await getOrg(c.var.ctx, c.var.tenant.orgId);
  return profile.targetLevel === 1 ? 1 : 2;
};

// ---- org + profile ----
routes.get("/", async (c) => {
  const t = c.var.tenant;
  const [{ org, profile }, { plan }] = await Promise.all([
    getOrg(c.var.ctx, t.orgId),
    orgPlan(c.var.ctx, t.orgId),
  ]);
  return c.json({
    org,
    role: t.role,
    profile,
    // The plan whose limits apply now, so pages can show Level 2 as read only instead of a 402.
    plan: { key: plan.key, name: plan.name, level2: plan.level2, quality: plan.quality },
    library: { verification: LIBRARY_VERIFICATION, level2Baseline: LEVEL2_BASELINE },
  });
});

routes.patch(
  "/profile",
  requireRole("admin"),
  validate(
    "json",
    z
      .object({
        targetLevel: z.union([z.literal(1), z.literal(2)]),
        legalName: text(200),
        cageCode: text(20),
        systemName: text(200),
        systemDescription: text(8000),
        boundaryDescription: text(8000),
        environmentDescription: text(8000),
        connectionsDescription: text(8000),
        sspUpdateFrequency: text(200),
        affirmingOfficial: text(200),
      })
      .partial(),
  ),
  async (c) => {
    const t = c.var.tenant;
    return c.json(await updateProfile(c.var.ctx, t.orgId, t.userId, c.req.valid("json")));
  },
);

// ---- members ----
routes.get("/members", async (c) =>
  c.json({ items: await listMembers(c.var.ctx, c.var.tenant.orgId) }),
);
routes.post(
  "/members",
  requireRole("admin"),
  validate("json", z.object({ email: z.string().email().max(320), role: z.enum(MEMBER_ROLES) })),
  async (c) => {
    const t = c.var.tenant;
    await assertSeat(c.var.ctx, t.orgId);
    const requireVerifiedEmail = emailVerificationRequired(c.env, c.req.raw);
    return c.json(
      await addMember(c.var.ctx, t.orgId, t, c.req.valid("json"), { requireVerifiedEmail }),
      201,
    );
  },
);
routes.patch(
  "/members/:memberId",
  requireRole("admin"),
  validate("json", z.object({ role: z.enum(MEMBER_ROLES) })),
  async (c) => {
    const t = c.var.tenant;
    await updateMemberRole(
      c.var.ctx,
      t.orgId,
      t,
      c.req.param("memberId"),
      c.req.valid("json").role,
    );
    return c.json({ ok: true });
  },
);
routes.delete("/members/:memberId", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  await removeMember(c.var.ctx, t.orgId, t, c.req.param("memberId"));
  return c.json({ ok: true });
});

// ---- controls ----
routes.get("/controls", validate("query", levelQuery), async (c) => {
  const level = await levelOf(c, c.req.valid("query").level);
  return c.json({ level, items: await listControls(c.var.ctx, c.var.tenant.orgId, level) });
});

// Import from a spreadsheet saved as CSV: `apply: false` previews the changes, `apply: true` makes them.
// Previewing is reading (any member, any plan); applying is recording.
routes.post(
  "/controls/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      level: z.union([z.literal(1), z.literal(2)]),
      csv: z.string().min(1).max(IMPORT_MAX_BYTES),
      apply: z.boolean().default(false),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const { level, csv, apply } = c.req.valid("json");
    if (!apply) return c.json(await previewImport(c.var.ctx, t.orgId, csv, level));
    if (level === 2) await assertLevel2Plan(c.var.ctx, t.orgId, "Importing Level 2 requirements");
    return c.json(await applyImport(c.var.ctx, t.orgId, t.userId, csv, level));
  },
);

routes.get("/controls/:controlId", async (c) => {
  const orgId = c.var.tenant.orgId;
  const def = requireControl(c.req.param("controlId"));
  const [record, files, poam] = await Promise.all([
    getRecord(c.var.ctx, orgId, def.id),
    listEvidence(c.var.ctx, orgId, def.id),
    listPoam(c.var.ctx, orgId).then((items) => items.filter((i) => i.controlId === def.id)),
  ]);
  return c.json({ ...def, record, evidence: files, poam });
});

routes.patch(
  "/controls/:controlId",
  requireRole("editor"),
  validate(
    "json",
    z
      .object({
        status: z.enum(IMPLEMENTATION_STATUSES),
        partialCredit: z.enum(PARTIAL_CREDIT_KEYS).nullable(),
        ownerUserId: z.string().max(64).nullable(),
        notes: text(8000),
        statement: text(8000),
        draftStatement: text(8000).nullable(),
        objectiveResults: z.record(z.string().max(32), z.enum(OBJECTIVE_RESULTS)),
      })
      .partial(),
  ),
  async (c) => {
    const t = c.var.tenant;
    await assertCanRecord(c.var.ctx, t.orgId, c.req.param("controlId"));
    return c.json(
      await updateControl(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("controlId"),
        c.req.valid("json"),
      ),
    );
  },
);

routes.post("/controls/:controlId/draft", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await assertCanDraft(c.var.ctx, t.orgId, c.req.param("controlId"));
  return c.json(await draftStatement(c.var.ctx, t.orgId, t.userId, c.req.param("controlId")));
});

routes.post(
  "/controls/:controlId/draft/accept",
  requireRole("editor"),
  validate("json", z.object({ statement: text(8000).optional() })),
  async (c) => {
    const t = c.var.tenant;
    await assertCanRecord(c.var.ctx, t.orgId, c.req.param("controlId"));
    return c.json(
      await acceptDraft(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("controlId"),
        c.req.valid("json").statement,
      ),
    );
  },
);

// ---- evidence ----
routes.get(
  "/evidence",
  validate("query", z.object({ controlId: z.string().max(64).optional() })),
  async (c) =>
    c.json({
      items: await listEvidence(c.var.ctx, c.var.tenant.orgId, c.req.valid("query").controlId),
    }),
);

routes.post("/evidence", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  const form = await c.req.formData().catch(() => {
    throw badRequest("Expected multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file in the `file` field");
  if (form.get("noCui") !== "true") {
    throw badRequest("Confirm the file contains no CUI: this workspace is not a CUI enclave");
  }
  const title = form.get("title");
  const controlId = form.get("controlId");
  await assertCanRecord(c.var.ctx, t.orgId, typeof controlId === "string" ? controlId : null);
  await assertEvidenceRoom(c.var.ctx, t.orgId, file.size);
  const dto = await uploadEvidence(c.var.ctx, t.orgId, t.userId, {
    file,
    title: typeof title === "string" ? title.slice(0, 200) : undefined,
    controlId: typeof controlId === "string" && controlId ? controlId : null,
  });
  return c.json(dto, 201);
});

routes.get("/evidence/:id/download", async (c) => {
  const t = c.var.tenant;
  const { row, body } = await downloadEvidence(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return new Response(body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

routes.delete("/evidence/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteEvidence(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- POA&M ----
const poamBody = z.object({
  controlId: z.string().max(64),
  weakness: z.string().trim().min(1).max(4000),
  remediation: text(4000).optional(),
  milestones: text(4000).optional(),
  responsible: text(200).optional(),
  scheduledCompletion: date,
});

routes.get("/poam", async (c) => c.json({ items: await listPoam(c.var.ctx, c.var.tenant.orgId) }));
routes.get("/poam/export.csv", async (c) => {
  const csv = poamCsv(await listPoam(c.var.ctx, c.var.tenant.orgId));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="poam.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.post("/poam", requireRole("editor"), validate("json", poamBody), async (c) => {
  const t = c.var.tenant;
  await assertCanRecord(c.var.ctx, t.orgId, c.req.valid("json").controlId);
  return c.json(await createPoam(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/poam/:id",
  requireRole("editor"),
  validate(
    "json",
    poamBody
      .omit({ controlId: true })
      .partial()
      .extend({ status: z.enum(POAM_STATUSES).optional() }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const item = await c.var.ctx.db
      .select({ controlId: poamItem.controlId })
      .from(poamItem)
      .where(and(eq(poamItem.orgId, t.orgId), eq(poamItem.id, c.req.param("id"))))
      .get();
    if (!item) throw notFound("POA&M item");
    await assertCanRecord(c.var.ctx, t.orgId, item.controlId);
    return c.json(
      await updatePoam(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.delete("/poam/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deletePoam(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- score + SSP ----
routes.get("/score", validate("query", levelQuery), async (c) => {
  const level = await levelOf(c, c.req.valid("query").level);
  const states = statesFrom(await recordsFor(c.var.ctx, c.var.tenant.orgId));
  if (level === 1) return c.json({ level, level1: scoreLevel1(states) });
  return c.json({ level, level2: scoreLevel2(states), conditional: conditionalReadiness(states) });
});

routes.get("/ssp", validate("query", levelQuery), async (c) => {
  const level = await levelOf(c, c.req.valid("query").level);
  return c.json({ level, markdown: await buildSsp(c.var.ctx, c.var.tenant.orgId, level) });
});

routes.get("/ssp/download", validate("query", levelQuery), async (c) => {
  const level = await levelOf(c, c.req.valid("query").level);
  const md = await buildSsp(c.var.ctx, c.var.tenant.orgId, level);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="ssp-level-${level}.md"`,
      "Cache-Control": "private, no-store",
    },
  });
});

// ---- SPRS affirmations (32 CFR 170.22): a record of what the affirming official entered ----
routes.get("/affirmations", async (c) =>
  c.json(await listAffirmations(c.var.ctx, c.var.tenant.orgId)),
);
// The due dates as an iCalendar file with alarms 60 and 7 days ahead: reminders without the app
// sending email. Every member may download it, like the list it is built from.
routes.get("/affirmations/calendar.ics", async (c) => {
  const t = c.var.tenant;
  const [{ org }, data] = await Promise.all([
    getOrg(c.var.ctx, t.orgId),
    listAffirmations(c.var.ctx, t.orgId),
  ]);
  const ics = renderAffirmationCalendar({
    orgId: t.orgId,
    orgName: org.name,
    schedules: data.schedules,
    now: c.var.ctx.now(),
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cmmc-due-dates.ics"',
      "Cache-Control": "private, no-store",
    },
  });
});
// The same calendar as a link a calendar app subscribes to (services/affirmations/calendar-feed.ts):
// one per organization, made, reset and turned off by admins; the link itself is shown only once.
routes.get("/affirmations/calendar-feed", requireRole("admin"), async (c) =>
  c.json(await calendarFeedStatus(c.var.ctx, c.var.tenant.orgId)),
);
routes.post("/affirmations/calendar-feed", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  return c.json(await resetCalendarFeed(c.var.ctx, t.orgId, t.userId), 201);
});
routes.delete("/affirmations/calendar-feed", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  return c.json(await deleteCalendarFeed(c.var.ctx, t.orgId, t.userId));
});
// The reminder email 60 and 7 days before a date (services/affirmations/reminders.ts): each member's
// own switch. Only admins and owners get the email; the answer says whether this member is one.
routes.get("/affirmations/reminders", async (c) => {
  const t = c.var.tenant;
  return c.json(await reminderSettings(c.var.ctx, t.orgId, t.userId, t.role));
});
routes.put(
  "/affirmations/reminders",
  validate("json", z.object({ on: z.boolean() })),
  async (c) => {
    const t = c.var.tenant;
    const { on } = c.req.valid("json");
    return c.json(await saveReminderSettings(c.var.ctx, t.orgId, t.userId, t.role, on));
  },
);
routes.post(
  "/affirmations",
  requireRole("admin"),
  validate(
    "json",
    z.object({
      level: z.union([z.literal(1), z.literal(2)]),
      kind: z.enum(AFFIRMATION_KINDS),
      cmmcStatus: z.enum(CMMC_STATUSES),
      cmmcStatusDate: date,
      affirmedOn: date,
      officialName: text(200),
      officialTitle: text(200),
      officialContact: text(320),
      sprsScore: z.number().int().nullable(),
      notes: text(4000).optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const body = c.req.valid("json");
    if (body.level === 2)
      await assertLevel2Plan(c.var.ctx, t.orgId, "Recording Level 2 affirmations");
    return c.json(await createAffirmation(c.var.ctx, t.orgId, t.userId, body), 201);
  },
);
routes.delete("/affirmations/:id", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  await deleteAffirmation(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- ISO 9001 clause checklist: every member reads; recording needs the quality plan ----
routes.get("/quality", async (c) => c.json(await qualityChecklist(c.var.ctx, c.var.tenant.orgId)));

routes.get("/quality/report", async (c) => {
  const t = c.var.tenant;
  const [{ org }, data, members] = await Promise.all([
    getOrg(c.var.ctx, t.orgId),
    qualityChecklist(c.var.ctx, t.orgId),
    listMembers(c.var.ctx, t.orgId),
  ]);
  const md = renderQualityReport(
    org.name,
    data,
    c.var.ctx.now().toISOString().slice(0, 10),
    new Map(members.map((m) => [m.userId, m.name])),
  );
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="iso-9001-self-check.md"',
      "Cache-Control": "private, no-store",
    },
  });
});

routes.patch(
  "/quality/:clauseId",
  requireRole("editor"),
  validate(
    "json",
    z
      .object({
        status: z.enum(QUALITY_STATUSES),
        notes: text(8000),
        ownerUserId: z.string().max(64).nullable(),
      })
      .partial(),
  ),
  async (c) => {
    const t = c.var.tenant;
    await assertQualityPlan(c.var.ctx, t.orgId);
    return c.json(
      await updateClause(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("clauseId"),
        c.req.valid("json"),
      ),
    );
  },
);

routes.post(
  "/quality/:clauseId/evidence",
  requireRole("editor"),
  validate("json", z.object({ evidenceId: z.string().min(1).max(64) })),
  async (c) => {
    const t = c.var.tenant;
    await assertQualityPlan(c.var.ctx, t.orgId);
    await linkEvidence(
      c.var.ctx,
      t.orgId,
      t.userId,
      c.req.param("clauseId"),
      c.req.valid("json").evidenceId,
    );
    return c.json({ ok: true }, 201);
  },
);

routes.delete("/quality/links/:linkId", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await assertQualityPlan(c.var.ctx, t.orgId);
  await unlinkEvidence(c.var.ctx, t.orgId, t.userId, c.req.param("linkId"));
  return c.json({ ok: true });
});

// ---- audit log ----
routes.get("/audit-log", requireRole("admin"), async (c) => {
  const items = await c.var.ctx.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.orgId, c.var.tenant.orgId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(200)
    .all();
  return c.json({ items });
});

export default routes;
