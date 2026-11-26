// Simpler.Grants.gov API adapter (enabled only when SIMPLER_GRANTS_API_KEY is set).
//   POST https://api.simpler.grants.gov/v1/opportunities/search   header X-API-Key
//   body { query?, query_operator?, filters: { opportunity_status, applicant_type, funding_category,
//          assistance_listing_number: { one_of: [...] } }, pagination: { page_offset (1-based),
//          page_size, sort_order: [{ order_by, sort_direction }] } }
//   response { data: OpportunityV1[], pagination_info: { total_records, total_pages, ... } }
// Source: https://api.simpler.grants.gov/openapi.json (OpportunitySearchRequestV1Schema,
// OpportunitySearchResponseV1Schema) and https://wiki.simpler.grants.gov/product/api/search-opportunities
// (checked 2026-11-19). It mirrors the Grants.gov catalog: `legacy_opportunity_id` is the Grants.gov
// opportunity id and `opportunity_number` matches Grants.gov's, which is how rows are deduped.
import { z } from "zod";
import type { WebFetcher } from "../../ports/web-fetcher";
import {
  GRANTS_GOV_ELIGIBILITIES,
  GRANTS_GOV_FUNDING_CATEGORIES,
  isEligibilityCode,
  isFundingCategoryCode,
  simplerApplicantLabel,
  simplerCategoryLabel,
} from "./codes";
import {
  type CatalogRecord,
  cleanText,
  grantsGovDetailUrl,
  htmlToText,
  isoDay,
  mapStatus,
  normalizeAwardRange,
  parseGrantsGovDate,
  parseIntOrNull,
  parseMoneyCents,
  truncate,
} from "./grants-gov";

export const SIMPLER_API = "https://api.simpler.grants.gov";
export const SIMPLER_SEARCH_URL = `${SIMPLER_API}/v1/opportunities/search`;

export const simplerDetailUrl = (id: string) =>
  `https://simpler.grants.gov/opportunity/${encodeURIComponent(id)}`;

const strOrNum = z.union([z.string(), z.number()]);

const SimplerSummary = z
  .object({
    summary_description: z.string().nullish(),
    applicant_eligibility_description: z.string().nullish(),
    applicant_types: z.array(z.string()).nullish(),
    funding_categories: z.array(z.string()).nullish(),
    funding_instruments: z.array(z.string()).nullish(),
    award_ceiling: strOrNum.nullish(),
    award_floor: strOrNum.nullish(),
    estimated_total_program_funding: strOrNum.nullish(),
    expected_number_of_awards: strOrNum.nullish(),
    is_cost_sharing: z.boolean().nullish(),
    is_forecast: z.boolean().nullish(),
    post_date: z.string().nullish(),
    close_date: z.string().nullish(),
    close_date_description: z.string().nullish(),
    forecasted_post_date: z.string().nullish(),
    forecasted_close_date: z.string().nullish(),
    forecasted_close_date_description: z.string().nullish(),
    archive_date: z.string().nullish(),
    additional_info_url: z.string().nullish(),
    agency_email_address: z.string().nullish(),
  })
  .passthrough();

