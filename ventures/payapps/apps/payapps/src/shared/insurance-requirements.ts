// Insurance requirements per job (insurance certificates, part 4): what the job's subcontract asks the
// company to carry (each coverage, its minimum limits, and the additional insured, waiver of
// subrogation and primary and non-contributory wording), checked against the certificates on file
// (src/shared/insurance.ts). A GC that finds a certificate short of the subcontract's requirements
// usually sends it back, and many hold the payment until a compliant one arrives, so the gap is worth
// seeing before the pay application goes out. Pure.
//
// Rules:
// - A certificate counts on a date when it is not archived, its effective date (when typed) is on or
//   before that date, and the date is before its expiry date (the expiry day itself counts as
//   expired, the same safe side as insurance.ts).
// - A requirement is met by one certificate of its coverage that is in force and has every limit and
//   every endorsement asked for. With several, the one with the fewest gaps is reported (then the
//   latest expiry).
// - A limit the company has not typed on the certificate is a gap ("not recorded"), never assumed met.
// - An umbrella or excess policy in force makes up a limit's shortfall only when the requirement says
//   the GC accepts it ("umbrella may count"), as many subcontracts allow; its own each-occurrence
//   limit adds to the each-occurrence limit and its aggregate to the aggregate.
// - Endorsements are what the certificate on file shows (the ADDL INSD and SUBR WVD columns, or the
//   description box). PayApps does not read the policy or the endorsement forms: a certificate is
//   evidence of coverage, not the coverage, and the GC's or the broker's reading of the policy wins.
import type { InsuranceKind } from "./insurance";
import { certificateName, INSURANCE_KIND_LABELS } from "./insurance";
import { formatCents } from "./money";

/** What the subcontract asks for one coverage on one job. */
export interface InsuranceRequirement {
  kind: InsuranceKind;
  /** Minimum each-occurrence (or each-accident, each-claim) limit in cents; null: none asked. */
  eachOccurrenceCents: number | null;
  /** Minimum aggregate (or policy-limit) limit in cents; null: none asked. */
  aggregateCents: number | null;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
  /** The GC accepts an umbrella or excess policy toward this coverage's limits. */
  umbrellaCounts: boolean;
}

/** A certificate as the check reads it: dates, limits and the endorsements it shows. */
export interface CertificateCoverage {
  id: string;
  kind: InsuranceKind;
  label: string | null;
  carrier: string | null;
  effectiveOn: string | null;
  expiresOn: string;
  archived: boolean;
  eachOccurrenceCents: number | null;
  aggregateCents: number | null;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
}

/** How the two limits are labelled on a certificate (ACORD 25 wording where it has one). */
export const LIMIT_LABELS: Record<InsuranceKind, { each: string; aggregate: string }> = {
  general_liability: { each: "Each occurrence", aggregate: "General aggregate" },
  auto: { each: "Combined single limit", aggregate: "Aggregate" },
  workers_comp: {
    each: "Employer's liability, each accident",
    aggregate: "E.L. disease, policy limit",
  },
  umbrella: { each: "Each occurrence", aggregate: "Aggregate" },
  professional: { each: "Each claim", aggregate: "Aggregate" },
  pollution: { each: "Each occurrence", aggregate: "Aggregate" },
  builders_risk: { each: "Limit", aggregate: "Aggregate" },
  other: { each: "Each occurrence", aggregate: "Aggregate" },
};

export const ENDORSEMENTS = [
  { key: "additionalInsured", label: "Additional insured" },
  { key: "waiverOfSubrogation", label: "Waiver of subrogation" },
  { key: "primaryNoncontributory", label: "Primary and non-contributory" },
] as const;
export type EndorsementKey = (typeof ENDORSEMENTS)[number]["key"];

export type GapKind =
  | "missing"
  | "lapsed"
  | "not_started"
  | "limit"
  | "limit_unknown"
  | "endorsement";

export interface RequirementGap {
  kind: GapKind;
  message: string;
}

export interface RequirementCheck {
  kind: InsuranceKind;
  coverage: string;
  met: boolean;
  /** The certificate the result is about (the best one in force), or null when none is. */
  certificateId: string | null;
  certificateName: string | null;
  /** An umbrella made up a limit's shortfall. */
  usedUmbrella: boolean;
  gaps: RequirementGap[];
}

/** $1,000,000 rather than $1,000,000.00: limits are whole dollars. */
export function formatLimit(cents: number): string {
  return formatCents(cents).replace(/\.00$/, "");
}

export function inForce(
  c: Pick<CertificateCoverage, "archived" | "effectiveOn" | "expiresOn">,
  onDate: string,
): boolean {
  return !c.archived && (!c.effectiveOn || c.effectiveOn <= onDate) && onDate < c.expiresOn;
}

/** A requirement in words: "General liability: each occurrence $1,000,000, additional insured". A row with no limit and no endorsement still asks for the coverage. */
export function requirementText(r: InsuranceRequirement): string {
  const labels = LIMIT_LABELS[r.kind];
  const parts: string[] = [];
  if (r.eachOccurrenceCents !== null) {
    parts.push(`${labels.each.toLowerCase()} ${formatLimit(r.eachOccurrenceCents)}`);
  }
  if (r.aggregateCents !== null) {
    parts.push(`${labels.aggregate.toLowerCase()} ${formatLimit(r.aggregateCents)}`);
  }
  for (const e of ENDORSEMENTS) if (r[e.key]) parts.push(e.label.toLowerCase());
  const base = INSURANCE_KIND_LABELS[r.kind];
  const umb = r.umbrellaCounts && (r.eachOccurrenceCents !== null || r.aggregateCents !== null);
  return parts.length === 0
    ? base
    : `${base}: ${parts.join(", ")}${umb ? " (umbrella may count)" : ""}`;
}

