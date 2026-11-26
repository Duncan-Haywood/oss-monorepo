// Stage 1 of matching: a cheap, deterministic prefilter that drops opportunities an org obviously
// cannot or should not pursue, before any embedding or LLM spend. Pure: no I/O, `now` injected.
import type { Eligibility, OpportunitySource, OpportunityStatus, OrgType } from "@shared/enums";

export const MIN_DAYS_TO_DEADLINE = 7;
export const MIN_AWARD_CEILING_CENTS = 250_000; // $2,500

export interface PrefilterOpportunity {
  status: OpportunityStatus;
  closeDate: Date | null;
  applicantTypes: string[];
  awardCeilingCents: number | null;
  geographicScope: string | null;
  /** When given, a SAM.gov / UEI requirement in it is checked against the profile's UEI. */
  eligibilityText?: string;
}

export interface PrefilterProfile {
  orgType: OrgType;
  state: string | null;
  serviceAreas: string[];
  /** SAM.gov Unique Entity ID; empty/absent = not on file. */
  uei?: string | null;
}

export interface PrefilterResult {
  pass: boolean;
  /** Best deterministic guess; the LLM stage refines it. */
  eligibility: Eligibility;
  /** Why it was rejected (empty when pass = true). */
  rejections: string[];
  /** Observations worth passing to the LLM stage (e.g. "applicant types: open to any entity"). */
  notes: string[];
}

/** Applicant categories normalized from grants.gov / Simpler Grants / free-text labels. */
export type ApplicantCategory =
  | "open"
  | "nonprofit_501c3"
  | "nonprofit_non501c3"
  | "nonprofit"
  | "tribal_government"
  | "tribal_organization"
  | "faith_based"
  | "community_based"
  | "higher_ed"
  | "k12"
  | "government"
  | "housing_authority"
  | "for_profit"
  | "individual";

