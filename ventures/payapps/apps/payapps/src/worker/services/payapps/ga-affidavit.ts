// Georgia's affidavit of nonpayment (O.C.G.A. § 44-14-366(g)(2)) for one sent Georgia waiver. A
// Georgia waiver becomes conclusively effective 90 days after it was signed even when the money never
// came, unless the claimant files this affidavit in the property's county first. The form's wording
// comes only from packages/lien-waivers; its blanks are the waiver's own (county, contractor, work,
// project, city, county, owner, property, claimant), plus the waiver's date and amount and the amount
// still unpaid, which PayApps knows from the payments recorded on the application. Printing saves
// nothing. Crew plan and up to print, like the waivers. Not legal advice; see the package README.
//
// Once filed, the user records it (day, county, the clerk's book and page or instrument number) and
// then the copy the affidavit says goes to the owner "WITHIN SEVEN DAYS OF FILING" by registered or
// certified mail or statutory overnight delivery. The filing stops the ninety-day reminder and
// starts the seven-day one (src/shared/ga-waiver-clock.ts). Recording needs Crew, like the waivers.
//
// Part 4: the same closing paragraph sends a copy to the contractor at the notice of commencement's
// address when the filer has no contract with the owner and such a notice was filed. The user says
// whether that copy is owed and, once sent, records it apart from the owner's. After payment in full
// the user records the (g)(3) affidavit that payment was received, as signed and then as recorded in
// the county, which voids the affidavit of nonpayment. PayApps prints neither: (g)(3) gives no form.
//
// Mississippi (2026-11-26): the same service serves Mississippi's affidavit of nonpayment
// (Miss. Code Ann. § 85-7-433(3)) for a sent Mississippi waiver, with its sixty days and two-day copy
// (§ 85-7-419(5)(b)), the suspension once filed ((5)(e)) and the affidavit of payment in full ((5)(c)).
// The form comes from packages/lien-waivers' msAffidavitOfNonpayment; it has no blank for the amount
// unpaid. Mississippi's affidavit names no copy to a contractor, so the contractor-copy calls refuse
// a Mississippi waiver. The filing is stored in the same columns as Georgia's.
import {
  GA_AFFIDAVIT_ID,
  gaAffidavitOfNonpayment,
  MS_AFFIDAVIT_ID,
  msAffidavitOfNonpayment,
  renderNotice,
} from "@lien-waivers";
import type {
  GaAffidavitFilingBody,
  GaContractorCopyBody,
  GaPaidAffidavitBody,
} from "@shared/api/schemas";
import type { GaAffidavitDto, WaiverDto } from "@shared/api/types";
import { gaWaiverClocks, nonpaymentRule } from "@shared/ga-waiver-clock";
import { receivedCents as receivedOf } from "@shared/payments";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { lienWaivers, projects } from "../../db/schema";
import { badRequest } from "../../lib/errors";
import { assertLienWaivers } from "../billing";
import { findPayApp, loadBundle, paidAmountOf, paymentsOf } from "./bundle";
import { fieldErrors, followUpInput, getWaiver, waiverDto } from "./waivers";

/** A Georgia or Mississippi waiver, the only states whose affidavit of nonpayment PayApps has. */
async function loadGaWaiver(ctx: AppContext, orgId: string, payAppId: string, waiverId: string) {
  const row = await getWaiver(ctx, orgId, payAppId, waiverId);
  const rule = nonpaymentRule(row.state);
  if (!rule) {
    throw badRequest(
      "The affidavit of nonpayment is Georgia's (O.C.G.A. § 44-14-366(g)(2)) or Mississippi's (Miss. Code Ann. § 85-7-433(3)).",
    );
  }
  return Object.assign(row, { rule });
}

/** The state's statutory affidavit of nonpayment from packages/lien-waivers. */
function affidavitForm(state: "GA" | "MS") {
  return state === "MS"
    ? { form: msAffidavitOfNonpayment(), id: MS_AFFIDAVIT_ID }
    : { form: gaAffidavitOfNonpayment(), id: GA_AFFIDAVIT_ID };
}

export async function gaAffidavitOverview(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  waiverId: string,
): Promise<GaAffidavitDto> {
  const row = await loadGaWaiver(ctx, orgId, payAppId, waiverId);
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  const received =
    app.status === "paid" ? paidAmountOf(app, computed) : receivedOf(paymentsOf(b, payAppId));
  const today = ctx.now().toISOString().slice(0, 10);
  const [clock] = gaWaiverClocks(app, received, [{ ...followUpInput(row), id: row.id }], today);
  const { form } = affidavitForm(row.rule.state);
  const prefill: Record<string, string | number> = {};
  for (const f of form.fields) {
    const v = row.formData?.[f.key];
    if (v !== undefined && v !== "") prefill[f.key] = v;
  }
  prefill.waiverDate = (row.sentAt ?? row.createdAt).toISOString().slice(0, 10);
  prefill.waiverAmountCents = row.amountCents;
  // Georgia's form asks how much is still unpaid; Mississippi's has no such blank.
  if (form.fields.some((f) => f.key === "unpaidCents")) {
    prefill.unpaidCents = clock?.unpaidCents ?? Math.max(0, row.amountCents - received);
  }
  if (prefill.propertyCounty && !prefill.county) prefill.county = prefill.propertyCounty;
  return {
    form: {
      id: form.id,
      title: form.title,
      citation: form.citation.text,
      officialUrl: form.citation.officialUrl,
      sendTo: form.sendTo,
      fields: form.fields.map((f) => ({ ...f })),
      notes: [...form.notes],
    },
    prefill,
    clock: clock ?? null,
  };
}

