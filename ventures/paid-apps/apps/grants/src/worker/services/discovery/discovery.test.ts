import { OpportunityRequirements } from "@shared/content";
import { describe, expect, it } from "vitest";
import { cleanFunderName, effectiveStatus, mergeRicher, normalizeFunderName } from "./catalog";
import { ALN_RE, ELIGIBILITY_CODES, FUNDING_CATEGORY_CODES } from "./codes";
import { parseRequirementsFake, planQueriesFake } from "./fake-llm";
import {
  buildSearchBody,
  htmlToText,
  isPlaceholder,
  mapStatus,
  normalizeAwardRange,
  OpportunityDetail,
  parseFetchResponse,
  parseGrantsGovDate,
  parseMoneyCents,
  parseSearchResponse,
  SearchHit,
  toCatalogRecord,
} from "./grants-gov";
import {
  keywordSpec,
  MAX_PLANS_PER_ORG,
  PLANNER_SYSTEM,
  PlanQueriesOutput,
  planToSpecs,
  rankByRelevance,
  relevanceScore,
  unionSearches,
  validateSearchPlans,
} from "./plans";
import { buildRequirementsPrompt, finalizeRequirements } from "./requirements";
import { SAMPLE_OPPORTUNITIES, sampleToRecord } from "./sample-opportunities";
import {
  buildSimplerSearchBody,
  parseSimplerSearchResponse,
  simplerToCatalogRecord,
} from "./simpler-grants";

