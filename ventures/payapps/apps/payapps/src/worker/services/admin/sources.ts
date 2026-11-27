// Sign-ups by the page they came from, for the owner's metrics: which front door (a free guide or
// tool, the marketing site) brings accounts whose companies go on to send a pay application and pay.
// Cross-tenant, so it selects ids, statuses and the source page name only: no names, emails, jobs
// or amounts. The sample job's pay applications never count, as on the getting-started checklist.
import type { SignupSourceRow, SignupSources } from "@admin-metrics";
import { catalog } from "@shared/plans";
import { signupSourceSite } from "@shared/signup-source";
import { and, eq, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, payApps, projects, signupSources, subscriptions, user } from "../../db/schema";

const NONE = "(none)";

export async function signupSourceCounts(ctx: AppContext, since: Date): Promise<SignupSources> {
  const { db } = ctx;
  const [users, sources, members, sentOrgs, subs] = await Promise.all([
    db
      .select({ id: user.id, createdAt: user.createdAt, verified: user.emailVerified })
      .from(user)
      .all(),
    db
      .select({ userId: signupSources.userId, source: signupSources.source })
      .from(signupSources)
      .all(),
    db.select({ userId: member.userId, orgId: member.organizationId }).from(member).all(),
    db
      .selectDistinct({ orgId: payApps.orgId })
      .from(payApps)
      .innerJoin(projects, eq(projects.id, payApps.projectId))
      .where(and(ne(payApps.status, "draft"), eq(projects.isSample, false)))
      .all(),
    db
      .select({
        orgId: subscriptions.orgId,
        planKey: subscriptions.planKey,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .all(),
  ]);

  const sourceOf = new Map(sources.map((s) => [s.userId, s.source]));
  const orgsOf = new Map<string, string[]>();
  for (const m of members) orgsOf.set(m.userId, [...(orgsOf.get(m.userId) ?? []), m.orgId]);
  const sent = new Set(sentOrgs.map((o) => o.orgId));
  const paid = new Set(
    subs
      .filter(
        (s) =>
          (s.status === "active" || s.status === "past_due") && catalog.isPurchasable(s.planKey),
      )
      .map((s) => s.orgId),
  );

  const rows = new Map<string, SignupSourceRow>();
  for (const u of users) {
    const source = sourceOf.get(u.id) ?? NONE;
    const row = rows.get(source) ?? {
      source,
      site: source === NONE ? NONE : signupSourceSite(source),
      signups: 0,
      lastWindow: 0,
      verified: 0,
      withCompany: 0,
      reachedOutcome: 0,
      paying: 0,
    };
    const orgs = orgsOf.get(u.id) ?? [];
    row.signups++;
    if (u.createdAt >= since) row.lastWindow++;
    if (u.verified) row.verified++;
    if (orgs.length) row.withCompany++;
    if (orgs.some((o) => sent.has(o))) row.reachedOutcome++;
    if (orgs.some((o) => paid.has(o))) row.paying++;
    rows.set(source, row);
  }

  return {
    definition:
      "Source: the page on our sites whose Start free link the account arrived on (the link's " +
      "`from`), recorded once within 14 days of sign-up; (none) is every account without one " +
      "(typed the address, an invitation, or signed up before sources were recorded). Outcome: " +
      "a company the account belongs to sent a pay application on a real job (not the sample). " +
      "Paying: that company is on a paid plan now.",
    rows: [...rows.values()].sort((a, b) =>
      a.source === NONE
        ? 1
        : b.source === NONE
          ? -1
          : b.signups - a.signups || a.source.localeCompare(b.source),
    ),
  };
}
