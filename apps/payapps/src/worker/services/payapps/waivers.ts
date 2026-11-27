// Lien waivers per pay application (Crew plan and up). The org is the claimant: it gives its
// customer a conditional waiver with the application and an unconditional one once the payment
// clears. Wording comes only from packages/lien-waivers: a state's statutory form when its text is
// encoded and verified (Arizona, California, Florida, Georgia, Michigan, Mississippi, Nevada, Texas, Utah and Wyoming today), the package's general form in
// states with no statutory form, and nothing printable in a statutory state whose text is not encoded
// yet, or for a kind the state's statute does not provide (Utah has no unconditional form, Florida no
// conditional one): the waiver is still
// tracked, and the UI shows why and points to the official text. A state may also offer a form for
// only some jobs beside its usual one (Missouri's unconditional final waiver for residential real
// property, Mo. Rev. Stat. § 429.016.27; Massachusetts' partial waiver and subordination of lien for
// a person who recorded a notice of contract, Mass. Gen. Laws c. 254, § 32(4)): the user chooses it,
// and the waiver keeps that form's id.
// Not legal advice; see the package README.
import {
  alternativeForms,
  amountInWords,
  type FormDefinition,
  formatCents,
  formatDate,
  formById,
  isIsoDate,
  listForms,
  normalizeState,
  render,
  type ValidationError,
  type WaiverData,
} from "@lien-waivers";
import type { CreateWaiverInput } from "@shared/api/schemas";
import type {
  GaAffidavitFilingDto,
  WaiverDto,
  WaiverFormDto,
  WaiverOverviewDto,
} from "@shared/api/types";
import type { WaiverKind } from "@shared/enums";
import { type GaWaiverClock, gaWaiverClocks } from "@shared/ga-waiver-clock";
import { receivedCents as receivedOf } from "@shared/payments";
import {
  type WaiverFollowUpInput,
  type WaiverToSend,
  waiversToSend,
} from "@shared/waiver-followup";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { lienWaivers, organization, projects } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { assertLienWaivers, orgPlan } from "../billing";
import { findPayApp, loadBundle, type ProjectBundle, paidAmountOf, paymentsOf } from "./bundle";

type WaiverRow = typeof lienWaivers.$inferSelect;

function parseState(state: string) {
  try {
    return normalizeState(state);
  } catch {
    throw badRequest(`Unknown US state code: ${state}`);
  }
}

/** The state's usual form of `kind`, or the one named by `formId` (it must be of that kind). */
const formFor = (state: string, kind: WaiverKind, formId?: string | null): FormDefinition => {
  const form = formId ? formById(state, formId) : listForms(state).find((f) => f.kind === kind);
  if (!form || form.kind !== kind) {
    throw badRequest(
      formId
        ? `No ${kind} waiver form ${formId} for ${state}`
        : `No ${kind} waiver form for ${state}`,
    );
  }
  return form;
};

export function formDto(f: FormDefinition): WaiverFormDto {
  return {
    id: f.id,
    kind: f.kind,
    title: f.title,
    source: f.source,
    citation: f.citation?.text ?? null,
    officialUrl: f.citation?.officialUrl ?? null,
    printable: f.body !== null,
    appliesTo: f.appliesTo ?? null,
    fields: f.fields.map((x) => ({ ...x })),
    notes: [...f.notes],
  };
}

