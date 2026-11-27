// CMMC workspace tables. Every row is tenant-scoped by org_id with ON DELETE CASCADE from organization.
// The control library itself is static data (src/shared/controls); these tables hold each org's answers.

import type { AffirmationKind, CmmcStatus, Deadline } from "@shared/affirmation";
import type { AssetCategory, SpecializedType } from "@shared/assets";
import type { FamilyCode, ImplementationStatus, PartialCreditKey } from "@shared/controls";
import type { DocEventKind, DocKind, DocOrigin, DocStatus } from "@shared/document-control";
import type { ObjectiveResult, PoamStatus } from "@shared/enums";
import type { AuditStatus, CaSource, FindingKind } from "@shared/internal-audits";
import type { DepartureKind } from "@shared/personnel";
import type { QualityStatus } from "@shared/quality";
import type { PolicyStatus } from "@shared/security-policies";
import type { ControlShare, EspData } from "@shared/service-providers";
import type { InfoFlowed, SupplierLevel, SupplierStatus } from "@shared/suppliers";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

const orgRef = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/** System description used by the SSP and as the only factual input to AI drafting. */
export const orgProfile = sqliteTable("org_profile", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  targetLevel: integer("target_level").notNull().default(2),
  legalName: text("legal_name").notNull().default(""),
  cageCode: text("cage_code").notNull().default(""),
  systemName: text("system_name").notNull().default(""),
  systemDescription: text("system_description").notNull().default(""),
  boundaryDescription: text("boundary_description").notNull().default(""),
  environmentDescription: text("environment_description").notNull().default(""),
  connectionsDescription: text("connections_description").notNull().default(""),
  sspUpdateFrequency: text("ssp_update_frequency").notNull().default(""),
  affirmingOfficial: text("affirming_official").notNull().default(""),
  /** The evidence file holding the network diagram of the assessment scope (Assets tab), or null. */
  networkDiagramEvidenceId: text("network_diagram_evidence_id"),
  /** Months between refresher trainings (People tab); the org's own choice, NIST sets none. */
  trainingRefreshMonths: integer("training_refresh_months").notNull().default(12),
  updatedAt: updatedAt(),
});

export const controlRecord = sqliteTable(
  "control_record",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    /** CMMC id from the library, e.g. "AC.L2-3.1.1" or "AC.L1-b.1.i". */
    controlId: text("control_id").notNull(),
    status: text("status").$type<ImplementationStatus>().notNull().default("not_assessed"),
    partialCredit: text("partial_credit").$type<PartialCreditKey>(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    /** The accepted implementation statement (human-reviewed). Only this goes in the SSP. */
    statement: text("statement").notNull().default(""),
    statementUpdatedBy: text("statement_updated_by"),
    statementUpdatedAt: ts("statement_updated_at"),
    /** Unreviewed AI draft. Never enters the SSP until a person accepts it. */
    draftStatement: text("draft_statement"),
    draftQuestions: json<string[]>("draft_questions"),
    draftGeneratedAt: ts("draft_generated_at"),
    objectiveResults: json<Record<string, ObjectiveResult>>("objective_results"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("control_record_org_control_uq").on(t.orgId, t.controlId)],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    controlId: text("control_id"),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Always `orgs/{orgId}/evidence/{id}`. */
    r2Key: text("r2_key").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("evidence_org_control_idx").on(t.orgId, t.controlId)],
);

