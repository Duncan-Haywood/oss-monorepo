// Foundation prospecting: ProPublica parsing, search + R2 cache, fact-citation guard rails,
// status preservation across refreshes, routes and cross-tenant isolation.
import { env } from "cloudflare:workers";
import { createApp } from "@worker/app";
import { createAppContext } from "@worker/context";
import { facts, member, orgProfiles } from "@worker/db/schema";
import { funderProfiles, orgProspects, prospectRuns } from "@worker/db/schema/prospects";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import type { LlmRequestBase } from "@worker/ports/llm";
import prospectRoutes from "@worker/routes/org/prospects";
import {
  buildProspects,
  deriveSearchParams,
  fakeHandlers,
  GIVING_UNKNOWN_CAP,
  OPERATING_FOUNDATION_CAP,
  PROSPECT_SCORE_PURPOSE,
  ProPublicaClient,
  parseOrganizationResponse,
  parseSearchResponse,
  searchFoundations,
  searchUrl,
} from "@worker/services/prospecting";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ORGANIZATIONS,
  PINON,
  ProPublicaFixtureFetcher,
  searchResponse,
  TOOL_LIBRARY,
} from "./fixtures/propublica";
import { BASE, createTestOrg, createTestUser, setupTenant, testDb } from "./helpers";

// Until the integration pass adds prospects.ts to db/schema/index.ts, TEST_SCHEMA_SQL lacks these
// tables. IF NOT EXISTS keeps this a no-op afterwards. DDL = `drizzle-kit export` of prospects.ts.
const DDL = [
  "CREATE TABLE IF NOT EXISTS `funder_profiles` (`ein` text PRIMARY KEY NOT NULL, `source` text DEFAULT 'propublica' NOT NULL, `name` text NOT NULL, `city` text, `state` text, `ntee_code` text, `subsection_code` integer, `foundation_type` text DEFAULT 'unknown' NOT NULL, `latest_filing_year` integer, `latest_form_type` integer, `total_assets_cents` integer, `total_giving_cents` integer, `website` text, `propublica_url` text, `raw_r2_key` text, `fetched_at` integer NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL)",
  "CREATE INDEX IF NOT EXISTS `funder_profiles_state_idx` ON `funder_profiles` (`state`,`foundation_type`)",
  "CREATE TABLE IF NOT EXISTS `org_prospects` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `ein` text NOT NULL, `fit_score` integer DEFAULT 0 NOT NULL, `reasons` text DEFAULT '[]' NOT NULL, `approach` text DEFAULT 'research_first' NOT NULL, `approach_notes` text DEFAULT '' NOT NULL, `status` text DEFAULT 'new' NOT NULL, `notes` text DEFAULT '' NOT NULL, `next_step_at` integer, `score_input_hash` text, `scored_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`ein`) REFERENCES `funder_profiles`(`ein`) ON UPDATE no action ON DELETE cascade)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `org_prospects_org_ein_uq` ON `org_prospects` (`org_id`,`ein`)",
  "CREATE INDEX IF NOT EXISTS `org_prospects_org_rank_idx` ON `org_prospects` (`org_id`,`status`,`fit_score`)",
  "CREATE TABLE IF NOT EXISTS `prospect_runs` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `status` text NOT NULL, `requested_by` text, `counts` text, `error` text, `started_at` integer NOT NULL, `finished_at` integer, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade)",
  "CREATE INDEX IF NOT EXISTS `prospect_runs_org_idx` ON `prospect_runs` (`org_id`,`started_at`)",
];

// Until app.ts mounts the router, mount it on a test instance exactly as app.ts will.
const app = createApp();
const sub = new Hono<AppEnv>();
sub.use("*", requireOrg("viewer"));
sub.route("/", prospectRoutes);
app.route("/api/orgs/:orgId/prospects", sub);