export const SimplerOpportunity = z
  .object({
    opportunity_id: strOrNum.transform(String),
    legacy_opportunity_id: strOrNum
      .nullish()
      .transform((v) => (v == null || v === "" ? null : String(v))),
    opportunity_number: z.string().nullish(),
    opportunity_title: z.string().nullish(),
    agency_code: z.string().nullish(),
    agency_name: z.string().nullish(),
    top_level_agency_name: z.string().nullish(),
    opportunity_status: z.string().nullish(),
    opportunity_assistance_listings: z
      .array(
        z
          .object({
            assistance_listing_number: z.string().nullish(),
            program_title: z.string().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    summary: SimplerSummary.nullish(),
  })
  .passthrough();
export type SimplerOpportunity = z.infer<typeof SimplerOpportunity>;

const SimplerSearchResponse = z
  .object({
    message: z.string().nullish(),
    status_code: z.number().nullish(),
    data: z.array(z.unknown()).nullish(),
    pagination_info: z
      .object({ total_records: z.number().nullish(), total_pages: z.number().nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export interface SimplerSearchParams {
  /** "" = no text query (filters only). */
  query: string;
  /** Grants.gov eligibility codes; translated to Simpler applicant_type enums. */
  eligibilities?: readonly string[];
  /** Grants.gov funding category codes; translated to Simpler funding_category enums. */
  fundingCategories?: readonly string[];
  aln?: string | null;
  /** 1-based. */
  pageOffset?: number;
  pageSize?: number;
}

export interface SimplerPage {
  totalRecords: number;
  totalPages: number;
  items: SimplerOpportunity[];
}

export function buildSimplerSearchBody(p: SimplerSearchParams): Record<string, unknown> {
  const filters: Record<string, { one_of: string[] }> = {
    opportunity_status: { one_of: ["forecasted", "posted"] },
  };
  const applicantTypes = (p.eligibilities ?? [])
    .filter(isEligibilityCode)
    .map((c) => GRANTS_GOV_ELIGIBILITIES[c].simpler);
  if (applicantTypes.length) filters.applicant_type = { one_of: [...new Set(applicantTypes)] };
  const categories = (p.fundingCategories ?? [])
    .filter(isFundingCategoryCode)
    .map((c) => GRANTS_GOV_FUNDING_CATEGORIES[c].simpler);
  if (categories.length) filters.funding_category = { one_of: [...new Set(categories)] };
  if (p.aln) filters.assistance_listing_number = { one_of: [p.aln] };
  const query = p.query.trim();
  return {
    ...(query ? { query, query_operator: "AND" } : {}),
    filters,
    pagination: {
      page_offset: p.pageOffset ?? 1,
      page_size: p.pageSize ?? 25,
      sort_order: [{ order_by: query ? "relevancy" : "post_date", sort_direction: "descending" }],
    },
  };
}

export async function searchSimpler(
  web: WebFetcher,
  apiKey: string,
  p: SimplerSearchParams,
): Promise<SimplerPage> {
  const raw = await web.fetchJson(SIMPLER_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(buildSimplerSearchBody(p)),
  });
  return parseSimplerSearchResponse(raw);
}

export function parseSimplerSearchResponse(raw: unknown): SimplerPage {
  const res = SimplerSearchResponse.parse(raw);
  if (res.status_code && res.status_code >= 400) {
    throw new Error(`simpler.grants.gov search error ${res.status_code}: ${res.message ?? ""}`);
  }
  const items: SimplerOpportunity[] = [];
  for (const d of res.data ?? []) {
    const parsed = SimplerOpportunity.safeParse(d);
    if (parsed.success && parsed.data.opportunity_id) items.push(parsed.data);
  }
  return {
    totalRecords: res.pagination_info?.total_records ?? items.length,
    totalPages: res.pagination_info?.total_pages ?? 1,
    items,
  };
}

const humanize = (v: string) => v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const simplerAlns = (o: SimplerOpportunity): string[] =>
  (o.opportunity_assistance_listings ?? [])
    .map((a) => cleanText(a.assistance_listing_number))
    .filter(Boolean);

/** Map a Simpler search result to our catalog columns (same conventions as Grants.gov). */
export function simplerToCatalogRecord(o: SimplerOpportunity): CatalogRecord {
  const s = o.summary ?? {};
  const isForecast =
    s.is_forecast === true || cleanText(o.opportunity_status).toLowerCase() === "forecasted";
  const descriptionText = htmlToText(s.summary_description);
  const applicantTypes = (s.applicant_types ?? []).map(
    (t) => simplerApplicantLabel(t) ?? humanize(t),
  );
  const estimatedPostDate = isForecast ? parseGrantsGovDate(s.forecasted_post_date) : null;
  const estimatedCloseDate = isForecast ? parseGrantsGovDate(s.forecasted_close_date) : null;
  const deadlineNote = cleanText(
    htmlToText(isForecast ? s.forecasted_close_date_description : s.close_date_description),
  );
  const listings = (o.opportunity_assistance_listings ?? [])
    .map((a) =>
      [cleanText(a.assistance_listing_number), cleanText(a.program_title)]
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
  const infoUrl = cleanText(s.additional_info_url);
  const description = [
    descriptionText,
    deadlineNote ? `Deadline note: ${deadlineNote}` : "",
    listings.length ? `Assistance listings: ${listings.join("; ")}` : "",
    infoUrl ? `Full announcement: ${infoUrl}` : "",
    isForecast
      ? [
          "This is a forecast; the full notice of funding opportunity is not yet posted.",
          estimatedPostDate ? `Estimated posting date: ${isoDay(estimatedPostDate)}.` : "",
          estimatedCloseDate
            ? `Estimated application due date: ${isoDay(estimatedCloseDate)}.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const eligibility = [
    applicantTypes.length ? `Eligible applicants: ${applicantTypes.join("; ")}.` : "",
    cleanText(htmlToText(s.applicant_eligibility_description)),
  ].filter(Boolean);
  const range = normalizeAwardRange(
    parseMoneyCents(s.award_floor),
    parseMoneyCents(s.award_ceiling),
  );
  const agency =
    [o.agency_name, o.top_level_agency_name, o.agency_code].map(cleanText).find(Boolean) ??
    "Unknown federal agency";
  return {
    source: "simpler_grants",
    sourceId: o.opportunity_id,
    sourceUrl: simplerDetailUrl(o.opportunity_id),
    funder: { name: agency, type: "federal", agencyCode: cleanText(o.agency_code) || null },
    title: (
      cleanText(o.opportunity_title) || `Simpler.Grants.gov opportunity ${o.opportunity_id}`
    ).replace(/\s+/g, " "),
    opportunityNumber: cleanText(o.opportunity_number) || null,
    summary: truncate(descriptionText, 600),
    description: truncate(description, 20_000),
    eligibilityText: truncate(eligibility.join("\n"), 4_000),
    applicantTypes,
    categories: (s.funding_categories ?? []).map((c) => simplerCategoryLabel(c) ?? humanize(c)),
    geographicScope: "United States (national)",
    awardFloorCents: range.floor,
    awardCeilingCents: range.ceiling,
    totalFundingCents: parseMoneyCents(s.estimated_total_program_funding),
    expectedAwards: parseIntOrNull(s.expected_number_of_awards),
    costSharingRequired: s.is_cost_sharing ?? null,
    openDate: isForecast ? null : parseGrantsGovDate(s.post_date),
    closeDate: isForecast ? null : parseGrantsGovDate(s.close_date),
    estimatedPostDate,
    estimatedCloseDate,
    status: isForecast ? "forecasted" : mapStatus(o.opportunity_status),
    submissionMethod: "grants_gov",
    submissionEmail: null,
    submissionUrl: o.legacy_opportunity_id
      ? grantsGovDetailUrl(o.legacy_opportunity_id)
      : simplerDetailUrl(o.opportunity_id),
  };
}
