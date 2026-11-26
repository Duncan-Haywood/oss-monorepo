import { env } from "cloudflare:workers";
import { createAppContext, testFakes } from "@worker/context";
import { discoveryRuns, funders, opportunities, opportunityMatches } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeLlm } from "@worker/ports/fake-llm";
import {
  ensureRequirements,
  getOpportunity,
  runGrantsGovDiscovery,
  SAMPLE_OPPORTUNITIES,
  seedSampleOpportunities,
} from "@worker/services/discovery";
import { fakeHandlers } from "@worker/services/discovery/fake-llm";
import { GRANTS_GOV_FETCH_URL, GRANTS_GOV_SEARCH_URL } from "@worker/services/discovery/grants-gov";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  forecastDetail,
  forecastHit,
  GrantsGovFixtureFetcher,
  postedDetail,
  postedHit,
  searchFixture,
} from "./fixtures/grants-gov";
import { api, setupTenant, testDb } from "./helpers";

const INTERNAL = { Authorization: "Bearer test-internal-token" };

const baseOpts = { trigger: "manual" as const, throttleMs: 0, rescore: false };

async function insertOpportunity(
  values: Partial<typeof opportunities.$inferInsert> = {},
): Promise<string> {
  const id = newId("opp");
  await testDb()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderName: "Test Funder",
      title: "Test opportunity",
      status: "posted",
      closeDate: new Date(Date.now() + 30 * 86_400_000),
      ...values,
    });
  return id;
}