function call(path: string, init: { method?: string; json?: unknown; as?: string } = {}) {
  const headers = new Headers();
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (init.as) headers.set(TEST_USER_HEADER, init.as);
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    }),
    env,
  );
}

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  // Until ports/fake-llm-handlers.ts registers this module, give the worker's FakeLlm our handler.
  Object.assign(allFakeHandlers, fakeHandlers);
});

async function clearCache() {
  const listed = await env.FILES.list({ prefix: "catalog/propublica/" });
  for (const o of listed.objects) await env.FILES.delete(o.key);
}

async function prepareOrg(orgId: string) {
  await testDb()
    .update(orgProfiles)
    .set({
      city: "Gallup",
      state: "NM",
      serviceAreas: ["Gallup, NM", "McKinley County, NM", "Navajo Nation"],
      focusAreas: ["workforce development", "construction trades"],
    })
    .where(eq(orgProfiles.orgId, orgId));
}

async function addFact(
  orgId: string,
  statement: string,
  category: "program" | "geography" = "program",
) {
  const id = newId("fct");
  await testDb().insert(facts).values({
    id,
    orgId,
    category,
    statement,
    status: "confirmed",
    sensitivity: "public",
    confidence: 1,
    sourceType: "user_entered",
  });
  return id;
}

const propublicaOpts = { source: "propublica" as const, minIntervalMs: 0 };

describe("ProPublica parsing", () => {
  it("builds polite search URLs with the documented bracketed params", () => {
    expect(searchUrl({ q: "Gallup", state: "nm", cCode: 3 })).toBe(
      "https://projects.propublica.org/nonprofits/api/v2/search.json?q=Gallup&state%5Bid%5D=NM&c_code%5Bid%5D=3",
    );
    expect(searchUrl({ q: "foundation", state: "NM", nteeMajor: 7, page: 1 })).toContain(
      "ntee%5Bid%5D=7&page=1",
    );
  });

  it("parses search hits (numeric EINs, null NTEE) tolerantly", () => {
    const page = parseSearchResponse(
      searchResponse("foundation", "NM", [
        PINON,
        { ...TOOL_LIBRARY, ntee_code: null },
        { bogus: true },
      ]),
    );
    expect(page.totalResults).toBe(3);
    expect(page.hits).toEqual([
      expect.objectContaining({
        ein: "000000011",
        name: "Fixture Pinon Family Foundation",
        city: "Gallup",
        state: "NM",
        nteeCode: "T20",
        subsectionCode: 3,
      }),
      expect.objectContaining({ ein: "000000012", nteeCode: null }),
    ]);
  });

  it("parses organizations: foundation type, newest filing, 990-PF grants paid in cents", () => {
    const pinon = parseOrganizationResponse(ORGANIZATIONS["000000011"]);
    expect(pinon).toMatchObject({
      ein: "000000011",
      foundationType: "private_non_operating",
      isPrivateFoundation: true,
      latest: {
        taxYear: 2023,
        formType: 2,
        formLabel: "990-PF",
        totalAssetsCents: 340_000_000,
        fairMarketValueCents: 390_000_000,
        totalGivingCents: 17_550_000,
      },
    });
    expect(pinon?.filings.map((f) => [f.taxYear, f.hasData])).toEqual([
      [2023, true],
      [2022, true],
      [2019, false],
    ]);

    const library = parseOrganizationResponse(ORGANIZATIONS["000000012"]);
    expect(library?.foundationType).toBe("public_charity");
    expect(library?.isPrivateFoundation).toBe(false);
    expect(library?.latest?.totalGivingCents).toBeNull(); // Form 990: no contrpdpbks

    const juniper = parseOrganizationResponse(ORGANIZATIONS["000000013"]);
    expect(juniper?.latest).toBeNull();
    expect(juniper?.filings).toHaveLength(2);
    expect(parseOrganizationResponse(ORGANIZATIONS["000000014"])?.foundationType).toBe(
      "private_operating",
    );
    expect(parseOrganizationResponse({ nope: 1 })).toBeNull();
  });

  it("derives search params from the org profile", () => {
    const d = deriveSearchParams({
      city: "Gallup",
      state: "nm",
      serviceAreas: ["Gallup, NM", "McKinley County, NM", "Navajo Nation", "Window Rock, AZ"],
      focusAreas: ["workforce development", "trades"],
    });
    expect(d.geography.states).toEqual(["NM", "AZ"]);
    expect(d.keywords).toEqual([
      "Gallup",
      "McKinley",
      "Navajo",
      '"workforce development"',
      "trades",
      "foundation",
    ]);
  });
});

