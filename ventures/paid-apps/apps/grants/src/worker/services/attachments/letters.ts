// Letters of support: staff create a request for a partner, the system drafts the request email
// from partner facts (never inventing commitments), sends a single-purpose upload link, reminds the
// partner 7 and 2 days before the due date (followups rows, swept by the followups.run_due cron),
// and ingests the uploaded letter as a letter_of_support document linked to the request.
import {
  LETTER_MAX_BYTES,
  type PublicLetterInfoDto,
  type SupportLetterCreateInput,
  type SupportLetterDto,
  type SupportLetterPatchInput,
} from "@shared/api/attachments";
import { and, asc, eq, inArray, isNull, like, lte, ne, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  documents,
  facts,
  followups,
  opportunities,
  orgProfiles,
} from "../../db/schema";
import { supportLetterRequests } from "../../db/schema/attachments";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { createTemplateContext, renderContent } from "../email-templates/layout";
import { createDocument } from "../ingestion/documents";
import { notify } from "../notifications";
import { audit } from "../privacy/audit";
import { isEmail } from "../submission/channel";
import { linkLetterToChecklist } from "./checklist";
import {
  checkLetterDraft,
  draftFromOutput,
  LETTER_DRAFT_PURPOSE,
  LETTER_SYSTEM,
  type LetterContext,
  type LetterDraft,
  LetterDraftOutput,
  letterPrompt,
  letterReminderEmail,
  letterRequestEmail,
  type PartnerFact,
  templateDraft,
} from "./letter-text";
import { significantTokens } from "./match";
import {
  deriveLetterToken,
  hashLetterToken,
  LETTER_TOKEN_RE,
  LETTER_TOKEN_TTL_MS,
  letterUploadUrl,
  newNonce,
} from "./tokens";

export type SupportLetterRow = typeof supportLetterRequests.$inferSelect;

const DAY = 86_400_000;
export const REMINDER_DAYS = [7, 2] as const;
const reminderKey = (id: string, days: number) => `support_letter:${id}:${days}d`;

const byId = (orgId: string, applicationId: string, id: string) =>
  and(
    eq(supportLetterRequests.id, id),
    eq(supportLetterRequests.orgId, orgId),
    eq(supportLetterRequests.applicationId, applicationId),
  );

async function loadApp(ctx: AppContext, orgId: string, applicationId: string) {
  const row = await ctx.db
    .select({
      id: applications.id,
      title: applications.title,
      status: applications.status,
      deadline: applications.deadline,
      grantTitle: opportunities.title,
      funderName: opportunities.funderName,
      closeDate: opportunities.closeDate,
    })
    .from(applications)
    .innerJoin(
      opportunities,
      and(
        eq(opportunities.id, applications.opportunityId),
        or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
      ),
    )
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!row) throw notFound("Application");
  return row;
}

async function orgIdentity(ctx: AppContext, orgId: string) {
  const p = await ctx.db
    .select({
      legalName: orgProfiles.legalName,
      contactName: orgProfiles.contactName,
      contactEmail: orgProfiles.contactEmail,
    })
    .from(orgProfiles)
    .where(eq(orgProfiles.orgId, orgId))
    .get();
  return {
    orgName: p?.legalName || "Our organization",
    contactName: p?.contactName ?? null,
    contactEmail: isEmail(p?.contactEmail) ? p.contactEmail : null,
  };
}

/** Facts usable in a partner email: not rejected/superseded, never restricted. */
async function usableFacts(ctx: AppContext, orgId: string, ids?: string[]): Promise<PartnerFact[]> {
  const base = and(
    eq(facts.orgId, orgId),
    inArray(facts.status, ["confirmed", "proposed"]),
    ne(facts.sensitivity, "restricted"),
  );
  const rows = await ctx.db
    .select({ id: facts.id, statement: facts.statement, category: facts.category })
    .from(facts)
    .where(
      ids
        ? and(base, inArray(facts.id, ids.slice(0, 50)))
        : and(base, eq(facts.category, "partner")),
    )
    .limit(500)
    .all();
  return rows.map((r) => ({ id: r.id, statement: r.statement }));
}

/** Partner facts that name this partner (all significant words of the name appear in the fact). */
export function factsAboutPartner(partnerName: string, all: readonly PartnerFact[]): PartnerFact[] {
  const name = significantTokens(partnerName);
  if (name.length === 0) return [];
  return all
    .filter((f) => {
      const t = new Set(significantTokens(f.statement));
      return name.every((w) => t.has(w));
    })
    .slice(0, 8);
}

