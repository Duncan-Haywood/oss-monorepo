// Simpler.Grants.gov API fixtures (shapes from api.simpler.grants.gov/openapi.json
// OpportunitySearchResponseV1Schema, trimmed). Content is illustrative test data.
import type { FetchResult, WebFetcher } from "@worker/ports/web-fetcher";

export const simplerItem = (overrides: Record<string, unknown> = {}) => {
  const { summary, ...rest } = overrides;
  return {
    opportunity_id: "0b7d4f2e-5c1a-4d8e-9f00-000000000001",
    legacy_opportunity_id: 470001,
    opportunity_number: "DOL-ETA-27-T01",
    opportunity_title: "Building Pathways to Infrastructure Jobs Grant Program",
    agency: "DOL-ETA",
    agency_code: "DOL-ETA",
    agency_name: "Employment and Training Administration",
    top_level_agency_name: "Department of Labor",
    category: "discretionary",
    opportunity_status: "posted",
    opportunity_assistance_listings: [
      { assistance_listing_number: "17.268", program_title: "H-1B Job Training Grants" },
    ],
    created_at: "2026-10-01T12:00:00+00:00",
    updated_at: "2026-10-02T12:00:00+00:00",
    summary: {
      summary_description:
        "<p>The Employment and Training Administration announces grants to develop, strengthen and scale pre-apprenticeship and apprenticeship programs in construction and infrastructure occupations, with priority for rural and tribal communities and wraparound supportive services.</p>",
      applicant_types: [
        "nonprofits_non_higher_education_with_501c3",
        "federally_recognized_native_american_tribal_governments",
        "other_native_american_tribal_organizations",
      ],
      funding_categories: ["employment_labor_and_training"],
      funding_instruments: ["grant"],
      award_ceiling: 5_000_000,
      award_floor: 250_000,
      estimated_total_program_funding: 50_000_000,
      expected_number_of_awards: 12,
      is_cost_sharing: false,
      is_forecast: false,
      post_date: "2026-10-01",
      close_date: "2027-01-15",
      close_date_description: "Applications are due by 11:59 p.m. Eastern Time.",
      additional_info_url: "https://www.example.gov/grants/building-pathways",
      agency_email_address: "grants-officer@example.gov",
      version_number: 3,
      ...(summary as Record<string, unknown> | undefined),
    },
    ...rest,
  };
};

export const simplerSearchFixture = (items: unknown[], totalRecords = items.length) => ({
  message: "Success",
  status_code: 200,
  data: items,
  facet_counts: { opportunity_status: { posted: items.length } },
  pagination_info: {
    page_offset: 1,
    page_size: 25,
    total_pages: Math.max(1, Math.ceil(totalRecords / 25)),
    total_records: totalRecords,
    sort_order: [{ order_by: "relevancy", sort_direction: "descending" }],
  },
});

/** Routes Simpler search POSTs to `search(body)` and records bodies + headers. */
export class SimplerFixtureFetcher implements WebFetcher {
  readonly calls: {
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[] = [];
  constructor(public search: (body: Record<string, unknown>) => unknown) {}
  async fetchPage(url: string): Promise<FetchResult | null> {
    return { url, status: 404, contentType: "text/plain", body: "" };
  }
  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    this.calls.push({ url, body, headers: { ...(init?.headers as Record<string, string>) } });
    if (url.endsWith("/v1/opportunities/search")) return this.search(body) as T;
    throw new Error(`unexpected url ${url}`);
  }
}
