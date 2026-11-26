// Funder detail: the relation plus a timeline computed on read from the rest of the app
// (applications and outcomes, awards and their reports, interactions, watchlist events, the
// foundation prospect with its 990-PF giving) and the funder's open opportunities.
// Every tenant query filters by orgId; global catalogs (funders, funder_profiles, opportunities
// with privateToOrgId = null, platform watch sources) are read as public data.
import {
  FUNDER_INTERACTION_LABELS,
  type FunderDetailResponse,
  type FunderOpenOpportunity,
  type FunderProspectInfo,
  type FunderTimelineItem,
} from "@shared/api/funders";
import type { ApplicationStatus } from "@shared/enums";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  funders,
  member,
  opportunities,
  user,
  watchEvents,
  watchSources,
} from "../../db/schema";
import { awardReports, awards } from "../../db/schema/awards";
import { funderProfiles, orgProspects } from "../../db/schema/prospects";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { normalizeFunderName } from "../discovery/catalog";
import { PROPUBLICA_ATTRIBUTION } from "../prospecting/propublica";
import { mergeTimeline } from "./model";
import {
  listContacts,
  listInteractions,
  loadRelation,
  type RelationRow,
  toRelationDto,
} from "./relations";
import { syncRelations, tolerateMissingTable } from "./sync";

const LIVE_APP_EXCLUDED: ApplicationStatus[] = ["withdrawn", "failed", "awarded", "declined"];

const money = (cents: number | null | undefined) =>
  cents == null
    ? null
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(cents / 100);

const humanize = (s: string) => s.replace(/_/g, " ");

/** Funder ids in the catalog that are this relation's funder (by id, else by normalized name). */
async function funderIdsFor(ctx: AppContext, rel: RelationRow): Promise<string[]> {
  if (rel.funderId) return [rel.funderId];
  const rows = await ctx.db
    .select({ id: funders.id })
    .from(funders)
    .where(eq(funders.normalizedName, rel.normalizedName))
    .all();
  return rows.map((r) => r.id);
}

const belongs =
  (rel: RelationRow, funderIds: string[]) => (o: { funderId: string | null; funderName: string }) =>
    (o.funderId !== null && funderIds.includes(o.funderId)) ||
    normalizeFunderName(o.funderName) === rel.normalizedName;