describe("grants.gov discovery", () => {
  it("parses search2 + fetchOpportunity into catalog rows, then skips unchanged listings", async () => {
    const fetcher = new GrantsGovFixtureFetcher(() => searchFixture([postedHit, forecastHit]), {
      "360001": postedDetail(),
      "363986": forecastDetail,
    });
    let now = new Date("2026-11-19T12:00:00Z");
    const ctx = createAppContext(env, { web: fetcher, now: () => now });

    const first = await runGrantsGovDiscovery(ctx, {
      ...baseOpts,
      queries: ["workforce development"],
    });
    expect(first.counts).toMatchObject({ found: 2, created: 2, updated: 0, errors: 0 });
    // One search page (hitCount 2 < rows) + two detail calls.
    expect(fetcher.calls.filter((c) => c.url === GRANTS_GOV_SEARCH_URL)).toHaveLength(1);
    expect(fetcher.calls.filter((c) => c.url === GRANTS_GOV_FETCH_URL)).toHaveLength(2);
    expect(fetcher.calls[0]?.body).toMatchObject({
      keyword: "workforce development",
      oppStatuses: "forecasted|posted",
      rows: 25,
      startRecordNum: 0,
    });
    expect(String(fetcher.calls[0]?.body.eligibilities)).toContain("12|13|07|11");

    const db = testDb();
    const posted = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.source, "grants_gov"), eq(opportunities.sourceId, "360001")))
      .get();
    expect(posted).toBeTruthy();
    expect(posted?.title).toBe("Building Pathways to Infrastructure Jobs Grant Program");
    expect(posted?.funderName).toBe("Employment and Training Administration");
    expect(posted?.awardCeilingCents).toBe(500_000_000);
    expect(posted?.awardFloorCents).toBe(50_000_000);
    expect(posted?.totalFundingCents).toBe(5_000_000_000);
    expect(posted?.expectedAwards).toBe(12);
    expect(posted?.costSharingRequired).toBe(false);
    expect(posted?.closeDate?.toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(posted?.summary).toContain("pre-apprenticeship and apprenticeship programs");
    expect(posted?.summary).toContain("construction & infrastructure");
    expect(posted?.summary).not.toContain("<");
    expect(posted?.applicantTypes).toHaveLength(2);
    expect(posted?.categories).toEqual(["Employment, Labor and Training"]);
    expect(posted?.eligibilityText).toContain("Partnerships led by nonprofits");
    expect(posted?.keywords).toEqual(["workforce development"]);
    expect(posted?.submissionMethod).toBe("grants_gov");
    expect(posted?.privateToOrgId).toBeNull();
    expect(posted?.rawR2Key).toBe("catalog/grants_gov/360001.json");
    const raw = await env.FILES.get("catalog/grants_gov/360001.json");
    expect(raw).not.toBeNull();
    expect(JSON.parse((await raw?.text()) ?? "{}").hit.id).toBe("360001");

    const funder = await db
      .select()
      .from(funders)
      .where(eq(funders.id, posted?.funderId ?? ""))
      .get();
    expect(funder).toMatchObject({ type: "federal", agencyCode: "DOL-ETA" });
    expect(funder?.normalizedName).toBe("employment and training administration");

    const forecast = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.source, "grants_gov"), eq(opportunities.sourceId, "363986")))
      .get();
    expect(forecast?.status).toBe("forecasted");
    expect(forecast?.totalFundingCents).toBe(290_000_000);
    expect(forecast?.awardCeilingCents).toBeNull(); // "0" = unknown
    // Forecasts have no deadline yet: only the funder's estimates, kept separately.
    expect(forecast?.closeDate).toBeNull();
    expect(forecast?.estimatedCloseDate?.toISOString().slice(0, 10)).toBe("2027-03-08");
    expect(forecast?.estimatedPostDate?.toISOString().slice(0, 10)).toBe("2027-01-05");
    expect(forecast?.eligibilityText).not.toMatch(/N\/A/);

    const run = await db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, first.runId))
      .get();
    expect(run).toMatchObject({ status: "succeeded", found: 2, created: 2, updated: 0 });

    // Second run, same data: no detail calls, no writes.
    const updatedAtBefore = posted?.updatedAt.getTime();
    fetcher.calls.length = 0;
    const second = await runGrantsGovDiscovery(ctx, {
      ...baseOpts,
      queries: ["workforce development"],
    });
    expect(second.counts).toMatchObject({ found: 2, created: 0, updated: 0, unchanged: 2 });
    expect(fetcher.calls.filter((c) => c.url === GRANTS_GOV_FETCH_URL)).toHaveLength(0);

    // A week later the details are re-verified; identical content is still not an update.
    now = new Date(now.getTime() + 8 * 86_400_000);
    const third = await runGrantsGovDiscovery(ctx, {
      ...baseOpts,
      queries: ["workforce development"],
    });
    expect(third.counts).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(fetcher.calls.filter((c) => c.url === GRANTS_GOV_FETCH_URL)).toHaveLength(2);
    const after = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, posted?.id ?? ""))
      .get();
    expect(after?.updatedAt.getTime()).toBe(updatedAtBefore);

    // A changed listing (deadline extended) is an update.
    fetcher.search = () => searchFixture([{ ...postedHit, closeDate: "02/15/2027" }, forecastHit]);
    fetcher.details["360001"] = postedDetail({
      synopsis: {
        ...(postedDetail().data.synopsis as Record<string, unknown>),
        responseDateStr: "2027-02-15-00-00-00",
      },
    });
    const fourth = await runGrantsGovDiscovery(ctx, {
      ...baseOpts,
      queries: ["workforce development"],
    });
    expect(fourth.counts).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    const extended = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, posted?.id ?? ""))
      .get();
    expect(extended?.closeDate?.toISOString().slice(0, 10)).toBe("2027-02-15");
  });

  it("paginates up to maxPages and records a failed run when every search fails", async () => {
    const hits = Array.from({ length: 25 }, (_, i) => ({ ...postedHit, id: `9${i}` }));
    const fetcher = new GrantsGovFixtureFetcher(() => searchFixture(hits, 500), {});
    const ctx = createAppContext(env, { web: fetcher });
    const res = await runGrantsGovDiscovery(ctx, {
      ...baseOpts,
      queries: ["tribal"],
      maxPages: 3,
      maxDetailFetches: 0,
    });
    const searches = fetcher.calls.filter((c) => c.url === GRANTS_GOV_SEARCH_URL);
    expect(searches.map((c) => c.body.startRecordNum)).toEqual([0, 25, 50]);
    expect(res.counts.found).toBe(25);

    const failing = new GrantsGovFixtureFetcher(() => {
      throw new Error("503");
    }, {});
    const failed = await runGrantsGovDiscovery(createAppContext(env, { web: failing }), {
      ...baseOpts,
      queries: ["tribal"],
    });
    const run = await testDb()
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, failed.runId))
      .get();
    expect(run?.status).toBe("failed");
  });

  it("works with the shared FakeWebFetcher fixtures (testFakes.web)", async () => {
    testFakes.web.set(GRANTS_GOV_SEARCH_URL, searchFixture([{ ...postedHit, id: "370001" }]));
    testFakes.web.set(GRANTS_GOV_FETCH_URL, postedDetail({ id: 370001 }));
    const ctx = createAppContext(env);
    const res = await runGrantsGovDiscovery(ctx, { ...baseOpts, queries: ["job training"] });
    expect(res.counts).toMatchObject({ found: 1, created: 1 });
  });
});

