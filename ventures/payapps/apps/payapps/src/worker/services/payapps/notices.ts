// Preliminary notices of the right to a lien for a job (Crew plan and up, with lien waivers). A
// sub or supplier sends one to the property's record owner early in the job where a state's statute
// prescribes it. Wording comes only from packages/lien-waivers (California's §§ 8102 and 8202 for
// private works, Florida's Notice to Owner, § 713.06(2)(c), and Wyoming's § 29-10-101(a) today);
// a state with no encoded notice gets none. Printing saves nothing: the notice is filled from the
// job and the org, checked by the package, and returned as a PDF. For California the company can
// also record each notice it gave (who, how, when, where) and enter the day it first furnished work:
// PayApps then counts § 8204(a)'s 20 days, flags a late notice, prints the § 8118 proof of notice
// declaration for each one, and the cash report reminds until the owner and direct contractor have
// one recorded. Not legal advice; see the package README.
import {
  CA_NOTICE_METHOD_LABELS,
  CA_NOTICE_METHODS,
  CA_NOTICE_RECIPIENT_LABELS,
  CA_NOTICE_RECIPIENTS,
  type CaNoticeRecipient,
  caNoticeCompleteOn,
  caNoticeDueOn,
  caNoticeTiming,
  caProofOfNotice,
  type NoticeForm,
  normalizeState,
  noticeById,
  noticeForms,
  renderNotice,
  US_STATES,
} from "@lien-waivers";
import type { CaNoticeSendBody } from "@shared/api/schemas";
import type {
  CaNoticeLogDto,
  CaNoticeSendDto,
  NoticeFormDto,
  NoticeOverviewDto,
} from "@shared/api/types";
import { formatCents } from "@shared/money";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrderItems, changeOrders, lienNoticeSends, projects } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { assertLienWaivers, orgPlan } from "../billing";
import { noticeFileCounts, purgeNoticeFiles } from "./notice-files";
import { fieldErrors, orgName } from "./waivers";

function parseState(state: string) {
  try {
    return normalizeState(state);
  } catch {
    throw badRequest(`Unknown US state code: ${state}`);
  }
}

async function loadProject(ctx: AppContext, orgId: string, projectId: string) {
  const p = await ctx.db
    .select({
      name: projects.name,
      location: projects.location,
      ownerName: projects.ownerName,
      gcName: projects.gcName,
      gcAddress: projects.gcAddress,
      originalContractSumCents: projects.originalContractSumCents,
      caFirstFurnishedOn: projects.caFirstFurnishedOn,
      isSample: projects.isSample,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!p) throw notFound("Project");
  return p;
}

/** The net of the job's approved change orders, for the notice's estimate of the total price. */
async function approvedChangeCents(ctx: AppContext, orgId: string, projectId: string) {
  const rows = await ctx.db
    .select({ amountCents: changeOrderItems.amountCents })
    .from(changeOrderItems)
    .innerJoin(changeOrders, eq(changeOrderItems.changeOrderId, changeOrders.id))
    .where(
      and(
        eq(changeOrderItems.orgId, orgId),
        eq(changeOrders.orgId, orgId),
        eq(changeOrders.projectId, projectId),
        eq(changeOrders.status, "approved"),
      ),
    )
    .all();
  return rows.reduce((s, r) => s + r.amountCents, 0);
}

const noticeDto = (n: NoticeForm): NoticeFormDto => ({
  id: n.id,
  title: n.title,
  citation: n.citation.text,
  officialUrl: n.citation.officialUrl,
  sendTo: n.sendTo,
  fields: n.fields.map((f) => ({ ...f })),
  notes: [...n.notes],
});

/** States with an encoded notice, from the package (so a new state shows up by itself). */
export const NOTICE_STATES: readonly string[] = US_STATES.filter(
  (code) => noticeForms(code).length > 0,
);

export async function noticeOverview(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  stateQuery?: string,
): Promise<NoticeOverviewDto> {
  const [p, { plan }, claimant] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    orgPlan(ctx, orgId),
    orgName(ctx, orgId),
  ]);
  const state = stateQuery ? parseState(stateQuery) : null;
  const prefill: Record<string, string> = {
    claimantContact: claimant,
    propertyDescription: p.name,
    signedDate: ctx.now().toISOString().slice(0, 10),
  };
  if (p.location) prefill.propertyAddress = p.location;
  // California's items (§§ 8102, 8202), from what the job already holds. The relationship to the
  // parties is left for the user: PayApps does not know whether they are a sub or a supplier.
  if (p.ownerName) prefill.ownerNameAddress = p.ownerName;
  prefill.directContractor = [p.gcName, p.gcAddress].filter(Boolean).join("\n");
  prefill.hiredBy = p.gcName;
  prefill.siteDescription = [p.name, p.location].filter(Boolean).join(", ");
  prefill.claimant = claimant;
  // Florida's Notice to Owner (§ 713.06(2)(c)): the lienor's name, and the contractor as the first
  // copy (§ 713.06(2)(a) requires it from a sub-subcontractor or a supplier to a subcontractor).
  prefill.lienorName = claimant;
  if (prefill.directContractor) prefill.copiesTo = prefill.directContractor;
  prefill.estimate = formatCents(
    p.originalContractSumCents + (await approvedChangeCents(ctx, orgId, projectId)),
  );
  return {
    enabled: plan.lienWaivers,
    state,
    notices: state ? noticeForms(state).map(noticeDto) : [],
    states: [...NOTICE_STATES],
    prefill,
    ownerName: p.ownerName ?? null,
    ca:
      state === "CA"
        ? await caNoticeLog(ctx, orgId, projectId, p.caFirstFurnishedOn, {
            owner: p.ownerName ?? undefined,
            "direct-contractor": prefill.directContractor || undefined,
          })
        : null,
  };
}