describe("grants.gov normalization", () => {
  it("parses money in every shape the API uses", () => {
    expect(parseMoneyCents("5000000")).toBe(500_000_000);
    expect(parseMoneyCents("$1,250.50")).toBe(125_050);
    expect(parseMoneyCents(2500)).toBe(250_000);
    expect(parseMoneyCents("none")).toBeNull();
    expect(parseMoneyCents("0")).toBeNull();
    expect(parseMoneyCents(null)).toBeNull();
  });

  it("handles amount quirks: placeholders, $0, suffixes, prose, absurd values", () => {
    expect(parseMoneyCents(0)).toBeNull();
    expect(parseMoneyCents("$0")).toBeNull();
    expect(parseMoneyCents("0.00")).toBeNull();
    expect(parseMoneyCents("N/A")).toBeNull();
    expect(parseMoneyCents("TBD")).toBeNull();
    expect(parseMoneyCents(" None ")).toBeNull();
    expect(parseMoneyCents("Up to $500,000")).toBe(50_000_000);
    expect(parseMoneyCents("$1.5M")).toBe(150_000_000);
    expect(parseMoneyCents("2 million")).toBe(200_000_000);
    expect(parseMoneyCents("75k")).toBe(7_500_000);
    expect(parseMoneyCents("-5")).toBe(500); // sign is not part of the amount token
    expect(parseMoneyCents(Number.NaN)).toBeNull();
    expect(parseMoneyCents("9999999999999")).toBeNull();
    expect(normalizeAwardRange(500, 100)).toEqual({ floor: 100, ceiling: 500 });
    expect(normalizeAwardRange(null, 100)).toEqual({ floor: null, ceiling: 100 });
  });

  it("parses every Grants.gov / Simpler date format and rejects impossible dates", () => {
    const day = (v: string) => parseGrantsGovDate(v)?.toISOString().slice(0, 10) ?? null;
    expect(day("1/5/2027")).toBe("2027-01-05");
    expect(day("2027-01-15")).toBe("2027-01-15"); // ISO (Simpler)
    expect(day("2027-01-15T17:00:00Z")).toBe("2027-01-15");
    expect(day("Jan 15, 2027 12:00:00 AM EST")).toBe("2027-01-15");
    expect(day("September 3, 2027")).toBe("2027-09-03");
    expect(day("01152027")).toBe("2027-01-15"); // XML extract MMDDYYYY
    expect(day("02/30/2027")).toBeNull();
    expect(day("2027-02-29")).toBeNull();
    expect(day("TBD")).toBeNull();
    expect(day("N/A")).toBeNull();
    expect(day("sometime soon")).toBeNull();
    expect(isPlaceholder("n/a.")).toBe(true);
    expect(isPlaceholder("Tribes")).toBe(false);
  });

  it("parses both date formats", () => {
    expect(parseGrantsGovDate("01/15/2027")?.toISOString()).toBe("2027-01-15T23:59:00.000Z");
    expect(parseGrantsGovDate("2027-03-08-00-00-00")?.toISOString()).toBe(
      "2027-03-08T23:59:00.000Z",
    );
    expect(parseGrantsGovDate("")).toBeNull();
    expect(parseGrantsGovDate("13/40/2027")).toBeNull();
  });

  it("strips HTML and decodes entities", () => {
    expect(htmlToText("<p>Jobs &amp; training&nbsp;now</p><ul><li>One</li><li>Two</li></ul>")).toBe(
      "Jobs & training now\n- One\n- Two",
    );
    expect(htmlToText("It&#39;s &#x41;")).toBe("It's A");
  });

  it("maps statuses", () => {
    expect(mapStatus("forecasted")).toBe("forecasted");
    expect(mapStatus("POSTED")).toBe("posted");
    expect(mapStatus(undefined)).toBe("posted");
  });

  it("tolerates missing/extra fields and skips malformed hits", () => {
    const page = parseSearchResponse({
      errorcode: 0,
      data: { hitCount: 3, oppHits: [{ id: 1, title: "A", extra: 1 }, { title: "no id" }, null] },
    });
    expect(page.hitCount).toBe(3);
    expect(page.hits.map((h) => h.id)).toEqual(["1"]);
    expect(parseSearchResponse({ data: null }).hits).toEqual([]);
    expect(() => parseSearchResponse({ errorcode: 500, msg: "down" })).toThrow(/500/);
    expect(parseFetchResponse({ errorcode: 1, data: null })).toBeNull();
  });

  it("builds a record from a hit alone when the detail call failed", () => {
    const r = toCatalogRecord(
      {
        id: "42",
        title: " Rural Jobs ",
        agency: "Sample Agency",
        closeDate: "12/01/2026",
        oppStatus: "posted",
      },
      null,
    );
    expect(r).toMatchObject({
      source: "grants_gov",
      sourceId: "42",
      title: "Rural Jobs",
      funder: { name: "Sample Agency", type: "federal" },
      status: "posted",
      summary: "",
    });
    expect(r.closeDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
  });

  it("normalizes funder names", () => {
    expect(normalizeFunderName("  Dept. of Labor & Training  ")).toBe(
      "department of labor and training",
    );
    expect(normalizeFunderName("Fundación Niños")).toBe("fundacion ninos");
    for (const n of [
      "U.S. Department of Labor",
      "Department of Labor",
      "The Department of Labor",
    ]) {
      expect(normalizeFunderName(n)).toBe("department of labor");
    }
    expect(normalizeFunderName("The Kresge Foundation, Inc.")).toBe("kresge foundation");
    // Only the federal "U.S. Department" prefix is dropped.
    expect(normalizeFunderName("US Institute of Peace")).toBe("us institute of peace");
    expect(cleanFunderName("  Employment and Training\nAdministration  ")).toBe(
      "Employment and Training",
    );
    expect(cleanFunderName("Indian Health   Service.")).toBe("Indian Health Service");
    expect(cleanFunderName("N/A")).toBe("Unknown funder");
  });

  it("normalizes ids: numeric fetchOpportunity id and string search id compare equal", () => {
    const detail = parseFetchResponse({ errorcode: 0, data: { id: 360001, synopsis: {} } });
    const hit = SearchHit.parse({ id: "360001" });
    expect(detail?.id).toBe("360001");
    expect(detail?.id).toBe(hit.id);
    expect(SearchHit.parse({ id: 42 }).id).toBe("42");
  });

  it("takes the funder from agencyDetails, never synopsis.agencyName (a contact person)", () => {
    const detail = OpportunityDetail.parse({
      id: 1,
      synopsis: {
        agencyName: "Jane Officer\nGrants Officer",
        agencyDetails: { agencyName: "Employment and Training Administration" },
      },
    });
    const r = toCatalogRecord({ id: "1", agency: "ETA (search)" }, detail);
    expect(r.funder.name).toBe("Employment and Training Administration");
    // No agencyDetails anywhere and no agency on the hit: top-level agency name.
    const top = OpportunityDetail.parse({
      id: 2,
      topAgencyDetails: { agencyName: "Department of Labor" },
      synopsis: { agencyName: "Jane Officer" },
    });
    expect(toCatalogRecord({ id: "2" }, top).funder.name).toBe("Department of Labor");
  });

  it("forecasts: closeDate null, estimated dates kept separately, '0' amounts unknown", () => {
    const detail = OpportunityDetail.parse({
      id: 9,
      forecast: {
        forecastDesc: "<p>Coming soon</p>",
        estApplicationResponseDateStr: "2027-03-08-00-00-00",
        estSynopsisPostingDateStr: "2027-01-05-00-00-00",
        awardCeiling: "0",
        awardFloor: "0",
        estimatedFunding: "2900000",
        numberOfAwards: "TBD",
        costSharing: "N/A",
      },
    });
    const r = toCatalogRecord(
      { id: "9", oppStatus: "forecasted", openDate: "09/28/2026", closeDate: "" },
      detail,
    );
    expect(r.status).toBe("forecasted");
    expect(r.closeDate).toBeNull();
    expect(r.openDate).toBeNull();
    expect(r.estimatedCloseDate?.toISOString().slice(0, 10)).toBe("2027-03-08");
    expect(r.estimatedPostDate?.toISOString().slice(0, 10)).toBe("2027-01-05");
    expect(r.awardCeilingCents).toBeNull();
    expect(r.awardFloorCents).toBeNull();
    expect(r.totalFundingCents).toBe(290_000_000);
    expect(r.expectedAwards).toBeNull();
    expect(r.costSharingRequired).toBeNull();
    expect(r.description).toContain("Estimated application due date: 2027-03-08.");
  });

  it("sends the Assistance Listing filter as `cfda` (search2 ignores `aln`)", () => {
    const body = buildSearchBody({
      keyword: "",
      aln: "17.268",
      eligibilities: ["07", "12"],
      fundingCategories: ["ELT", "CD"],
    });
    expect(body).toMatchObject({
      keyword: "",
      cfda: "17.268",
      eligibilities: "07|12",
      fundingCategories: "ELT|CD",
    });
    expect(body).not.toHaveProperty("aln");
    const plain = buildSearchBody({ keyword: "tribal" });
    expect(plain).not.toHaveProperty("cfda");
    expect(plain).not.toHaveProperty("fundingCategories");
    expect(String(plain.eligibilities)).toBe("12|13|07|11|25|99");
  });

  it("closes posted rows past their deadline; merges richer fields", () => {
    const now = new Date("2026-11-19T00:00:00Z");
    expect(effectiveStatus("posted", new Date("2026-11-01T00:00:00Z"), now)).toBe("closed");
    expect(effectiveStatus("posted", null, now)).toBe("posted");
    expect(effectiveStatus("forecasted", new Date("2026-01-01T00:00:00Z"), now)).toBe("forecasted");
    const primary = {
      sourceUrl: null,
      funderId: "fnd_1",
      funderName: "A",
      title: "T",
      opportunityNumber: "N-1",
      summary: "short",
      description: "long description from primary",
      eligibilityText: "",
      applicantTypes: ["x"],
      categories: [],
      geographicScope: null,
      awardFloorCents: null,
      awardCeilingCents: 100,
      totalFundingCents: null,
      expectedAwards: null,
      costSharingRequired: null,
      openDate: null,
      closeDate: now,
      estimatedPostDate: null,
      estimatedCloseDate: null,
      status: "posted" as const,
      submissionMethod: "grants_gov" as const,
      submissionEmail: null,
      submissionUrl: null,
    };
    const merged = mergeRicher(primary, {
      summary: "a longer summary from the secondary source",
      description: "short",
      applicantTypes: ["x", "y"],
      categories: ["Employment, Labor and Training"],
      awardFloorCents: 50,
      awardCeilingCents: 999,
      title: "Other title",
    });
    expect(merged.summary).toBe("a longer summary from the secondary source");
    expect(merged.description).toBe("long description from primary");
    expect(merged.applicantTypes).toEqual(["x", "y"]);
    expect(merged.categories).toEqual(["Employment, Labor and Training"]);
    expect(merged.awardFloorCents).toBe(50); // gap filled
    expect(merged.awardCeilingCents).toBe(100); // primary kept
    expect(merged.title).toBe("T");
  });
});

describe("requirements", () => {
  it("adds standard sections for listing-only sources and dedupes keys", () => {
    const parsed = OpportunityRequirements.parse({
      sections: [
        { key: "Need Statement", title: "Statement of Need" },
        { key: "need_statement", title: "Need (again)" },
      ],
      complete: true,
    });
    const out = finalizeRequirements(parsed, { funderType: "federal", listingOnly: true });
    expect(out.complete).toBe(false);
    const keys = out.sections.map((s) => s.key);
    expect(keys.slice(0, 2)).toEqual(["need_statement", "need_statement_2"]);
    expect(keys).toContain("project_abstract");
    expect(keys.filter((k) => k === "need_statement")).toHaveLength(1);
    expect(out.attachments.map((a) => a.name)).toContain(
      "SF-424 Application for Federal Assistance",
    );
  });

  it("trusts a complete RFP parse as-is", () => {
    const parsed = OpportunityRequirements.parse({
      sections: [{ key: "a", title: "A" }],
      complete: true,
    });
    const out = finalizeRequirements(parsed, { funderType: "foundation", listingOnly: false });
    expect(out.sections.map((s) => s.key)).toEqual(["a"]);
    expect(out.complete).toBe(true);
  });

  it("fake handler output satisfies the schema", () => {
    const prompt = buildRequirementsPrompt({
      source: "grants_gov",
      funderName: "X",
      funderType: "federal",
      title: "T",
      summary: "S",
      description: "1. Project Narrative (1000 words)\nDescribe.",
      eligibilityText: "Nonprofits. Tribes.",
      applicantTypes: [],
      submissionMethod: "grants_gov",
    });
    const out = OpportunityRequirements.parse(
      parseRequirementsFake({ purpose: "discovery.parse_requirements", system: "", prompt }),
    );
    expect(out.sections[0]).toMatchObject({ key: "project_narrative", wordLimit: 1000 });
    expect(out.eligibilityCriteria).toEqual(["Nonprofits", "Tribes"]);
    expect(out.complete).toBe(false);
  });
});

describe("sample catalog", () => {
  it("is clearly labeled fictional data with valid requirements", () => {
    const now = new Date("2026-11-19T00:00:00Z");
    expect(SAMPLE_OPPORTUNITIES.length).toBeGreaterThanOrEqual(8);
    for (const s of SAMPLE_OPPORTUNITIES) {
      expect(s.title.startsWith("[Sample] ")).toBe(true);
      expect(s.funderName.startsWith("Sample ")).toBe(true);
      expect(s.description).toContain("SAMPLE DATA");
      expect(() => OpportunityRequirements.parse(s.requirements)).not.toThrow();
      const r = sampleToRecord(s, now);
      expect(r.source).toBe("manual");
      expect(r.closeDate && r.closeDate > now).toBe(true);
      for (const url of [r.sourceUrl, r.submissionUrl].filter(Boolean)) {
        expect(new URL(String(url)).hostname.endsWith("example.org")).toBe(true);
      }
      if (r.submissionEmail) expect(r.submissionEmail.endsWith(".example.org")).toBe(true);
    }
  });
});

describe("discovery query plans", () => {
  const plan = (p: Partial<PlanQueriesOutput["plans"][number]>) => ({
    keyword: "pre-apprenticeship",
    rationale: "From [prj_1]",
    eligibilityCodes: [],
    fundingCategories: [],
    assistanceListings: [],
    ...p,
  });

  it("validates keywords, official codes and ALN format deterministically", () => {
    const v = validateSearchPlans({
      plans: [
        plan({
          keyword: '  "Construction   trades"  ',
          eligibilityCodes: ["12", "7", "99", "42", "nonprofit", "12"],
          fundingCategories: ["elt", "Community Development", "XYZ", "Jobs"],
          assistanceListings: ["17.268", "17.2680", "17-268", "CFDA 17.268", "93.600", "17.268"],
        }),
        plan({ keyword: "x" }), // too short
        plan({ keyword: "y".repeat(61) }), // too long
        plan({ keyword: "construction TRADES" }), // duplicate (case-insensitive)
        plan({ keyword: "  ab " }), // exactly 2 chars after trim: ok
      ],
    });
    expect(v.plans).toHaveLength(2);
    expect(v.plans[0]).toEqual({
      keyword: "Construction trades",
      rationale: "From [prj_1]",
      eligibilityCodes: ["07", "12", "99"],
      fundingCategories: ["CD", "ELT"],
      assistanceListings: ["17.268", "93.600"],
    });
    expect(v.plans[1]?.keyword).toBe("ab");
    expect(v.droppedPlans).toBe(3);
    // "42", "nonprofit", "XYZ", "Jobs", "17.2680", "17-268", "CFDA 17.268"
    expect(v.droppedValues).toBe(7);
  });

  it("caps plans per org and ALNs per plan; every kept value is on the official lists", () => {
    const v = validateSearchPlans({
      plans: Array.from({ length: 20 }, (_, i) =>
        plan({
          keyword: `keyword ${i}`,
          eligibilityCodes: ["12", "13"],
          fundingCategories: ["ED"],
          assistanceListings: ["10.001", "10.002", "10.003", "10.004"],
        }),
      ),
    });
    expect(v.plans).toHaveLength(MAX_PLANS_PER_ORG);
    for (const p of v.plans) {
      expect(p.assistanceListings).toHaveLength(3);
      for (const c of p.eligibilityCodes) expect(ELIGIBILITY_CODES).toContain(c);
      for (const c of p.fundingCategories) expect(FUNDING_CATEGORY_CODES).toContain(c);
      for (const a of p.assistanceListings) expect(a).toMatch(ALN_RE);
      expect(p.keyword.length).toBeGreaterThanOrEqual(2);
      expect(p.keyword.length).toBeLessThanOrEqual(60);
    }
  });

  it("embeds the official code lists in the planner prompt", () => {
    expect(ELIGIBILITY_CODES).toHaveLength(17);
    expect(FUNDING_CATEGORY_CODES).toHaveLength(28);
    expect(PLANNER_SYSTEM).toContain("12 = Nonprofits having a 501(c)(3)");
    expect(PLANNER_SYSTEM).toContain("ELT = Employment, Labor and Training");
  });

  it("fake planner output passes the schema and validation", () => {
    const context = [
      "<org_profile>",
      "- Legal name: Example Org",
      "- Focus areas: workforce development; construction trades",
      "</org_profile>",
      "<confirmed_facts>",
      "[fct_1] (confirmed) Serves Navajo Nation residents — source: no quote",
      "</confirmed_facts>",
      "<projects>",
      "[prj_1] Carpentry Pre-Apprenticeship Cohort — 16-week program",
      "</projects>",
    ].join("\n");
    const raw = PlanQueriesOutput.parse(
      planQueriesFake({ purpose: "discovery.plan_queries", system: "", context, prompt: "" }),
    );
    const v = validateSearchPlans(raw);
    expect(v.droppedPlans).toBe(0);
    expect(v.droppedValues).toBe(0);
    expect(v.plans.map((p) => p.keyword)).toEqual([
      "workforce development",
      "construction trades",
      "Carpentry Pre-Apprenticeship Cohort",
      "pre-apprenticeship",
      "tribal workforce development",
    ]);
  });

  it("unions defaults + org plans, dedupes, merges filters and caps (round-robin)", () => {
    const a = planToSpecs([
      {
        keyword: "Workforce Development",
        rationale: "",
        eligibilityCodes: ["07"],
        fundingCategories: ["ELT"],
        assistanceListings: ["17.268"],
      },
      { ...plan({ keyword: "a1" }), eligibilityCodes: [] },
      { ...plan({ keyword: "a2" }), eligibilityCodes: [] },
    ]);
    const b = planToSpecs([
      { ...plan({ keyword: "b1", fundingCategories: ["ED"] }) },
      { ...plan({ keyword: "B1", fundingCategories: ["CD"], eligibilityCodes: ["13"] }) },
      { ...plan({ keyword: "b2", assistanceListings: ["17.268"] }) },
    ]);
    const { specs, dropped } = unionSearches(["workforce development", "tribal"], [a, b], 7);
    expect(specs.map((s) => s.aln ?? s.keyword)).toEqual([
      "workforce development", // default, merged with org a's plan (eligibilities union)
      "tribal",
      "b1", // round-robin: a[0] merged, b[0], a[1], b[1] merged, a[2], b[2]
      "a1",
      "a2",
      "b2",
      "17.268", // proposed by both orgs: one search
    ]);
    expect(dropped).toBe(0);
    const wd = specs[0];
    expect(wd?.eligibilities).toContain("07");
    expect(wd?.eligibilities).toContain("12");
    expect(wd?.fundingCategories).toEqual([]); // default = all categories wins
    expect(specs[2]?.fundingCategories).toEqual(["CD", "ED"]);
    expect(specs[2]?.eligibilities).toContain("13");
    const capped = unionSearches(["d1", "d2"], [a, b], 3);
    expect(capped.specs).toHaveLength(3);
    expect(capped.dropped).toBeGreaterThan(0);
    expect(unionSearches([], [], 40).specs).toEqual([]);
    expect(keywordSpec("tribal").eligibilities).toEqual(["12", "13", "07", "11", "25", "99"]);
  });

  it("pre-ranks hits by keyword hits against all org plans", () => {
    const terms = {
      keywords: ["construction trades", "pre-apprenticeship", "tribal"],
      alns: ["17.285"],
    };
    const strong = relevanceScore(
      "Tribal Construction Trades Pre-Apprenticeship Grants",
      ["construction trades", "tribal"],
      ["17.285"],
      terms,
    );
    const weak = relevanceScore("Marine Biology Research", ["tribal"], [], terms);
    expect(strong).toBe(3 + 2 + 2);
    expect(weak).toBe(1);
    const ranked = rankByRelevance(
      ["a", "b", "c", "d"],
      (x) => ({ a: 1, b: 3, c: 1, d: 2 })[x] ?? 0,
    );
    expect(ranked).toEqual(["b", "d", "a", "c"]); // stable for ties
  });
});

describe("simpler.grants.gov adapter", () => {
  const item = {
    opportunity_id: "8f2c2b4e-1111-4c1a-9d3e-000000000001",
    legacy_opportunity_id: 360001,
    opportunity_number: "DOL-ETA-27-001",
    opportunity_title: "Building Pathways to Infrastructure Jobs Grant Program",
    agency_code: "DOL-ETA",
    agency_name: "Employment and Training Administration",
    top_level_agency_name: "Department of Labor",
    opportunity_status: "posted",
    opportunity_assistance_listings: [
      { assistance_listing_number: "17.268", program_title: "H-1B Job Training Grants" },
    ],
    summary: {
      summary_description: "<p>Grants for <b>apprenticeship</b> programs.</p>",
      applicant_types: ["nonprofits_non_higher_education_with_501c3", "unrestricted"],
      funding_categories: ["employment_labor_and_training"],
      award_ceiling: 5_000_000,
      award_floor: 0,
      estimated_total_program_funding: 50_000_000,
      expected_number_of_awards: 12,
      is_cost_sharing: false,
      is_forecast: false,
      post_date: "2026-10-01",
      close_date: "2027-01-15",
      close_date_description:
        "Electronically submitted applications must be submitted no later than 4:00 p.m. ET",
      additional_info_url: "https://www.example.gov/grants/building-pathways",
    },
    new_field: true,
  };

  it("builds the search body with translated filters", () => {
    const body = buildSimplerSearchBody({
      query: "pre-apprenticeship",
      eligibilities: ["12", "07", "bogus"],
      fundingCategories: ["ELT"],
      aln: "17.268",
      pageOffset: 2,
      pageSize: 25,
    });
    expect(body).toEqual({
      query: "pre-apprenticeship",
      query_operator: "AND",
      filters: {
        opportunity_status: { one_of: ["forecasted", "posted"] },
        applicant_type: {
          one_of: [
            "nonprofits_non_higher_education_with_501c3",
            "federally_recognized_native_american_tribal_governments",
          ],
        },
        funding_category: { one_of: ["employment_labor_and_training"] },
        assistance_listing_number: { one_of: ["17.268"] },
      },
      pagination: {
        page_offset: 2,
        page_size: 25,
        sort_order: [{ order_by: "relevancy", sort_direction: "descending" }],
      },
    });
    const noQuery = buildSimplerSearchBody({ query: " " });
    expect(noQuery).not.toHaveProperty("query");
    expect(noQuery.pagination).toMatchObject({ sort_order: [{ order_by: "post_date" }] });
  });

  it("parses results tolerantly and maps them to catalog columns", () => {
    const page = parseSimplerSearchResponse({
      message: "Success",
      status_code: 200,
      data: [item, { no_id: true }],
      pagination_info: { total_records: 2, total_pages: 1, page_offset: 1, page_size: 25 },
    });
    expect(page.totalRecords).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.legacy_opportunity_id).toBe("360001");
    const r = simplerToCatalogRecord(page.items[0] as (typeof page.items)[number]);
    expect(r).toMatchObject({
      source: "simpler_grants",
      sourceId: item.opportunity_id,
      opportunityNumber: "DOL-ETA-27-001",
      funder: { name: "Employment and Training Administration", agencyCode: "DOL-ETA" },
      awardCeilingCents: 500_000_000,
      awardFloorCents: null,
      totalFundingCents: 5_000_000_000,
      expectedAwards: 12,
      costSharingRequired: false,
      status: "posted",
      submissionMethod: "grants_gov",
      submissionUrl: "https://www.grants.gov/search-results-detail/360001",
      categories: ["Employment, Labor and Training"],
    });
    expect(r.applicantTypes[0]).toMatch(/^Nonprofits having a 501\(c\)\(3\)/);
    expect(r.summary).toBe("Grants for apprenticeship programs.");
    expect(r.description).toContain("Deadline note: Electronically submitted");
    expect(r.description).toContain("Assistance listings: 17.268 H-1B Job Training Grants");
    expect(r.closeDate?.toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(() => parseSimplerSearchResponse({ status_code: 401, message: "bad key" })).toThrow(
      /401/,
    );
  });

  it("maps forecasts with estimated dates only", () => {
    const r = simplerToCatalogRecord(
      parseSimplerSearchResponse({
        data: [
          {
            opportunity_id: "f-1",
            opportunity_status: "forecasted",
            summary: {
              is_forecast: true,
              close_date: null,
              forecasted_post_date: "2027-01-05",
              forecasted_close_date: "2027-03-08",
            },
          },
        ],
      }).items[0] as never,
    );
    expect(r.status).toBe("forecasted");
    expect(r.closeDate).toBeNull();
    expect(r.estimatedCloseDate?.toISOString().slice(0, 10)).toBe("2027-03-08");
    expect(r.estimatedPostDate?.toISOString().slice(0, 10)).toBe("2027-01-05");
    expect(r.funder.name).toBe("Unknown federal agency");
  });
});