/** The filled affidavit, checked by the package; throws with every field problem at once. */
export async function renderGaAffidavit(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
  fields: Record<string, string | number>,
) {
  await assertLienWaivers(ctx, orgId);
  const row = await loadGaWaiver(ctx, orgId, payAppId, waiverId);
  const { form, id } = affidavitForm(row.rule.state);
  const r = renderNotice(form, fields);
  if (!r.ok) throw fieldErrors(r.errors);
  const p = await ctx.db
    .select({ isSample: projects.isSample })
    .from(projects)
    .where(and(eq(projects.id, row.projectId), eq(projects.orgId, orgId)))
    .get();
  return {
    document: r.document,
    sample: p?.isSample ?? false,
    formId: id,
    state: row.rule.state,
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Record the affidavit as filed, or change the record (the copy to the owner is usually added a few
 * days later with the same call). Only on a Georgia or Mississippi waiver marked sent: a draft was never signed.
 * No day in the future; the copy not before the filing.
 */
export async function setGaAffidavitFiling(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
  input: GaAffidavitFilingBody,
): Promise<{ waiver: WaiverDto; copyAdded: boolean; filedChanged: boolean }> {
  await assertLienWaivers(ctx, orgId);
  const row = await loadGaWaiver(ctx, orgId, payAppId, waiverId);
  if (row.status !== "sent" || !row.sentAt) {
    throw badRequest(
      "Mark the waiver sent first: the affidavit of nonpayment is about a waiver you gave.",
    );
  }
  const today = isoDay(ctx.now());
  if (input.filedOn > today) throw badRequest("The filing date cannot be in the future.");
  if (input.copySentOn && input.copySentOn > today) {
    throw badRequest("The day the copy was sent cannot be in the future.");
  }
  if (input.copySentOn && input.copySentOn < input.filedOn) {
    throw badRequest("The copy to the owner is sent after the affidavit is filed.");
  }
  const copy = input.copySentOn && input.copyMethod;
  await ctx.db
    .update(lienWaivers)
    .set({
      gaAffidavitFiledOn: input.filedOn,
      gaAffidavitCounty: input.county,
      gaAffidavitRecording: input.recording || null,
      gaAffidavitCopySentOn: copy ? (input.copySentOn ?? null) : null,
      gaAffidavitCopyMethod: copy ? (input.copyMethod ?? null) : null,
      gaAffidavitCopyTracking: copy ? input.copyTracking || null : null,
    })
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, row.id)));
  return {
    waiver: await waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId),
    copyAdded: Boolean(copy) && row.gaAffidavitCopySentOn !== input.copySentOn,
    filedChanged:
      row.gaAffidavitFiledOn !== input.filedOn || row.gaAffidavitCounty !== input.county,
  };
}

/** Clear a filing recorded by mistake; the ninety-day reminder comes back. */
export async function clearGaAffidavitFiling(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
): Promise<WaiverDto> {
  await assertLienWaivers(ctx, orgId);
  const row = await loadGaWaiver(ctx, orgId, payAppId, waiverId);
  await ctx.db
    .update(lienWaivers)
    .set({
      gaAffidavitFiledOn: null,
      gaAffidavitCounty: null,
      gaAffidavitRecording: null,
      gaAffidavitCopySentOn: null,
      gaAffidavitCopyMethod: null,
      gaAffidavitCopyTracking: null,
      ...NO_CONTRACTOR_COPY,
      ...NO_PAID_AFFIDAVIT,
    })
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, row.id)));
  return waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId);
}

const NO_CONTRACTOR_COPY = {
  gaAffidavitContractorCopy: null,
  gaAffidavitContractorCopySentOn: null,
  gaAffidavitContractorCopyMethod: null,
  gaAffidavitContractorCopyTracking: null,
} as const;
const NO_PAID_AFFIDAVIT = {
  gaPaidAffidavitSignedOn: null,
  gaPaidAffidavitRecordedOn: null,
  gaPaidAffidavitRecording: null,
} as const;

/** A Georgia or Mississippi waiver with an affidavit of nonpayment recorded as filed, or a 400 saying what is missing. */
async function loadFiledGaWaiver(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
) {
  await assertLienWaivers(ctx, orgId);
  const row = await loadGaWaiver(ctx, orgId, payAppId, waiverId);
  if (!row.gaAffidavitFiledOn) {
    throw badRequest("Record the affidavit of nonpayment as filed first.");
  }
  return { row, filedOn: row.gaAffidavitFiledOn };
}

const noContractorCopy = () =>
  badRequest(
    "Mississippi's affidavit of nonpayment sends a copy to the owner only (Miss. Code Ann. § 85-7-433(3)); there is no contractor's copy to record.",
  );

