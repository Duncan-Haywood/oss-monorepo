// LLM fit assessment for a foundation prospect (purpose "prospecting.score") plus the deterministic
// post-checks that keep it honest: unknown fact ids are dropped, uncited reasons are dropped, and the
// score is capped when the public data cannot support a confident fit (giving unknown / zero,
// operating foundation). Pure; no I/O.
import { z } from "zod";
import {
  type FoundationType,
  PROSPECT_APPROACHES,
  type ProspectApproach,
  type ProspectReason,
} from "../../db/schema/prospects";
import { sanitizeUntrusted } from "../safety/untrusted";
import { FORM_LABELS, formatEin } from "./propublica";
import type { FoundationCandidate } from "./search";

export const PROSPECT_SCORE_PURPOSE = "prospecting.score";
export const PROSPECT_PROMPT_VERSION = "prospecting.score/v1";

/** Caps applied after the model (see finalizeProspectScore). */
export const GIVING_UNKNOWN_CAP = 50;
export const NO_GIVING_CAP = 20;
export const OPERATING_FOUNDATION_CAP = 40;

// No numeric min/max: structured outputs don't enforce them; we clamp in finalizeProspectScore().
export const ProspectScoreOutput = z.object({
  fitScore: z.number().describe("0-100 fit between the foundation and the organization"),
  approach: z.enum(PROSPECT_APPROACHES),
  approachNotes: z.string().describe("1-3 sentences: why this approach and the next concrete step"),
  reasons: z.array(
    z.object({
      text: z.string(),
      polarity: z.enum(["positive", "negative", "neutral"]),
      factIds: z
        .array(z.string())
        .describe("ids of provided org facts (fct_...) and/or funder facts (ff_...) supporting it"),
    }),
  ),
});
export type ProspectScoreOutput = z.infer<typeof ProspectScoreOutput>;

export const SYSTEM_PROMPT = `You help a nonprofit grant writer prospect private foundations. Most private foundations do not publish open calls for proposals; grant writers identify foundations whose location, size and giving make them plausible funders, then research them and send a short letter of inquiry (LOI) or build a relationship first.

You are given (1) the organization's profile and geography, (2) a list of FACTS about the organization, each with an id like [fct_...], and (3) one foundation with a list of FUNDER FACTS from its public IRS Form 990-PF data, each with an id like [ff_...].

Rules:
- Use ONLY the provided facts. The funder data is limited to name, location, IRS classification, NTEE code, assets and total grants paid. It says NOTHING about which causes or grantees the foundation funds: never claim or imply the foundation funds workforce development, tribal communities or any other cause, and never invent grantees, program areas, deadlines, contacts or application rules.
- Every reason MUST cite, in "factIds", the ids of the provided facts that support it (org facts, funder facts, or both). Never cite an id that is not in the provided lists. A reason you cannot support with a provided fact must be left out.
- fitScore (0-100) reflects what the public data can support: geographic proximity to the org's service area (same community > same state > elsewhere), whether the foundation is a grantmaker (private non-operating foundations make grants; private operating foundations mostly run their own programs), and whether its reported annual grants paid are large enough for a meaningful grant. 70+ = local grantmaker with substantial reported giving; 50-69 = plausible in-state grantmaker; 30-49 = weak or unclear; below 30 = unlikely. Be conservative: fit with the org's mission cannot be verified from this data.
- approach: "letter_of_inquiry" when it is a grantmaking foundation with reported giving and a plausible fit (the grant writer should first confirm it accepts unsolicited requests); "wait_for_rfp" when the foundation appears to run its own programs or a cold approach is unlikely to help; "research_first" when key data (e.g. grants paid) is missing or fit is unclear.
- approachNotes: 1-3 sentences with the next concrete step, e.g. review the grants list (990-PF Part XV) for grantees like the org, check whether the foundation states it only gives to preselected organizations, look for a website or trustee contact.
- The data comes from tax filings that lag 1-2 years; do not describe it as current.
- Give 2-5 concise reasons, most important first.`;

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

