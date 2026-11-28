// Tenant-scoped API under /api/orgs/:orgId. requireOrg() runs first (app.ts); every handler below uses
// c.var.tenant.orgId only.

import { AFFIRMATION_KINDS, CMMC_STATUSES } from "@shared/affirmation";
import { renderAffirmationCalendar } from "@shared/affirmation-ics";
import {
  ASSET_CATEGORIES,
  ASSET_RULE_VERIFICATION,
  assetsCsv,
  CATEGORY_INFO,
  SPECIALIZED_LABEL,
  SPECIALIZED_TYPES,
} from "@shared/assets";
import { isCalendarDate } from "@shared/calendar-date";
import {
  AS_FOUND,
  AS_FOUND_LABEL,
  AS_LEFT,
  AS_LEFT_LABEL,
  CAL_DUE_SOON_DAYS,
  CAL_INTERVAL_CHOICES,
  CAL_INTERVAL_MAX,
  CAL_INTERVAL_MIN,
  CAL_PERFORMER_LABEL,
  CAL_PERFORMERS,
  CAL_TEXT_MAX,
  GAUGE_KIND_LABEL,
  GAUGE_KINDS,
  GAUGE_OWNER_LABEL,
  GAUGE_OWNERS,
  GAUGE_STATUS_LABEL,
  GAUGE_STATUSES,
  GAUGE_TAG_MAX,
  GAUGE_TEXT_MAX,
} from "@shared/calibration";
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
import {
  DOC_KIND_LABEL,
  DOC_KINDS,
  DOC_ORIGIN_LABEL,
  DOC_ORIGINS,
  DOC_REVIEW_MONTHS,
  DOC_STATUS_LABEL,
  DOC_STATUSES,
  masterListCsv,
} from "@shared/document-control";
import { MEMBER_ROLES, OBJECTIVE_RESULTS, POAM_STATUSES, SCOPE_DISCLAIMER } from "@shared/enums";
import {
  AFFECTS,
  AFFECTS_LABEL,
  CLAUSE_ANSWERS,
  CLAUSE_LABEL,
  INCIDENT_QUOTES,
  INCIDENT_RULE_VERIFICATION,
  INCIDENT_STAGE_LABEL,
  INCIDENT_STEPS,
  incidentRecordMarkdown,
  incidentsCsv,
  isInstant,
  MAX_TIMELINE_ENTRIES,
  PRESERVE_DAYS,
  REPORT_HOURS,
  ROLE_LABEL,
  ROLES,
  TRI,
  TRI_LABEL,
} from "@shared/incidents";
import {
  AUDIT_COVERAGE_MONTHS,
  AUDIT_STATUS_LABEL,
  AUDIT_STATUSES,
  CA_SOURCE_LABEL,
  CA_SOURCES,
  CA_STAGE_LABEL,
  CA_STAGES,
  correctiveActionLogCsv,
  FINDING_KIND_LABEL,
  FINDING_KINDS,
} from "@shared/internal-audits";
import {
  MAX_REVIEW_ACTIONS,
  REVIEW_INPUT_KEYS,
  REVIEW_INPUTS,
  REVIEW_OUTPUT_KEYS,
  REVIEW_OUTPUTS,
  REVIEW_SHORT_MAX,
  REVIEW_TEXT_MAX,
} from "@shared/management-review";
import {
  DEPARTURE_KINDS,
  DEPARTURE_LABEL,
  personnelCsv,
  REFRESH_MONTH_CHOICES,
  REFRESH_NOTE,
  TRAINING_INFO,
  TRAININGS,
} from "@shared/personnel";
import { QUALITY_STATUSES } from "@shared/quality";
import {
  POLICY_BODY_MAX,
  POLICY_TITLE_MAX,
  REVIEW_MONTHS,
  renderPolicyDocument,
  renderPolicyManual,
} from "@shared/security-policies";
import {
  ESP_DATA,
  ESP_DATA_LABEL,
  ESP_QUOTES,
  ESP_RULE_VERIFICATION,
  espScope,
  RESPONSIBILITIES,
  sharesByControl,
} from "@shared/service-providers";
import {
  INFO_FLOWED,
  INFO_FLOWED_LABEL,
  SUPPLIER_LEVEL_LABEL,
  SUPPLIER_LEVELS,
  SUPPLIER_QUOTES,
  SUPPLIER_RULE_VERIFICATION,
  SUPPLIER_STATUS_LABEL,
  SUPPLIER_STATUSES,
  suppliersCsv,
} from "@shared/suppliers";
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
import {
  assetInventory,
  createAsset,
  deleteAsset,
  listAssets,
  setNetworkDiagram,
  updateAsset,
} from "../../services/assets";
import { applyAssetImport, previewAssetImport } from "../../services/assets/import";
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
  calibrationDueDatesFor,
  createGauge,
  deleteGauge,
  gaugeCsv,
  gaugeHistory,
  gaugeList,
  recordCalibration,
  recordImpact,
  updateGauge,
} from "../../services/calibration";
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
import {
  controlledCopyFiles,
  createDocument,
  deleteDocument,
  documentHistory,
  documentList,
  documentReviewDatesFor,
  listDocuments,
  obsoleteDocument,
  releaseDocument,
  reviewDocument,
  reviseDocument,
  setDocumentFile,
  updateDocument,
} from "../../services/documents";
import { applyDocumentImport, previewDocumentImport } from "../../services/documents/import";
import { draftStatement } from "../../services/drafting";
import {
  discardProcedureDraft,
  draftProcedure,
  requireFamilyControl,
} from "../../services/drafting/procedure";
import {
  deleteEvidence,
  downloadEvidence,
  listEvidence,
  uploadEvidence,
} from "../../services/evidence";
import {
  createIncident,
  deleteIncident,
  describeIncident,
  getIncident,
  incidentHoldDatesFor,
  incidentList,
  listIncidents,
  updateIncident,
} from "../../services/incidents";
import {
  addFinding,
  auditProgramme,
  auditReport,
  cancelAudit,
  clauseNumber,
  completeAudit,
  createAudit,
  createCorrectiveAction,
  deleteAudit,
  deleteCorrectiveAction,
  deleteFinding,
  listCorrectiveActions,
  openFromFinding,
  qualityDueDatesFor,
  updateAudit,
  updateCorrectiveAction,
  verifyCorrectiveAction,
} from "../../services/internal-audits";
import {
  createReview,
  deleteReview,
  finaliseReview,
  reviewDueDatesFor,
  reviewList,
  reviewMinutes,
  reviewSummary,
  setActionDone,
  updateReview,
} from "../../services/management-review";
import {
  addMember,
  getOrg,
  listMembers,
  removeMember,
  updateMemberRole,
  updateProfile,
} from "../../services/orgs";
import {
  createPerson,
  deletePerson,
  listPeople,
  personnelRecords,
  refreshMonths,
  setRefreshMonths,
  trainingDueDatesFor,
  updatePerson,
} from "../../services/personnel";
import { applyPersonnelImport, previewPersonnelImport } from "../../services/personnel/import";
import { createPoam, deletePoam, listPoam, poamCsv, updatePoam } from "../../services/poam";
import { applyPoamImport, previewPoamImport, touchesLevel2 } from "../../services/poam/import";
import {
  linkEvidence,
  qualityChecklist,
  renderQualityReport,
  unlinkEvidence,
  updateClause,
} from "../../services/quality";
import {
  allPolicyDocuments,
  approvePolicy,
  deletePolicy,
  getPolicy,
  listPolicies,
  policyDocument,
  policyReviewDates,
  requireFamily,
  reviewPolicy,
  savePolicy,
} from "../../services/security-policies";
import {
  createProvider,
  deleteProvider,
  listProviders,
  providerList,
  updateProvider,
} from "../../services/service-providers";
import { buildSsp } from "../../services/ssp";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  supplierDueDatesFor,
  supplierList,
  updateSupplier,
} from "../../services/suppliers";
import { applySupplierImport, previewSupplierImport } from "../../services/suppliers/import";
import type { AppEnv } from "../../types";