type SendRow = typeof lienNoticeSends.$inferSelect;

function sendDto(r: SendRow, firstFurnishedOn: string | null, fileCount = 0): CaNoticeSendDto {
  const t = firstFurnishedOn
    ? caNoticeTiming(firstFurnishedOn, { method: r.method, on: r.givenOn })
    : null;
  return {
    id: r.id,
    recipient: r.recipient,
    recipientNameAddress: r.recipientNameAddress,
    method: r.method,
    givenOn: r.givenOn,
    completeOn: caNoticeCompleteOn(r.method, r.givenOn),
    place: r.place,
    tracking: r.tracking,
    onTime: t?.onTime ?? null,
    coversWorkFrom: t?.coversWorkFrom ?? null,
    fileCount,
  };
}

async function loadSends(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(lienNoticeSends)
    .where(and(eq(lienNoticeSends.orgId, orgId), eq(lienNoticeSends.projectId, projectId)))
    .orderBy(asc(lienNoticeSends.givenOn), asc(lienNoticeSends.createdAt))
    .all();
}

/**
 * The recipients the reminder waits on: the owner and the direct contractor (§ 8200(a)(1)-(2)). The
 * lender is owed one only "if any", which PayApps cannot know, so it never holds the reminder open.
 */
export const CA_REMINDER_RECIPIENTS: readonly CaNoticeRecipient[] = ["owner", "direct-contractor"];

export function missingRecipients(sends: readonly { recipient: CaNoticeRecipient }[]) {
  const have = new Set(sends.map((s) => s.recipient));
  return CA_REMINDER_RECIPIENTS.filter((r) => !have.has(r));
}

async function caNoticeLog(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  firstFurnishedOn: string | null,
  recipientPrefill: CaNoticeLogDto["recipientPrefill"],
): Promise<CaNoticeLogDto> {
  const [rows, counts] = await Promise.all([
    loadSends(ctx, orgId, projectId),
    noticeFileCounts(ctx, orgId, projectId),
  ]);
  return {
    firstFurnishedOn,
    dueOn: firstFurnishedOn ? caNoticeDueOn(firstFurnishedOn) : null,
    sends: rows.map((r) => sendDto(r, firstFurnishedOn, counts.get(r.id) ?? 0)),
    missing: missingRecipients(rows),
    methods: CA_NOTICE_METHODS.map((id) => ({ id, label: CA_NOTICE_METHOD_LABELS[id] })),
    recipients: CA_NOTICE_RECIPIENTS.map((id) => ({ id, label: CA_NOTICE_RECIPIENT_LABELS[id] })),
    recipientPrefill,
  };
}