/**
 * Whether the affidavit's copy to the contractor is owed and, when owed and sent, the day and how.
 * Not before the filing, not in the future.
 */
export async function setGaContractorCopy(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
  input: GaContractorCopyBody,
): Promise<{ waiver: WaiverDto; changed: boolean }> {
  const { row, filedOn } = await loadFiledGaWaiver(ctx, orgId, payAppId, waiverId);
  if (!row.rule.contractorCopy) throw noContractorCopy();
  const today = isoDay(ctx.now());
  if (input.sentOn && input.sentOn > today) {
    throw badRequest("The day the copy was sent cannot be in the future.");
  }
  if (input.sentOn && input.sentOn < filedOn) {
    throw badRequest("The copy to the contractor is sent after the affidavit is filed.");
  }
  const sent = input.copy === "owed" && input.sentOn && input.method;
  const next = {
    gaAffidavitContractorCopy: input.copy,
    gaAffidavitContractorCopySentOn: sent ? (input.sentOn ?? null) : null,
    gaAffidavitContractorCopyMethod: sent ? (input.method ?? null) : null,
    gaAffidavitContractorCopyTracking: sent ? input.tracking || null : null,
  };
  await ctx.db
    .update(lienWaivers)
    .set(next)
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, row.id)));
  return {
    waiver: await waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId),
    changed:
      row.gaAffidavitContractorCopy !== next.gaAffidavitContractorCopy ||
      row.gaAffidavitContractorCopySentOn !== next.gaAffidavitContractorCopySentOn,
  };
}

/** Clear the contractor's copy answer: the cash report asks again. */
export async function clearGaContractorCopy(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
): Promise<WaiverDto> {
  const { row } = await loadFiledGaWaiver(ctx, orgId, payAppId, waiverId);
  if (!row.rule.contractorCopy) throw noContractorCopy();
  await ctx.db
    .update(lienWaivers)
    .set(NO_CONTRACTOR_COPY)
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, row.id)));
  return waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId);
}

/**
 * Record the (g)(3) affidavit that payment in full was received: signed, then recorded in the county.
 * Only once the payments recorded cover the waiver (the statute's "paid, in full, the amount set
 * forth in the waiver"). Signed not before the filing; recorded not before signed; neither in the
 * future.
 */
export async function setGaPaidAffidavit(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
  input: GaPaidAffidavitBody,
): Promise<{ waiver: WaiverDto; signedChanged: boolean; recordedAdded: boolean }> {
  const { row, filedOn } = await loadFiledGaWaiver(ctx, orgId, payAppId, waiverId);
  const before = await waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId);
  const stage = before.gaClock?.stage;
  if (stage !== "paid-after-filing" && stage !== "released") {
    throw badRequest(
      `Record the payments that cover the waiver first: the affidavit of payment in full (${row.rule.paidCite}) comes after the claimant is paid in full.`,
    );
  }
  const today = isoDay(ctx.now());
  if (input.signedOn > today || (input.recordedOn && input.recordedOn > today)) {
    throw badRequest("The dates cannot be in the future.");
  }
  if (input.signedOn < filedOn) {
    throw badRequest(
      "The affidavit of payment is signed after the affidavit of nonpayment is filed.",
    );
  }
  if (input.recordedOn && input.recordedOn < input.signedOn) {
    throw badRequest("The affidavit of payment is recorded after it is signed.");
  }
  await ctx.db
    .update(lienWaivers)
    .set({
      gaPaidAffidavitSignedOn: input.signedOn,
      gaPaidAffidavitRecordedOn: input.recordedOn ?? null,
      gaPaidAffidavitRecording: input.recordedOn ? input.recording || null : null,
    })
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, row.id)));
  return {
    waiver: await waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId),
    signedChanged: row.gaPaidAffidavitSignedOn !== input.signedOn,
    recordedAdded:
      Boolean(input.recordedOn) && row.gaPaidAffidavitRecordedOn !== (input.recordedOn ?? null),
  };
}

/** Clear the (g)(3) record made by mistake. */
export async function clearGaPaidAffidavit(
  ctx: AppContext,
  orgId: string,
  payAppId: string,
  waiverId: string,
): Promise<WaiverDto> {
  const { row } = await loadFiledGaWaiver(ctx, orgId, payAppId, waiverId);
  await ctx.db
    .update(lienWaivers)
    .set(NO_PAID_AFFIDAVIT)
    .where(and(eq(lienWaivers.orgId, orgId), eq(lienWaivers.id, row.id)));
  return waiverWithClock(ctx, orgId, row.projectId, payAppId, waiverId);
}

async function waiverWithClock(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  waiverId: string,
): Promise<WaiverDto> {
  const row = await getWaiver(ctx, orgId, payAppId, waiverId);
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  const received =
    app.status === "paid" ? paidAmountOf(app, computed) : receivedOf(paymentsOf(b, payAppId));
  const [clock] = gaWaiverClocks(
    app,
    received,
    [{ ...followUpInput(row), id: row.id }],
    isoDay(ctx.now()),
  );
  return waiverDto(row, clock ?? null);
}