describe("searchFoundations", () => {
  it("returns only in-state private foundations with latest totals, cached in R2, throttled", async () => {
    await clearCache();
    const web = new ProPublicaFixtureFetcher();
    const ctx = createAppContext(env, { web });
    const waits: number[] = [];
    const client = new ProPublicaClient(ctx, {
      minIntervalMs: 1_000,
      sleep: async (ms) => void waits.push(ms),
    });

    const res = await searchFoundations(
      ctx,
      { state: "NM", keywords: ["Gallup", "foundation"] },
      { source: "propublica", client },
    );
    expect(res.candidates.map((c) => c.ein).sort()).toEqual([
      "000000011",
      "000000013",
      "000000014",
    ]);
    expect(res.stats).toMatchObject({
      queries: 2,
      hits: 4,
      detailFetched: 4,
      privateFoundations: 3,
      network: 6,
      cacheHits: 0,
    });
    expect(web.calls[0]).toContain("c_code%5Bid%5D=3");
    expect(web.calls.some((u) => u.includes("000000015"))).toBe(false); // AZ hit filtered before detail
    expect(waits).toHaveLength(5); // every network call after the first waited for its slot
    expect(waits.every((w) => w > 0 && w <= 1_000)).toBe(true);

    const pinon = res.candidates.find((c) => c.ein === "000000011");
    expect(pinon).toMatchObject({
      source: "propublica",
      name: "Fixture Pinon Family Foundation",
      latestFilingYear: 2023,
      totalAssetsCents: 340_000_000,
      totalGivingCents: 17_550_000,
      propublicaUrl: "https://projects.propublica.org/nonprofits/organizations/000000011",
      rawR2Key: "catalog/propublica/v2/organizations/000000011.json",
    });
    expect(pinon?.matchedQueries).toEqual(["Gallup", "foundation"]);
    const raw = await env.FILES.get("catalog/propublica/v2/organizations/000000011.json");
    expect(JSON.parse((await raw?.text()) ?? "{}").body.organization.ein).toBe(11);

    // Second search within 30 days: served from R2, no network.
    web.calls.length = 0;
    const again = await searchFoundations(
      ctx,
      { state: "NM", keywords: ["Gallup", "foundation"] },
      propublicaOpts,
    );
    expect(web.calls).toHaveLength(0);
    expect(again.stats.cacheHits).toBe(6);

    // After 30 days the cache is stale and refetched.
    const later = createAppContext(env, { web, now: () => new Date(Date.now() + 31 * 86_400_000) });
    await searchFoundations(later, { state: "NM", keywords: ["Gallup"] }, propublicaOpts);
    expect(web.calls.length).toBeGreaterThan(0);
  });

  it("offline mode serves only fictional sample foundations", async () => {
    const ctx = createAppContext(env);
    const res = await searchFoundations(ctx, { state: "NM", keywords: ["Gallup"] });
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) {
      expect(c.source).toBe("sample");
      expect(c.name.startsWith("Sample ")).toBe(true);
      expect(c.ein.startsWith("00")).toBe(true);
      expect(c.propublicaUrl).toBeNull();
    }
  });
});