/** Set or clear the day the company first furnished work (the § 8204(a) start). */
export async function setCaFirstFurnished(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  firstFurnishedOn: string | null,
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  if (firstFurnishedOn) {
    try {
      caNoticeDueOn(firstFurnishedOn);
    } catch {
      throw badRequest(`Not a date: ${firstFurnishedOn}`);
    }
  }
  await ctx.db
    .update(projects)
    .set({ caFirstFurnishedOn: firstFurnishedOn })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return {
    firstFurnishedOn,
    /** For the job history: whether anything changed, and whether the job is the sample. */
    changed: (p.caFirstFurnishedOn ?? null) !== firstFurnishedOn,
    isSample: p.isSample,
  };
}

/** Record a California preliminary notice as given to one person. */
export async function recordCaNoticeSend(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  input: CaNoticeSendBody,
): Promise<{ send: CaNoticeSendDto; isSample: boolean }> {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  try {
    caNoticeCompleteOn(input.method, input.givenOn);
  } catch {
    throw badRequest(`Not a date: ${input.givenOn}`);
  }
  const row: SendRow = {
    id: crypto.randomUUID(),
    orgId,
    projectId,
    recipient: input.recipient,
    recipientNameAddress: input.recipientNameAddress,
    method: input.method,
    givenOn: input.givenOn,
    place: input.place,
    tracking: input.tracking?.trim() || null,
    createdBy: userId,
    createdAt: ctx.now(),
  };
  await ctx.db.insert(lienNoticeSends).values(row);
  return { send: sendDto(row, p.caFirstFurnishedOn), isSample: p.isSample };
}

async function loadSend(ctx: AppContext, orgId: string, projectId: string, sendId: string) {
  const r = await ctx.db
    .select()
    .from(lienNoticeSends)
    .where(
      and(
        eq(lienNoticeSends.id, sendId),
        eq(lienNoticeSends.orgId, orgId),
        eq(lienNoticeSends.projectId, projectId),
      ),
    )
    .get();
  if (!r) throw notFound("Notice");
  return r;
}

export async function deleteCaNoticeSend(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
) {
  await assertLienWaivers(ctx, orgId);
  const [p, r] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    loadSend(ctx, orgId, projectId, sendId),
  ]);
  // The files' objects first: their rows cascade with the record, and an object no row owns would
  // count against nothing and never be cleaned up.
  await purgeNoticeFiles(ctx, orgId, sendId);
  await ctx.db
    .delete(lienNoticeSends)
    .where(and(eq(lienNoticeSends.id, sendId), eq(lienNoticeSends.orgId, orgId)));
  return { send: r, isSample: p.isSample };
}

/** The § 8118 proof of notice declaration for one recorded notice. */
export async function caProofDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
  declarant: string,
) {
  await assertLienWaivers(ctx, orgId);
  const [p, r, claimant] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    loadSend(ctx, orgId, projectId, sendId),
    orgName(ctx, orgId),
  ]);
  const document = caProofOfNotice({
    recipient: r.recipient,
    recipientNameAddress: r.recipientNameAddress,
    method: r.method,
    on: r.givenOn,
    place: r.place,
    tracking: r.tracking ?? undefined,
    declarant: declarant.trim() || claimant,
    claimant,
    siteDescription: [p.name, p.location].filter(Boolean).join(", "),
  });
  return { document, sample: p.isSample, recipient: r.recipient };
}

/** The filled notice, checked by the package; throws with every field problem at once. */
export async function renderProjectNotice(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: { state: string; formId: string; fields: Record<string, string> },
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  const state = parseState(input.state);
  const form = noticeById(state, input.formId);
  if (!form) throw badRequest(`No preliminary notice ${input.formId} for ${state}`);
  const r = renderNotice(form, input.fields);
  if (!r.ok) throw fieldErrors(r.errors);
  return { document: r.document, sample: p.isSample, state };
}
