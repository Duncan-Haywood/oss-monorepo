// Discovery: AI query plans (cache + re-plan), planned searches in runs, Simpler.Grants.gov
// adapter + dedupe with Grants.gov, forecast -> posted transitions and the daily status sweep.
import { env } from "cloudflare:workers";
import { createAppContext } from "@worker/context";
import {
  applications,
  discoveryRuns,
  facts,
  opportunities,
  orgProfiles,
  projects,
} from "@worker/db/schema";
import { discoveryPlans } from "@worker/db/schema/discovery-plans";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { FakeLlm } from "@worker/ports/fake-llm";
import {
  ensureOrgPlan,
  PLAN_QUERIES_PURPOSE,
  runGrantsGovDiscovery,
  runSimplerDiscovery,
  sweepOpportunityStatuses,
} from "@worker/services/discovery";
import { fakeHandlers } from "@worker/services/discovery/fake-llm";
import { GRANTS_GOV_FETCH_URL, GRANTS_GOV_SEARCH_URL } from "@worker/services/discovery/grants-gov";
import { SIMPLER_SEARCH_URL } from "@worker/services/discovery/simpler-grants";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  forecastDetail,
  forecastHit,
  GrantsGovFixtureFetcher,
  postedDetail,
  postedHit,
  searchFixture,
} from "./fixtures/grants-gov";
import {
  SimplerFixtureFetcher,
  simplerItem,
  simplerSearchFixture,
} from "./fixtures/simpler-grants";
import { setupTenant, testDb } from "./helpers";