/** AI draft when it passes the deterministic no-invented-commitments check, else the template. */
export async function draftLetterRequest(
  ctx: AppContext,
  c: LetterContext,
  ids: { orgId: string; applicationId: string },
): Promise<LetterDraft & { source: "ai" | "template" }> {
  try {
    const { data } = await ctx.llm.generateStructured({
      purpose: LETTER_DRAFT_PURPOSE,
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      system: LETTER_SYSTEM,
      prompt: letterPrompt(c),
      schema: LetterDraftOutput,
      effort: "low",
      maxTokens: 1200,
    });
    const check = checkLetterDraft(data, c.facts, [
      c.orgName,
      c.partnerName,
      c.grantTitle,
      c.funderName,
    ]);
    if (check.ok) return { ...draftFromOutput(c, data), source: "ai" };
    ctx.logger.warn("support_letter.draft_rejected", {
      orgId: ids.orgId,
      problems: check.problems.length,
    });
  } catch (e) {
    ctx.logger.info("support_letter.draft_fallback", {
      orgId: ids.orgId,
      error: String(e).slice(0, 160),
    });
  }
  return { ...templateDraft(c), source: "template" };
}

function toDto(row: SupportLetterRow, factMap: Map<string, PartnerFact>): SupportLetterDto {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: row.id,
    applicationId: row.applicationId,
    partnerName: row.partnerName,
    partnerEmail: row.partnerEmail,
    status: row.status,
    dueAt: iso(row.dueAt),
    sentAt: iso(row.sentAt),
    receivedAt: iso(row.receivedAt),
    tokenExpiresAt: iso(row.tokenExpiresAt),
    receivedDocumentId: row.receivedDocumentId,
    emailSubject: row.emailSubject,
    emailIntro: row.emailIntro,
    outline: row.outline,
    draftSource: row.draftSource,
    facts: row.factIds.flatMap((id) => {
      const f = factMap.get(id);
      return f ? [f] : [];
    }),
    note: row.note,
    reminderCount: row.reminderCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function dtos(ctx: AppContext, orgId: string, rows: SupportLetterRow[]) {
  const ids = [...new Set(rows.flatMap((r) => r.factIds))];
  const fs = ids.length ? await usableFacts(ctx, orgId, ids) : [];
  const map = new Map(fs.map((f) => [f.id, f]));
  return rows.map((r) => toDto(r, map));
}

export async function listSupportLetters(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
): Promise<SupportLetterDto[]> {
  await loadApp(ctx, orgId, applicationId);
  const rows = await ctx.db
    .select()
    .from(supportLetterRequests)
    .where(
      and(
        eq(supportLetterRequests.orgId, orgId),
        eq(supportLetterRequests.applicationId, applicationId),
      ),
    )
    .orderBy(asc(supportLetterRequests.createdAt))
    .all();
  return dtos(ctx, orgId, rows);
}

function parseDue(v: string | null | undefined, now: Date): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T17:00:00.000Z` : v);
  if (Number.isNaN(d.getTime())) throw badRequest("Invalid due date");
  if (d.getTime() <= now.getTime()) throw badRequest("The due date must be in the future");
  return d;
}

export async function createSupportLetter(
  ctx: AppContext,
  input: {
    orgId: string;
    applicationId: string;
    userId: string;
    data: SupportLetterCreateInput;
    requestId?: string;
  },
): Promise<SupportLetterDto> {
  const { orgId, applicationId, data } = input;
  const app = await loadApp(ctx, orgId, applicationId);
  const now = ctx.now();
  if (!isEmail(data.partnerEmail))
    throw badRequest("Enter a single valid email address for the partner");
  let dueAt = parseDue(data.dueAt, now);
  if (!dueAt) {
    const deadline = app.deadline ?? app.closeDate;
    const suggested = deadline ? new Date(deadline.getTime() - 7 * DAY) : null;
    dueAt =
      suggested && suggested.getTime() > now.getTime() + 2 * DAY
        ? suggested
        : new Date(now.getTime() + 21 * DAY);
  }
  const partnerFacts = data.factIds?.length
    ? await usableFacts(ctx, orgId, data.factIds)
    : factsAboutPartner(data.partnerName, await usableFacts(ctx, orgId));
  if (data.factIds?.length && partnerFacts.length !== new Set(data.factIds).size) {
    throw badRequest("Some facts can't be used (not found, rejected or restricted)");
  }
  const who = await orgIdentity(ctx, orgId);
  const c: LetterContext = {
    orgName: who.orgName,
    partnerName: data.partnerName.trim(),
    grantTitle: app.grantTitle,
    funderName: app.funderName,
    dueAt,
    facts: partnerFacts,
  };
  const draft = await draftLetterRequest(ctx, c, { orgId, applicationId });
  const [row] = await ctx.db
    .insert(supportLetterRequests)
    .values({
      id: newId("slr"),
      orgId,
      applicationId,
      partnerName: c.partnerName,
      partnerEmail: data.partnerEmail.trim(),
      status: "draft",
      dueAt,
      factIds: partnerFacts.map((f) => f.id),
      emailSubject: draft.subject,
      emailIntro: draft.intro,
      outline: draft.outline,
      draftSource: draft.source,
      note: data.note?.trim() || null,
      createdBy: input.userId,
    })
    .returning();
  if (!row) throw new Error("support letter insert failed");
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    requestId: input.requestId,
    action: "support_letter.created",
    targetType: "application",
    targetId: applicationId,
    metadata: { requestId: row.id, draftSource: draft.source, factCount: partnerFacts.length },
  });
  return (await dtos(ctx, orgId, [row]))[0] as SupportLetterDto;
}

async function mustGet(ctx: AppContext, orgId: string, applicationId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(supportLetterRequests)
    .where(byId(orgId, applicationId, id))
    .get();
  if (!row) throw notFound("Letter request");
  return row;
}

/** Skip the partner reminders that have not fired yet (letter received / declined / moved). */
async function skipReminders(ctx: AppContext, row: SupportLetterRow, notes: string) {
  for (const days of REMINDER_DAYS) {
    await ctx.db
      .update(followups)
      .set({ status: "skipped", notes })
      .where(
        and(
          eq(followups.orgId, row.orgId),
          eq(followups.dedupeKey, reminderKey(row.id, days)),
          eq(followups.status, "pending"),
        ),
      );
  }
}

async function scheduleReminders(ctx: AppContext, row: SupportLetterRow) {
  if (!row.dueAt) return;
  const now = ctx.now().getTime();
  for (const days of REMINDER_DAYS) {
    const dueAt = new Date(row.dueAt.getTime() - days * DAY);
    const key = reminderKey(row.id, days);
    const title = `Remind ${row.partnerName}: letter of support due in ${days} days`;
    if (dueAt.getTime() <= now) continue;
    await ctx.db
      .insert(followups)
      .values({
        id: newId("fup"),
        orgId: row.orgId,
        applicationId: row.applicationId,
        kind: "custom",
        title,
        notes: `We email ${row.partnerName} a reminder with their upload link.`,
        dueAt,
        dedupeKey: key,
      })
      .onConflictDoNothing();
    await ctx.db
      .update(followups)
      .set({ dueAt, title, status: "pending" })
      .where(
        and(
          eq(followups.orgId, row.orgId),
          eq(followups.dedupeKey, key),
          isNull(followups.notifiedAt),
        ),
      );
  }
}

export async function updateSupportLetter(
  ctx: AppContext,
  input: {
    orgId: string;
    applicationId: string;
    id: string;
    userId: string;
    data: SupportLetterPatchInput;
    requestId?: string;
  },
): Promise<SupportLetterDto> {
  const { orgId, applicationId, data } = input;
  const row = await mustGet(ctx, orgId, applicationId, input.id);
  const patch: Partial<typeof supportLetterRequests.$inferInsert> = {};
  const editable = row.status === "draft" || row.status === "sent";
  if (data.partnerName !== undefined || data.partnerEmail !== undefined) {
    if (row.status !== "draft")
      throw conflict("The partner can only be changed before the request is sent");
    if (data.partnerName !== undefined) patch.partnerName = data.partnerName.trim();
    if (data.partnerEmail !== undefined) {
      if (!isEmail(data.partnerEmail))
        throw badRequest("Enter a single valid email address for the partner");
      patch.partnerEmail = data.partnerEmail.trim();
    }
  }
  if (data.dueAt !== undefined) {
    if (!editable) throw conflict(`This request is ${row.status}`);
    patch.dueAt = parseDue(data.dueAt, ctx.now());
  }
  if (data.emailIntro !== undefined || data.outline !== undefined) {
    if (row.status !== "draft") throw conflict("The email can only be edited before it is sent");
    if (data.emailIntro !== undefined) patch.emailIntro = data.emailIntro;
    if (data.outline !== undefined) patch.outline = data.outline;
    patch.draftSource = "staff";
  }
  if (data.note !== undefined) patch.note = data.note?.trim() || null;
  if (data.status === "declined") {
    if (row.status === "received") throw conflict("The letter was already received");
    patch.status = "declined";
  } else if (data.status === "received") {
    if (!data.documentId) throw badRequest("Pick the document that holds the letter");
    const doc = await ctx.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, data.documentId), eq(documents.orgId, orgId)))
      .get();
    if (!doc) throw notFound("Document");
    patch.status = "received";
    patch.receivedDocumentId = doc.id;
    patch.receivedAt = ctx.now();
  }
  if (Object.keys(patch).length === 0)
    return (await dtos(ctx, orgId, [row]))[0] as SupportLetterDto;
  const [updated] = await ctx.db
    .update(supportLetterRequests)
    .set(patch)
    .where(byId(orgId, applicationId, row.id))
    .returning();
  const next = updated ?? { ...row, ...patch };
  if (patch.status) {
    await skipReminders(
      ctx,
      next,
      patch.status === "declined" ? "Partner declined" : "Letter received",
    );
    if (patch.status === "received" && patch.receivedDocumentId) {
      await linkLetterToChecklist(ctx, orgId, applicationId, patch.receivedDocumentId);
    }
  } else if (patch.dueAt !== undefined && next.status === "sent") {
    await scheduleReminders(ctx, next);
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    requestId: input.requestId,
    action: patch.status ? `support_letter.${patch.status}` : "support_letter.updated",
    targetType: "application",
    targetId: applicationId,
    metadata: { requestId: row.id, fields: Object.keys(patch) },
  });
  return (await dtos(ctx, orgId, [next]))[0] as SupportLetterDto;
}

function partnerEmailData(
  row: SupportLetterRow,
  app: { grantTitle: string },
  who: Awaited<ReturnType<typeof orgIdentity>>,
  uploadUrl: string,
  expiresAt: Date,
) {
  return {
    subject: row.emailSubject,
    orgName: who.orgName,
    partnerName: row.partnerName,
    grantTitle: app.grantTitle,
    uploadUrl,
    dueAt: row.dueAt,
    expiresAt,
    intro: row.emailIntro,
    outline: row.outline,
    contactName: who.contactName,
    contactEmail: who.contactEmail,
  };
}

/**
 * Email the request with a fresh upload link (a new nonce: any earlier link stops working), valid
 * for 30 days, and schedule the 7- and 2-day reminders.
 */
export async function sendSupportLetter(
  ctx: AppContext,
  input: { orgId: string; applicationId: string; id: string; userId: string; requestId?: string },
): Promise<SupportLetterDto> {
  const { orgId, applicationId } = input;
  const row = await mustGet(ctx, orgId, applicationId, input.id);
  if (row.status === "received" || row.status === "declined")
    throw conflict(`This request is ${row.status}`);
  const app = await loadApp(ctx, orgId, applicationId);
  const who = await orgIdentity(ctx, orgId);
  const now = ctx.now();
  const nonce = newNonce();
  const token = await deriveLetterToken(ctx.env, row.id, nonce);
  const expiresAt = new Date(now.getTime() + LETTER_TOKEN_TTL_MS);
  const t = createTemplateContext(ctx.env.APP_URL);
  const msg = renderContent(
    letterRequestEmail(
      partnerEmailData(row, app, who, letterUploadUrl(t.appUrl, token), expiresAt),
      t,
    ),
    t,
  );
  // Store the hash first: if the send fails, the old link is already revoked (fail closed).
  const [updated] = await ctx.db
    .update(supportLetterRequests)
    .set({
      requestTokenHash: await hashLetterToken(token),
      tokenNonce: nonce,
      tokenExpiresAt: expiresAt,
    })
    .where(byId(orgId, applicationId, row.id))
    .returning();
  try {
    await ctx.email.send({
      to: [row.partnerEmail],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: who.contactEmail ?? undefined,
      idempotencyKey: `support_letter:${row.id}:${nonce}`,
    });
  } catch (e) {
    ctx.logger.warn("support_letter.send_failed", {
      orgId,
      requestId: row.id,
      error: String(e).slice(0, 200),
    });
    throw new AppError(502, "email_failed", "The email could not be sent. Try again in a moment.");
  }
  const [sent] = await ctx.db
    .update(supportLetterRequests)
    .set({ status: "sent", sentAt: now })
    .where(byId(orgId, applicationId, row.id))
    .returning();
  const next = sent ?? { ...(updated ?? row), status: "sent" as const, sentAt: now };
  await scheduleReminders(ctx, next);
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    requestId: input.requestId,
    action: "support_letter.sent",
    targetType: "application",
    targetId: applicationId,
    metadata: { requestId: row.id, expiresAt: expiresAt.toISOString() },
  });
  return (await dtos(ctx, orgId, [next]))[0] as SupportLetterDto;
}

// ---- Public link (/letters/:token) -------------------------------------------------------------

const linkNotFound = () =>
  new AppError(
    404,
    "not_found",
    "This link is not valid. Check it, or ask the organization for a new one.",
  );

/**
 * The request behind an upload token, or a 404/410. Only status `sent` links work: a draft has no
 * link, and a received or declined request closes it (single purpose: one letter, one request).
 */
export async function resolveLetterToken(
  ctx: AppContext,
  token: string,
): Promise<SupportLetterRow> {
  if (!LETTER_TOKEN_RE.test(token)) throw linkNotFound();
  const row = await ctx.db
    .select()
    .from(supportLetterRequests)
    .where(eq(supportLetterRequests.requestTokenHash, await hashLetterToken(token)))
    .get();
  if (!row?.tokenNonce || row.status === "draft") throw linkNotFound();
  if (row.status === "received")
    throw new AppError(
      410,
      "already_received",
      "Thank you — this letter has already been received.",
    );
  if (row.status === "declined")
    throw new AppError(410, "link_closed", "This request was closed by the organization.");
  if (!row.tokenExpiresAt || row.tokenExpiresAt.getTime() <= ctx.now().getTime()) {
    throw new AppError(
      410,
      "link_expired",
      "This link has expired. Ask the organization to send a new one.",
    );
  }
  return row;
}

export async function publicLetterInfo(
  ctx: AppContext,
  token: string,
): Promise<PublicLetterInfoDto> {
  const row = await resolveLetterToken(ctx, token);
  const app = await loadApp(ctx, row.orgId, row.applicationId);
  const who = await orgIdentity(ctx, row.orgId);
  return {
    orgName: who.orgName,
    grantTitle: app.grantTitle,
    partnerName: row.partnerName,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    maxBytes: LETTER_MAX_BYTES,
    acceptedTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  };
}

/**
 * Store the partner's validated file through normal ingestion (kind letter_of_support), close the
 * link, link the document to the request and checklist, and tell the org's editors.
 */
export async function receivePartnerLetter(
  ctx: AppContext,
  input: {
    token: string;
    mimeType: string;
    bytes: ArrayBuffer;
    filename: string;
    ipHash: string | null;
    userAgent: string | null;
    requestId?: string;
  },
): Promise<void> {
  const row = await resolveLetterToken(ctx, input.token);
  const { orgId, applicationId } = row;
  // Claim the request first so two concurrent uploads can't both land.
  const claimed = await ctx.db
    .update(supportLetterRequests)
    .set({ status: "received", receivedAt: ctx.now() })
    .where(
      and(
        eq(supportLetterRequests.id, row.id),
        eq(supportLetterRequests.orgId, orgId),
        eq(supportLetterRequests.status, "sent"),
      ),
    )
    .returning({ id: supportLetterRequests.id });
  if (claimed.length === 0)
    throw new AppError(
      410,
      "already_received",
      "Thank you — this letter has already been received.",
    );
  let documentId: string;
  try {
    const { document } = await createDocument(ctx, orgId, {
      title: `Letter of support — ${row.partnerName}`,
      kind: "letter_of_support",
      mimeType: input.mimeType,
      bytes: input.bytes,
      filename: input.filename,
      uploadedBy: null,
      notes: `Uploaded by ${row.partnerName} through a letter-of-support link.`,
      consent: { userId: null, ipHash: input.ipHash, userAgent: input.userAgent },
      onDuplicate: "reuse",
      requestId: input.requestId,
    });
    documentId = document.id;
  } catch (e) {
    await ctx.db
      .update(supportLetterRequests)
      .set({ status: "sent", receivedAt: null })
      .where(and(eq(supportLetterRequests.id, row.id), eq(supportLetterRequests.orgId, orgId)));
    throw e;
  }
  const [next] = await ctx.db
    .update(supportLetterRequests)
    .set({ receivedDocumentId: documentId })
    .where(and(eq(supportLetterRequests.id, row.id), eq(supportLetterRequests.orgId, orgId)))
    .returning();
  await skipReminders(ctx, next ?? row, "Letter received");
  await linkLetterToChecklist(ctx, orgId, applicationId, documentId);
  await audit(ctx, {
    orgId,
    actorType: "system",
    actorId: null,
    requestId: input.requestId,
    action: "support_letter.received",
    targetType: "application",
    targetId: applicationId,
    metadata: { requestId: row.id, documentId },
  });
  await notify(ctx, {
    orgId,
    recipients: "editors",
    kind: "support_letter.received",
    title: `Letter of support received from ${row.partnerName}`,
    body: "It was added to your documents and the application's attachments.",
    link: `/orgs/${orgId}/applications/${applicationId}`,
    severity: "success",
    dedupeKey: `support_letter_received:${row.id}`,
  });
}

// ---- Reminders (followups.run_due cron) -------------------------------------------------------

/**
 * Email partners the reminders that are due: pending `followups` rows with dedupe key
 * support_letter:{id}:{7|2}d. Runs before the generic follow-up sweep so it claims these rows
 * (notifiedAt) and marks them done; a failed send releases the claim for the next run.
 */
export async function sendDueLetterReminders(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = ctx.now();
  const due = await ctx.db
    .select()
    .from(followups)
    .where(
      and(
        eq(followups.status, "pending"),
        isNull(followups.notifiedAt),
        lte(followups.dueAt, now),
        like(followups.dedupeKey, "support_letter:%"),
      ),
    )
    .orderBy(asc(followups.dueAt))
    .limit(opts.limit ?? 100)
    .all();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const f of due) {
    const m = /^support_letter:(slr_[a-z0-9]+):(\d+)d$/.exec(f.dedupeKey ?? "");
    const claimed = await ctx.db
      .update(followups)
      .set({ notifiedAt: now })
      .where(
        and(eq(followups.id, f.id), eq(followups.orgId, f.orgId), isNull(followups.notifiedAt)),
      )
      .returning({ id: followups.id });
    if (claimed.length === 0) continue;
    const row = m
      ? await ctx.db
          .select()
          .from(supportLetterRequests)
          .where(
            and(
              eq(supportLetterRequests.id, m[1] as string),
              eq(supportLetterRequests.orgId, f.orgId),
            ),
          )
          .get()
      : undefined;
    const close = (status: "done" | "skipped", notes: string) =>
      ctx.db
        .update(followups)
        .set({ status, notes, completedAt: now })
        .where(and(eq(followups.id, f.id), eq(followups.orgId, f.orgId)));
    if (
      row?.status !== "sent" ||
      !row.tokenNonce ||
      !row.dueAt ||
      !row.tokenExpiresAt ||
      row.tokenExpiresAt.getTime() <= now.getTime() ||
      row.dueAt.getTime() <= now.getTime()
    ) {
      await close("skipped", "No reminder needed (received, closed, expired or past due).");
      skipped++;
      continue;
    }
    try {
      const app = await loadApp(ctx, row.orgId, row.applicationId);
      const who = await orgIdentity(ctx, row.orgId);
      const token = await deriveLetterToken(ctx.env, row.id, row.tokenNonce);
      const t = createTemplateContext(ctx.env.APP_URL);
      const daysLeft = Math.max(1, Math.ceil((row.dueAt.getTime() - now.getTime()) / DAY));
      const msg = renderContent(
        letterReminderEmail(
          {
            ...partnerEmailData(
              row,
              app,
              who,
              letterUploadUrl(t.appUrl, token),
              row.tokenExpiresAt,
            ),
            daysLeft,
          },
          t,
        ),
        t,
      );
      await ctx.email.send({
        to: [row.partnerEmail],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        replyTo: who.contactEmail ?? undefined,
        idempotencyKey: `support_letter_reminder:${f.id}`,
      });
      await close("done", `Reminder emailed to ${row.partnerName}.`);
      await ctx.db
        .update(supportLetterRequests)
        .set({ lastReminderAt: now, reminderCount: row.reminderCount + 1 })
        .where(
          and(eq(supportLetterRequests.id, row.id), eq(supportLetterRequests.orgId, row.orgId)),
        );
      sent++;
    } catch (e) {
      failed++;
      ctx.logger.warn("support_letter.reminder_failed", {
        followupId: f.id,
        error: String(e).slice(0, 200),
      });
      await ctx.db
        .update(followups)
        .set({ notifiedAt: null })
        .where(and(eq(followups.id, f.id), eq(followups.orgId, f.orgId)));
    }
  }
  return { sent, skipped, failed };
}