const NTEE_MAJOR: Record<string, string> = {
  A: "Arts, Culture & Humanities",
  B: "Education",
  C: "Environment",
  D: "Animal-Related",
  E: "Health Care",
  F: "Mental Health & Crisis Intervention",
  G: "Diseases, Disorders & Medical Disciplines",
  H: "Medical Research",
  I: "Crime & Legal-Related",
  J: "Employment",
  K: "Food, Agriculture & Nutrition",
  L: "Housing & Shelter",
  M: "Public Safety, Disaster Preparedness & Relief",
  N: "Recreation & Sports",
  O: "Youth Development",
  P: "Human Services",
  Q: "International, Foreign Affairs & National Security",
  R: "Civil Rights, Social Action & Advocacy",
  S: "Community Improvement & Capacity Building",
  T: "Philanthropy, Voluntarism & Grantmaking Foundations",
  U: "Science & Technology",
  V: "Social Science",
  W: "Public & Societal Benefit",
  X: "Religion-Related",
  Y: "Mutual & Membership Benefit",
  Z: "Unknown",
};
const NTEE_T: Record<string, string> = {
  T20: "Private Grantmaking Foundations",
  T21: "Corporate Foundations",
  T22: "Private Independent Foundations",
  T23: "Private Operating Foundations",
  T30: "Public Foundations",
  T31: "Community Foundations",
};

export function nteeLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  return NTEE_T[c.slice(0, 3)] ?? NTEE_MAJOR[c.charAt(0)] ?? null;
}

const FOUNDATION_TYPE_TEXT: Record<FoundationType, string> = {
  private_non_operating:
    "private non-operating foundation (IRS foundation code 04), the type that typically makes grants to other organizations",
  private_operating:
    "private operating foundation (IRS foundation code 02/03), which mostly runs its own charitable programs rather than making grants",
  private_foundation: "private foundation (files Form 990-PF; operating status not available)",
  public_charity: "public charity",
  unknown: "organization of unknown IRS foundation status",
};

export interface FunderFact {
  id: string;
  statement: string;
}

/** Numbered public-data facts about a foundation, citable by the model as ff_... ids. Pure. */
export type FunderFactInput = Pick<
  FoundationCandidate,
  | "ein"
  | "name"
  | "city"
  | "state"
  | "nteeCode"
  | "foundationType"
  | "latestFilingYear"
  | "latestFormType"
  | "totalAssetsCents"
  | "totalGivingCents"
>;

export function funderFacts(c: FunderFactInput): FunderFact[] {
  const out: FunderFact[] = [];
  const place = [c.city, c.state].filter(Boolean).join(", ");
  out.push({
    id: "ff_location",
    statement: `${c.name} (EIN ${formatEin(c.ein)}) is located in ${place || "an unknown location"}.`,
  });
  out.push({
    id: "ff_type",
    statement: `IRS classification: ${FOUNDATION_TYPE_TEXT[c.foundationType]}.`,
  });
  const ntee = nteeLabel(c.nteeCode);
  if (c.nteeCode) {
    out.push({
      id: "ff_ntee",
      statement: `NTEE code ${c.nteeCode}${ntee ? ` (${ntee})` : ""}; this classifies the foundation itself, not the causes it funds.`,
    });
  }
  const form = c.latestFormType != null ? (FORM_LABELS[c.latestFormType] ?? "990") : null;
  if (c.latestFilingYear != null) {
    out.push({
      id: "ff_filing",
      statement: `Most recent filing with financial data: Form ${form ?? "990"} for tax year ${c.latestFilingYear}.`,
    });
  } else {
    out.push({
      id: "ff_filing",
      statement: "No filing with extracted financial data is available.",
    });
  }
  if (c.totalAssetsCents != null) {
    out.push({
      id: "ff_assets",
      statement: `Total assets at the end of tax year ${c.latestFilingYear ?? "unknown"}: ${usd(c.totalAssetsCents)} (book value).`,
    });
  }
  out.push({
    id: "ff_giving",
    statement:
      c.totalGivingCents == null
        ? "Total contributions, gifts and grants paid are not reported in the available data."
        : c.totalGivingCents === 0
          ? `Reported contributions, gifts and grants paid in tax year ${c.latestFilingYear}: $0.`
          : `Reported contributions, gifts and grants paid in tax year ${c.latestFilingYear}: ${usd(c.totalGivingCents)}.`,
  });
  return out;
}

export interface OrgGeography {
  states: string[];
  places: string[];
}

/** Stable per org (cached across the foundations scored in one run). */
export function buildProspectContext(i: {
  profileText: string;
  geography: OrgGeography;
  factsText: string;
}): string {
  // Document-derived text must not close a block (sanitizeUntrusted is a no-op on plain text, so
  // ordinary inputs keep their scoreInputHash).
  return [
    `<org_profile>\n${sanitizeUntrusted(i.profileText.trim())}\n</org_profile>`,
    `<org_geography>\n${sanitizeUntrusted(`org_states: ${i.geography.states.join("; ") || "unknown"}\norg_places: ${i.geography.places.join("; ") || "unknown"}`)}\n</org_geography>`,
    `<facts>\n${sanitizeUntrusted(i.factsText.trim()) || "(no facts yet)"}\n</facts>`,
  ].join("\n\n");
}

