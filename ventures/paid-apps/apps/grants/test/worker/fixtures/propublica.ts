// ProPublica Nonprofit Explorer API v2 fixtures. Field names and value types mirror real responses
// (https://projects.propublica.org/nonprofits/api, verified 2026-11: numeric `ein`, `strein`,
// `subseccd`, `filings_with_data[].contrpdpbks` etc.), but every organization is FICTIONAL
// ("Fixture ..." names, never-issued 00- EINs).
import type { WebFetcher } from "@worker/ports/web-fetcher";

const DATA_SOURCE =
  "ProPublica Nonprofit Explorer API: https://projects.propublica.org/nonprofits/api/\nIRS Exempt Organizations Business Master File Extract (EO BMF): https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf\nIRS Annual Extract of Tax-Exempt Organization Financial Data: https://www.irs.gov/uac/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data";

export function searchHit(
  ein: number,
  name: string,
  city: string,
  state: string,
  ntee: string | null,
  subseccd = 3,
) {
  const s = String(ein).padStart(9, "0");
  return {
    ein,
    strein: `${s.slice(0, 2)}-${s.slice(2)}`,
    name,
    sub_name: name,
    city,
    state,
    ntee_code: ntee,
    raw_ntee_code: ntee,
    subseccd,
    has_subseccd: true,
    have_filings: null,
    have_extracts: null,
    have_pdfs: null,
    score: 18.260471,
  };
}

export function searchResponse(q: string, state: string, organizations: unknown[]) {
  return {
    total_results: organizations.length,
    organizations,
    num_pages: 1,
    cur_page: 0,
    page_offset: 0,
    per_page: 25,
    search_query: q,
    selected_state: state,
    selected_ntee: null,
    selected_code: "3",
    data_source: DATA_SOURCE,
    api_version: 2,
  };
}

interface FilingSpec {
  year: number;
  formtype: 0 | 1 | 2;
  assets: number;
  revenue: number;
  expenses: number;
  /** 990-PF Part I line 25 col (a); only meaningful for formtype 2. */
  grantsPaid?: number;
  fmv?: number;
}

function filingWithData(ein: number, f: FilingSpec) {
  const pf = f.formtype === 2;
  return {
    tax_prd: f.year * 100 + 12,
    tax_prd_yr: f.year,
    formtype: f.formtype,
    pdf_url: `https://projects.propublica.org/nonprofits/download-filing?path=IRS%2F${ein}_${f.year}12_990PF_fixture.pdf`,
    updated: "2025-08-05T16:14:56.419Z",
    totrevenue: f.revenue,
    totfuncexpns: f.expenses,
    totassetsend: f.assets,
    totliabend: 0,
    pct_compnsatncurrofcr: 0,
    eostatus: "1",
    tax_yr: f.year,
    ...(pf
      ? {
          operatingcd: "N",
          subcd: 3,
          grscontrgifts: 0,
          dividndsamt: Math.round(f.assets * 0.02),
          contrpdpbks: f.grantsPaid ?? 0,
          totrcptperbks: f.revenue,
          totexpnspbks: f.expenses,
          fairmrktvalamt: f.fmv ?? f.assets,
          distribamt: Math.round(f.assets * 0.05),
          grntindivcd: "N",
        }
      : { totcntrbgfts: 0 }),
    ein,
  };
}

export function organizationResponse(o: {
  ein: number;
  name: string;
  city: string;
  state: string;
  ntee: string | null;
  foundationCode: number;
  filings: FilingSpec[];
  pdfOnlyYears?: number[];
}) {
  return {
    organization: {
      id: o.ein,
      ein: o.ein,
      name: o.name,
      careofname: null,
      address: "1 FIXTURE RD",
      city: o.city,
      state: o.state,
      zipcode: "87301-0000",
      exemption_number: 0,
      subsection_code: 3,
      affiliation_code: 3,
      classification_codes: "1000",
      ruling_date: "1999-01-01",
      deductibility_code: 1,
      foundation_code: o.foundationCode,
      activity_codes: "000000000",
      organization_code: 1,
      exempt_organization_status_code: 1,
      tax_period: "2024-12-01",
      asset_code: 7,
      income_code: 6,
      filing_requirement_code: 0,
      pf_filing_requirement_code: o.foundationCode >= 2 && o.foundationCode <= 4 ? 1 : 0,
      accounting_period: 12,
      asset_amount: o.filings[0]?.assets ?? null,
      income_amount: o.filings[0]?.revenue ?? null,
      revenue_amount: null,
      ntee_code: o.ntee,
      sort_name: null,
      created_at: "2023-05-09T20:44:12.416Z",
      updated_at: "2026-10-21T13:31:31.123Z",
      data_source: "current_2026_10_21",
      have_extracts: null,
      have_pdfs: null,
      latest_object_id: "000000000000000000",
    },
    filings_with_data: o.filings.map((f) => filingWithData(o.ein, f)),
    filings_without_data: (o.pdfOnlyYears ?? []).map((y) => ({
      tax_prd: y * 100 + 12,
      tax_prd_yr: y,
      formtype: 2,
      formtype_str: "990PF",
      pdf_url: `https://projects.propublica.org/nonprofits/download-filing?path=IRS%2F${o.ein}_${y}12_990PF_fixture.pdf`,
    })),
    data_source: DATA_SOURCE,
    api_version: 2,
  };
}