const text = (max: number) => z.string().max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isCalendarDate, "Not a calendar date: use YYYY-MM-DD");
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
const providerShares = async (ctx: AppEnv["Variables"]["ctx"], orgId: string) =>
  sharesByControl(await listProviders(ctx, orgId));

routes.get("/controls", validate("query", levelQuery), async (c) => {
  const level = await levelOf(c, c.req.valid("query").level);
  const orgId = c.var.tenant.orgId;
  const [items, shares] = await Promise.all([
    listControls(c.var.ctx, orgId, level),
    level === 2 ? providerShares(c.var.ctx, orgId) : new Map(),
  ]);
  // Per requirement, the external service providers whose CRM says they carry it or share it.
  return c.json({
    level,
    items: items.map((i) => ({ ...i, providers: shares.get(i.id) ?? [] })),
  });
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
  const [record, files, poam, shares] = await Promise.all([
    getRecord(c.var.ctx, orgId, def.id),
    listEvidence(c.var.ctx, orgId, def.id),
    listPoam(c.var.ctx, orgId).then((items) => items.filter((i) => i.controlId === def.id)),
    def.level === 2 ? providerShares(c.var.ctx, orgId) : new Map(),
  ]);
  return c.json({ ...def, record, evidence: files, poam, providers: shares.get(def.id) ?? [] });
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
        // null clears a result back to unanswered.
        objectiveResults: z.record(z.string().max(32), z.enum(OBJECTIVE_RESULTS).nullable()),
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
// Import an existing POA&M sheet (CSV, or an .xlsx sheet sent as CSV by the browser): `apply: false`
// previews (any editor, any plan), `apply: true` creates and updates items (Level 2 items need the
// Level 2 plan, as adding one by hand does).
routes.post(
  "/poam/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      level: z.union([z.literal(1), z.literal(2)]),
      csv: z.string().min(1).max(IMPORT_MAX_BYTES),
      apply: z.boolean().default(false),
      // Numeric dates month first (US) or day first; left out, the sheet's own dates decide.
      dateOrder: z.enum(["mdy", "dmy"]).optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const { level, csv, apply, dateOrder } = c.req.valid("json");
    const preview = await previewPoamImport(c.var.ctx, t.orgId, csv, level, dateOrder);
    if (!apply) return c.json(preview);
    if (touchesLevel2(preview))
      await assertLevel2Plan(c.var.ctx, t.orgId, "Importing Level 2 POA&M items");
    return c.json(await applyPoamImport(c.var.ctx, t.orgId, t.userId, csv, level, dateOrder));
  },
);
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

// ---- Level 2 asset inventory (32 CFR 170.19(c)) ----
// Every member reads it on every plan; recording needs the Level 2 plan (it scopes Level 2).
const assetBody = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(ASSET_CATEGORIES),
  specializedType: z.enum(SPECIALIZED_TYPES).nullable().optional(),
  assetType: text(200).optional(),
  location: text(200).optional(),
  provider: text(200).optional(),
  owner: text(200).optional(),
  notes: text(4000).optional(),
});

