// Cash report across an org's jobs (src/shared/cash-report.ts holds the math). Every project's
// applications are recomputed from their entries, as everywhere else: nothing derived is stored.
import { type CaNoticeRecipient, caNoticeDueOn } from "@lien-waivers";
import { type CashReport, type CashReportProjectInput, cashReport } from "@shared/cash-report";
import {
  type CloseoutItemFacts,
  type CloseoutReadiness,
  closeoutReadiness,
  summarizeCloseout,
} from "@shared/closeout";
import { centsToDecimal } from "@shared/money";
import { type PunchItemFacts, summarizePunchList } from "@shared/punch-list";
import type { WaiverFollowUpInput } from "@shared/waiver-followup";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { closeoutItems, lienNoticeSends, lienWaivers, projects, punchItems } from "../../db/schema";
import { csvCell } from "../export/csv";
import { loadBundle, type ProjectBundle, paymentsOf } from "./bundle";
import { retainagePosition } from "./closeout";
import { missingRecipients } from "./notices";
import { followUpInput } from "./waivers";

/** Today in UTC as YYYY-MM-DD (the report's "as of" date). */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function toCashInput(
  b: ProjectBundle,
  waivers: ReadonlyMap<string, WaiverFollowUpInput[]> = new Map(),
  noticeSends: ReadonlyMap<string, { recipient: CaNoticeRecipient }[]> = new Map(),
  closeouts: ReadonlyMap<string, CloseoutReadiness> = new Map(),
): CashReportProjectInput {
  const p = b.project;
  const missing = p.caFirstFurnishedOn ? missingRecipients(noticeSends.get(p.id) ?? []) : [];
  const approvedChanges = b.changeOrders
    .filter((co) => co.status === "approved")
    .reduce((s, co) => s + co.items.reduce((t, i) => t + i.amountCents, 0), 0);
  const computedById = new Map(b.computed.map((c) => [c.periodId, c]));
  return {
    id: p.id,
    name: p.name,
    number: p.number,
    gcName: p.gcName,
    gcBillingName: p.gcBillingName,
    gcBillingEmail: p.gcBillingEmail,
    status: p.status,
    originalContractSumCents: p.originalContractSumCents,
    contractSumToDateCents: p.originalContractSumCents + approvedChanges,
    payTermsDays: p.payTermsDays,
    payTermsBasis: p.payTermsBasis,
    payTermsOuterDays: p.payTermsOuterDays,
    billingDay: p.billingDay,
    closeout: closeouts.get(p.id) ?? null,
    caNotice:
      p.caFirstFurnishedOn && missing.length > 0
        ? {
            dueOn: caNoticeDueOn(p.caFirstFurnishedOn),
            missing: missing.map((m) => (m === "owner" ? "owner" : "direct contractor")),
          }
        : null,
    changeOrders: b.changeOrders.map((co) => ({
      id: co.id,
      number: co.number,
      description: co.description,
      status: co.status,
      amountCents: co.items.reduce((s, i) => s + i.amountCents, 0),
      submittedOn: co.submittedOn,
      createdOn: isoDay(co.createdAt),
      lastEmailedOn: co.lastEmailedOn,
    })),
    apps: b.payApps.flatMap((a) => {
      const c = computedById.get(a.id);
      if (!c) return [];
      return [
        {
          id: a.id,
          number: a.number,
          status: a.status,
          applicationDate: a.applicationDate,
          periodTo: a.periodTo,
          submittedOn: a.submittedAt ? isoDay(a.submittedAt) : null,
          certifiedAmountCents: a.certifiedAmountCents,
          ownerPaidOn: a.ownerPaidOn,
          summary: c.summary,
          totals: c.totals,
          payments: paymentsOf(b, a.id).map((p) => ({
            amountCents: p.amountCents,
            receivedOn: p.receivedOn,
          })),
          waivers: waivers.get(a.id) ?? [],
          shortClose:
            a.shortClosedCents !== null && a.shortReason && a.shortClosedOn
              ? {
                  cents: a.shortClosedCents,
                  reason: a.shortReason,
                  note: a.shortNote,
                  closedOn: a.shortClosedOn,
                }
              : null,
        },
      ];
    }),
  };
}