async function applicationItems(ctx: AppContext, orgId: string, rel: RelationRow, ids: string[]) {
  const rows = await ctx.db
    .select({
      id: applications.id,
      title: applications.title,
      status: applications.status,
      createdAt: applications.createdAt,
      submittedAt: applications.submittedAt,
      outcomeAt: applications.outcomeAt,
      awardedAmountCents: applications.awardedAmountCents,
      requestedAmountCents: applications.requestedAmountCents,
      opportunityId: applications.opportunityId,
      funderId: opportunities.funderId,
      funderName: opportunities.funderName,
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .where(eq(applications.orgId, orgId))
    .orderBy(desc(applications.createdAt))
    .limit(1000)
    .all();
  const mine = rows.filter(belongs(rel, ids));
  const items: FunderTimelineItem[] = [];
  for (const a of mine) {
    const link = `/applications/${a.id}`;
    items.push({
      id: `application:${a.id}`,
      kind: "application",
      at: a.createdAt.toISOString(),
      title: `Application started: ${a.title}`,
      detail: a.requestedAmountCents != null ? `Asking ${money(a.requestedAmountCents)}` : null,
      status: a.status,
      link,
    });
    if (a.submittedAt) {
      items.push({
        id: `submitted:${a.id}`,
        kind: "application",
        at: a.submittedAt.toISOString(),
        title: `Application submitted: ${a.title}`,
        detail: null,
        status: "submitted",
        link,
      });
    }
    if (a.outcomeAt && (a.status === "awarded" || a.status === "declined")) {
      items.push({
        id: `outcome:${a.id}`,
        kind: "outcome",
        at: a.outcomeAt.toISOString(),
        title:
          a.status === "awarded"
            ? `Awarded${a.awardedAmountCents != null ? ` ${money(a.awardedAmountCents)}` : ""}: ${a.title}`
            : `Declined: ${a.title}`,
        detail: null,
        status: a.status,
        link,
      });
    }
  }
  return { apps: mine, items };
}

async function awardItems(ctx: AppContext, orgId: string, rel: RelationRow, appIds: string[]) {
  const rows = await tolerateMissingTable(ctx, "awards", () =>
    ctx.db
      .select()
      .from(awards)
      .where(eq(awards.orgId, orgId))
      .orderBy(desc(awards.createdAt))
      .limit(500)
      .all(),
  );
  const mine = rows.filter(
    (w) =>
      (w.applicationId !== null && appIds.includes(w.applicationId)) ||
      normalizeFunderName(w.funderName) === rel.normalizedName,
  );
  const items: FunderTimelineItem[] = mine.map((w) => ({
    id: `award:${w.id}`,
    kind: "award",
    at: w.createdAt.toISOString(),
    title: `Award recorded: ${w.title}`,
    detail:
      [
        money(w.amountCents),
        w.startDate && w.endDate ? `${w.startDate} to ${w.endDate}` : null,
        w.grantNumber ? `Grant ${w.grantNumber}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    status: null,
    link: w.applicationId ? `/applications/${w.applicationId}` : null,
  }));
  const awardIds = mine.map((w) => w.id);
  const reports = awardIds.length
    ? (
        await Promise.all(
          chunk(awardIds, D1_IN_CHUNK).map((part) =>
            tolerateMissingTable(ctx, "award_reports", () =>
              ctx.db
                .select()
                .from(awardReports)
                .where(and(eq(awardReports.orgId, orgId), inArray(awardReports.awardId, part)))
                .orderBy(asc(awardReports.dueAt))
                .all(),
            ),
          ),
        )
      ).flat()
    : [];
  for (const r of reports) {
    const submitted = r.status === "submitted" && r.submittedAt;
    items.push({
      id: `report:${r.id}`,
      kind: "report",
      at: (submitted ? (r.submittedAt as Date) : r.dueAt).toISOString(),
      title: submitted
        ? `${humanize(r.kind)} report submitted`
        : `${humanize(r.kind)} report due`.replace(/^./, (c) => c.toUpperCase()),
      detail: `Period ${r.periodStart} to ${r.periodEnd}`,
      status: r.status,
      link: null,
    });
  }
  return items;
}

async function watchItems(ctx: AppContext, orgId: string, rel: RelationRow, oppIds: Set<string>) {
  const sources = await ctx.db
    .select({ id: watchSources.id, funderName: watchSources.funderName, label: watchSources.label })
    .from(watchSources)
    .where(or(eq(watchSources.orgId, orgId), isNull(watchSources.orgId)))
    .limit(500)
    .all();
  const mine = sources.filter(
    (s) =>
      (s.funderName && normalizeFunderName(s.funderName) === rel.normalizedName) ||
      (s.label && normalizeFunderName(s.label) === rel.normalizedName),
  );
  const sourceIds = mine.map((s) => s.id);
  const visible = or(
    eq(watchEvents.orgId, orgId),
    and(isNull(watchEvents.orgId), inArray(watchEvents.kind, ["changed", "opportunity_found"])),
  );
  const rows = (
    await Promise.all(
      chunk(sourceIds, D1_IN_CHUNK).map((part) =>
        ctx.db
          .select()
          .from(watchEvents)
          .where(and(visible, inArray(watchEvents.sourceId, part)))
          .orderBy(desc(watchEvents.createdAt))
          .limit(100)
          .all(),
      ),
    )
  ).flat();
  // Opportunities this funder posted that a watch source found (even from another funder's page).
  const oppList = [...oppIds];
  const byOpp = (
    await Promise.all(
      chunk(oppList, D1_IN_CHUNK).map((part) =>
        ctx.db
          .select()
          .from(watchEvents)
          .where(and(visible, inArray(watchEvents.opportunityId, part)))
          .orderBy(desc(watchEvents.createdAt))
          .limit(100)
          .all(),
      ),
    )
  ).flat();
  return [...rows, ...byOpp].map(
    (e): FunderTimelineItem => ({
      id: `watch:${e.id}`,
      kind: "watch_event",
      at: e.createdAt.toISOString(),
      title:
        e.kind === "opportunity_found"
          ? "Watchlist found a new opportunity"
          : e.kind === "changed"
            ? "Funder page changed"
            : "Watchlist check failed",
      detail: e.summary || null,
      status: e.kind,
      link: e.opportunityId ? `/opportunities/${e.opportunityId}` : null,
    }),
  );
}

async function prospectInfo(
  ctx: AppContext,
  orgId: string,
  ein: string | null,
): Promise<{ info: FunderProspectInfo | null; items: FunderTimelineItem[] }> {
  if (!ein) return { info: null, items: [] };
  const profile = await ctx.db
    .select()
    .from(funderProfiles)
    .where(eq(funderProfiles.ein, ein))
    .get();
  if (!profile) return { info: null, items: [] };
  const prospect = await ctx.db
    .select()
    .from(orgProspects)
    .where(and(eq(orgProspects.orgId, orgId), eq(orgProspects.ein, ein)))
    .get();
  const sample = profile.source === "sample";
  const info: FunderProspectInfo = {
    prospectId: prospect?.id ?? null,
    status: prospect?.status ?? null,
    fitScore: prospect?.fitScore ?? null,
    ein: profile.ein,
    name: profile.name,
    city: profile.city,
    state: profile.state,
    totalGivingCents: profile.totalGivingCents,
    totalAssetsCents: profile.totalAssetsCents,
    latestFilingYear: profile.latestFilingYear,
    website: profile.website,
    propublicaUrl: profile.propublicaUrl,
    attribution: {
      text: sample
        ? "Fictional sample foundation for the offline demo. Not real IRS data."
        : PROPUBLICA_ATTRIBUTION,
      source: sample ? "Fictional sample data" : "ProPublica Nonprofit Explorer",
      url: profile.propublicaUrl,
      fetchedAt: profile.fetchedAt.toISOString(),
    },
  };
  const items: FunderTimelineItem[] = [];
  if (prospect) {
    const giving =
      profile.totalGivingCents != null && profile.latestFilingYear != null
        ? `990-PF ${profile.latestFilingYear}: ${money(profile.totalGivingCents)} in grants paid (ProPublica Nonprofit Explorer)`
        : null;
    items.push({
      id: `prospect:${prospect.id}`,
      kind: "prospect",
      at: prospect.createdAt.toISOString(),
      title: `Added as a foundation prospect (fit ${prospect.fitScore})`,
      detail: giving,
      status: prospect.status,
      link: "/sourcing?tab=prospects",
    });
  }
  return { info, items };
}

async function openOpportunities(
  ctx: AppContext,
  orgId: string,
  funderIds: string[],
  liveAppOppIds: Set<string>,
): Promise<FunderOpenOpportunity[]> {
  if (funderIds.length === 0) return [];
  const now = ctx.now();
  const rows = await ctx.db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      closeDate: opportunities.closeDate,
      awardCeilingCents: opportunities.awardCeilingCents,
    })
    .from(opportunities)
    .where(
      and(
        inArray(opportunities.funderId, funderIds.slice(0, D1_IN_CHUNK)),
        or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
        inArray(opportunities.status, ["posted", "forecasted"]),
        or(isNull(opportunities.closeDate), gt(opportunities.closeDate, now)),
      ),
    )
    .orderBy(asc(opportunities.closeDate))
    .limit(20)
    .all();
  return rows.map((o) => ({
    id: o.id,
    title: o.title,
    closeDate: o.closeDate ? o.closeDate.toISOString() : null,
    awardCeilingCents: o.awardCeilingCents,
    hasActiveApplication: liveAppOppIds.has(o.id),
  }));
}

export async function getFunderDetail(
  ctx: AppContext,
  orgId: string,
  id: string,
  canEdit: boolean,
): Promise<FunderDetailResponse> {
  await syncRelations(ctx, orgId);
  const rel = await loadRelation(ctx, orgId, id);
  const funderIds = await funderIdsFor(ctx, rel);
  const funder = funderIds[0]
    ? ((await ctx.db
        .select({
          id: funders.id,
          name: funders.name,
          type: funders.type,
          websiteUrl: funders.websiteUrl,
          ein: funders.ein,
        })
        .from(funders)
        .where(eq(funders.id, funderIds[0]))
        .get()) ?? null)
    : null;

  const [{ apps, items: appTimeline }, contacts, interactions, members] = await Promise.all([
    applicationItems(ctx, orgId, rel, funderIds),
    listContacts(ctx, orgId, rel.id),
    listInteractions(ctx, orgId, rel.id),
    ctx.db
      .select({ userId: member.userId, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId))
      .orderBy(user.name)
      .limit(200)
      .all(),
  ]);
  const appIds = apps.map((a) => a.id);
  const oppIds = new Set(apps.map((a) => a.opportunityId));
  const liveAppOppIds = new Set(
    apps.filter((a) => !LIVE_APP_EXCLUDED.includes(a.status)).map((a) => a.opportunityId),
  );
  const ein = rel.prospectEin ?? (funder?.ein ? funder.ein.replace(/\D/g, "") : null);
  const [awardTimeline, watchTimeline, prospect, open] = await Promise.all([
    awardItems(ctx, orgId, rel, appIds),
    watchItems(ctx, orgId, rel, oppIds),
    prospectInfo(ctx, orgId, ein),
    openOpportunities(ctx, orgId, funderIds, liveAppOppIds),
  ]);

  const interactionTimeline: FunderTimelineItem[] = interactions.map((i) => ({
    id: `interaction:${i.id}`,
    kind: "interaction",
    at: i.occurredAt,
    title: FUNDER_INTERACTION_LABELS[i.kind],
    detail: i.summary,
    status: i.kind,
    link: null,
  }));
  const nextStep: FunderTimelineItem[] = rel.nextStepAt
    ? [
        {
          id: `next_step:${rel.id}`,
          kind: "next_step",
          at: rel.nextStepAt.toISOString(),
          title: rel.nextStepNote ? `Next step: ${rel.nextStepNote}` : "Next step",
          detail: null,
          status: rel.nextStepAt.getTime() < ctx.now().getTime() ? "overdue" : "scheduled",
          link: null,
        },
      ]
    : [];

  return {
    relation: toRelationDto(rel),
    funder: funder
      ? { id: funder.id, name: funder.name, type: funder.type, websiteUrl: funder.websiteUrl }
      : null,
    prospect: prospect.info,
    contacts,
    interactions,
    timeline: mergeTimeline(
      [nextStep, appTimeline, awardTimeline, interactionTimeline, watchTimeline, prospect.items],
      ctx.now(),
    ),
    openOpportunities: open,
    members,
    canEdit,
  };
}