routes.get("/assets", async (c) =>
  c.json({
    ...(await assetInventory(c.var.ctx, c.var.tenant.orgId)),
    categories: Object.values(CATEGORY_INFO),
    specializedTypes: SPECIALIZED_TYPES.map((key) => ({ key, label: SPECIALIZED_LABEL[key] })),
    verification: ASSET_RULE_VERIFICATION,
  }),
);
routes.get("/assets/export.csv", async (c) => {
  const csv = assetsCsv(await listAssets(c.var.ctx, c.var.tenant.orgId));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="asset-inventory.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.post("/assets", requireRole("editor"), validate("json", assetBody), async (c) => {
  const t = c.var.tenant;
  await assertLevel2Plan(c.var.ctx, t.orgId, "Recording the Level 2 asset inventory");
  return c.json(await createAsset(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/assets/:id",
  requireRole("editor"),
  validate("json", assetBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    await assertLevel2Plan(c.var.ctx, t.orgId, "Recording the Level 2 asset inventory");
    return c.json(
      await updateAsset(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
// Import an existing asset list (CSV, or an .xlsx sheet sent as CSV by the browser): `apply: false`
// previews (any editor, any plan), `apply: true` creates and updates assets (the Level 2 plan, as
// recording one by hand).
routes.post(
  "/assets/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({ csv: z.string().min(1).max(IMPORT_MAX_BYTES), apply: z.boolean().default(false) }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const { csv, apply } = c.req.valid("json");
    if (!apply) return c.json(await previewAssetImport(c.var.ctx, t.orgId, csv));
    await assertLevel2Plan(c.var.ctx, t.orgId, "Recording the Level 2 asset inventory");
    return c.json(await applyAssetImport(c.var.ctx, t.orgId, t.userId, csv));
  },
);
// The network diagram of the assessment scope (table 3 to 32 CFR 170.19(c)(1)): one of the org's
// evidence files. Linking needs the Level 2 plan, as recording assets does; unlinking never does.
routes.put(
  "/assets/network-diagram",
  requireRole("editor"),
  validate("json", z.object({ evidenceId: z.string().min(1).max(64).nullable() })),
  async (c) => {
    const t = c.var.tenant;
    const { evidenceId } = c.req.valid("json");
    if (evidenceId) await assertLevel2Plan(c.var.ctx, t.orgId, "Linking the network diagram");
    return c.json({
      networkDiagram: await setNetworkDiagram(c.var.ctx, t.orgId, t.userId, evidenceId),
    });
  },
);
// Deleting is allowed on every plan, so a shop that downgrades can still clean up.
routes.delete("/assets/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteAsset(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- External service providers (32 CFR 170.19(c)(2)) ----
// Same gates as the asset inventory: read on every plan, record on Level 2, delete on any plan.
const providerBody = z.object({
  name: z.string().trim().min(1).max(200),
  data: z.enum(ESP_DATA),
  isCsp: z.boolean().optional(),
  services: text(1000).optional(),
  fedrampBasis: text(1000).optional(),
  serviceDescriptionRef: text(500).optional(),
  crmRef: text(500).optional(),
  serviceDescriptionEvidenceId: z.string().max(64).nullable().optional(),
  crmEvidenceId: z.string().max(64).nullable().optional(),
  notes: text(4000).optional(),
  controls: z
    .array(z.object({ controlId: z.string().max(40), responsibility: z.enum(RESPONSIBILITIES) }))
    .max(110)
    .optional(),
});

routes.get("/service-providers", async (c) =>
  c.json({
    ...(await providerList(c.var.ctx, c.var.tenant.orgId)),
    options: ESP_DATA.map((key) => ({
      key,
      label: ESP_DATA_LABEL[key],
      csp: espScope(key, true),
      notCsp: espScope(key, false),
    })),
    quotes: { intro: ESP_QUOTES.intro, document: ESP_QUOTES.document },
    verification: ESP_RULE_VERIFICATION,
  }),
);
routes.post(
  "/service-providers",
  requireRole("editor"),
  validate("json", providerBody),
  async (c) => {
    const t = c.var.tenant;
    await assertLevel2Plan(c.var.ctx, t.orgId, "Recording external service providers");
    return c.json(await createProvider(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
  },
);
routes.patch(
  "/service-providers/:id",
  requireRole("editor"),
  validate("json", providerBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    await assertLevel2Plan(c.var.ctx, t.orgId, "Recording external service providers");
    return c.json(
      await updateProvider(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.delete("/service-providers/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteProvider(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- Subcontractors and suppliers (DFARS 252.204-7021(d)(4), (f)) ----
// Every member reads on every plan; FCI-only Level 1 flow-down records on every plan, CUI or a Level 2
// or 3 requirement needs the Level 2 plan (services/suppliers); deleting works on any plan.
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isCalendarDate, "Not a calendar date: use YYYY-MM-DD")
  .nullable()
  .optional();
const supplierBody = z.object({
  name: z.string().trim().min(1).max(200),
  supplies: text(500).optional(),
  infoFlowed: z.enum(INFO_FLOWED),
  cots: z.boolean().optional(),
  requiredLevel: z.enum(SUPPLIER_LEVELS).nullable().optional(),
  status: z.enum(SUPPLIER_STATUSES).nullable().optional(),
  statusDate: isoDay,
  affirmedOn: isoDay,
  cmmcUids: text(400).optional(),
  clauseFlowedDown: z.boolean().optional(),
  subcontractRef: text(200).optional(),
  checkedOn: isoDay,
  awardedOn: isoDay,
  evidenceRef: text(500).optional(),
  notes: text(4000).optional(),
});

routes.get("/suppliers", async (c) =>
  c.json({
    ...(await supplierList(c.var.ctx, c.var.tenant.orgId)),
    infoOptions: INFO_FLOWED.map((key) => ({ key, label: INFO_FLOWED_LABEL[key] })),
    levels: SUPPLIER_LEVELS.map((key) => ({ key, label: SUPPLIER_LEVEL_LABEL[key] })),
    statuses: SUPPLIER_STATUSES.map((key) => ({ key, label: SUPPLIER_STATUS_LABEL[key] })),
    quotes: SUPPLIER_QUOTES,
    verification: SUPPLIER_RULE_VERIFICATION,
  }),
);
routes.get("/suppliers/export.csv", async (c) => {
  const { ctx, tenant } = c.var;
  const csv = suppliersCsv(
    await listSuppliers(ctx, tenant.orgId),
    ctx.now().toISOString().slice(0, 10),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="suppliers-cmmc-flowdown.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
// Import an approved-supplier list (CSV, or an .xlsx sheet sent as CSV by the browser): `apply: false`
// previews (any editor, any plan), `apply: true` creates and updates suppliers under the same plan
// gate as the form. `infoDefault` is what rows that do not say what the order sends are taken to send
// (null leaves them out); `dateOrder` reads numeric dates like 03/04/2026.
routes.post(
  "/suppliers/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      csv: z.string().min(1).max(IMPORT_MAX_BYTES),
      apply: z.boolean().default(false),
      infoDefault: z.enum(INFO_FLOWED).nullable().default(null),
      dateOrder: z.enum(["mdy", "dmy"]).optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const { csv, apply, infoDefault, dateOrder } = c.req.valid("json");
    const opts = { infoDefault, dateOrder };
    if (!apply) return c.json(await previewSupplierImport(c.var.ctx, t.orgId, csv, opts));
    return c.json(await applySupplierImport(c.var.ctx, t.orgId, t.userId, csv, opts));
  },
);
routes.post("/suppliers", requireRole("editor"), validate("json", supplierBody), async (c) => {
  const t = c.var.tenant;
  return c.json(await createSupplier(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/suppliers/:id",
  requireRole("editor"),
  validate("json", supplierBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await updateSupplier(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.delete("/suppliers/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteSupplier(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- Cyber incidents (IR.L2-3.6.1, 3.6.2; DFARS 252.204-7012 (c) to (m)) ----
// On every plan (services/incidents says why). Every member reads; editors record; only admins delete,
// since a deleted incident is evidence gone. Times are instants (ISO 8601 UTC); the browser converts.
const instant = z
  .string()
  .max(40)
  .refine(isInstant, "Use an ISO 8601 time in UTC, e.g. 2026-11-28T14:05:00.000Z");
const incidentBody = z.object({
  title: z.string().trim().min(1).max(200),
  clause: z.enum(CLAUSE_ANSWERS).optional(),
  affects: z.enum(AFFECTS).optional(),
  role: z.enum(ROLES).optional(),
  higherTier: text(200).optional(),
  contractRef: text(200).optional(),
  discoveredAt: instant,
  reportedAt: instant.nullable().optional(),
  reportNumber: text(100).optional(),
  higherTierNotifiedAt: instant.nullable().optional(),
  malware: z.enum(TRI).optional(),
  cloud: z.enum(TRI).optional(),
  systems: text(4000).optional(),
  summary: text(8000).optional(),
  steps: z.record(z.string().max(40), z.boolean()).optional(),
  timeline: z
    .array(z.object({ at: instant, text: z.string().trim().min(1).max(1000) }))
    .max(MAX_TIMELINE_ENTRIES)
    .optional(),
  closedOn: isoDay,
  lessons: text(8000).optional(),
});

routes.get("/incidents", async (c) =>
  c.json({
    ...(await incidentList(c.var.ctx, c.var.tenant.orgId)),
    clauseOptions: CLAUSE_ANSWERS.map((key) => ({ key, label: CLAUSE_LABEL[key] })),
    affectsOptions: AFFECTS.map((key) => ({ key, label: AFFECTS_LABEL[key] })),
    roleOptions: ROLES.map((key) => ({ key, label: ROLE_LABEL[key] })),
    triOptions: TRI.map((key) => ({ key, label: TRI_LABEL[key] })),
    stageLabels: INCIDENT_STAGE_LABEL,
    steps: INCIDENT_STEPS.map(({ when: _w, ...s }) => s),
    reportHours: REPORT_HOURS,
    preserveDays: PRESERVE_DAYS,
    quotes: INCIDENT_QUOTES,
    verification: INCIDENT_RULE_VERIFICATION,
  }),
);
routes.get("/incidents/export.csv", async (c) => {
  const { ctx, tenant } = c.var;
  const csv = incidentsCsv(await listIncidents(ctx, tenant.orgId), ctx.now());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cyber-incident-register.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.get("/incidents/:id/record.md", async (c) => {
  const { ctx, tenant } = c.var;
  const [row, { org }] = await Promise.all([
    getIncident(ctx, tenant.orgId, c.req.param("id")),
    getOrg(ctx, tenant.orgId),
  ]);
  const md = incidentRecordMarkdown(row, { orgName: org.name, now: ctx.now() });
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cyber-incident-record.md"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.post("/incidents", requireRole("editor"), validate("json", incidentBody), async (c) => {
  const t = c.var.tenant;
  const row = await createIncident(c.var.ctx, t.orgId, t.userId, c.req.valid("json"));
  return c.json(describeIncident(row, c.var.ctx.now()), 201);
});
routes.patch(
  "/incidents/:id",
  requireRole("editor"),
  validate("json", incidentBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    const row = await updateIncident(
      c.var.ctx,
      t.orgId,
      t.userId,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return c.json(describeIncident(row, c.var.ctx.now()));
  },
);
routes.delete("/incidents/:id", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  await deleteIncident(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- Personnel and training records (AT.L2-3.2.1 to 3.2.3, PS.L2-3.9.1 and 3.9.2) ----
// Same gates as the asset inventory: every member reads on every plan, recording needs the Level 2
// plan, deleting works on any plan. The refresher interval is an admin setting.
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, "Not a calendar date: use YYYY-MM-DD")
  .nullable()
  .optional();
const personBody = z.object({
  name: z.string().trim().min(1).max(200),
  jobTitle: text(200).optional(),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]).optional(),
  cuiAccess: z.boolean().optional(),
  securityDuties: z.boolean().optional(),
  dutiesDescription: text(1000).optional(),
  screenedOn: day,
  screeningMethod: text(500).optional(),
  accessGrantedOn: day,
  awarenessOn: day,
  roleBasedOn: day,
  insiderThreatOn: day,
  leftOn: day,
  departureKind: z.enum(DEPARTURE_KINDS).nullable().optional(),
  accessRemovedOn: day,
  notes: text(2000).optional(),
});

routes.get("/people", async (c) =>
  c.json({
    ...(await personnelRecords(c.var.ctx, c.var.tenant.orgId)),
    trainings: TRAININGS.map((key) => ({ key, ...TRAINING_INFO[key] })),
    departureKinds: DEPARTURE_KINDS.map((key) => ({ key, label: DEPARTURE_LABEL[key] })),
    refreshChoices: REFRESH_MONTH_CHOICES,
    refreshNote: REFRESH_NOTE,
  }),
);
routes.get("/people/export.csv", async (c) => {
  const { ctx, tenant } = c.var;
  const [rows, months] = await Promise.all([
    listPeople(ctx, tenant.orgId),
    refreshMonths(ctx, tenant.orgId),
  ]);
  const csv = personnelCsv(rows, ctx.now().toISOString().slice(0, 10), months);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="personnel-training.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.post("/people", requireRole("editor"), validate("json", personBody), async (c) => {
  const t = c.var.tenant;
  await assertLevel2Plan(c.var.ctx, t.orgId, "Recording personnel and training");
  return c.json(await createPerson(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
// Import a roster or a training provider's completion export (CSV, or an .xlsx sheet sent as CSV by
// the browser): `apply: false` previews (any editor, any plan), `apply: true` creates and updates people
// (the Level 2 plan, as recording one by hand). `courseMap` says which training each course counts for.
routes.post(
  "/people/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      csv: z.string().min(1).max(IMPORT_MAX_BYTES),
      apply: z.boolean().default(false),
      dateOrder: z.enum(["mdy", "dmy"]).optional(),
      courseMap: z
        .record(z.string().max(300), z.array(z.enum(TRAININGS)).max(3))
        .refine((m) => Object.keys(m).length <= 200, { message: "At most 200 courses." })
        .optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const { apply, ...input } = c.req.valid("json");
    if (!apply) return c.json(await previewPersonnelImport(c.var.ctx, t.orgId, input));
    await assertLevel2Plan(c.var.ctx, t.orgId, "Recording personnel and training");
    return c.json(await applyPersonnelImport(c.var.ctx, t.orgId, t.userId, input));
  },
);
routes.put(
  "/people/settings",
  requireRole("admin"),
  validate(
    "json",
    z.object({
      refreshMonths: z
        .number()
        .int()
        .refine((n) => (REFRESH_MONTH_CHOICES as readonly number[]).includes(n), {
          message: `Choose ${REFRESH_MONTH_CHOICES.join(", ")} months.`,
        }),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    await assertLevel2Plan(c.var.ctx, t.orgId, "Setting the training interval");
    await setRefreshMonths(c.var.ctx, t.orgId, t.userId, c.req.valid("json").refreshMonths);
    return c.json(await personnelRecords(c.var.ctx, t.orgId));
  },
);
routes.patch(
  "/people/:id",
  requireRole("editor"),
  validate("json", personBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    await assertLevel2Plan(c.var.ctx, t.orgId, "Recording personnel and training");
    return c.json(
      await updatePerson(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.delete("/people/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deletePerson(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- Written security policies, one per NIST SP 800-171 family ----
// Every member reads them and downloads them on every plan; writing and approving need the Level 2
// plan (as the other Level 2 records do); approving, reviewing and deleting are for admins.
const markdownFile = (md: string, name: string) =>
  new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });

routes.get("/policies", async (c) => c.json(await listPolicies(c.var.ctx, c.var.tenant.orgId)));
routes.get("/policies/export.md", async (c) => {
  const { orgName, generatedOn, docs } = await allPolicyDocuments(c.var.ctx, c.var.tenant.orgId);
  return markdownFile(renderPolicyManual(orgName, generatedOn, docs), "security-policies.md");
});
routes.get("/policies/:family", async (c) =>
  c.json(await getPolicy(c.var.ctx, c.var.tenant.orgId, requireFamily(c.req.param("family")))),
);
routes.get(
  "/policies/:family/download",
  validate("query", z.object({ version: z.coerce.number().int().min(1).max(10_000).optional() })),
  async (c) => {
    const family = requireFamily(c.req.param("family"));
    const { version } = c.req.valid("query");
    const doc = await policyDocument(c.var.ctx, c.var.tenant.orgId, family, version);
    const name = `policy-${family.toLowerCase()}-v${doc.version}${doc.status === "draft" ? "-draft" : ""}.md`;
    return markdownFile(renderPolicyDocument(doc), name);
  },
);
routes.put(
  "/policies/:family",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      title: text(POLICY_TITLE_MAX).optional(),
      body: text(POLICY_BODY_MAX).optional(),
      ownerUserId: z.string().max(64).nullable().optional(),
      reviewMonths: z
        .number()
        .int()
        .refine((n) => (REVIEW_MONTHS as readonly number[]).includes(n), "Pick 6, 12, 24 or 36")
        .optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const family = requireFamily(c.req.param("family"));
    await assertLevel2Plan(c.var.ctx, t.orgId, "Writing security policies");
    return c.json(await savePolicy(c.var.ctx, t.orgId, t.userId, family, c.req.valid("json")));
  },
);
routes.post("/policies/:family/approve", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  const family = requireFamily(c.req.param("family"));
  await assertLevel2Plan(c.var.ctx, t.orgId, "Approving security policies");
  return c.json(await approvePolicy(c.var.ctx, t.orgId, t.userId, family));
});
routes.post("/policies/:family/review", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  const family = requireFamily(c.req.param("family"));
  await assertLevel2Plan(c.var.ctx, t.orgId, "Recording policy reviews");
  return c.json(await reviewPolicy(c.var.ctx, t.orgId, t.userId, family));
});
// "Draft with AI" for one requirement's procedure: stored beside the policy as a draft, counted
// against the plan's AI drafts, and put in the policy text only by a person saving it.
routes.post("/policies/:family/procedures/:controlId/draft", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  const family = requireFamily(c.req.param("family"));
  const controlId = c.req.param("controlId");
  requireFamilyControl(family, controlId);
  await assertLevel2Plan(c.var.ctx, t.orgId, "Writing security policies");
  await assertCanDraft(c.var.ctx, t.orgId, controlId);
  return c.json(await draftProcedure(c.var.ctx, t.orgId, t.userId, family, controlId));
});
routes.delete("/policies/:family/procedures/:controlId/draft", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  const family = requireFamily(c.req.param("family"));
  await discardProcedureDraft(c.var.ctx, t.orgId, family, c.req.param("controlId"));
  return c.json({ ok: true });
});
// Deleting is allowed on every plan, so a shop that downgrades can still clean up.
routes.delete("/policies/:family", requireRole("admin"), async (c) => {
  const t = c.var.tenant;
  await deletePolicy(c.var.ctx, t.orgId, t.userId, requireFamily(c.req.param("family")));
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
// The due dates (and approved policies' review dates, training refresher dates, suppliers' current-through dates, controlled documents' review dates, planned audits and corrective-action dates, gauges' calibration due dates, the next management review and its open actions) as an iCalendar file with alarms 60 and 7 days ahead: reminders without the app
// sending email. Every member may download it, like the list it is built from.
routes.get("/affirmations/calendar.ics", async (c) => {
  const t = c.var.tenant;
  const [
    { org },
    data,
    policyReviews,
    trainingDue,
    supplierDue,
    documentReviews,
    qualityDue,
    incidentHolds,
    calibrationDue,
    reviewDue,
  ] = await Promise.all([
    getOrg(c.var.ctx, t.orgId),
    listAffirmations(c.var.ctx, t.orgId),
    policyReviewDates(c.var.ctx, t.orgId),
    trainingDueDatesFor(c.var.ctx, t.orgId),
    supplierDueDatesFor(c.var.ctx, t.orgId),
    documentReviewDatesFor(c.var.ctx, t.orgId),
    qualityDueDatesFor(c.var.ctx, t.orgId),
    incidentHoldDatesFor(c.var.ctx, t.orgId),
    calibrationDueDatesFor(c.var.ctx, t.orgId),
    reviewDueDatesFor(c.var.ctx, t.orgId),
  ]);
  const ics = renderAffirmationCalendar({
    orgId: t.orgId,
    orgName: org.name,
    schedules: data.schedules,
    policyReviews,
    trainingDue,
    supplierDue,
    documentReviews,
    qualityDue,
    incidentHolds,
    calibrationDue,
    reviewDue,
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

// ---- ISO 9001 document control (clause 7.5): the master list and each document's history ----
// Every member reads on every plan, like the checklist; recording needs the quality plan
// (services/documents). Released documents are withdrawn, never deleted.
const docDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isCalendarDate, "Not a calendar date: use YYYY-MM-DD");
const documentBody = z.object({
  docNumber: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(DOC_KINDS),
  origin: z.enum(DOC_ORIGINS).optional(),
  revision: z.string().trim().max(12).optional(),
  issuer: text(200).optional(),
  location: text(500).optional(),
  ownerUserId: z.string().max(64).nullable().optional(),
  reviewMonths: z.number().int().nullable().optional(),
  notes: text(4000).optional(),
});

routes.get("/documents", async (c) =>
  c.json({
    ...(await documentList(c.var.ctx, c.var.tenant.orgId)),
    kinds: DOC_KINDS.map((key) => ({ key, label: DOC_KIND_LABEL[key] })),
    origins: DOC_ORIGINS.map((key) => ({ key, label: DOC_ORIGIN_LABEL[key] })),
    statuses: DOC_STATUSES.map((key) => ({ key, label: DOC_STATUS_LABEL[key] })),
    reviewMonths: DOC_REVIEW_MONTHS,
  }),
);
routes.get("/documents/export.csv", async (c) => {
  const { ctx, tenant } = c.var;
  const [docs, members] = await Promise.all([
    listDocuments(ctx, tenant.orgId),
    listMembers(ctx, tenant.orgId),
  ]);
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const files = await controlledCopyFiles(ctx, tenant.orgId, docs);
  const csv = masterListCsv(
    docs,
    (id) => (id ? (names.get(id) ?? "") : ""),
    ctx.now().toISOString().slice(0, 10),
    (id) => files.get(id) ?? null,
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="document-master-list.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
// Import an existing master list (CSV, or an .xlsx sheet sent as CSV by the browser): `apply: false`
// previews (any editor, any plan), `apply: true` adds the documents not already listed, on the
// quality plan as the form. `dateOrder` reads numeric dates like 03/04/2026.
routes.post(
  "/documents/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      csv: z.string().min(1).max(IMPORT_MAX_BYTES),
      apply: z.boolean().default(false),
      dateOrder: z.enum(["mdy", "dmy"]).optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    const { csv, apply, dateOrder } = c.req.valid("json");
    if (!apply) return c.json(await previewDocumentImport(c.var.ctx, t.orgId, csv, dateOrder));
    return c.json(await applyDocumentImport(c.var.ctx, t.orgId, t.userId, csv, dateOrder));
  },
);
routes.get("/documents/:id/history", async (c) =>
  c.json({
    items: await documentHistory(c.var.ctx, c.var.tenant.orgId, c.req.param("id")),
  }),
);
routes.post("/documents", requireRole("editor"), validate("json", documentBody), async (c) => {
  const t = c.var.tenant;
  return c.json(await createDocument(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/documents/:id",
  requireRole("editor"),
  validate("json", documentBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await updateDocument(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post(
  "/documents/:id/release",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      approvedBy: z.string().max(64).optional(),
      approvedOn: docDay,
      effectiveOn: docDay.nullable().optional(),
      changeSummary: text(2000).optional(),
      evidenceId: z.string().max(64).nullable().optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await releaseDocument(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post(
  "/documents/:id/revise",
  requireRole("editor"),
  validate("json", z.object({ revision: z.string().trim().max(12).optional() })),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await reviseDocument(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post(
  "/documents/:id/review",
  requireRole("editor"),
  validate("json", z.object({ reviewedOn: docDay, notes: text(2000).optional() })),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await reviewDocument(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post(
  "/documents/:id/obsolete",
  requireRole("editor"),
  validate("json", z.object({ on: docDay, reason: text(2000) })),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await obsoleteDocument(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
// The evidence file that is the controlled copy of the revision in force (null unlinks).
routes.put(
  "/documents/:id/file",
  requireRole("editor"),
  validate("json", z.object({ evidenceId: z.string().max(64).nullable() })),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await setDocumentFile(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("id"),
        c.req.valid("json").evidenceId,
      ),
    );
  },
);
routes.delete("/documents/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteDocument(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- ISO 9001 internal audits (9.2) and corrective actions (10.2) ----
// Every member reads on every plan; recording needs the quality plan (services/internal-audits).
// Audits whose findings opened actions, and closed actions, are kept, never deleted.
const clauseIdField = z.string().max(40);
const auditBody = z.object({
  title: z.string().trim().min(1).max(200),
  clauseIds: z.array(clauseIdField).max(60).optional(),
  process: text(200).optional(),
  plannedOn: date,
  auditorUserId: z.string().max(64).nullable().optional(),
  auditorName: text(200).optional(),
});
const caBody = z.object({
  source: z.enum(CA_SOURCES),
  clauseId: clauseIdField.nullable().optional(),
  nonconformity: z.string().trim().min(1).max(4000),
  containment: text(4000).optional(),
  rootCause: text(4000).optional(),
  action: text(4000).optional(),
  ownerUserId: z.string().max(64).nullable().optional(),
  raisedOn: date,
  dueOn: date.nullable().optional(),
  completedOn: date.nullable().optional(),
  verifyDueOn: date.nullable().optional(),
});
const tid = (c: { var: AppEnv["Variables"] }) => c.var.tenant;

routes.get("/audits", async (c) =>
  c.json({
    ...(await auditProgramme(c.var.ctx, c.var.tenant.orgId)),
    statuses: AUDIT_STATUSES.map((key) => ({ key, label: AUDIT_STATUS_LABEL[key] })),
    findingKinds: FINDING_KINDS.map((key) => ({ key, label: FINDING_KIND_LABEL[key] })),
    sources: CA_SOURCES.map((key) => ({ key, label: CA_SOURCE_LABEL[key] })),
    stages: CA_STAGES.map((key) => ({ key, label: CA_STAGE_LABEL[key] })),
    coverageMonths: AUDIT_COVERAGE_MONTHS,
  }),
);
routes.post("/audits", requireRole("editor"), validate("json", auditBody), async (c) => {
  const t = tid(c);
  return c.json(await createAudit(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/audits/:id",
  requireRole("editor"),
  validate("json", auditBody.partial().extend({ summary: text(4000).optional() })),
  async (c) => {
    const t = tid(c);
    return c.json(
      await updateAudit(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post(
  "/audits/:id/complete",
  requireRole("editor"),
  validate("json", z.object({ completedOn: date, summary: text(4000).optional() })),
  async (c) => {
    const t = tid(c);
    return c.json(
      await completeAudit(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post("/audits/:id/cancel", requireRole("editor"), async (c) => {
  const t = tid(c);
  return c.json(await cancelAudit(c.var.ctx, t.orgId, t.userId, c.req.param("id")));
});
routes.delete("/audits/:id", requireRole("editor"), async (c) => {
  const t = tid(c);
  await deleteAudit(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});
routes.post(
  "/audits/:id/findings",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      kind: z.enum(FINDING_KINDS),
      clauseId: clauseIdField.nullable().optional(),
      description: z.string().trim().min(1).max(4000),
      evidence: text(4000).optional(),
    }),
  ),
  async (c) => {
    const t = tid(c);
    return c.json(
      await addFinding(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
      201,
    );
  },
);
routes.delete("/audits/:id/findings/:findingId", requireRole("editor"), async (c) => {
  const t = tid(c);
  await deleteFinding(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.param("findingId"));
  return c.json({ ok: true });
});
routes.post(
  "/audits/:id/findings/:findingId/corrective-action",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      ownerUserId: z.string().max(64).nullable().optional(),
      dueOn: date.nullable().optional(),
      containment: text(4000).optional(),
    }),
  ),
  async (c) => {
    const t = tid(c);
    return c.json(
      await openFromFinding(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("id"),
        c.req.param("findingId"),
        c.req.valid("json"),
      ),
      201,
    );
  },
);
routes.get("/audits/:id/report.md", async (c) => {
  const { ctx, tenant } = c.var;
  const [{ org }, members] = await Promise.all([
    getOrg(ctx, tenant.orgId),
    listMembers(ctx, tenant.orgId),
  ]);
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const report = await auditReport(
    ctx,
    tenant.orgId,
    org.name,
    c.req.param("id"),
    (id) => (id ? (names.get(id) ?? "") : ""),
    SCOPE_DISCLAIMER,
  );
  const slug =
    report.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "audit";
  return new Response(report.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="internal-audit-${slug}.md"`,
      "Cache-Control": "private, no-store",
    },
  });
});
routes.get("/corrective-actions/export.csv", async (c) => {
  const { ctx, tenant } = c.var;
  const [actions, members] = await Promise.all([
    listCorrectiveActions(ctx, tenant.orgId),
    listMembers(ctx, tenant.orgId),
  ]);
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const csv = correctiveActionLogCsv(
    actions,
    (id) => (id ? (names.get(id) ?? "") : ""),
    clauseNumber,
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="corrective-action-log.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.post("/corrective-actions", requireRole("editor"), validate("json", caBody), async (c) => {
  const t = tid(c);
  return c.json(
    await createCorrectiveAction(c.var.ctx, t.orgId, t.userId, c.req.valid("json")),
    201,
  );
});
routes.patch(
  "/corrective-actions/:id",
  requireRole("editor"),
  validate("json", caBody.partial()),
  async (c) => {
    const t = tid(c);
    return c.json(
      await updateCorrectiveAction(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("id"),
        c.req.valid("json"),
      ),
    );
  },
);
routes.post(
  "/corrective-actions/:id/verify",
  requireRole("editor"),
  validate(
    "json",
    z.object({ checkedOn: date, effective: z.boolean(), notes: z.string().max(4000) }),
  ),
  async (c) => {
    const t = tid(c);
    return c.json(
      await verifyCorrectiveAction(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("id"),
        c.req.valid("json"),
      ),
    );
  },
);
routes.delete("/corrective-actions/:id", requireRole("editor"), async (c) => {
  const t = tid(c);
  await deleteCorrectiveAction(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});

// ---- ISO 9001 gauge and instrument calibration (7.1.5) ----
// Every member reads on every plan; recording needs the quality plan (services/calibration).
// Calibrations are kept as recorded; a gauge with any is retired, never deleted.
const gaugeBody = z.object({
  tag: z.string().trim().min(1).max(GAUGE_TAG_MAX),
  description: z.string().trim().min(1).max(GAUGE_TEXT_MAX),
  kind: z.enum(GAUGE_KINDS),
  manufacturer: text(GAUGE_TEXT_MAX).optional(),
  serial: text(GAUGE_TEXT_MAX).optional(),
  range: text(GAUGE_TEXT_MAX).optional(),
  location: text(GAUGE_TEXT_MAX).optional(),
  owner: z.enum(GAUGE_OWNERS).optional(),
  assignedTo: text(GAUGE_TEXT_MAX).optional(),
  status: z.enum(GAUGE_STATUSES).optional(),
  intervalMonths: z
    .number()
    .int()
    .min(CAL_INTERVAL_MIN)
    .max(CAL_INTERVAL_MAX)
    .nullable()
    .optional(),
  method: text(GAUGE_TEXT_MAX).optional(),
  notes: text(CAL_TEXT_MAX).optional(),
});
const calibrationBody = z.object({
  calibratedOn: date,
  performer: z.enum(CAL_PERFORMERS),
  performedBy: z.string().trim().min(1).max(GAUGE_TEXT_MAX),
  asFound: z.enum(AS_FOUND),
  asLeft: z.enum(AS_LEFT),
  readings: text(CAL_TEXT_MAX).optional(),
  certificateNo: text(GAUGE_TEXT_MAX).optional(),
  traceability: text(GAUGE_TEXT_MAX).optional(),
  evidenceId: z.string().max(64).nullable().optional(),
  impact: text(CAL_TEXT_MAX).optional(),
  correctiveActionRef: text(40).optional(),
});
const labelled = <K extends string>(keys: readonly K[], labels: Record<K, string>) =>
  keys.map((key) => ({ key, label: labels[key] }));

routes.get("/gauges", async (c) =>
  c.json({
    ...(await gaugeList(c.var.ctx, c.var.tenant.orgId)),
    kinds: labelled(GAUGE_KINDS, GAUGE_KIND_LABEL),
    statuses: labelled(GAUGE_STATUSES, GAUGE_STATUS_LABEL),
    owners: labelled(GAUGE_OWNERS, GAUGE_OWNER_LABEL),
    performers: labelled(CAL_PERFORMERS, CAL_PERFORMER_LABEL),
    asFound: labelled(AS_FOUND, AS_FOUND_LABEL),
    asLeft: labelled(AS_LEFT, AS_LEFT_LABEL),
    intervals: CAL_INTERVAL_CHOICES,
    dueSoonDays: CAL_DUE_SOON_DAYS,
  }),
);
routes.get("/gauges/export.csv", async (c) => {
  const csv = await gaugeCsv(c.var.ctx, c.var.tenant.orgId);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gauge-list.csv"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.get("/gauges/:id/calibrations", async (c) =>
  c.json({ items: await gaugeHistory(c.var.ctx, c.var.tenant.orgId, c.req.param("id")) }),
);
routes.post("/gauges", requireRole("editor"), validate("json", gaugeBody), async (c) => {
  const t = c.var.tenant;
  return c.json(await createGauge(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/gauges/:id",
  requireRole("editor"),
  validate("json", gaugeBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await updateGauge(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.delete("/gauges/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteGauge(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
  return c.json({ ok: true });
});
routes.post(
  "/gauges/:id/calibrations",
  requireRole("editor"),
  validate("json", calibrationBody),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await recordCalibration(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
      201,
    );
  },
);
routes.put(
  "/gauges/:id/calibrations/:calId/impact",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      impact: z.string().trim().min(1).max(CAL_TEXT_MAX),
      correctiveActionRef: text(40).optional(),
    }),
  ),
  async (c) => {
    const t = c.var.tenant;
    return c.json({
      items: await recordImpact(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("id"),
        c.req.param("calId"),
        c.req.valid("json"),
      ),
    });
  },
);

// ---- management review (ISO 9001 9.3) ----
// A draft is edited freely; finalising checks the minutes are complete and freezes them, after which
// only an action's done date changes. Only drafts can be deleted.
const reviewText = (keys: readonly string[]) =>
  z
    .record(z.string(), text(REVIEW_TEXT_MAX))
    .refine((o) => Object.keys(o).every((k) => keys.includes(k)), "Unknown heading");
const reviewAction = z.object({
  id: z.string().max(64).optional(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(REVIEW_SHORT_MAX * 2),
  owner: text(REVIEW_SHORT_MAX),
  dueOn: date.nullable(),
  doneOn: date.nullable(),
});
const reviewBody = z.object({
  heldOn: date,
  periodFrom: date.optional(),
  periodTo: date.optional(),
  attendees: text(REVIEW_TEXT_MAX).optional(),
  inputs: reviewText(REVIEW_INPUT_KEYS).optional(),
  outputs: reviewText(REVIEW_OUTPUT_KEYS).optional(),
  actions: z.array(reviewAction).max(MAX_REVIEW_ACTIONS).optional(),
  nextReviewOn: date.nullable().optional(),
});

routes.get("/reviews", async (c) =>
  c.json({
    ...(await reviewList(c.var.ctx, c.var.tenant.orgId)),
    inputs: REVIEW_INPUTS,
    outputs: REVIEW_OUTPUTS,
  }),
);
// The dashboard card: next review due and overdue or due-soon actions, without the draft figures.
routes.get("/reviews/summary", async (c) =>
  c.json(await reviewSummary(c.var.ctx, c.var.tenant.orgId)),
);
routes.get("/reviews/:id/minutes.md", async (c) => {
  const md = await reviewMinutes(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="management-review-minutes.md"',
      "Cache-Control": "private, no-store",
    },
  });
});
routes.post("/reviews", requireRole("editor"), validate("json", reviewBody), async (c) => {
  const t = c.var.tenant;
  return c.json(await createReview(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
});
routes.patch(
  "/reviews/:id",
  requireRole("editor"),
  validate("json", reviewBody.partial()),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await updateReview(c.var.ctx, t.orgId, t.userId, c.req.param("id"), c.req.valid("json")),
    );
  },
);
routes.post("/reviews/:id/finalise", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  return c.json(await finaliseReview(c.var.ctx, t.orgId, t.userId, c.req.param("id")));
});
routes.put(
  "/reviews/:id/actions/:actionId/done",
  requireRole("editor"),
  validate("json", z.object({ doneOn: date.nullable() })),
  async (c) => {
    const t = c.var.tenant;
    return c.json(
      await setActionDone(
        c.var.ctx,
        t.orgId,
        t.userId,
        c.req.param("id"),
        c.req.param("actionId"),
        c.req.valid("json").doneOn,
      ),
    );
  },
);
routes.delete("/reviews/:id", requireRole("editor"), async (c) => {
  const t = c.var.tenant;
  await deleteReview(c.var.ctx, t.orgId, t.userId, c.req.param("id"));
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