/** Classify one applicant-type label. Returns null for labels we do not recognize. */
export function classifyApplicantType(label: string): ApplicantCategory | null {
  const s = label.toLowerCase().replace(/[_-]+/g, " ");
  if (/^others?\b/.test(s)) return null; // "Others (see eligibility text)": undecidable here
  if (/\bunrestricted\b|\bany (type of )?entity\b|\bopen to all\b|^all\b/.test(s)) return "open";
  if (/housing authorit/.test(s)) return "housing_authority";
  if (/tribal|native american|indian tribe|alaska native|tribe\b/.test(s)) {
    if (/organization|other than federally recognized/.test(s)) return "tribal_organization";
    return "tribal_government";
  }
  if (/non ?profit|not for profit|charit|501 ?\(?c\)? ?\(?3/.test(s)) {
    if (/do not have|without|non 501|not having/.test(s)) return "nonprofit_non501c3";
    if (/501 ?\(?c\)? ?\(?3|501c3/.test(s)) return "nonprofit_501c3";
    return "nonprofit";
  }
  if (/faith|religious|church/.test(s)) return "faith_based";
  if (/community (based|organization)/.test(s)) return "community_based";
  if (/higher education|universit|college/.test(s)) return "higher_ed";
  if (/school district|k ?12|elementary|secondary school/.test(s)) return "k12";
  if (/government|state\b|county|city|township|municipal|special district|public agenc/.test(s)) {
    return "government";
  }
  if (/small business|for profit|business|commercial|compan/.test(s)) return "for_profit";
  if (/individual/.test(s)) return "individual";
  return null;
}

const COMPATIBLE: Record<OrgType, ApplicantCategory[]> = {
  nonprofit_501c3: ["nonprofit_501c3", "nonprofit", "community_based", "faith_based"],
  tribal_government: ["tribal_government", "government", "housing_authority"],
  tribal_organization: ["tribal_organization", "nonprofit", "community_based"],
  faith_based: ["faith_based", "nonprofit_501c3", "nonprofit", "community_based"],
  community_based: ["community_based", "nonprofit", "nonprofit_501c3", "nonprofit_non501c3"],
  educational: ["higher_ed", "k12", "nonprofit"],
  government: ["government", "housing_authority"],
  fiscally_sponsored: ["nonprofit_501c3", "nonprofit", "community_based"],
  other: [],
};

export function applicantCompatibility(
  applicantTypes: string[],
  orgType: OrgType,
): { eligibility: Eligibility; note: string | null } {
  if (applicantTypes.length === 0) return { eligibility: "unknown", note: null };
  if (orgType === "other") return { eligibility: "unknown", note: "org type is 'other'" };
  const cats = applicantTypes.map(classifyApplicantType);
  if (cats.includes("open")) {
    return { eligibility: "likely_eligible", note: "applicant types: open to any entity" };
  }
  const allowed = COMPATIBLE[orgType];
  if (cats.some((c) => c !== null && allowed.includes(c))) {
    return { eligibility: "likely_eligible", note: "applicant types include the org's type" };
  }
  // Unrecognized labels: we can't rule the org out.
  if (cats.some((c) => c === null)) return { eligibility: "unknown", note: null };
  return { eligibility: "ineligible", note: null };
}

const STATES: [string, string][] = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"],
  ["PR", "Puerto Rico"],
];
/** Two-letter codes that are also common English words; only matched as full names. */
const AMBIGUOUS_CODES = new Set(["IN", "OR", "ME", "OK", "HI", "OH", "DE", "PA", "LA", "MA"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentionsState(scope: string, code: string, name: string): boolean {
  if (new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(scope)) return true;
  if (AMBIGUOUS_CODES.has(code)) return false;
  return new RegExp(`\\b${code}\\b`).test(scope); // case-sensitive
}

function normalizeState(state: string | null): [string, string] | null {
  if (!state) return null;
  const s = state.trim();
  return (
    STATES.find(([c, n]) => c === s.toUpperCase() || n.toLowerCase() === s.toLowerCase()) ?? null
  );
}

export function geographyCompatibility(
  scope: string | null,
  profile: Pick<PrefilterProfile, "state" | "serviceAreas">,
): { compatible: boolean; note: string | null } {
  const s = scope?.trim();
  if (!s) return { compatible: true, note: null };
  if (
    /\b(national|nationwide|united states|usa|all states|any state)\b|\bu\.s\./i.test(s) ||
    /\bUS\b/.test(s)
  ) {
    return { compatible: true, note: "national scope" };
  }
  const orgState = normalizeState(profile.state);
  if (orgState && mentionsState(s, orgState[0], orgState[1])) {
    return { compatible: true, note: `scope includes ${orgState[1]}` };
  }
  for (const area of profile.serviceAreas) {
    // Match on the most specific part of the area ("Gallup" of "Gallup, NM").
    const head = area.split(",")[0]?.trim();
    if (head && head.length >= 3 && new RegExp(`\\b${escapeRe(head)}\\b`, "i").test(s)) {
      return { compatible: true, note: `scope includes service area ${area}` };
    }
  }
  const otherStates = STATES.filter(([c, n]) => mentionsState(s, c, n));
  if (otherStates.length > 0 && orgState) {
    return { compatible: false, note: null };
  }
  // Free text we can't interpret ("rural communities", "Southwest") — don't drop it.
  return { compatible: true, note: null };
}

export function prefilter(
  opp: PrefilterOpportunity,
  profile: PrefilterProfile,
  now: Date,
): PrefilterResult {
  const rejections: string[] = [];
  const notes: string[] = [];

  if (opp.status !== "posted" && opp.status !== "forecasted") {
    rejections.push(`status is ${opp.status}`);
  }
  if (opp.closeDate) {
    const days = (opp.closeDate.getTime() - now.getTime()) / 86_400_000;
    if (days < MIN_DAYS_TO_DEADLINE) {
      rejections.push(
        days < 0 ? "deadline has passed" : `deadline in ${Math.floor(days)} days (< 7)`,
      );
    }
  }
  if (opp.awardCeilingCents != null && opp.awardCeilingCents < MIN_AWARD_CEILING_CENTS) {
    rejections.push("award ceiling below $2,500");
  }

  const applicant = applicantCompatibility(opp.applicantTypes, profile.orgType);
  if (applicant.eligibility === "ineligible") {
    rejections.push("applicant types exclude the org's type");
  } else if (applicant.note) {
    notes.push(applicant.note);
  }

  const geo = geographyCompatibility(opp.geographicScope, profile);
  if (!geo.compatible) rejections.push("geographic scope excludes the org's service area");
  else if (geo.note) notes.push(geo.note);

  // A required SAM.gov registration the org has no UEI for: never better than "unknown".
  let eligibility = applicant.eligibility;
  if (requiresSamRegistration(opp.eligibilityText) && !profile.uei?.trim()) {
    notes.push("requires SAM.gov registration (UEI); no UEI on file");
    if (eligibility !== "ineligible") eligibility = "unknown";
  }

  return {
    pass: rejections.length === 0,
    eligibility: rejections.length > 0 ? "ineligible" : eligibility,
    rejections,
    notes,
  };
}

const RE_SAM = /\bSAM\b|\bUEI\b|sam\.gov|system for award management|unique entity identifier/;
const RE_SAM_CI = /sam\.gov|system for award management|unique entity identifier/i;
const RE_SAM_WAIVED =
  /\bnot (?:be )?required\b|\bnot needed\b|\bdo(?:es)? not (?:need|have to)\b|\bwaived?\b|\bexempt\w*\b|\bunnecessary\b|\boptional\b/i;

/** True when a sentence of the eligibility text requires SAM.gov / UEI registration. */
export function requiresSamRegistration(text: string | null | undefined): boolean {
  if (!text) return false;
  return text
    .split(/(?<=[.;!?])\s+|\n+/)
    .some((s) => (RE_SAM.test(s) || RE_SAM_CI.test(s)) && !RE_SAM_WAIVED.test(s));
}

/** Fields findNearDuplicates compares (a subset of an opportunities row). */
export interface DedupeOpportunity {
  id: string;
  source: OpportunitySource;
  funderName: string;
  title: string;
  opportunityNumber: string | null;
  closeDate: Date | null;
  description: string;
}

const SOURCE_RANK: Record<OpportunitySource, number> = {
  grants_gov: 0,
  simpler_grants: 1,
  manual: 2,
  url_import: 3,
  rfp_upload: 4,
};
const TITLE_NOISE = new Set(
  "a an and the of for to in on fy grant grants program programs funding opportunity notice nofo rfp rfa round cycle".split(
    " ",
  ),
);
const normNumber = (s: string | null) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normFunder = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const titleTokens = (s: string) =>
  new Set(
    (
      s
        .toLowerCase()
        .replace(/&/g, " and ")
        .match(/[a-z]+/g) ?? []
    ).filter((w) => !TITLE_NOISE.has(w)),
  );
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}
const sameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/**
 * The same program listed twice (e.g. a Grants.gov row and a watchlist / import copy, which the
 * catalog's opportunity-number merge does not cover): same normalized opportunity number, or same
 * funder + same deadline day + near-identical title. Returns duplicateId -> keptId, keeping the
 * official source first, then the longer description. Pure.
 */
export function findNearDuplicates(opps: readonly DedupeOpportunity[]): Map<string, string> {
  const ranked = [...opps].sort(
    (a, b) =>
      SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
      b.description.length - a.description.length ||
      a.id.localeCompare(b.id),
  );
  const kept: DedupeOpportunity[] = [];
  const dupes = new Map<string, string>();
  for (const o of ranked) {
    const num = normNumber(o.opportunityNumber);
    const twin = kept.find(
      (k) =>
        (num.length >= 5 && num === normNumber(k.opportunityNumber)) ||
        (normFunder(k.funderName) === normFunder(o.funderName) &&
          sameDay(k.closeDate, o.closeDate) &&
          jaccard(titleTokens(k.title), titleTokens(o.title)) >= 0.75),
    );
    if (twin) dupes.set(o.id, twin.id);
    else kept.push(o);
  }
  return dupes;
}