export function buildProspectPrompt(c: FoundationCandidate, facts: FunderFact[]): string {
  const lines = [
    `name: ${c.name}`,
    `ein: ${formatEin(c.ein)}`,
    `funder_state: ${c.state ?? "unknown"}`,
    `funder_city: ${c.city ?? "unknown"}`,
    `foundation_type: ${c.foundationType}`,
    `latest_filing_year: ${c.latestFilingYear ?? "unknown"}`,
    `total_assets_cents: ${c.totalAssetsCents ?? "unknown"}`,
    `total_giving_cents: ${c.totalGivingCents ?? "unknown"}`,
    "",
    "funder_facts:",
    ...facts.map((f) => `[${f.id}] ${f.statement}`),
  ];
  // Names and places come from third-party filings data: tag-neutralized.
  return `Assess this foundation as a prospect for the organization above.\n\n<funder>\n${sanitizeUntrusted(lines.join("\n"))}\n</funder>`;
}

export interface FinalizeProspectInput {
  output: ProspectScoreOutput;
  orgFactIds: ReadonlySet<string>;
  funderFactIds: ReadonlySet<string>;
  totalGivingCents: number | null;
  foundationType: FoundationType;
}

export interface FinalProspectScore {
  fitScore: number;
  approach: ProspectApproach;
  approachNotes: string;
  reasons: ProspectReason[];
  /** Which caps were applied (for logs/tests). */
  caps: string[];
  droppedFactIds: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Deterministic guard rails on the model's output. Pure. */
export function finalizeProspectScore(i: FinalizeProspectInput): FinalProspectScore {
  const o = i.output;
  const dropped = new Set<string>();
  const reasons: ProspectReason[] = [];
  for (const r of o.reasons.slice(0, 8)) {
    const ids = [...new Set(r.factIds.map((id) => id.trim()))];
    const factIds = ids.filter((id) => i.orgFactIds.has(id));
    const funderFactIds = ids.filter((id) => i.funderFactIds.has(id));
    for (const id of ids) if (!i.orgFactIds.has(id) && !i.funderFactIds.has(id)) dropped.add(id);
    const text = r.text.trim().slice(0, 400);
    // A reason with no valid citation is unsupported: drop it rather than show it.
    if (!text || (factIds.length === 0 && funderFactIds.length === 0)) continue;
    reasons.push({ text, polarity: r.polarity, factIds, funderFactIds });
  }

  let fitScore = Math.round(clamp(Number.isFinite(o.fitScore) ? o.fitScore : 0, 0, 100));
  let approach: ProspectApproach = o.approach;
  const caps: string[] = [];
  const capTo = (cap: number, label: string, text: string, citeId: string) => {
    if (fitScore > cap) {
      fitScore = cap;
      caps.push(label);
    }
    reasons.push({
      text,
      polarity: "neutral",
      factIds: [],
      funderFactIds: i.funderFactIds.has(citeId) ? [citeId] : [],
    });
  };

  if (i.totalGivingCents == null) {
    capTo(
      GIVING_UNKNOWN_CAP,
      "giving_unknown",
      `Grants paid are not in the available filing data, so the score cannot exceed ${GIVING_UNKNOWN_CAP}. Check the 990-PF before investing time.`,
      "ff_giving",
    );
    if (approach === "letter_of_inquiry") approach = "research_first";
  } else if (i.totalGivingCents === 0) {
    capTo(
      NO_GIVING_CAP,
      "no_giving",
      `The latest filing reports no grants paid, so the score cannot exceed ${NO_GIVING_CAP}.`,
      "ff_giving",
    );
  }
  if (i.foundationType === "private_operating") {
    capTo(
      OPERATING_FOUNDATION_CAP,
      "operating_foundation",
      `Private operating foundations mostly run their own programs, so the score cannot exceed ${OPERATING_FOUNDATION_CAP}.`,
      "ff_type",
    );
    if (approach === "letter_of_inquiry") approach = "wait_for_rfp";
  }

  return {
    fitScore,
    approach,
    approachNotes: o.approachNotes.trim().slice(0, 600),
    reasons,
    caps,
    droppedFactIds: [...dropped],
  };
}
