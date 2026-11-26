// Realistic Grants.gov API fixtures (shapes captured from api.grants.gov/v1/api search2 and
// fetchOpportunity, trimmed). Content is illustrative test data.
import type { FetchResult, WebFetcher } from "@worker/ports/web-fetcher";

export const searchFixture = (hits: unknown[], hitCount = hits.length) => ({
  errorcode: 0,
  msg: "Webservice Succeeds",
  token: "test",
  data: {
    searchParams: { keyword: "workforce development", rows: 25, oppStatuses: "forecasted|posted" },
    hitCount,
    startRecord: 0,
    oppHits: hits,
    oppStatusOptions: [{ label: "posted", value: "posted", count: 1 }],
    eligibilities: [{ label: "Nonprofits having a 501(c)(3) status", value: "12", count: 1 }],
  },
});

export const postedHit = {
  id: "360001",
  number: "DOL-ETA-27-001",
  title: "Building Pathways to Infrastructure Jobs Grant Program",
  agencyCode: "DOL-ETA",
  agency: "Employment and Training Administration",
  openDate: "10/01/2026",
  closeDate: "01/15/2027",
  oppStatus: "posted",
  docType: "synopsis",
  cfdaList: ["17.268"],
};

export const forecastHit = {
  id: "363986",
  number: "HHS-IHS-27-0076",
  title: "Tribal Workforce Capacity Building",
  agencyCode: "HHS-IHS",
  agency: "Indian Health Service",
  openDate: "09/28/2026",
  closeDate: "",
  oppStatus: "forecasted",
  docType: "forecast",
  cfdaList: ["93.000"],
};

export const postedDetail = (overrides: Record<string, unknown> = {}) => ({
  errorcode: 0,
  msg: "Webservice Succeeds",
  token: "test",
  data: {
    id: 360001,
    revision: 2,
    opportunityNumber: "DOL-ETA-27-001",
    opportunityTitle: "Building Pathways to Infrastructure Jobs Grant Program",
    owningAgencyCode: "DOL-ETA",
    listed: "L",
    opportunityCategory: { category: "D", description: "Discretionary" },
    agencyDetails: { code: "ETA", agencyName: "Employment and Training Administration" },
    topAgencyDetails: { code: "DOL", agencyName: "Department of Labor" },
    synopsis: {
      opportunityId: 360001,
      version: 3,
      agencyCode: "DOL-ETA",
      agencyName: "Jane Officer\nGrants Officer",
      agencyDetails: {
        code: "ETA",
        seed: "DOL-ETA",
        agencyName: "Employment and Training Administration",
        agencyCode: "DOL-ETA",
        topAgencyCode: "DOL",
      },
      agencyContactEmail: "grants-officer@example.gov",
      synopsisDesc:
        "<p>The Employment and Training Administration announces grants to develop, strengthen and scale <strong>pre-apprenticeship and apprenticeship</strong> programs in construction &amp; infrastructure occupations.</p><ul><li>Train workers for in-demand jobs</li><li>Serve rural and tribal communities</li></ul>",
      responseDate: "Jan 15, 2027 12:00:00 AM EST",
      responseDateDesc: "Applications are due by 11:59 p.m. Eastern Time.",
      responseDateStr: "2027-01-15-00-00-00",
      postingDate: "Oct 01, 2026 12:00:00 AM EDT",
      postingDateStr: "2026-10-01-00-00-00",
      archiveDateStr: "2027-02-14-00-00-00",
      fundingDescLinkUrl: "https://www.example.gov/grants/building-pathways",
      costSharing: false,
      awardCeiling: "5000000",
      awardFloor: "500,000",
      estimatedFunding: "50000000",
      numberOfAwards: "12",
      applicantEligibilityDesc: "<p>Partnerships led by nonprofits or tribal organizations.</p>",
      applicantTypes: [
        {
          id: "12",
          description:
            "Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education",
        },
        {
          id: "07",
          description: "Native American tribal governments (Federally recognized)",
        },
      ],
      fundingInstruments: [{ id: "G", description: "Grant" }],
      fundingActivityCategories: [{ id: "ELT", description: "Employment, Labor and Training" }],
      lastUpdatedDate: "Oct 01, 2026 09:00:00 AM EDT",
      someNewFieldTheApiAdded: { anything: true },
    },
    cfdas: [{ cfdaNumber: "17.268", programTitle: "H-1B Job Training Grants" }],
    opportunityPkgs: [{ id: 1 }],
    docType: "synopsis",
    ...overrides,
  },
});

export const forecastDetail = {
  errorcode: 0,
  msg: "Webservice Succeeds",
  data: {
    id: 363986,
    opportunityNumber: "HHS-IHS-27-0076",
    opportunityTitle: "Tribal Workforce Capacity Building",
    owningAgencyCode: "HHS-IHS",
    agencyDetails: { agencyName: "Indian Health Service" },
    forecast: {
      opportunityId: 363986,
      forecastDesc: "<p>This NOFO will build tribal workforce capacity.</p>",
      costSharing: false,
      numberOfAwards: "1",
      estimatedFunding: "2900000",
      awardCeiling: "0",
      awardFloor: "0",
      agencyCode: "HHS-IHS",
      applicantEligibilityDesc: "N/A",
      estApplicationResponseDateStr: "2027-03-08-00-00-00",
      estSynopsisPostingDateStr: "2027-01-05-00-00-00",
      applicantTypes: [
        {
          id: "11",
          description:
            "Native American tribal organizations (other than Federally recognized tribal governments)",
        },
      ],
      fundingActivityCategories: [{ id: "HL", description: "Health" }],
    },
    docType: "forecast",
  },
};

/** WebFetcher that routes Grants.gov POSTs by request body (FakeWebFetcher keys by URL only). */
export class GrantsGovFixtureFetcher implements WebFetcher {
  readonly calls: { url: string; body: Record<string, unknown> }[] = [];
  constructor(
    public search: (body: Record<string, unknown>) => unknown,
    public details: Record<string, unknown>,
  ) {}
  async fetchPage(url: string): Promise<FetchResult | null> {
    return { url, status: 404, contentType: "text/plain", body: "" };
  }
  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    this.calls.push({ url, body });
    if (url.endsWith("/search2")) return this.search(body) as T;
    if (url.endsWith("/fetchOpportunity")) {
      const d = this.details[String(body.opportunityId)];
      if (!d) throw new Error(`no detail fixture for ${String(body.opportunityId)}`);
      return d as T;
    }
    throw new Error(`unexpected url ${url}`);
  }
}