export const poamItem = sqliteTable(
  "poam_item",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    controlId: text("control_id").notNull(),
    weakness: text("weakness").notNull(),
    remediation: text("remediation").notNull().default(""),
    milestones: text("milestones").notNull().default(""),
    responsible: text("responsible").notNull().default(""),
    /** YYYY-MM-DD */
    scheduledCompletion: text("scheduled_completion").notNull(),
    status: text("status").$type<PoamStatus>().notNull().default("open"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("poam_org_idx").on(t.orgId, t.status)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_idx").on(t.orgId, t.createdAt)],
);

/**
 * What the organization's affirming official entered in SPRS (32 CFR 170.22). A record of the
 * user's own submission, never a submission: the app sends nothing to SPRS.
 */
export const affirmation = sqliteTable(
  "affirmation",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    level: integer("level").$type<1 | 2>().notNull(),
    kind: text("kind").$type<AffirmationKind>().notNull(),
    cmmcStatus: text("cmmc_status").$type<CmmcStatus>().notNull(),
    /** YYYY-MM-DD */
    cmmcStatusDate: text("cmmc_status_date").notNull(),
    /** YYYY-MM-DD: the day the affirmation was entered in SPRS. */
    affirmedOn: text("affirmed_on").notNull(),
    officialName: text("official_name").notNull(),
    officialTitle: text("official_title").notNull(),
    officialContact: text("official_contact").notNull(),
    /** Level 2: the score entered in SPRS. */
    sprsScore: integer("sprs_score"),
    /** Level 2: the score this workspace computed when the record was made. */
    workspaceScore: integer("workspace_score"),
    notes: text("notes").notNull().default(""),
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("affirmation_org_idx").on(t.orgId, t.level, t.affirmedOn)],
);

/** The org's answer for one ISO 9001 clause (src/shared/quality). The clause list is static data. */
export const qualityClauseRecord = sqliteTable(
  "quality_clause_record",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    /** e.g. "iso9001-7.5.3" */
    clauseId: text("clause_id").notNull(),
    status: text("status").$type<QualityStatus>().notNull().default("not_assessed"),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("quality_clause_org_clause_uq").on(t.orgId, t.clauseId)],
);

/**
 * An evidence file (already uploaded, usually for a CMMC requirement) linked to an ISO clause, so one
 * training record or internal audit serves both without a second upload.
 */
export const qualityEvidenceLink = sqliteTable(
  "quality_evidence_link",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    clauseId: text("clause_id").notNull(),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    linkedBy: text("linked_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quality_link_org_clause_evidence_uq").on(t.orgId, t.clauseId, t.evidenceId)],
);

/**
 * A member's own email settings in one organization. No row means the defaults: the affirmation
 * reminder is on for admins and owners (it is about a legal deadline they are responsible for).
 */
