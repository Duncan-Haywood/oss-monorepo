// Offline-demo foundations (FAKE_EXTERNALS=true). These are FICTIONAL: every name starts with
// "Sample", every EIN is in the never-issued 00- prefix, and websites use the reserved .example TLD.
// Never put real foundations here with invented numbers. They are shaped exactly like ProPublica
// /organizations/{ein}.json responses so the offline path exercises the same parser.
import { type OrganizationDetail, parseOrganizationResponse } from "./propublica";

interface SampleSpec {
  ein: string;
  name: string;
  city: string;
  state: string;
  ntee: string | null;
  foundationCode: number;
  /** Latest 990-PF with data; null = only PDF filings (no extracted financials). */
  latest: { year: number; assets: number; fmv: number; grantsPaid: number | null } | null;
  website: string | null;
}

const SPECS: SampleSpec[] = [
  {
    ein: "000000001",
    name: "Sample Mesa Family Foundation",
    city: "Gallup",
    state: "NM",
    ntee: "T20",
    foundationCode: 4,
    latest: { year: 2024, assets: 4_200_000, fmv: 4_650_000, grantsPaid: 210_000 },
    website: "https://sample-mesa-family-foundation.example",
  },
  {
    ein: "000000002",
    name: "Sample High Desert Trades Fund",
    city: "Albuquerque",
    state: "NM",
    ntee: "T22",
    foundationCode: 4,
    latest: { year: 2023, assets: 12_400_000, fmv: 13_100_000, grantsPaid: 640_000 },
    website: null,
  },
  {
    ein: "000000003",
    name: "Sample Four Corners Community Trust",
    city: "Farmington",
    state: "NM",
    ntee: "T22",
    foundationCode: 4,
    latest: null,
    website: null,
  },
  {
    ein: "000000004",
    name: "Sample Red Rock Operating Foundation",
    city: "Santa Fe",
    state: "NM",
    ntee: "T23",
    foundationCode: 3,
    latest: { year: 2024, assets: 2_300_000, fmv: 2_300_000, grantsPaid: 15_000 },
    website: null,
  },
  {
    ein: "000000005",
    name: "Sample Turquoise Trail Foundation",
    city: "Las Cruces",
    state: "NM",
    ntee: "T20",
    foundationCode: 4,
    latest: { year: 2023, assets: 850_000, fmv: 900_000, grantsPaid: 0 },
    website: null,
  },
  {
    ein: "000000006",
    name: "Sample Canyon Workforce Foundation",
    city: "Flagstaff",
    state: "AZ",
    ntee: "T20",
    foundationCode: 4,
    latest: { year: 2024, assets: 6_100_000, fmv: 6_400_000, grantsPaid: 305_000 },
    website: null,
  },
];

/** ProPublica-shaped organization payload for a sample spec (amounts in whole dollars). */
export function sampleOrganizationPayload(s: SampleSpec) {
  const pdfPath = (year: number) => `https://sample-filings.example/${s.ein}_${year}12_990PF.pdf`;
  return {
    organization: {
      id: Number(s.ein),
      ein: Number(s.ein),
      name: s.name,
      city: s.city,
      state: s.state,
      subsection_code: 3,
      foundation_code: s.foundationCode,
      pf_filing_requirement_code: 1,
      ntee_code: s.ntee,
      asset_amount: s.latest?.assets ?? null,
    },
    filings_with_data: s.latest
      ? [
          {
            tax_prd: s.latest.year * 100 + 12,
            tax_prd_yr: s.latest.year,
            formtype: 2,
            pdf_url: pdfPath(s.latest.year),
            totrevenue: Math.round(s.latest.assets * 0.08),
            totfuncexpns: Math.round((s.latest.grantsPaid ?? 0) * 1.15),
            totassetsend: s.latest.assets,
            fairmrktvalamt: s.latest.fmv,
            contrpdpbks: s.latest.grantsPaid,
            operatingcd: s.foundationCode === 4 ? "N" : "Y",
            ein: Number(s.ein),
          },
        ]
      : [],
    filings_without_data: [
      {
        tax_prd: 202212,
        tax_prd_yr: 2022,
        formtype: 2,
        formtype_str: "990PF",
        pdf_url: pdfPath(2022),
      },
    ],
    data_source: "Fictional sample data for the offline demo (not ProPublica).",
    api_version: 2,
  };
}

export interface SampleFoundation {
  detail: OrganizationDetail;
  website: string | null;
  payload: ReturnType<typeof sampleOrganizationPayload>;
}

export const SAMPLE_FOUNDATIONS: SampleFoundation[] = SPECS.map((s) => {
  const payload = sampleOrganizationPayload(s);
  const detail = parseOrganizationResponse(payload);
  if (!detail) throw new Error(`invalid sample foundation ${s.ein}`);
  return { detail, website: s.website, payload };
});