describe("opportunity visibility + listing", () => {
  it("hides org A's private opportunity from org B", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const privateId = await insertOpportunity({
      source: "url_import",
      title: "Private import for A",
      privateToOrgId: a.orgId,
    });
    const publicId = await insertOpportunity({ title: "Public catalog entry" });

    const listB = (await (
      await api(`/api/orgs/${b.orgId}/opportunities?status=all`, { as: b.userId })
    ).json()) as {
      items: { id: string }[];
    };
    expect(listB.items.map((i) => i.id)).toContain(publicId);
    expect(listB.items.map((i) => i.id)).not.toContain(privateId);
    const detailB = await api(`/api/orgs/${b.orgId}/opportunities/${privateId}`, { as: b.userId });
    expect(detailB.status).toBe(404);

    const listA = (await (
      await api(`/api/orgs/${a.orgId}/opportunities?status=all`, { as: a.userId })
    ).json()) as {
      items: { id: string }[];
    };
    expect(listA.items.map((i) => i.id)).toContain(privateId);
    const detailA = await api(`/api/orgs/${a.orgId}/opportunities/${privateId}`, { as: a.userId });
    expect(detailA.status).toBe(200);
    expect(((await detailA.json()) as { id: string; match: null }).match).toBeNull();

    // Non-members cannot use org A's route at all.
    const probe = await api(`/api/orgs/${a.orgId}/opportunities/${privateId}`, { as: b.userId });
    expect(probe.status).toBe(404);
    // Service-level check too.
    await expect(getOpportunity(createAppContext(env), b.orgId, privateId)).rejects.toThrow();
  });

  it("sorts by this org's match expected value, then deadline; filters q/status/closingWithinDays", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const tag = newId("opp").slice(4, 12);
    const soon = await insertOpportunity({
      title: `Soon ${tag}`,
      closeDate: new Date(Date.now() + 5 * 86_400_000),
    });
    const later = await insertOpportunity({
      title: `Later ${tag}`,
      closeDate: new Date(Date.now() + 50 * 86_400_000),
    });
    const best = await insertOpportunity({
      title: `Best ${tag}`,
      closeDate: new Date(Date.now() + 80 * 86_400_000),
    });
    await insertOpportunity({ title: `Closed ${tag}`, status: "closed" });
    await insertOpportunity({
      title: `Expired ${tag}`,
      closeDate: new Date(Date.now() - 86_400_000),
    });
    const db = testDb();
    await db.insert(opportunityMatches).values([
      {
        id: newId("mat"),
        orgId: t.orgId,
        opportunityId: best,
        expectedValueCents: 900_000,
        fitScore: 90,
      },
      // Another org's match must not leak or affect this org's ordering.
      { id: newId("mat"), orgId: other.orgId, opportunityId: later, expectedValueCents: 5_000_000 },
    ]);

    const res = await api(`/api/orgs/${t.orgId}/opportunities?q=${tag}`, { as: t.userId });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as {
      items: { id: string; title: string; match: { orgId: string; fitScore: number } | null }[];
    };
    expect(items.map((i) => i.id)).toEqual([best, soon, later]);
    expect(items[0]?.match).toMatchObject({ orgId: t.orgId, fitScore: 90 });
    expect(items[2]?.match).toBeNull();

    const closing = (await (
      await api(`/api/orgs/${t.orgId}/opportunities?q=${tag}&closingWithinDays=10`, {
        as: t.userId,
      })
    ).json()) as { items: { id: string }[] };
    expect(closing.items.map((i) => i.id)).toEqual([soon]);

    const closed = (await (
      await api(`/api/orgs/${t.orgId}/opportunities?q=${tag}&status=closed`, { as: t.userId })
    ).json()) as { items: { title: string }[] };
    expect(closed.items.map((i) => i.title)).toEqual([`Closed ${tag}`]);

    const bad = await api(`/api/orgs/${t.orgId}/opportunities?status=bogus`, { as: t.userId });
    expect(bad.status).toBe(400);
  });
});