/** A waiver row as src/shared/waiver-followup.ts reads it, with the state's missing forms looked up. */
export function followUpInput(
  w: Pick<WaiverRow, "kind" | "status" | "state"> & {
    amountCents?: number;
    sentAt?: Date | null;
  } & Partial<
      Pick<
        WaiverRow,
        | "gaAffidavitFiledOn"
        | "gaAffidavitCounty"
        | "gaAffidavitCopySentOn"
        | "gaAffidavitContractorCopy"
        | "gaAffidavitContractorCopySentOn"
        | "gaPaidAffidavitSignedOn"
        | "gaPaidAffidavitRecordedOn"
      >
    >,
): WaiverFollowUpInput {
  const scope = w.kind.endsWith("-final") ? "final" : "progress";
  let noUnconditionalForm = false;
  try {
    noUnconditionalForm = Boolean(
      listForms(w.state).find((f) => f.kind === `unconditional-${scope}`)?.absent,
    );
  } catch {
    // A state code the package no longer knows: prompt as for any state.
  }
  return {
    kind: w.kind,
    status: w.status,
    state: w.state,
    noUnconditionalForm,
    amountCents: w.amountCents,
    ...(w.sentAt ? { sentOn: w.sentAt.toISOString().slice(0, 10) } : {}),
    ...(w.gaAffidavitFiledOn
      ? {
          gaAffidavit: {
            filedOn: w.gaAffidavitFiledOn,
            county: w.gaAffidavitCounty ?? "",
            ...(w.gaAffidavitCopySentOn ? { copySentOn: w.gaAffidavitCopySentOn } : {}),
            ...(w.gaAffidavitContractorCopy ? { contractorCopy: w.gaAffidavitContractorCopy } : {}),
            ...(w.gaAffidavitContractorCopySentOn
              ? { contractorCopySentOn: w.gaAffidavitContractorCopySentOn }
              : {}),
            ...(w.gaPaidAffidavitSignedOn
              ? { paidAffidavitSignedOn: w.gaPaidAffidavitSignedOn }
              : {}),
            ...(w.gaPaidAffidavitRecordedOn
              ? { paidAffidavitRecordedOn: w.gaPaidAffidavitRecordedOn }
              : {}),
          },
        }
      : {}),
  };
}

export function gaFilingDto(w: WaiverRow): GaAffidavitFilingDto | null {
  if (!w.gaAffidavitFiledOn) return null;
  return {
    filedOn: w.gaAffidavitFiledOn,
    county: w.gaAffidavitCounty ?? "",
    recording: w.gaAffidavitRecording,
    copySentOn: w.gaAffidavitCopySentOn,
    copyMethod: w.gaAffidavitCopyMethod,
    copyTracking: w.gaAffidavitCopyTracking,
    contractorCopy: w.gaAffidavitContractorCopy,
    contractorCopySentOn: w.gaAffidavitContractorCopySentOn,
    contractorCopyMethod: w.gaAffidavitContractorCopyMethod,
    contractorCopyTracking: w.gaAffidavitContractorCopyTracking,
    paidAffidavitSignedOn: w.gaPaidAffidavitSignedOn,
    paidAffidavitRecordedOn: w.gaPaidAffidavitRecordedOn,
    paidAffidavitRecording: w.gaPaidAffidavitRecording,
  };
}

export function waiverDto(w: WaiverRow, gaClock: GaWaiverClock | null = null): WaiverDto {
  return {
    id: w.id,
    payAppId: w.payAppId,
    state: w.state,
    kind: w.kind,
    formId: w.formId,
    printable: w.formId !== null && w.formData !== null,
    amountCents: w.amountCents,
    throughDate: w.throughDate,
    status: w.status,
    sentAt: w.sentAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
    gaClock,
    gaAffidavitFiling: gaFilingDto(w),
  };
}

/** Conditional until the pay app is paid; a final waiver once nothing remains to bill or hold. */
export function suggestKind(b: ProjectBundle, payAppId: string): WaiverKind {
  const { app, computed } = findPayApp(b, payAppId);
  const s = computed.summary;
  const final = s.contractSumToDateCents > 0 && s.balanceToFinishIncludingRetainageCents === 0;
  const paid = app.status === "paid";
  return `${paid ? "unconditional" : "conditional"}-${final ? "final" : "progress"}`;
}

/**
 * The suggested kind, moved to its conditional twin when the state's statute has no form of that
 * kind. Utah's two forms take effect once the check is paid, so after payment they are what the
 * statute offers; there is no unconditional Utah form to suggest.
 */
export function suggestedFor(kind: WaiverKind, forms: readonly FormDefinition[]): WaiverKind {
  if (!forms.find((f) => f.kind === kind)?.absent) return kind;
  const twin = kind.replace(/^unconditional-/, "conditional-") as WaiverKind;
  return forms.some((f) => f.kind === twin && f.body) ? twin : kind;
}