function bestUmbrella(certs: CertificateCoverage[], onDate: string) {
  const umbrellas = certs.filter((c) => c.kind === "umbrella" && inForce(c, onDate));
  const max = (key: "eachOccurrenceCents" | "aggregateCents") =>
    umbrellas.reduce<number | null>(
      (m, c) => (c[key] === null ? m : Math.max(m ?? 0, c[key] as number)),
      null,
    );
  return { each: max("eachOccurrenceCents"), aggregate: max("aggregateCents") };
}

function gapsFor(
  r: InsuranceRequirement,
  c: CertificateCoverage,
  umbrella: { each: number | null; aggregate: number | null },
): { gaps: RequirementGap[]; usedUmbrella: boolean } {
  const gaps: RequirementGap[] = [];
  let usedUmbrella = false;
  const labels = LIMIT_LABELS[r.kind];
  const limit = (
    asked: number | null,
    have: number | null,
    extra: number | null,
    label: string,
  ) => {
    if (asked === null) return;
    if (have === null) {
      gaps.push({
        kind: "limit_unknown",
        message: `${label} limit is not recorded on the certificate on file; the job asks for ${formatLimit(asked)}.`,
      });
      return;
    }
    if (have >= asked) return;
    const canUse = r.umbrellaCounts && r.kind !== "umbrella" && extra !== null;
    if (canUse && have + (extra as number) >= asked) {
      usedUmbrella = true;
      return;
    }
    gaps.push({
      kind: "limit",
      message: canUse
        ? `${label} ${formatLimit(have)} plus the umbrella's ${formatLimit(extra as number)} is ${formatLimit(have + (extra as number))}; the job asks for ${formatLimit(asked)}.`
        : `${label} ${formatLimit(have)}; the job asks for ${formatLimit(asked)}.`,
    });
  };
  limit(r.eachOccurrenceCents, c.eachOccurrenceCents, umbrella.each, labels.each);
  limit(r.aggregateCents, c.aggregateCents, umbrella.aggregate, labels.aggregate);
  for (const e of ENDORSEMENTS) {
    if (r[e.key] && !c[e.key]) {
      gaps.push({
        kind: "endorsement",
        message: `${e.label} is not shown on the certificate on file; the job asks for it.`,
      });
    }
  }
  return { gaps, usedUmbrella };
}

/**
 * Each of a job's requirements checked against the company's certificates on `onDate` (YYYY-MM-DD),
 * in the order of the requirements.
 */
export function checkRequirements(
  requirements: InsuranceRequirement[],
  certificates: CertificateCoverage[],
  onDate: string,
): RequirementCheck[] {
  const umbrella = bestUmbrella(certificates, onDate);
  return requirements.map((r) => {
    const coverage = INSURANCE_KIND_LABELS[r.kind];
    const ofKind = certificates.filter((c) => c.kind === r.kind && !c.archived);
    const live = ofKind.filter((c) => inForce(c, onDate));
    if (live.length === 0) {
      const future = ofKind
        .filter((c) => c.effectiveOn && c.effectiveOn > onDate)
        .sort((a, b) => (a.effectiveOn as string).localeCompare(b.effectiveOn as string))[0];
      const lapsed = ofKind
        .filter((c) => c.expiresOn <= onDate)
        .sort((a, b) => b.expiresOn.localeCompare(a.expiresOn))[0];
      const gap: RequirementGap = future
        ? {
            kind: "not_started",
            message: `${coverage}: the certificate on file starts ${future.effectiveOn}; nothing on file covers this date.`,
          }
        : lapsed
          ? {
              kind: "lapsed",
              message: `${coverage}: the certificate on file expired ${lapsed.expiresOn}. Ask the broker for the renewal certificate.`,
            }
          : {
              kind: "missing",
              message: `${coverage}: no certificate on file, and the job asks for it.`,
            };
      return {
        kind: r.kind,
        coverage,
        met: false,
        certificateId: null,
        certificateName: null,
        usedUmbrella: false,
        gaps: [gap],
      };
    }
    const scored = live
      .map((c) => ({ c, ...gapsFor(r, c, umbrella) }))
      .sort((a, b) => a.gaps.length - b.gaps.length || b.c.expiresOn.localeCompare(a.c.expiresOn));
    const best = scored[0] as (typeof scored)[number];
    return {
      kind: r.kind,
      coverage,
      met: best.gaps.length === 0,
      certificateId: best.c.id,
      certificateName: certificateName(best.c),
      usedUmbrella: best.usedUmbrella,
      gaps: best.gaps,
    };
  });
}

/** One line per unmet requirement, for a pay application's note: "General liability: ...". */
export function requirementGapLines(checks: RequirementCheck[]): string[] {
  return checks
    .filter((c) => !c.met)
    .flatMap((c) =>
      c.gaps.map((g) =>
        g.message.startsWith(`${c.coverage}:`) ? g.message : `${c.coverage}: ${g.message}`,
      ),
    );
}
