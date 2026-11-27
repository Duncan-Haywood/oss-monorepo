// Texas notices of claim for unpaid labor or materials (Tex. Prop. Code § 53.056), under the notice
// panel when the job's state is TX. The company says once whether the job is a residential
// construction project (saved with the job: projects.tx_project_kind); each unpaid submitted or
// certified application then gets its notice date from its period, as the cash report computes it
// (src/shared/tx-notice-claims.ts), and a notice sent is recorded on the application (the day and
// the § 53.003(b) method, which a lien affidavit must state, § 53.054(a)(8)). The cash page and the
// weekly email remind until one is recorded or the application is paid. Crew plan and up, like the
// notice. Not legal advice; see the package README.
import {
  TX_NOTICE_METHOD_LABELS,
  TX_NOTICE_METHODS,
  TX_PROJECT_KIND_LABELS,
  TX_PROJECT_KINDS,
  type TxNoticeMethod,
  type TxProjectKind,
} from "@lien-waivers";
import type { TxNoticeLogDto } from "@shared/api/types";
import { projectCash } from "@shared/cash-report";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { payApps, projects } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { assertLienWaivers } from "../billing";
import { loadBundle } from "./bundle";
import { isoDay, toCashInput } from "./cash";

async function loadProject(ctx: AppContext, orgId: string, projectId: string) {
  const p = await ctx.db
    .select({ txProjectKind: projects.txProjectKind, isSample: projects.isSample })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!p) throw notFound("Project");
  return p;
}

export async function txNoticeLog(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<TxNoticeLogDto> {
  const p = await loadProject(ctx, orgId, projectId);
  const kind = p.txProjectKind ?? null;
  const claims = kind
    ? projectCash(toCashInput(await loadBundle(ctx, orgId, projectId)), isoDay(ctx.now()))
        .txNoticeClaims
    : [];
  return {
    kind,
    kinds: TX_PROJECT_KINDS.map((id) => ({ id, label: TX_PROJECT_KIND_LABELS[id] })),
    methods: TX_NOTICE_METHODS.map((id) => ({ id, label: TX_NOTICE_METHOD_LABELS[id] })),
    claims,
  };
}

/** Turn Texas notices of claim on for the job (residential or not), or off (null). */
export async function setTxProjectKind(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  kind: TxProjectKind | null,
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  await ctx.db
    .update(projects)
    .set({ txProjectKind: kind })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return { kind, changed: (p.txProjectKind ?? null) !== kind, isSample: p.isSample };
}

/** Record a § 53.056 notice of claim as sent for one application, or clear the record (null). */
export async function setTxNoticeSent(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  sent: { sentOn: string; method: TxNoticeMethod } | null,
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  const a = await ctx.db
    .select({
      number: payApps.number,
      status: payApps.status,
      periodFrom: payApps.periodFrom,
      txNoticeSentOn: payApps.txNoticeSentOn,
      txNoticeMethod: payApps.txNoticeMethod,
    })
    .from(payApps)
    .where(
      and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId), eq(payApps.projectId, projectId)),
    )
    .get();
  if (!a) throw notFound("Pay application");
  if (sent && a.status === "draft") {
    throw badRequest(
      "A draft has not gone to the GC: a notice of claim is for work billed and unpaid.",
    );
  }
  if (sent && sent.sentOn < a.periodFrom) {
    throw badRequest(`The notice is dated before the period it claims starts (${a.periodFrom}).`);
  }
  await ctx.db
    .update(payApps)
    .set({ txNoticeSentOn: sent?.sentOn ?? null, txNoticeMethod: sent?.method ?? null })
    .where(and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId)));
  return {
    number: a.number,
    isSample: p.isSample,
    changed:
      (a.txNoticeSentOn ?? null) !== (sent?.sentOn ?? null) ||
      (a.txNoticeMethod ?? null) !== (sent?.method ?? null),
  };
}