/** Values the job and pay app already know, keyed by every field name the forms use. */
export function prefillFor(
  b: ProjectBundle,
  payAppId: string,
  claimant: string,
  today: string,
): Record<string, string | number> {
  const { app, computed } = findPayApp(b, payAppId);
  const p = b.project;
  // Once paid, only the money received (a balance closed short was never paid, so never waived).
  const amount = paidAmountOf(app, computed);
  const out: Record<string, string | number | null | undefined> = {
    claimantName: claimant,
    customerName: p.gcName,
    ownerName: p.ownerName,
    jobLocation: p.location,
    jobDescription: [p.name, p.location].filter(Boolean).join(", "),
    projectName: p.name,
    jobNumber: p.number,
    throughDate: app.periodTo,
    checkMaker: p.gcName,
    checkPayee: claimant,
    checkAmountCents: Math.max(0, amount),
    amountPaidCents: Math.max(0, amount),
    // Nevada's statutory blanks (§ 108.2457(5)): the pay app is the "Payment Application".
    invoiceNumber: `Pay Application No. ${app.number}`,
    paymentAmountCents: Math.max(0, amount),
    paymentPeriod: `${app.periodFrom} to ${app.periodTo}`,
    // Wyoming's form (§ 29-10-101(b)) reserves "monies withheld as retainage in the amount of":
    // the retainage held as of this application. Its "not been paid the sum of" is left to the user.
    retainageHeldCents: Math.max(0, computed.summary.totalRetainageCents),
    signedDate: today,
    ...maPrefill(b, app, computed.summary, claimant, Math.max(0, amount)),
  };
  return Object.fromEntries(
    Object.entries(out).filter((e): e is [string, string | number] => e[1] != null && e[1] !== ""),
  );
}

/**
 * Massachusetts' partial waiver (c. 254, § 32(4)) heads its text with the pay application's own
 * arithmetic, lines 1-10. Lines 1-8 are this application's G702 summary: line 7, "Less Previous
 * Payments", is the G702's previous certificates, so line 8 stays line 6 less line 7 as the form
 * says (the user corrects it where the GC paid a different amount). Line 9 is the job's change
 * orders still pending today; line 10 and the county and town are left to the user.
 */
function maPrefill(
  b: ProjectBundle,
  app: ReturnType<typeof findPayApp>["app"],
  s: ReturnType<typeof findPayApp>["computed"]["summary"],
  claimant: string,
  paymentCents: number,
): Record<string, string | number> {
  const pending = b.changeOrders
    .filter((co) => co.status === "pending")
    .reduce((sum, co) => sum + co.items.reduce((t, i) => t + i.amountCents, 0), 0);
  return {
    applicationNumber: String(app.number),
    contractorName: claimant,
    originalContractCents: s.originalContractSumCents,
    approvedChangeOrders: formatCents(s.netChangeByChangeOrdersCents),
    adjustedContractCents: s.contractSumToDateCents,
    completedToDateCents: s.totalCompletedAndStoredCents,
    retainageCents: s.totalRetainageCents,
    totalPayableCents: s.totalEarnedLessRetainageCents,
    previousPaymentsCents: s.lessPreviousCertificatesCents,
    currentAmountDueCents: s.currentPaymentDueCents,
    pendingChangeOrders: formatCents(pending),
    propertyDescription: [b.project.name, b.project.location].filter(Boolean).join(", "),
    paymentAmountWords: amountInWords(paymentCents),
    invoiceDate: app.applicationDate,
  };
}

/**
 * After a partial payment whose unconditional waiver already went out, the next waiver is for the
 * rest only: an unconditional waiver for the whole application would repeat the first one.
 */
export function remainderPrefill(
  prefill: Record<string, string | number>,
  remainingCents: number | undefined,
): Record<string, string | number> {
  if (remainingCents === undefined) return prefill;
  return {
    ...prefill,
    checkAmountCents: remainingCents,
    amountPaidCents: remainingCents,
    paymentAmountCents: remainingCents,
    paymentAmountWords: amountInWords(Math.max(0, remainingCents)),
  };
}