export async function orgCashReport(
  ctx: AppContext,
  orgId: string,
  opts: { excludeSample?: boolean } = {},
): Promise<CashReport> {
  const rows = await ctx.db
    .select({ id: projects.id })
    .from(projects)
    .where(
      opts.excludeSample
        ? and(eq(projects.orgId, orgId), eq(projects.isSample, false))
        : eq(projects.orgId, orgId),
    )
    .orderBy(asc(projects.createdAt));
  const bundles: ProjectBundle[] = [];
  // One project at a time: D1 serializes queries anyway, and this keeps memory flat.
  for (const r of rows) bundles.push(await loadBundle(ctx, orgId, r.id));
  const waiverRows = await ctx.db
    .select({
      payAppId: lienWaivers.payAppId,
      kind: lienWaivers.kind,
      status: lienWaivers.status,
      state: lienWaivers.state,
      amountCents: lienWaivers.amountCents,
      sentAt: lienWaivers.sentAt,
      gaAffidavitFiledOn: lienWaivers.gaAffidavitFiledOn,
      gaAffidavitCounty: lienWaivers.gaAffidavitCounty,
      gaAffidavitCopySentOn: lienWaivers.gaAffidavitCopySentOn,
      gaAffidavitContractorCopy: lienWaivers.gaAffidavitContractorCopy,
      gaAffidavitContractorCopySentOn: lienWaivers.gaAffidavitContractorCopySentOn,
      gaPaidAffidavitSignedOn: lienWaivers.gaPaidAffidavitSignedOn,
      gaPaidAffidavitRecordedOn: lienWaivers.gaPaidAffidavitRecordedOn,
    })
    .from(lienWaivers)
    .where(eq(lienWaivers.orgId, orgId))
    .orderBy(asc(lienWaivers.createdAt));
  const waivers = new Map<string, WaiverFollowUpInput[]>();
  for (const w of waiverRows) {
    const list = waivers.get(w.payAppId) ?? [];
    list.push(followUpInput(w));
    waivers.set(w.payAppId, list);
  }
  const sendRows = await ctx.db
    .select({ projectId: lienNoticeSends.projectId, recipient: lienNoticeSends.recipient })
    .from(lienNoticeSends)
    .where(eq(lienNoticeSends.orgId, orgId));
  const noticeSends = new Map<string, { recipient: CaNoticeRecipient }[]>();
  for (const r of sendRows) {
    const list = noticeSends.get(r.projectId) ?? [];
    list.push(r);
    noticeSends.set(r.projectId, list);
  }
  const asOf = isoDay(ctx.now());
  const closeouts = await closeoutReadinessByJob(ctx, orgId, bundles, asOf);
  return cashReport(
    bundles.map((b) => toCashInput(b, waivers, noticeSends, closeouts)),
    asOf,
  );
}

/**
 * Each finished job's close-out checklist read with its punch list and retainage, as the job page
 * reads it (services/payapps/closeout.ts, listCloseout), so the cash report can say what the
 * retainage on finished work still waits on. Two queries for the whole company, grouped by job;
 * only jobs whose work is complete with retainage held, and that have a close-out document or a
 * punch item entered, are read.
 */
export async function closeoutReadinessByJob(
  ctx: AppContext,
  orgId: string,
  bundles: ProjectBundle[],
  asOf: string,
): Promise<Map<string, CloseoutReadiness>> {
  const out = new Map<string, CloseoutReadiness>();
  const finished = bundles
    .map((b) => ({ id: b.project.id, retainage: retainagePosition(b) }))
    .filter((j) => j.retainage.workComplete && j.retainage.heldCents > 0);
  if (finished.length === 0) return out;
  const [docs, punch] = await Promise.all([
    ctx.db.select().from(closeoutItems).where(eq(closeoutItems.orgId, orgId)).all(),
    ctx.db.select().from(punchItems).where(eq(punchItems.orgId, orgId)).all(),
  ]);
  const group = <T extends { projectId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.projectId, [...(m.get(r.projectId) ?? []), r]);
    return m;
  };
  const docsByJob = group(docs);
  const punchByJob = group(punch);
  for (const j of finished) {
    const items: CloseoutItemFacts[] = docsByJob.get(j.id) ?? [];
    const punchList: PunchItemFacts[] = punchByJob.get(j.id) ?? [];
    // A job with neither list started does not use them: its retainage keeps the plain "bill it"
    // step rather than being reported as waiting on a checklist nobody keeps.
    if (items.length === 0 && punchList.length === 0) continue;
    out.set(
      j.id,
      closeoutReadiness(
        summarizeCloseout(items, asOf),
        summarizePunchList(punchList, asOf),
        j.retainage,
      ),
    );
  }
  return out;
}