export const memberNotifications = sqliteTable(
  "member_notifications",
  {
    orgId: orgRef(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    affirmationReminders: bool("affirmation_reminders").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

/**
 * One row per reminder sent (services/affirmations/reminders.ts): an organization's deadline, its
 * due date and the warning stage (60 or 7 days). Inserted before the email goes out, so two
 * overlapping cron runs never send the same reminder twice. A new affirmation moves the due date,
 * which makes a new key, so the next cycle is reminded again.
 */
export const affirmationReminderSent = sqliteTable(
  "affirmation_reminder_sent",
  {
    orgId: orgRef(),
    level: integer("level").$type<1 | 2>().notNull(),
    deadlineKey: text("deadline_key").$type<Deadline["key"]>().notNull(),
    /** YYYY-MM-DD */
    due: text("due").notNull(),
    /** 60 or 7: days of warning this reminder was for. */
    stage: integer("stage").notNull(),
    sentAt: ts("sent_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.level, t.deadlineKey, t.due, t.stage] })],
);

/**
 * An organization's subscribable calendar link (services/affirmations/calendar-feed.ts): at most one
 * per organization. Only the SHA-256 of the secret token is kept, so a database read cannot rebuild
 * the link; an admin sees it once when it is made, and resetting it replaces the hash, which stops
 * the old link. Deleting the row turns the link off.
 */
export const affirmationCalendarFeed = sqliteTable(
  "affirmation_calendar_feed",
  {
    orgId: orgRef().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** When a calendar last fetched it, at most hourly; null until the first fetch. */
    lastFetchedAt: ts("last_fetched_at"),
  },
  (t) => [uniqueIndex("affirmation_calendar_feed_token_hash").on(t.tokenHash)],
);

/**
 * The Level 2 asset inventory (32 CFR 170.19(c)): one row per asset with its scoping category.
 * Feeds the SSP's asset section and the CSV export; holds descriptions only, never CUI.
 */
export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    name: text("name").notNull(),
    category: text("category").$type<AssetCategory>().notNull(),
    specializedType: text("specialized_type").$type<SpecializedType>(),
    /** Free text: "Laptop", "CNC mill controller", "Microsoft 365 GCC High". */
    assetType: text("asset_type").notNull().default(""),
    location: text("location").notNull().default(""),
    /** External service provider, when someone else runs it. */
    provider: text("provider").notNull().default(""),
    owner: text("owner").notNull().default(""),
    /** How it is managed (CRMA, specialized) or why it is out of scope; printed in the SSP. */
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("asset_org_category_idx").on(t.orgId, t.category)],
);

/**
 * External service providers for a Level 2 assessment (32 CFR 170.19(c)(2)): what each holds (CUI,
 * Security Protection Data or neither), whether it is a cloud provider, where its service
 * description and customer responsibility matrix are kept, and which requirements that matrix says
 * it carries. Feeds the SSP; holds descriptions only, never CUI.
 */
export const serviceProvider = sqliteTable(
  "service_provider",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    name: text("name").notNull(),
    data: text("data").$type<EspData>().notNull(),
    isCsp: bool("is_csp").notNull().default(false),
    /** "Email and file storage", "Managed firewall and EDR monitoring". */
    services: text("services").notNull().default(""),
    /** FedRAMP Moderate authorization or equivalency evidence (a CSP holding CUI). */
    fedrampBasis: text("fedramp_basis").notNull().default(""),
    /** Where the service description is kept: a link, a file name, an evidence title. */
    serviceDescriptionRef: text("service_description_ref").notNull().default(""),
    /** Where the customer responsibility matrix is kept. */
    crmRef: text("crm_ref").notNull().default(""),
    /** The service description as an evidence file this org holds (cleared when the file is deleted). */
    serviceDescriptionEvidenceId: text("service_description_evidence_id"),
    /** The customer responsibility matrix as an evidence file this org holds. */
    crmEvidenceId: text("crm_evidence_id"),
    notes: text("notes").notNull().default(""),
    /** Level 2 requirements the CRM says the provider carries, alone or shared. */
    controls: json<ControlShare[]>("controls").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_provider_org_idx").on(t.orgId)],
);

/**
 * A subcontractor or supplier the org flows FCI or CUI down to (DFARS 252.204-7021(d)(4), (f)), with
 * the CMMC status the org checked before award. Business facts only; never CUI.
 */
export const supplier = sqliteTable(
  "supplier",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    name: text("name").notNull(),
    /** "Type II anodize", "5-axis machining of housings". */
    supplies: text("supplies").notNull().default(""),
    infoFlowed: text("info_flowed").$type<InfoFlowed>().notNull(),
    cots: bool("cots").notNull().default(false),
    requiredLevel: text("required_level").$type<SupplierLevel>(),
    status: text("status").$type<SupplierStatus>(),
    statusDate: text("status_date"),
    affirmedOn: text("affirmed_on"),
    cmmcUids: text("cmmc_uids").notNull().default(""),
    clauseFlowedDown: bool("clause_flowed_down").notNull().default(false),
    /** PO or subcontract number where the clause sits. */
    subcontractRef: text("subcontract_ref").notNull().default(""),
    checkedOn: text("checked_on"),
    awardedOn: text("awarded_on"),
    /** Where the SPRS screenshot or the supplier's statement is kept. */
    evidenceRef: text("evidence_ref").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("supplier_org_idx").on(t.orgId)],
);

/**
 * A written security policy, one per NIST SP 800-171 family (services/security-policies). `body` is
 * the current text; editing an approved policy starts the next version as a draft while the last
 * approved text (in security_policy_event) stays in force. `reviewDue` comes from the last approval
 * or "reviewed, no changes" plus `reviewMonths`, and is null until the first approval.
 */
export const securityPolicy = sqliteTable(
  "security_policy",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    family: text("family").$type<FamilyCode>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<PolicyStatus>().notNull().default("draft"),
    /** The version number of `body`: 1 until the first approval, then one more per revision. */
    version: integer("version").notNull().default(1),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    reviewMonths: integer("review_months").notNull().default(12),
    /** YYYY-MM-DD of the last approval (of any version), or null. */
    approvedOn: text("approved_on"),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    /** YYYY-MM-DD, or null until first approved. */
    reviewDue: text("review_due"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("security_policy_org_family_uq").on(t.orgId, t.family)],
);

/**
 * A policy's approvals and reviews, oldest first: the record an assessor asks for. An approval keeps
 * the exact text approved; a review ("reviewed, no changes") keeps none and moves the review date.
 */
export const securityPolicyEvent = sqliteTable(
  "security_policy_event",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    policyId: text("policy_id")
      .notNull()
      .references(() => securityPolicy.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"approved" | "reviewed">().notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    /** The approved text (approvals only). */
    body: text("body"),
    /** YYYY-MM-DD */
    day: text("day").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("security_policy_event_policy_idx").on(t.orgId, t.policyId, t.createdAt)],
);

/**
 * An AI-drafted procedure for one requirement of a family's policy, kept apart from the policy text
 * until a person puts it in the editor and saves. Never read by the SSP, the documents or the policy
 * template: only the policy page shows it, labelled as a draft. One per requirement; a new draft
 * replaces the old one.
 */
export const policyProcedureDraft = sqliteTable(
  "policy_procedure_draft",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    family: text("family").$type<FamilyCode>().notNull(),
    controlId: text("control_id").notNull(),
    text: text("text").notNull(),
    questions: json<string[]>("questions").notNull(),
    generatedBy: text("generated_by").references(() => user.id, { onDelete: "set null" }),
    generatedAt: ts("generated_at").notNull(),
  },
  (t) => [uniqueIndex("policy_procedure_draft_org_control_uq").on(t.orgId, t.controlId)],
);

/**
 * People who use the systems in scope, with their training and screening dates (AT.L2-3.2.1 to
 * 3.2.3, PS.L2-3.9.1 and 3.9.2). Dates are YYYY-MM-DD text. Holds names, roles and dates only:
 * never background-check results or other sensitive personnel details.
 */
export const person = sqliteTable(
  "person",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull().default(""),
    email: text("email").notNull().default(""),
    cuiAccess: bool("cui_access").notNull().default(true),
    securityDuties: bool("security_duties").notNull().default(false),
    dutiesDescription: text("duties_description").notNull().default(""),
    screenedOn: text("screened_on"),
    /** How they were screened ("reference and background check by ..."), never the result. */
    screeningMethod: text("screening_method").notNull().default(""),
    accessGrantedOn: text("access_granted_on"),
    awarenessOn: text("awareness_on"),
    roleBasedOn: text("role_based_on"),
    insiderThreatOn: text("insider_threat_on"),
    leftOn: text("left_on"),
    departureKind: text("departure_kind").$type<DepartureKind>(),
    accessRemovedOn: text("access_removed_on"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("person_org_name_idx").on(t.orgId, t.name)],
);

/**
 * A controlled document on the ISO 9001 master list (src/shared/document-control): a procedure, work
 * instruction, form or the customer drawing the shop works to. The file itself stays where the shop
 * keeps it (`location`); this row is its identity, revision and approval. `revision` is the working
 * revision (being drafted, or the one released); `releasedRevision` is the one in force, kept while
 * the next is drafted. Every release, review and withdrawal is written to controlled_document_event.
 */
export const controlledDocument = sqliteTable(
  "controlled_document",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    docNumber: text("doc_number").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<DocKind>().notNull(),
    origin: text("origin").$type<DocOrigin>().notNull().default("internal"),
    revision: text("revision").notNull().default(""),
    status: text("status").$type<DocStatus>().notNull().default("draft"),
    releasedRevision: text("released_revision"),
    issuer: text("issuer").notNull().default(""),
    location: text("location").notNull().default(""),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    /** YYYY-MM-DD of the release in force. */
    approvedOn: text("approved_on"),
    effectiveOn: text("effective_on"),
    /** null: no periodic review. */
    reviewMonths: integer("review_months"),
    reviewDue: text("review_due"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("controlled_document_org_number_uq").on(t.orgId, t.docNumber)],
);

/** The revision history of a controlled document: one row per release, review or withdrawal. */
export const controlledDocumentEvent = sqliteTable(
  "controlled_document_event",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    documentId: text("document_id")
      .notNull()
      .references(() => controlledDocument.id, { onDelete: "cascade" }),
    kind: text("kind").$type<DocEventKind>().notNull(),
    revision: text("revision").notNull(),
    /** What changed (a release), what was checked (a review) or why it was withdrawn. */
    summary: text("summary").notNull().default(""),
    /** The approver of a release; whoever recorded a review or withdrawal. */
    byUserId: text("by_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Display name at the time, so the history still reads after the person leaves. */
    byName: text("by_name").notNull().default(""),
    on: text("on").notNull(),
    effectiveOn: text("effective_on"),
    createdAt: createdAt(),
  },
  (t) => [index("controlled_document_event_doc_idx").on(t.orgId, t.documentId)],
);

/**
 * An internal audit on the ISO 9001 audit programme (clause 9.2; src/shared/internal-audits): its
 * scope by clause (`clauseIds`) or by process, the planned date and the auditor (a member, or an
 * outside auditor by name). Done audits keep their completion date and summary.
 */
export const internalAudit = sqliteTable(
  "internal_audit",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    title: text("title").notNull(),
    clauseIds: json<string[]>("clause_ids").notNull(),
    process: text("process").notNull().default(""),
    plannedOn: text("planned_on").notNull(),
    auditorUserId: text("auditor_user_id").references(() => user.id, { onDelete: "set null" }),
    /** An outside auditor's name, or the member's name when recorded, so the report still reads. */
    auditorName: text("auditor_name").notNull().default(""),
    status: text("status").$type<AuditStatus>().notNull().default("planned"),
    completedOn: text("completed_on"),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("internal_audit_org_idx").on(t.orgId, t.plannedOn)],
);