// --- The fictional NM set -------------------------------------------------------------------

export const PINON = searchHit(11, "Fixture Pinon Family Foundation", "Gallup", "NM", "T20");
export const TOOL_LIBRARY = searchHit(12, "Fixture Gallup Tool Library", "Gallup", "NM", "S20");
export const JUNIPER = searchHit(13, "Fixture Juniper Charitable Trust", "Albuquerque", "NM", null);
export const RAVEN = searchHit(14, "Fixture Raven Operating Foundation", "Santa Fe", "NM", "T23");
export const OUT_OF_STATE = searchHit(15, "Fixture Saguaro Foundation", "Tucson", "AZ", "T20");

export const ORGANIZATIONS: Record<string, unknown> = {
  "000000011": organizationResponse({
    ein: 11,
    name: "Fixture Pinon Family Foundation",
    city: "Gallup",
    state: "NM",
    ntee: "T20",
    foundationCode: 4,
    filings: [
      // Deliberately out of order: the parser must pick the newest tax period.
      {
        year: 2022,
        formtype: 2,
        assets: 3_000_000,
        revenue: 150_000,
        expenses: 160_000,
        grantsPaid: 120_000,
      },
      {
        year: 2023,
        formtype: 2,
        assets: 3_400_000,
        revenue: 210_000,
        expenses: 190_000,
        grantsPaid: 175_500,
        fmv: 3_900_000,
      },
    ],
    pdfOnlyYears: [2019],
  }),
  "000000012": organizationResponse({
    ein: 12,
    name: "Fixture Gallup Tool Library",
    city: "Gallup",
    state: "NM",
    ntee: "S20",
    foundationCode: 15, // public charity (509(a)(1)/170(b)(1)(A)(vi))
    filings: [{ year: 2023, formtype: 0, assets: 80_000, revenue: 60_000, expenses: 55_000 }],
  }),
  "000000013": organizationResponse({
    ein: 13,
    name: "Fixture Juniper Charitable Trust",
    city: "Albuquerque",
    state: "NM",
    ntee: null,
    foundationCode: 4,
    filings: [],
    pdfOnlyYears: [2023, 2022],
  }),
  "000000014": organizationResponse({
    ein: 14,
    name: "Fixture Raven Operating Foundation",
    city: "Santa Fe",
    state: "NM",
    ntee: "T23",
    foundationCode: 3,
    filings: [
      {
        year: 2023,
        formtype: 2,
        assets: 900_000,
        revenue: 90_000,
        expenses: 80_000,
        grantsPaid: 5_000,
      },
    ],
  }),
};

/** Serves ProPublica fixtures by URL and records every call. Unknown URLs fail like a 404. */
export class ProPublicaFixtureFetcher implements WebFetcher {
  readonly calls: string[] = [];
  constructor(
    private search: (q: string, state: string) => unknown[] = defaultSearch,
    private orgs: Record<string, unknown> = ORGANIZATIONS,
  ) {}
  async fetchPage(): Promise<null> {
    return null;
  }
  async fetchJson<T>(url: string): Promise<T> {
    this.calls.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith("/search.json")) {
      const q = u.searchParams.get("q") ?? "";
      const state = u.searchParams.get("state[id]") ?? "";
      return searchResponse(q, state, this.search(q, state)) as T;
    }
    const m = u.pathname.match(/\/organizations\/(\d{9})\.json$/);
    const body = m?.[1] ? this.orgs[m[1]] : undefined;
    if (!body) throw new Error(`GET ${u.host} failed: 404`);
    return body as T;
  }
}

export function defaultSearch(q: string, state: string): unknown[] {
  if (state !== "NM") return [];
  if (q === "Gallup") return [PINON, TOOL_LIBRARY];
  if (q === "foundation") return [PINON, JUNIPER, RAVEN, OUT_OF_STATE];
  return [];
}