const amt = (cents: number) => Number(centsToDecimal(cents));

/** One row per job, for a bookkeeper's spreadsheet. */
export function cashReportCsv(r: CashReport): string {
  const header = [
    "Job",
    "Job number",
    "General contractor",
    "Status",
    "Contract sum to date",
    "Completed to date",
    "% complete",
    "Applied (sent applications)",
    "Paid",
    "Outstanding",
    "Oldest unpaid (days)",
    "Retainage held",
    "Retainage held since (days)",
    "Work complete",
    "Last application",
    "Next step",
    "Pay terms (days)",
    "Pay terms count from",
    "Past due",
    "Due in the next 30 days",
    "Unconditional waivers to send",
    "Pending change orders (additions)",
    "Pending change orders",
    "Backcharged",
    "Disputed (closed short)",
    "Written off",
    "Waiting on the owner's payment (pay-when-paid)",
    "Pay-when-paid outer limit (days from the application date)",
    "Retainage waiting on close-out",
  ];
  const rows = r.projects.map((p) => [
    p.name,
    p.number,
    p.gcName,
    p.status,
    amt(p.contractSumToDateCents),
    amt(p.completedToDateCents),
    p.percentComplete,
    amt(p.appliedCents),
    amt(p.paidCents),
    amt(p.outstandingCents),
    p.outstanding.length ? Math.max(...p.outstanding.map((o) => o.ageDays)) : null,
    amt(p.retainageHeldCents),
    p.retainageAgeDays,
    p.workComplete ? "yes" : "no",
    p.lastApplication ? `#${p.lastApplication.number} (${p.lastApplication.status})` : null,
    p.actions.join(" "),
    p.payTermsDays,
    p.payTermsDays === null
      ? null
      : p.payTermsBasis === "period_end"
        ? "period end"
        : p.payTermsBasis === "owner_paid"
          ? "owner's payment to the GC"
          : "application date",
    p.payTermsDays === null ? null : amt(p.pastDueCents),
    p.payTermsDays === null ? null : amt(p.dueNext30Cents),
    p.waiversToSend
      .map((w) => `#${w.number} ${w.scope}${w.reason === "unsent" ? " (saved, not sent)" : ""}`)
      .join("; ") || null,
    amt(p.pendingChangeCents),
    p.pendingChanges
      .map(
        (c) =>
          `${c.number} ${amt(c.amountCents)} (${c.ageDays} days since ${c.agedFrom === "sent" ? `sent ${c.submittedOn}` : "entered"}${c.lastEmailedOn ? `; last emailed ${c.lastEmailedOn}` : ""})`,
      )
      .join("; ") || null,
    amt(p.backchargedCents),
    amt(p.disputedCents),
    amt(p.writtenOffCents),
    p.payTermsBasis === "owner_paid" && p.payTermsDays !== null ? amt(p.awaitingOwnerCents) : null,
    p.payTermsDays === null ? null : p.payTermsOuterDays,
    p.closeout
      ? p.closeout.ready
        ? "none: the close-out checklist is in"
        : p.closeout.blockers.join(" ")
      : null,
  ]);
  const t = r.totals;
  const total = [
    "Total",
    null,
    null,
    null,
    amt(t.contractSumToDateCents),
    null,
    null,
    amt(t.appliedCents),
    amt(t.paidCents),
    amt(t.outstandingCents),
    null,
    amt(t.retainageHeldCents),
    null,
    null,
    null,
    null,
    null,
    amt(t.pastDueCents),
    amt(t.dueNext30Cents),
    t.waiversToSend || null,
    amt(t.pendingChangeCents),
    t.pendingChangeOrders || null,
    amt(t.backchargedCents),
    amt(t.disputedCents),
    amt(t.writtenOffCents),
    amt(t.awaitingOwnerCents),
    null,
    amt(t.retainageWaitingOnCloseoutCents),
  ];
  const lines = [
    header,
    ...rows,
    total,
    [
      `As of ${r.asOf}. Drafts are not counted. Past due and the next 30 days count only jobs with pay terms set, and on pay-when-paid jobs only applications whose owner payment to the GC is recorded or whose job has an outer limit (the rest is under "Waiting on the owner's payment"). Pending change orders (additions) adds up those waiting for the GC's approval that add money; deductions are listed but not added. Backcharged, disputed and written off are balances of applications paid short that were closed: they count as neither paid nor outstanding.`,
    ],
  ];
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