describe("buildProspects", () => {
  it("drops unknown fact ids and uncited reasons; caps scores the public data can't support", async () => {
    const { orgId } = await setupTenant();
    await prepareOrg(orgId);
    const factId = await addFact(
      orgId,
      "The organization trains adults in construction trades in Gallup, New Mexico.",
    );
    const llm = new FakeLlm().on(PROSPECT_SCORE_PURPOSE, (req: LlmRequestBase) => ({
      fitScore: 140,
      approach: "letter_of_inquiry",
      approachNotes: "  Send a letter of inquiry.  ",
      reasons: [
        {
          text: "Same community.",
          polarity: "positive",
          factIds: [factId, "ff_location", "fct_invented", "ff_made_up"],
        },
        { text: "Funds workforce programs.", polarity: "positive", factIds: ["fct_invented"] },
        {
          text: "Prompt check",
          polarity: "neutral",
          factIds: req.prompt.includes("[ff_giving]") ? ["ff_giving"] : [],
        },
      ],
    }));
    const ctx = createAppContext(env, { web: new ProPublicaFixtureFetcher(), llm });

    const res = await buildProspects(ctx, orgId, propublicaOpts);
    expect(res).toMatchObject({ states: ["NM"], candidates: 3, scored: 3, created: 3, failed: 0 });
    // The model saw the org's facts (cached context) and the numbered funder facts (prompt).
    expect(llm.calls[0]?.context).toContain(`[${factId}]`);
    expect(llm.calls[0]?.prompt).toContain("[ff_giving]");

    const rows = await testDb()
      .select()
      .from(orgProspects)
      .where(eq(orgProspects.orgId, orgId))
      .all();
    const byEin = new Map(rows.map((r) => [r.ein, r]));
    for (const r of rows) {
      const cited = r.reasons.flatMap((x) => [...x.factIds, ...x.funderFactIds]);
      expect(cited).not.toContain("fct_invented");
      expect(cited).not.toContain("ff_made_up");
      expect(r.reasons.some((x) => x.text === "Funds workforce programs.")).toBe(false); // only bogus ids
      expect(r.reasons[0]).toEqual({
        text: "Same community.",
        polarity: "positive",
        factIds: [factId],
        funderFactIds: ["ff_location"],
      });
      expect(r.approachNotes).toBe("Send a letter of inquiry.");
    }
    expect(byEin.get("000000011")).toMatchObject({
      fitScore: 100,
      approach: "letter_of_inquiry",
      status: "new",
    });
    // Juniper: no extracted financials -> giving unknown -> capped, and no LOI before research.
    expect(byEin.get("000000013")).toMatchObject({
      fitScore: GIVING_UNKNOWN_CAP,
      approach: "research_first",
    });
    // Raven: operating foundation -> capped.
    expect(byEin.get("000000014")).toMatchObject({
      fitScore: OPERATING_FOUNDATION_CAP,
      approach: "wait_for_rfp",
    });

    const funder = await testDb()
      .select()
      .from(funderProfiles)
      .where(eq(funderProfiles.ein, "000000011"))
      .get();
    expect(funder).toMatchObject({
      source: "propublica",
      foundationType: "private_non_operating",
      totalGivingCents: 17_550_000,
      latestFilingYear: 2023,
      state: "NM",
    });
  });

  it("preserves the user's status, notes and next step across refreshes", async () => {
    const { orgId, userId } = await setupTenant();
    await prepareOrg(orgId);
    await addFact(orgId, "The organization serves Gallup and McKinley County.", "geography");
    const ctx = createAppContext(env, {
      web: new ProPublicaFixtureFetcher(),
      llm: new FakeLlm(fakeHandlers),
    });
    await buildProspects(ctx, orgId, propublicaOpts);

    const pinon = await testDb()
      .select()
      .from(orgProspects)
      .where(
        and(eq(orgProspects.orgId, orgId), eq(orgProspects.ein, PINON.strein.replace("-", ""))),
      )
      .get();
    expect(pinon).toBeTruthy();
    const patch = await call(`/api/orgs/${orgId}/prospects/${pinon?.id}`, {
      method: "PATCH",
      as: userId,
      json: {
        status: "contacted",
        notes: "Met a trustee at the chamber lunch.",
        nextStepAt: "2027-01-15T17:00:00.000Z",
      },
    });
    expect(patch.status).toBe(200);

    // Unchanged inputs: no LLM calls, nothing rewritten.
    const unchanged = await buildProspects(ctx, orgId, propublicaOpts);
    expect(unchanged).toMatchObject({ scored: 0, unchanged: 3 });

    // New knowledge changes the inputs -> rescored, but user-owned fields survive.
    await addFact(
      orgId,
      "The organization's trades program places graduates with local employers.",
    );
    const rescored = await buildProspects(ctx, orgId, propublicaOpts);
    expect(rescored).toMatchObject({ scored: 3, created: 0 });
    const after = await testDb()
      .select()
      .from(orgProspects)
      .where(eq(orgProspects.id, pinon?.id ?? ""))
      .get();
    expect(after).toMatchObject({
      status: "contacted",
      notes: "Met a trustee at the chamber lunch.",
    });
    expect(after?.nextStepAt?.toISOString()).toBe("2027-01-15T17:00:00.000Z");
    expect(after?.scoreInputHash).not.toBe(pinon?.scoreInputHash);
    expect(after?.reasons.length).toBeGreaterThan(0);
  });
});

