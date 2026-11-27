// The Miller Act 90-day notice drafted from a federal job (Crew plan and up, with lien waivers and
// the other notices). A company that contracted with one of the prime's subcontractors gives the
// prime written notice within 90 days of its last day before it may sue on the payment bond
// (40 U.S.C. § 3133(b)(2)); the job page already counts that date (src/shared/public-jobs.ts).
// This fills the notice from what the job holds: the company, the job, the GC on the job as the
// party the work was furnished to (on a second-tier job that is the prime's sub, who bills the
// prime), the saved last day, and the unpaid amount from the cash report (billed and not paid,
// plus retainage held). The prime's name and address are the user's to type: PayApps knows the
// party it bills, not the contractor above it. Wording and checks come from packages/lien-waivers
// (src/us-miller.ts). Printing saves nothing. Not legal advice.
import { millerActNotice, renderNotice } from "@lien-waivers";
import type { MillerNoticeDto, NoticeFormDto } from "@shared/api/types";
import { projectCash } from "@shared/cash-report";
import { formatCents } from "@shared/money";
import { millerDates } from "@shared/public-jobs";
import type { AppContext } from "../../context";
import { badRequest } from "../../lib/errors";
import { assertLienWaivers, orgPlan } from "../billing";
import { loadBundle } from "./bundle";
import { isoDay, toCashInput } from "./cash";
import { fieldErrors, orgName } from "./waivers";

function noticeDto(): NoticeFormDto {
  const n = millerActNotice();
  return {
    id: n.id,
    title: n.title,
    citation: n.citation.text,
    officialUrl: n.citation.officialUrl,
    sendTo: n.sendTo,
    fields: n.fields.map((f) => ({ ...f })),
    notes: [...n.notes],
  };
}

function applies(publicOwner: string | null, tier: string | null): MillerNoticeDto["applies"] {
  if (publicOwner !== "federal") return "not-federal";
  if (tier === "second") return "needed";
  if (tier === "first") return "not-needed";
  if (tier === "remote") return "not-covered";
  return "unsure";
}

export async function millerNoticeOverview(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<MillerNoticeDto> {
  const [b, { plan }, claimant] = await Promise.all([
    loadBundle(ctx, orgId, projectId),
    orgPlan(ctx, orgId),
    orgName(ctx, orgId),
  ]);
  const p = b.project;
  const cash = projectCash(toCashInput(b), isoDay(ctx.now()));
  const unpaid = cash.outstandingCents + cash.retainageHeldCents;
  const prefill: Record<string, string> = {
    noticeDate: isoDay(ctx.now()),
    project: [p.name, p.location].filter(Boolean).join("\n"),
    claimant,
    furnishedTo: [p.gcName, p.gcAddress].filter(Boolean).join("\n"),
  };
  if (unpaid > 0) prefill.amountClaimed = formatCents(unpaid);
  if (p.lastFurnishedOn) prefill.lastDay = p.lastFurnishedOn;
  const dates = p.lastFurnishedOn ? millerDates(p.lastFurnishedOn, p.millerTier ?? null) : null;
  return {
    enabled: plan.lienWaivers,
    applies: applies(p.publicOwner ?? null, p.millerTier ?? null),
    notice: noticeDto(),
    prefill,
    outstandingCents: cash.outstandingCents,
    retainageHeldCents: cash.retainageHeldCents,
    lastFurnishedOn: p.lastFurnishedOn ?? null,
    noticeDueOn: dates?.noticeDueOn ?? null,
  };
}

/** The filled notice, checked by the package; throws with every field problem at once. */
export async function renderMillerNotice(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: { fields: Record<string, string> },
) {
  await assertLienWaivers(ctx, orgId);
  const b = await loadBundle(ctx, orgId, projectId);
  if (b.project.publicOwner !== "federal") {
    throw badRequest(
      "Mark the job as owned by the federal government first (the lien deadline panel)",
    );
  }
  const r = renderNotice(millerActNotice(), input.fields);
  if (!r.ok) throw fieldErrors(r.errors);
  return { document: r.document, sample: b.project.isSample };
}
