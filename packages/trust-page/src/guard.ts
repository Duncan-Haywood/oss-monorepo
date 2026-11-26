// Honesty guards. A trust page must never imply a certification or attestation the company does not
// hold (it holds none: docs/trust/README.md). Providers' own reports are linked per subprocessor by the
// renderer with fixed wording, so profile text has no reason to name SOC 2, ISO 27001 and the like.

import type { Claim, ClaimStatus, SectionId, Subprocessor, TrustProfile } from "./types.ts";

export class TrustClaimError extends Error {
  override name = "TrustClaimError";
}

/**
 * Wording that names or implies a certification, audit or attestation. Matched case-insensitively on
 * every string in a profile. Deliberately broad: a false positive costs a rewrite, a false negative
 * costs a misleading public page.
 */
const FORBIDDEN: readonly { re: RegExp; why: string }[] = [
  { re: /\bSOC\s*-?\s*[123]\b/i, why: "names SOC reports" },
  { re: /\bSSAE\s*-?\s*1[68]\b|\bISAE\s*-?\s*3402\b/i, why: "names an audit standard" },
  {
    re: /\bISO(?:\/IEC)?\s*-?\s*(?:27001|27017|27018|27701|42001|9001)\b/i,
    why: "names an ISO standard",
  },
  { re: /\bPCI(?:[\s-]*DSS)?\b/i, why: "names PCI" },
  {
    re: /\bHIPAA\b|\bHITRUST\b|\bFedRAMP\b|\bStateRAMP\b|\bCMMC\b/i,
    why: "names a regulatory regime",
  },
  { re: /\bCSA\s+STAR\b|\bSTAR\s+(?:Level|registry|certif)/i, why: "names CSA STAR" },
  { re: /\bGDPR[\s-]+(?:compliant|certified|ready)\b/i, why: "claims GDPR compliance" },
  { re: /\bcertif(?:ied|ication|icate)s?\b/i, why: "says certified/certification" },
  { re: /\baccredit(?:ed|ation)\b/i, why: "says accredited" },
  { re: /\b(?:audited|attested|attestation)\b/i, why: "says audited/attested" },
  { re: /\bcompliant\b|\bcompliance\b/i, why: "says compliant/compliance" },
  { re: /\b(?:bank|military)[\s-]grade\b/i, why: "marketing security wording" },
  { re: /\b(?:unhackable|100%\s*secure|fully\s+secure|guarantee[sd]?)\b/i, why: "absolute claim" },
];

/** Throws if `text` contains certification-like or absolute wording. `where` names the field. */
export function assertHonestText(text: string, where: string): void {
  for (const { re, why } of FORBIDDEN) {
    const m = re.exec(text);
    if (m) {
      throw new TrustClaimError(
        `${where}: "${m[0]}" ${why}; trust pages must not imply certifications`,
      );
    }
  }
}

const STATUSES: readonly ClaimStatus[] = [
  "in_place",
  "partial",
  "not_in_place",
  "owner_to_confirm",
];
export const SECTION_IDS: readonly SectionId[] = [
  "data_location",
  "encryption",
  "access",
  "backups",
  "deletion",
  "incident",
  "development",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A source is a monorepo-relative path (no "..", no leading "/") or an https URL. */
export function isValidSource(s: string): boolean {
  if (s.startsWith("https://")) {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  }
  if (s.includes("://") || s.startsWith("mailto:")) return false;
  const path = s.split("#")[0] ?? "";
  return path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..");
}

export function isSecurityContact(uri: string): boolean {
  return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(uri) || /^https:\/\/[^\s]+$/.test(uri);
}

function checkClaim(c: Claim, where: string): void {
  if (!c.text.trim()) throw new TrustClaimError(`${where}: empty claim`);
  if (!STATUSES.includes(c.status))
    throw new TrustClaimError(`${where}: unknown status ${c.status}`);
  if (c.sources.length === 0)
    throw new TrustClaimError(`${where}: a claim needs at least one source`);
  for (const s of c.sources) {
    if (!isValidSource(s)) throw new TrustClaimError(`${where}: bad source "${s}"`);
  }
  assertHonestText(c.text, where);
}

function checkSubprocessor(p: Subprocessor, where: string): void {
  for (const [k, v] of Object.entries({
    name: p.name,
    purpose: p.purpose,
    data: p.data,
    location: p.location,
    condition: p.condition ?? "",
  })) {
    assertHonestText(v, `${where}.${k}`);
  }
  if (p.sources.length === 0) throw new TrustClaimError(`${where}: needs a source`);
  for (const s of p.sources) {
    if (!isValidSource(s)) throw new TrustClaimError(`${where}: bad source "${s}"`);
  }
  if (p.trustUrl !== undefined && !p.trustUrl.startsWith("https://")) {
    throw new TrustClaimError(`${where}: trustUrl must be https`);
  }
  if (p.trustUrlCheckedOn !== undefined) {
    if (!p.trustUrl) throw new TrustClaimError(`${where}: trustUrlCheckedOn without trustUrl`);
    if (!isIsoDate(p.trustUrlCheckedOn)) {
      throw new TrustClaimError(`${where}: trustUrlCheckedOn must be YYYY-MM-DD`);
    }
  }
}

/** Validates a whole profile; throws TrustClaimError on the first problem. */
export function validateProfile(profile: TrustProfile): void {
  assertHonestText(profile.product, "product");
  assertHonestText(profile.operator, "operator");
  if (!isIsoDate(profile.reviewedOn)) throw new TrustClaimError("reviewedOn must be YYYY-MM-DD");
  if (profile.securityContact !== null && !isSecurityContact(profile.securityContact)) {
    throw new TrustClaimError("securityContact must be a mailto: or https: URI");
  }
  if (
    profile.disclosurePolicyUrl !== undefined &&
    !profile.disclosurePolicyUrl.startsWith("https://")
  ) {
    throw new TrustClaimError("disclosurePolicyUrl must be https");
  }
  for (const id of SECTION_IDS) {
    const claims = profile.sections[id];
    if (!claims || claims.length === 0) throw new TrustClaimError(`section ${id} is empty`);
    claims.forEach((c, i) => {
      checkClaim(c, `${id}[${i}]`);
    });
  }
  const ids = new Set<string>();
  profile.subprocessors.forEach((p, i) => {
    if (ids.has(p.id)) throw new TrustClaimError(`duplicate subprocessor id ${p.id}`);
    ids.add(p.id);
    checkSubprocessor(p, `subprocessors[${i}]`);
  });
}

/** Every source in a profile, for the "does this path still exist" test. */
export function profileSources(profile: TrustProfile): string[] {
  const out: string[] = [];
  for (const id of SECTION_IDS) for (const c of profile.sections[id]) out.push(...c.sources);
  for (const p of profile.subprocessors) out.push(...p.sources);
  return out;
}