/**
 * California's conditional progress form (Civ. Code § 8132) excepts "progress payments for which the
 * claimant has previously given a conditional waiver and release but has not received payment",
 * with their dates and unpaid amounts. Those are this job's earlier applications that still owe
 * money and whose conditional progress waiver was given (marked sent): one entry per application,
 * oldest first, the amount still owed on it today (expected less what has been recorded). Keys only
 * the forms that have these blanks use them; empty when there is nothing to except.
 */
export function priorUnpaidConditional(
  b: ProjectBundle,
  payAppId: string,
  rows: readonly Pick<
    WaiverRow,
    "payAppId" | "kind" | "status" | "state" | "sentAt" | "createdAt" | "formData"
  >[],
  state: string | null,
): { priorWaiverDates?: string; priorUnpaidAmounts?: string } {
  const { app: current } = findPayApp(b, payAppId);
  const dates: string[] = [];
  const amounts: string[] = [];
  b.payApps.forEach((app, i) => {
    const computed = b.computed[i];
    if (!computed || app.id === payAppId || app.number >= current.number) return;
    if (app.status === "paid") return;
    const owed = paidAmountOf(app, computed) - receivedOf(paymentsOf(b, app.id));
    if (owed <= 0) return;
    const given = rows
      .filter(
        (w) =>
          w.payAppId === app.id &&
          w.kind === "conditional-progress" &&
          w.status === "sent" &&
          (state === null || w.state === state),
      )
      .map((w) => {
        const signed = w.formData?.signedDate;
        if (typeof signed === "string" && isIsoDate(signed)) return signed;
        return (w.sentAt ?? w.createdAt).toISOString().slice(0, 10);
      });
    if (given.length === 0) return;
    dates.push([...new Set(given)].sort().map(formatDate).join(", "));
    amounts.push(formatCents(owed));
  });
  if (dates.length === 0) return {};
  return { priorWaiverDates: dates.join("; "), priorUnpaidAmounts: amounts.join("; ") };
}

export async function orgName(ctx: AppContext, orgId: string) {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) throw notFound("Organization");
  return org.name;
}

const listRows = (ctx: AppContext, orgId: string, payAppId: string) =>
  ctx.db
    .select()
    .from(lienWaivers)
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.payAppId, payAppId)))
    .orderBy(lienWaivers.createdAt)
    .all();

export async function waiverOverview(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  stateQuery?: string,
): Promise<WaiverOverviewDto> {
  const b = await loadBundle(ctx, orgId, projectId);
  const [{ plan }, rows, claimant, onJob] = await Promise.all([
    orgPlan(ctx, orgId),
    listRows(ctx, orgId, payAppId),
    orgName(ctx, orgId),
    ctx.db
      .select({
        payAppId: lienWaivers.payAppId,
        kind: lienWaivers.kind,
        status: lienWaivers.status,
        state: lienWaivers.state,
        sentAt: lienWaivers.sentAt,
        createdAt: lienWaivers.createdAt,
        formData: lienWaivers.formData,
      })
      .from(lienWaivers)
      .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.projectId, projectId)))
      .orderBy(desc(lienWaivers.createdAt))
      .all(),
  ]);
  const state = stateQuery ? parseState(stateQuery) : (onJob[0]?.state ?? null);
  const forms = state ? listForms(state) : [];
  const { app, computed } = findPayApp(b, payAppId);
  const paidCents = paidAmountOf(app, computed);
  // On an application paid in part, the money recorded so far (the partial check's waiver).
  const receivedCents = app.status === "paid" ? undefined : receivedOf(paymentsOf(b, payAppId));
  const toSend: WaiverToSend[] = waiversToSend(
    { ...app, paidCents, receivedCents },
    rows.map(followUpInput),
  );
  // Georgia's 90 days and Mississippi's 60 on each sent waiver there the money recorded does not cover.
  const clocks = gaWaiverClocks(
    app,
    receivedCents ?? paidCents,
    rows.map((w) => ({ ...followUpInput(w), id: w.id })),
    ctx.now().toISOString().slice(0, 10),
  );
  return {
    enabled: plan.lienWaivers,
    items: rows.map((w) => waiverDto(w, clocks.find((c) => c.waiverId === w.id) ?? null)),
    toSend,
    // A paid application owing an unconditional waiver suggests that one, whatever the scope rule says.
    suggestedKind: toSend[0]
      ? `unconditional-${toSend[0].scope}`
      : suggestedFor(suggestKind(b, payAppId), forms),
    prefill: {
      ...remainderPrefill(
        prefillFor(b, payAppId, claimant, ctx.now().toISOString().slice(0, 10)),
        toSend[0]?.remainingCents,
      ),
      ...priorUnpaidConditional(b, payAppId, onJob, state),
    },
    state,
    forms: forms.map(formDto),
    alternatives: state ? alternativeForms(state).map(formDto) : [],
    gaNoc: { filed: b.project.gaNocFiled, contractor: b.project.gaNocContractor },
  };
}