// Until the integration pass exports discovery-plans.ts from db/schema/index.ts, TEST_SCHEMA_SQL
// lacks this table (DDL = `drizzle-kit export` of the schema file).
beforeAll(async () => {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS `discovery_plans` (`org_id` text PRIMARY KEY NOT NULL, `plans` text DEFAULT '[]' NOT NULL, `facts_hash` text NOT NULL, `created_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade)",
  ).run();
});

const DAY = 86_400_000;
const base = { trigger: "manual" as const, throttleMs: 0, rescore: false };

async function addFact(
  orgId: string,
  statement: string,
  values: Partial<typeof facts.$inferInsert> = {},
) {
  await testDb()
    .insert(facts)
    .values({
      id: newId("fct"),
      orgId,
      category: "program",
      statement,
      status: "confirmed",
      sourceType: "user_entered",
      ...values,
    });
}

/** An org with a construction-trades program on Navajo Nation (planner input). */
async function plannedOrg() {
  const t = await setupTenant();
  await testDb()
    .update(orgProfiles)
    .set({ focusAreas: ["workforce development", "construction trades"] })
    .where(eq(orgProfiles.orgId, t.orgId));
  await addFact(t.orgId, "Runs a 16-week carpentry pre-apprenticeship for Navajo Nation adults.");
  await addFact(t.orgId, "Bank account number is 1234.", { sensitivity: "restricted" });
  await testDb()
    .insert(projects)
    .values({
      id: newId("prj"),
      orgId: t.orgId,
      title: "Trades Training Center Expansion",
      summary: "Add a second cohort and an HVAC track.",
      status: "planned",
    });
  return t;
}

async function rowById(id: string) {
  return testDb().select().from(opportunities).where(eq(opportunities.id, id)).get();
}

async function rowsByNumber(n: string) {
  return testDb().select().from(opportunities).where(eq(opportunities.opportunityNumber, n)).all();
}

describe("AI query plans", () => {
  it("plans per org, validates, caches, and re-plans on a facts change or after 14 days", async () => {
    const t = await plannedOrg();
    const llm = new FakeLlm(fakeHandlers);
    let now = new Date("2026-11-19T12:00:00Z");
    const ctx = createAppContext(env, { llm, now: () => now });

    const first = await ensureOrgPlan(ctx, t.orgId);
    expect(first.status).toBe("planned");
    expect(llm.calls.map((c) => c.purpose)).toEqual([PLAN_QUERIES_PURPOSE]);
    expect(llm.calls[0]?.orgId).toBe(t.orgId);
    const context = llm.calls[0]?.context ?? "";
    expect(context).toContain("carpentry pre-apprenticeship");
    expect(context).toContain("Trades Training Center Expansion");
    expect(context).not.toContain("Bank account"); // restricted facts never reach the planner
    const keywords = first.plans.map((p) => p.keyword);
    expect(keywords).toContain("pre-apprenticeship");
    expect(keywords).toContain("tribal workforce development");
    expect(first.plans.find((p) => p.keyword === "pre-apprenticeship")).toMatchObject({
      fundingCategories: ["ELT"],
      assistanceListings: ["17.285"],
    });
    const stored = await testDb()
      .select()
      .from(discoveryPlans)
      .where(eq(discoveryPlans.orgId, t.orgId))
      .get();
    expect(stored?.plans).toEqual(first.plans);
    expect(stored?.createdAt.getTime()).toBe(now.getTime());

    // Unchanged input: cached, no LLM call.
    expect((await ensureOrgPlan(ctx, t.orgId)).status).toBe("cached");
    expect(llm.calls).toHaveLength(1);

    // A proposed (unconfirmed) fact does not change the planner input.
    await addFact(t.orgId, "Maybe runs a welding course.", { status: "proposed" });
    expect((await ensureOrgPlan(ctx, t.orgId)).status).toBe("cached");

    // A new confirmed fact does.
    await addFact(t.orgId, "Placed 40 graduates with local construction employers in 2025.");
    expect((await ensureOrgPlan(ctx, t.orgId)).status).toBe("planned");
    expect(llm.calls).toHaveLength(2);
    const hash2 = (
      await testDb().select().from(discoveryPlans).where(eq(discoveryPlans.orgId, t.orgId)).get()
    )?.factsHash;
    expect(hash2).not.toBe(stored?.factsHash);

    // Older than 14 days: re-planned even though nothing changed.
    now = new Date(now.getTime() + 13 * DAY);
    expect((await ensureOrgPlan(ctx, t.orgId)).status).toBe("cached");
    now = new Date(now.getTime() + 2 * DAY);
    expect((await ensureOrgPlan(ctx, t.orgId)).status).toBe("planned");
    expect(llm.calls).toHaveLength(3);

    // Over the per-run re-plan cap, or when the LLM fails: the previous plan is kept.
    await addFact(t.orgId, "Opened a second training site in Window Rock.");
    const deferred = await ensureOrgPlan(ctx, t.orgId, { allowReplan: false });
    expect(deferred.status).toBe("stale");
    expect(deferred.plans).toEqual(first.plans);
    llm.on(PLAN_QUERIES_PURPOSE, () => {
      throw new Error("model unavailable");
    });
    const failed = await ensureOrgPlan(ctx, t.orgId);
    expect(failed.status).toBe("failed");
    expect(failed.plans.length).toBeGreaterThan(0);

    // Model output is validated before it is stored.
    llm.on(PLAN_QUERIES_PURPOSE, () => ({
      plans: [
        {
          keyword: "Indian Community Development",
          rationale: "fact",
          eligibilityCodes: ["07", "999"],
          fundingCategories: ["CD", "Construction"],
          assistanceListings: ["14.862", "14862"],
        },
        {
          keyword: "z",
          rationale: "",
          eligibilityCodes: [],
          fundingCategories: [],
          assistanceListings: [],
        },
      ],
    }));
    const validated = await ensureOrgPlan(ctx, t.orgId);
    expect(validated.plans).toEqual([
      {
        keyword: "Indian Community Development",
        rationale: "fact",
        eligibilityCodes: ["07"],
        fundingCategories: ["CD"],
        assistanceListings: ["14.862"],
      },
    ]);
  });

  it("a run searches defaults ∪ org plans (cfda + categories), capped, most relevant first", async () => {
    await plannedOrg();
    const relevant = {
      ...postedHit,
      id: "460001",
      number: "DOL-ETA-27-P01",
      title: "Construction Trades Pre-Apprenticeship Grants",
      cfdaList: ["17.285"],
    };
    const offTopic = {
      ...postedHit,
      id: "460002",
      number: "NSF-27-P02",
      title: "Marine Biology Research",
      cfdaList: ["47.050"],
    };
    const fetcher = new GrantsGovFixtureFetcher(
      (body) =>
        body.cfda === "17.285"
          ? searchFixture([relevant])
          : body.keyword === "New Mexico"
            ? searchFixture([offTopic])
            : searchFixture([]),
      {
        "460001": postedDetail({ id: 460001, opportunityNumber: "DOL-ETA-27-P01" }),
        "460002": postedDetail({ id: 460002, opportunityNumber: "NSF-27-P02" }),
      },
    );
    const ctx = createAppContext(env, { web: fetcher, llm: new FakeLlm(fakeHandlers) });
    const res = await runGrantsGovDiscovery(ctx, { ...base, maxQueries: 12, maxDetailFetches: 1 });

    const searches = fetcher.calls.filter((c) => c.url === GRANTS_GOV_SEARCH_URL);
    expect(searches.length).toBeLessThanOrEqual(12);
    expect(searches.map((c) => c.body.keyword).slice(0, 6)).toEqual([
      "workforce development",
      "job training",
      "construction trades",
      "Native American",
      "tribal",
      "New Mexico",
    ]);
    expect(searches.find((c) => c.body.keyword === "pre-apprenticeship")?.body).toMatchObject({
      fundingCategories: "ELT",
      eligibilities: "12",
    });
    expect(searches.find((c) => c.body.cfda === "17.285")?.body).toMatchObject({ keyword: "" });
    expect(searches.some((c) => "aln" in c.body)).toBe(false);
    expect(res.dropped.queries).toBeGreaterThanOrEqual(0);

    // Only one detail fetch allowed: the hit matching the org plans wins; the other is deferred.
    const details = fetcher.calls.filter((c) => c.url === GRANTS_GOV_FETCH_URL);
    expect(details.map((c) => c.body.opportunityId)).toEqual([460001]);
    expect(res.dropped.deferred).toBe(1);
    expect(res.counts).toMatchObject({ found: 2, created: 1 });
    const run = await testDb()
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, res.runId))
      .get();
    const runQuery = (run?.query ?? {}) as { queries?: string[]; dropped?: { deferred: number } };
    expect(runQuery.queries).toContain("aln:17.285");
    expect(runQuery.dropped?.deferred).toBe(1);
    const row = (await rowsByNumber("DOL-ETA-27-P01"))[0];
    expect(row?.keywords).toContain("pre-apprenticeship");

    // A tight cap drops (and counts) planned searches.
    const capped = await runGrantsGovDiscovery(ctx, {
      ...base,
      maxQueries: 6,
      maxDetailFetches: 0,
    });
    expect(capped.dropped.queries).toBeGreaterThan(0);
  });
});

describe("simpler.grants.gov", () => {
  const withKey = { ...env, SIMPLER_GRANTS_API_KEY: "test-simpler-key" } as Env;

  it("is skipped (recorded) without SIMPLER_GRANTS_API_KEY", async () => {
    const fetcher = new SimplerFixtureFetcher(() => simplerSearchFixture([]));
    const res = await runSimplerDiscovery(createAppContext(env, { web: fetcher }), {
      ...base,
      queries: ["tribal"],
    });
    expect(fetcher.calls).toHaveLength(0);
    const run = await testDb()
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, res.runId))
      .get();
    expect(run).toMatchObject({ source: "simpler_grants", status: "failed" });
    expect(run?.error).toContain("SIMPLER_GRANTS_API_KEY");
  });

  it("merges into the Grants.gov row by opportunity number, keeping the richer fields", async () => {
    // Grants.gov first: its detail has no award floor and a short synopsis.
    const gg = new GrantsGovFixtureFetcher(
      () => searchFixture([{ ...postedHit, id: "470001", number: "DOL-ETA-27-T01" }]),
      {
        "470001": postedDetail({
          id: 470001,
          opportunityNumber: "DOL-ETA-27-T01",
          synopsis: {
            ...(postedDetail().data.synopsis as Record<string, unknown>),
            synopsisDesc: "<p>Apprenticeship grants.</p>",
            awardFloor: "none",
          },
        }),
      },
    );
    const ggRes = await runGrantsGovDiscovery(createAppContext(env, { web: gg }), {
      ...base,
      queries: ["workforce development"],
    });
    const id = ggRes.changedIds[0] ?? "";
    const before = await rowById(id);
    expect(before?.awardFloorCents).toBeNull();

    const sg = new SimplerFixtureFetcher(() => simplerSearchFixture([simplerItem()]));
    const ctx = createAppContext(withKey, { web: sg });
    const res = await runSimplerDiscovery(ctx, { ...base, queries: ["workforce development"] });
    expect(sg.calls[0]?.url).toBe(SIMPLER_SEARCH_URL);
    expect(sg.calls[0]?.headers["X-API-Key"]).toBe("test-simpler-key");
    expect(sg.calls[0]?.body).toMatchObject({
      query: "workforce development",
      filters: { opportunity_status: { one_of: ["forecasted", "posted"] } },
      pagination: { page_offset: 1, page_size: 25 },
    });
    expect(res.counts).toMatchObject({ found: 1, created: 0, updated: 1 });

    const rows = await rowsByNumber("DOL-ETA-27-T01");
    expect(rows).toHaveLength(1); // same opportunity, two sources -> one row
    const merged = rows[0];
    expect(merged?.id).toBe(id);
    expect(merged?.source).toBe("grants_gov");
    expect(merged?.sourceId).toBe("470001");
    expect(merged?.awardFloorCents).toBe(25_000_000); // gap filled from Simpler
    expect(merged?.awardCeilingCents).toBe(500_000_000);
    expect(merged?.summary).toContain("wraparound supportive services"); // longer text kept
    expect(merged?.contentHash).toBe(before?.contentHash); // Grants.gov change detection intact
    expect(merged?.fetchedAt?.getTime()).toBe(before?.fetchedAt?.getTime());

    // Same data again: nothing to merge.
    const again = await runSimplerDiscovery(ctx, { ...base, queries: ["workforce development"] });
    expect(again.counts).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  });

  it("a Simpler-only row is adopted by Grants.gov later (one row, same id)", async () => {
    const item = simplerItem({
      opportunity_id: "0b7d4f2e-5c1a-4d8e-9f00-000000000002",
      legacy_opportunity_id: 470002,
      opportunity_number: "HHS-IHS-27-T02",
      opportunity_title: "Tribal Workforce Capacity Building",
      agency_code: "HHS-IHS",
      agency_name: "Indian Health Service",
    });
    const sg = new SimplerFixtureFetcher(() => simplerSearchFixture([item]));
    const sRes = await runSimplerDiscovery(createAppContext(withKey, { web: sg }), {
      ...base,
      queries: ["tribal"],
    });
    expect(sRes.counts.created).toBe(1);
    const [simplerRow] = await rowsByNumber("HHS-IHS-27-T02");
    expect(simplerRow?.source).toBe("simpler_grants");
    expect(simplerRow?.rawR2Key).toBe(`catalog/simpler_grants/${item.opportunity_id}.json`);
    expect(await env.FILES.get(simplerRow?.rawR2Key ?? "")).not.toBeNull();

    const gg = new GrantsGovFixtureFetcher(
      () =>
        searchFixture([
          { ...postedHit, id: "470002", number: "HHS-IHS-27-T02", agency: "Indian Health Service" },
        ]),
      {
        "470002": postedDetail({
          id: 470002,
          opportunityNumber: "HHS-IHS-27-T02",
          opportunityTitle: "Tribal Workforce Capacity Building",
        }),
      },
    );
    const gRes = await runGrantsGovDiscovery(createAppContext(env, { web: gg }), {
      ...base,
      queries: ["tribal"],
    });
    expect(gRes.counts).toMatchObject({ created: 0, updated: 1 });
    const rows = await rowsByNumber("HHS-IHS-27-T02");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: simplerRow?.id, source: "grants_gov", sourceId: "470002" });
  });
});

describe("forecast monitoring", () => {
  it("stores forecasts with estimated dates and detects forecasted -> posted", async () => {
    const hit = { ...forecastHit, id: "480001", number: "HHS-IHS-27-F01" };
    const fetcher = new GrantsGovFixtureFetcher(() => searchFixture([hit]), {
      "480001": { ...forecastDetail, data: { ...forecastDetail.data, id: 480001 } },
    });
    let now = new Date("2026-11-19T12:00:00Z");
    const ctx = createAppContext(env, { web: fetcher, now: () => now });
    const first = await runGrantsGovDiscovery(ctx, { ...base, queries: ["tribal"] });
    expect(first.counts).toMatchObject({ created: 1, forecastsPosted: 0 });
    const id = first.changedIds[0] ?? "";
    const forecast = await rowById(id);
    expect(forecast).toMatchObject({ status: "forecasted", closeDate: null, openDate: null });
    expect(forecast?.estimatedCloseDate?.toISOString().slice(0, 10)).toBe("2027-03-08");
    expect(forecast?.estimatedPostDate?.toISOString().slice(0, 10)).toBe("2027-01-05");
    expect(forecast?.description).toContain("This is a forecast");

    // The NOFO is published: same Grants.gov id, status posted, a real deadline.
    now = new Date("2027-01-06T12:00:00Z");
    fetcher.search = () =>
      searchFixture([
        {
          ...hit,
          oppStatus: "posted",
          docType: "synopsis",
          openDate: "01/05/2027",
          closeDate: "04/01/2027",
        },
      ]);
    fetcher.details["480001"] = postedDetail({
      id: 480001,
      opportunityNumber: "HHS-IHS-27-F01",
      opportunityTitle: "Tribal Workforce Capacity Building",
      forecast: forecastDetail.data.forecast,
      synopsis: {
        ...(postedDetail().data.synopsis as Record<string, unknown>),
        responseDateStr: "2027-04-01-00-00-00",
        postingDateStr: "2027-01-05-00-00-00",
      },
    });
    const second = await runGrantsGovDiscovery(ctx, { ...base, queries: ["tribal"] });
    expect(second.counts).toMatchObject({ updated: 1, forecastsPosted: 1 });
    expect(second.forecastPostedIds).toEqual([id]);
    const posted = await rowById(id);
    expect(posted?.status).toBe("posted");
    expect(posted?.closeDate?.toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(posted?.openDate?.toISOString().slice(0, 10)).toBe("2027-01-05");
    expect(posted?.estimatedCloseDate).toBeNull();
    expect(posted?.description).not.toContain("This is a forecast");

    // A later no-op run is not another transition.
    const third = await runGrantsGovDiscovery(ctx, { ...base, queries: ["tribal"] });
    expect(third.counts.forecastsPosted).toBe(0);
  });
});

describe("daily status sweep", () => {
  it("closes expired posted rows and archives 90-day-old closed rows unless an application references them", async () => {
    const t = await setupTenant();
    const now = new Date("2027-06-01T12:00:00Z");
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const insert = async (values: Partial<typeof opportunities.$inferInsert>) => {
      const id = newId("opp");
      await testDb()
        .insert(opportunities)
        .values({
          id,
          source: "manual",
          sourceId: id,
          funderName: "Sweep Funder",
          title: "Sweep test",
          status: "posted",
          ...values,
        });
      return id;
    };
    const expired = await insert({ closeDate: ago(1) });
    const live = await insert({ closeDate: new Date(now.getTime() + 5 * DAY) });
    const noDeadline = await insert({ closeDate: null });
    const oldClosed = await insert({ status: "closed", closeDate: ago(100) });
    const oldReferenced = await insert({ status: "closed", closeDate: ago(120) });
    const recentClosed = await insert({ status: "closed", closeDate: ago(30) });
    const staleForecast = await insert({
      status: "forecasted",
      closeDate: null,
      estimatedCloseDate: ago(95),
    });
    const freshForecast = await insert({
      status: "forecasted",
      closeDate: null,
      estimatedCloseDate: ago(10),
    });
    const privateExpired = await insert({ closeDate: ago(2), privateToOrgId: t.orgId });
    await testDb()
      .insert(applications)
      .values({
        id: newId("app"),
        orgId: t.orgId,
        opportunityId: oldReferenced,
        title: "Application that references a closed opportunity",
      });

    const counts = await sweepOpportunityStatuses(createAppContext(env, { now: () => now }));
    expect(counts.closed).toBeGreaterThanOrEqual(2);
    expect(counts.archived).toBeGreaterThanOrEqual(2);
    const status = async (id: string) => (await rowById(id))?.status;
    expect(await status(expired)).toBe("closed");
    expect(await status(privateExpired)).toBe("closed");
    expect(await status(live)).toBe("posted");
    expect(await status(noDeadline)).toBe("posted");
    expect(await status(oldClosed)).toBe("archived");
    expect(await status(oldReferenced)).toBe("closed");
    expect(await status(recentClosed)).toBe("closed");
    expect(await status(staleForecast)).toBe("archived");
    expect(await status(freshForecast)).toBe("forecasted");

    // Idempotent.
    const again = await sweepOpportunityStatuses(createAppContext(env, { now: () => now }));
    expect(again).toEqual({ closed: 0, archived: 0 });
  });

  it("an upsert never stores a passed deadline as posted", async () => {
    const fetcher = new GrantsGovFixtureFetcher(
      () => searchFixture([{ ...postedHit, id: "490001", number: "DOL-ETA-27-X01" }]),
      { "490001": postedDetail({ id: 490001, opportunityNumber: "DOL-ETA-27-X01" }) },
    );
    const ctx = createAppContext(env, {
      web: fetcher,
      now: () => new Date("2027-02-01T00:00:00Z"),
    });
    const res = await runGrantsGovDiscovery(ctx, { ...base, queries: ["workforce development"] });
    const row = await testDb()
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.source, "grants_gov"), eq(opportunities.sourceId, "490001")))
      .get();
    expect(res.counts.created).toBe(1);
    expect(row?.status).toBe("closed"); // deadline 2027-01-15 already passed
  });
});