/** A finding an internal audit raised. A nonconformity is followed up by a corrective action. */
export const auditFinding = sqliteTable(
  "audit_finding",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    auditId: text("audit_id")
      .notNull()
      .references(() => internalAudit.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FindingKind>().notNull(),
    clauseId: text("clause_id"),
    /** The requirement not met, or the observation. */
    description: text("description").notNull(),
    /** What the auditor saw: the record, the part, the conversation. */
    evidence: text("evidence").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_finding_audit_idx").on(t.orgId, t.auditId)],
);

/**
 * One entry in the corrective-action log (clause 10.2): the nonconformity, the immediate correction,
 * the root cause, the action, and the check that it worked. Its stage is read from what is filled in
 * (caStage); `closedOn` is set only by an effectiveness check that found the action worked.
 */
export const correctiveAction = sqliteTable(
  "corrective_action",
  {
    id: text("id").primaryKey(),
    orgId: orgRef(),
    /** CA-0001, unique per org. */
    ref: text("ref").notNull(),
    source: text("source").$type<CaSource>().notNull(),
    findingId: text("finding_id").references(() => auditFinding.id, { onDelete: "set null" }),
    clauseId: text("clause_id"),
    nonconformity: text("nonconformity").notNull(),
    containment: text("containment").notNull().default(""),
    rootCause: text("root_cause").notNull().default(""),
    action: text("action").notNull().default(""),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    raisedOn: text("raised_on").notNull(),
    dueOn: text("due_on"),
    completedOn: text("completed_on"),
    verifyDueOn: text("verify_due_on"),
    verifiedOn: text("verified_on"),
    verifiedByName: text("verified_by_name").notNull().default(""),
    effective: bool("effective"),
    verificationNotes: text("verification_notes").notNull().default(""),
    closedOn: text("closed_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("corrective_action_org_ref_uq").on(t.orgId, t.ref)],
);