export function fieldErrors(errors: ValidationError[]) {
  return new AppError(
    400,
    "invalid_waiver",
    errors.map((e) => e.message).join(" "),
    errors.map((e) => ({ field: e.field, code: e.code, message: e.message })),
  );
}

export async function createWaiver(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: CreateWaiverInput,
  userId: string,
): Promise<WaiverDto> {
  await assertLienWaivers(ctx, orgId);
  const b = await loadBundle(ctx, orgId, projectId);
  findPayApp(b, payAppId);
  const state = parseState(input.state);
  const form = formFor(state, input.kind, input.formId);

  // Printable only when the package has the form's verified text and the fields fill it.
  let formData: WaiverData | null = null;
  if (form.body && input.fields) {
    const r = render(form, input.fields);
    if (!r.ok) throw fieldErrors(r.errors);
    formData = input.fields;
  }
  const row = {
    id: newId("lwv"),
    orgId,
    projectId,
    payAppId,
    state,
    kind: input.kind,
    formId: formData ? form.id : null,
    amountCents: input.amountCents,
    throughDate: input.throughDate ?? null,
    formData: formData as Record<string, string | number> | null,
    createdBy: userId,
  };
  await ctx.db.insert(lienWaivers).values(row);
  return waiverDto(await getWaiver(ctx, orgId, payAppId, row.id));
}

export async function getWaiver(ctx: AppContext, orgId: string, payAppId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(lienWaivers)
    .where(
      and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.payAppId, payAppId), eq(lienWaivers.id, id)),
    )
    .get();
  if (!row) throw notFound("Lien waiver");
  return row;
}

export async function setWaiverStatus(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  id: string,
  status: WaiverRow["status"],
) {
  await assertLienWaivers(ctx, orgId);
  await getWaiver(ctx, orgId, payAppId, id);
  await ctx.db
    .update(lienWaivers)
    .set({ status, sentAt: status === "sent" ? ctx.now() : null })
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, id)));
  return waiverDto(await getWaiver(ctx, orgId, payAppId, id));
}

export async function deleteWaiver(ctx: AppContext, orgId: string, payAppId: string, id: string) {
  const row = await getWaiver(ctx, orgId, payAppId, id);
  await ctx.db.delete(lienWaivers).where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, id)));
  return row;
}

/** The filled form for a printable waiver. Readable on any plan (nothing is hidden on downgrade). */
export async function renderWaiver(ctx: AppContext, orgId: string, payAppId: string, id: string) {
  const row = await getWaiver(ctx, orgId, payAppId, id);
  if (!row.formId || !row.formData) {
    const absent = formFor(row.state, row.kind).absent;
    throw badRequest(
      absent
        ? `This waiver is tracked only. ${absent}`
        : "This waiver is tracked only: its state's statutory text is not in PayApps yet. Use the official form.",
    );
  }
  const form = formById(row.state, row.formId);
  if (!form || form.kind !== row.kind) {
    throw new AppError(
      409,
      "form_changed",
      "This waiver's form is no longer offered; create it again.",
    );
  }
  const r = render(form, row.formData);
  if (!r.ok) throw fieldErrors(r.errors);
  const project = await ctx.db
    .select({ isSample: projects.isSample })
    .from(projects)
    .where(and(eq(projects.id, row.projectId), eq(projects.orgId, orgId)))
    .get();
  return { row, document: r.document, sample: project?.isSample ?? false };
}