describe("prospects routes", () => {
  it("refreshes (sample data offline), lists with filters, shows detail with attribution, rate-limits", async () => {
    const { orgId, userId } = await setupTenant("editor");
    await prepareOrg(orgId);

    const refresh = await call(`/api/orgs/${orgId}/prospects/refresh`, {
      method: "POST",
      as: userId,
    });
    expect(refresh.status).toBe(202);
    expect(await refresh.json()).toMatchObject({ queued: true });

    const list = await call(`/api/orgs/${orgId}/prospects`, { as: userId });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      items: {
        id: string;
        fitScore: number;
        funder: { name: string; source: string; state: string };
      }[];
      lastRun: { status: string; counts: Record<string, number> };
    };
    expect(body.lastRun).toMatchObject({ status: "succeeded" });
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((i) => i.funder.source === "sample" && i.funder.state === "NM")).toBe(
      true,
    );
    expect(body.items[0]?.funder.name).toBe("Sample Mesa Family Foundation"); // local + grantmaker
    const scores = body.items.map((i) => i.fitScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const filtered = await call(
      `/api/orgs/${orgId}/prospects?minFit=60&approach=letter_of_inquiry`,
      { as: userId },
    );
    const fb = (await filtered.json()) as { items: { fitScore: number; approach: string }[] };
    expect(fb.items.every((i) => i.fitScore >= 60 && i.approach === "letter_of_inquiry")).toBe(
      true,
    );
    expect((await call(`/api/orgs/${orgId}/prospects?status=bogus`, { as: userId })).status).toBe(
      400,
    );

    const top = body.items[0];
    const detail = await call(`/api/orgs/${orgId}/prospects/${top?.id}`, { as: userId });
    expect(detail.status).toBe(200);
    const d = (await detail.json()) as {
      reasons: { funderFactIds: string[] }[];
      funderFacts: { id: string }[];
      filings: { taxYear: number }[];
      attribution: { source: string; termsUrl: string };
    };
    expect(d.filings[0]?.taxYear).toBe(2024);
    expect(d.attribution).toMatchObject({
      source: "Fictional sample data",
      termsUrl: "https://www.propublica.org/about/propublica-data-terms-of-use",
    });
    const ffIds = new Set(d.funderFacts.map((f) => f.id));
    for (const r of d.reasons) for (const id of r.funderFactIds) expect(ffIds.has(id)).toBe(true);

    const again = await call(`/api/orgs/${orgId}/prospects/refresh`, {
      method: "POST",
      as: userId,
    });
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("Retry-After"))).toBeGreaterThan(3_000);
    const runs = await testDb()
      .select()
      .from(prospectRuns)
      .where(eq(prospectRuns.orgId, orgId))
      .all();
    expect(runs).toHaveLength(1);
  });

  it("detail of a ProPublica-sourced prospect links to ProPublica and summarizes filings from R2", async () => {
    const { orgId, userId } = await setupTenant();
    await prepareOrg(orgId);
    const ctx = createAppContext(env, {
      web: new ProPublicaFixtureFetcher(),
      llm: new FakeLlm(fakeHandlers),
    });
    await buildProspects(ctx, orgId, propublicaOpts);
    const row = await testDb()
      .select()
      .from(orgProspects)
      .where(and(eq(orgProspects.orgId, orgId), eq(orgProspects.ein, "000000011")))
      .get();
    const res = await call(`/api/orgs/${orgId}/prospects/${row?.id}`, { as: userId });
    const d = (await res.json()) as {
      funder: { propublicaUrl: string };
      filings: { taxYear: number; totalGivingCents: number | null; pdfUrl: string | null }[];
      attribution: { source: string; url: string; text: string };
    };
    expect(d.attribution).toMatchObject({
      source: "ProPublica Nonprofit Explorer",
      url: "https://projects.propublica.org/nonprofits/organizations/000000011",
    });
    expect(d.attribution.text).toContain("ProPublica");
    expect(d.filings.map((f) => f.taxYear)).toEqual([2023, 2022, 2019]);
    expect(d.filings[0]?.totalGivingCents).toBe(17_550_000);
  });

  it("enforces roles and tenant isolation", async () => {
    const owner = await setupTenant();
    await prepareOrg(owner.orgId);
    expect(
      (
        await call(`/api/orgs/${owner.orgId}/prospects/refresh`, {
          method: "POST",
          as: owner.userId,
        })
      ).status,
    ).toBe(202);
    const mine = await testDb()
      .select()
      .from(orgProspects)
      .where(eq(orgProspects.orgId, owner.orgId))
      .all();
    const target = mine[0];
    expect(target).toBeTruthy();

    // Viewer in the same org can read but not write.
    const viewer = await createTestUser();
    await testDb()
      .insert(member)
      .values({
        id: `mem_${newId("org").slice(4)}`,
        organizationId: owner.orgId,
        userId: viewer.id,
        role: "viewer",
      });
    expect((await call(`/api/orgs/${owner.orgId}/prospects`, { as: viewer.id })).status).toBe(200);
    expect(
      (
        await call(`/api/orgs/${owner.orgId}/prospects/${target?.id}`, {
          method: "PATCH",
          as: viewer.id,
          json: { status: "declined" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(`/api/orgs/${owner.orgId}/prospects/refresh`, { method: "POST", as: viewer.id }))
        .status,
    ).toBe(403);

    // Another tenant: cannot reach org A's routes, nor A's prospect through its own org.
    const intruder = await createTestUser();
    const other = await createTestOrg(intruder.id, { name: "Other Org" });
    expect((await call(`/api/orgs/${owner.orgId}/prospects`, { as: intruder.id })).status).toBe(
      404,
    );
    expect(
      (await call(`/api/orgs/${owner.orgId}/prospects/${target?.id}`, { as: intruder.id })).status,
    ).toBe(404);
    expect(
      (await call(`/api/orgs/${other.orgId}/prospects/${target?.id}`, { as: intruder.id })).status,
    ).toBe(404);
    const patch = await call(`/api/orgs/${other.orgId}/prospects/${target?.id}`, {
      method: "PATCH",
      as: intruder.id,
      json: { status: "declined", notes: "x" },
    });
    expect(patch.status).toBe(404);
    const otherList = (await (
      await call(`/api/orgs/${other.orgId}/prospects`, { as: intruder.id })
    ).json()) as { items: unknown[]; lastRun: unknown };
    expect(otherList).toEqual({ items: [], lastRun: null });

    const unchanged = await testDb()
      .select()
      .from(orgProspects)
      .where(eq(orgProspects.id, target?.id ?? ""))
      .get();
    expect(unchanged).toMatchObject({ status: "new", notes: "" });
  });
});