describe("ensureRequirements", () => {
  it("parses with the LLM once, adds standard sections for listing-only sources, persists", async () => {
    const llm = new FakeLlm(fakeHandlers);
    const ctx = createAppContext(env, { llm });
    const id = await insertOpportunity({
      source: "grants_gov",
      sourceId: `gg-${newId("opp")}`,
      title: "Federal workforce grant",
      summary: "Funds apprenticeship programs.",
      description: "Synopsis only.",
      eligibilityText: "Nonprofits with 501(c)(3) status. Tribal organizations.",
    });
    const req = await ensureRequirements(ctx, id);
    expect(llm.calls.map((c) => c.purpose)).toEqual(["discovery.parse_requirements"]);
    expect(req.complete).toBe(false);
    const keys = req.sections.map((s) => s.key);
    for (const k of [
      "need_statement",
      "project_description",
      "goals_objectives",
      "evaluation_plan",
      "organizational_capacity",
      "budget_narrative",
      "sustainability",
    ]) {
      expect(keys).toContain(k);
    }
    expect(keys).toContain("project_abstract"); // federal-style listing
    expect(req.eligibilityCriteria).toContain("Nonprofits with 501(c)(3) status");
    expect(req.attachments.length).toBeGreaterThan(0);

    const stored = await testDb()
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    expect(stored?.requirements?.sections.length).toBe(req.sections.length);

    // Cached: no second LLM call.
    await ensureRequirements(ctx, id);
    expect(llm.calls).toHaveLength(1);
  });

  it("keeps parsed RFP sections and marks complete when the full RFP is present", async () => {
    const llm = new FakeLlm(fakeHandlers);
    const ctx = createAppContext(env, { llm });
    const id = await insertOpportunity({
      source: "rfp_upload",
      title: "Uploaded RFP",
      description:
        "# Need Statement (500 words)\nDescribe the need.\n# Program Design (750 words)\nDescribe the program.\n# Budget Justification\nJustify costs.",
    });
    const req = await ensureRequirements(ctx, id);
    expect(req.complete).toBe(true);
    expect(req.sections.map((s) => s.key)).toEqual([
      "need_statement",
      "program_design",
      "budget_justification",
    ]);
    expect(req.sections[0]).toMatchObject({ wordLimit: 500, prompt: "Describe the need." });
    expect(req.sections[2]?.kind).toBe("budget");
  });
});

describe("sample catalog + internal routes", () => {
  it("rejects missing or wrong bearer tokens", async () => {
    expect((await api("/api/internal/discovery/runs")).status).toBe(401);
    expect(
      (await api("/api/internal/discovery/runs", { headers: { Authorization: "Bearer nope" } }))
        .status,
    ).toBe(401);
    expect(
      (
        await api("/api/internal/discovery/run", {
          method: "POST",
          headers: { Authorization: "test-internal-token" },
        })
      ).status,
    ).toBe(401);
  });

  it("POST /discovery/run (offline) seeds the labeled sample catalog idempotently", async () => {
    const res = await api("/api/internal/discovery/run", { method: "POST", headers: INTERNAL });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ queued: true, sources: ["grants_gov"] });

    const runs = (await (
      await api("/api/internal/discovery/runs", { headers: INTERNAL })
    ).json()) as {
      items: { status: string; found: number; query: { mode?: string } | null }[];
    };
    const sampleRun = runs.items.find((r) => r.query?.mode === "sample_catalog");
    expect(sampleRun).toMatchObject({ status: "succeeded", found: SAMPLE_OPPORTUNITIES.length });

    const samples = await testDb()
      .select()
      .from(opportunities)
      .where(eq(opportunities.source, "manual"))
      .all();
    const sampleRows = samples.filter((o) => o.sourceId.startsWith("sample:"));
    expect(sampleRows).toHaveLength(SAMPLE_OPPORTUNITIES.length);
    for (const o of sampleRows) {
      expect(o.title.startsWith("[Sample] ")).toBe(true);
      expect(o.funderName.startsWith("Sample ")).toBe(true);
      expect(o.requirements?.sections.length).toBeGreaterThan(0);
    }

    const again = await seedSampleOpportunities(createAppContext(env));
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: SAMPLE_OPPORTUNITIES.length });

    // Samples are visible in an org's catalog.
    const t = await setupTenant();
    const list = (await (
      await api(`/api/orgs/${t.orgId}/opportunities?q=${encodeURIComponent("[Sample]")}`, {
        as: t.userId,
      })
    ).json()) as {
      items: { title: string }[];
    };
    expect(list.items.length).toBe(SAMPLE_OPPORTUNITIES.length);
  });
});
