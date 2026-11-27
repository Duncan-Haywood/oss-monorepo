// Insurance certificates: the company's own certificates of insurance (general liability, auto,
// workers' compensation, umbrella...) that GCs ask a subcontractor to keep current. Many GCs will not
// release a payment while a sub's certificate on file has expired, so a lapsed or soon-lapsing policy
// is worth seeing before a pay application goes out. Pure: the status is computed on read from the
// stored expiry date, nothing else is stored but what the user typed (insurance_certificates).
//
// Rules:
// - A certificate is "expired" on and after its expiry date, "expiring" within
//   INSURANCE_EXPIRING_DAYS before it, else "current". PayApps does not know the hour a policy ends
//   (the policy says), so the expiry day itself already counts as expired: the safe side.
// - A pay application is warned about every certificate that is expired on its application date
//   ("lapsed") or expires within INSURANCE_EXPIRING_DAYS after it ("expiring"): the GC reviews the
//   application in the days after it is sent.
// - Archived certificates (replaced by a renewal, or a policy the company no longer carries) are
//   never warned about.
// - Certificate holders: the jobs whose GC holds a certificate (the GC is the "certificate holder"
//   on an ACORD 25), recorded by the user with the date it was sent when known. A renewal goes to
//   every GC holding the old certificate (one send a GC, however many of its jobs); a pay
//   application says whether its own GC has the certificate on file, once the company records
//   holders at all (an empty list everywhere means the feature is unused, not "nobody holds it").
// PayApps only reads the dates the user typed here. What a job's subcontract requires (coverages,
// limits, endorsements) is checked in insurance-requirements.ts, against what was typed from each
// certificate, never against the policy itself.

export const INSURANCE_KINDS = [
  "general_liability",
  "auto",
  "workers_comp",
  "umbrella",
  "professional",
  "pollution",
  "builders_risk",
  "other",
] as const;
export type InsuranceKind = (typeof INSURANCE_KINDS)[number];

export const INSURANCE_KIND_LABELS: Record<InsuranceKind, string> = {
  general_liability: "General liability",
  auto: "Commercial auto",
  workers_comp: "Workers' compensation",
  umbrella: "Umbrella / excess",
  professional: "Professional liability",
  pollution: "Pollution liability",
  builders_risk: "Builder's risk",
  other: "Other",
};

/** Days before the expiry date a certificate counts as expiring. */
export const INSURANCE_EXPIRING_DAYS = 30;

export type InsuranceStatus = "current" | "expiring" | "expired";

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export interface CertificateStatus {
  status: InsuranceStatus;
  /** Days from `today` to the expiry date: 0 on the day, negative once past. */
  daysLeft: number;
}

export function certificateStatus(expiresOn: string, today: string): CertificateStatus {
  const daysLeft = daysBetween(today, expiresOn);
  const status: InsuranceStatus =
    daysLeft <= 0 ? "expired" : daysLeft <= INSURANCE_EXPIRING_DAYS ? "expiring" : "current";
  return { status, daysLeft };
}

export interface CertificateInput {
  id: string;
  kind: InsuranceKind;
  /** The user's own name for it ("Other" kinds, or a second policy of a kind). */
  label: string | null;
  carrier: string | null;
  policyNumber: string | null;
  /** YYYY-MM-DD. */
  expiresOn: string;
  archived: boolean;
  /** The GCs holding it (certificate holders), deduplicated; absent or empty when none recorded. */
  holderGcs?: string[];
}

/** "General liability", or "Other: Inland marine", or "General liability (Acme Mutual)". */
export function certificateName(c: Pick<CertificateInput, "kind" | "label" | "carrier">): string {
  const base = INSURANCE_KIND_LABELS[c.kind];
  if (c.label) return c.kind === "other" ? c.label : `${base}: ${c.label}`;
  return c.carrier ? `${base} (${c.carrier})` : base;
}

export interface PayAppInsuranceWarning {
  id: string;
  name: string;
  expiresOn: string;
  /** "lapsed": expired on the application date; "expiring": within the window after it. */
  kind: "lapsed" | "expiring";
  /** Days from the application date to the expiry date (0 or negative when lapsed). */
  days: number;
  message: string;
}

/**
 * The certificates a pay application dated `applicationDate` should be warned about, lapsed first,
 * then by expiry date.
 */
export function payAppInsuranceWarnings(
  certificates: CertificateInput[],
  applicationDate: string,
): PayAppInsuranceWarning[] {
  const out: PayAppInsuranceWarning[] = [];
  for (const c of certificates) {
    if (c.archived) continue;
    const days = daysBetween(applicationDate, c.expiresOn);
    if (days > INSURANCE_EXPIRING_DAYS) continue;
    const name = certificateName(c);
    const lapsed = days <= 0;
    out.push({
      id: c.id,
      name,
      expiresOn: c.expiresOn,
      kind: lapsed ? "lapsed" : "expiring",
      days,
      message: lapsed
        ? `${name} certificate expired ${c.expiresOn}, on or before this application's date. Many GCs hold payment until a current certificate is on file: send the renewal with this application.`
        : `${name} certificate expires ${c.expiresOn}, ${days} day${days === 1 ? "" : "s"} after this application's date. Send the GC the renewal before then.`,
    });
  }
  return out.sort(
    (a, b) =>
      (a.kind === "lapsed" ? 0 : 1) - (b.kind === "lapsed" ? 0 : 1) ||
      a.expiresOn.localeCompare(b.expiresOn),
  );
}

/** Active certificates that are expired or expiring on `today`, soonest first (the weekly email). */
export function certificatesNeedingRenewal(
  certificates: CertificateInput[],
  today: string,
): (CertificateInput & CertificateStatus)[] {
  return certificates
    .filter((c) => !c.archived)
    .map((c) => ({ ...c, ...certificateStatus(c.expiresOn, today) }))
    .filter((c) => c.status !== "current")
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

/** One job whose GC holds a certificate, as the insurance page lists it. */
export interface CertificateHolder {
  projectId: string;
  projectName: string;
  gcName: string;
  /** YYYY-MM-DD the certificate was sent to the GC, or null when not typed. */
  sentOn: string | null;
}

/** The GCs holding a certificate, each once with its jobs, by GC name (a renewal is one send a GC). */
export function holdersByGc(holders: CertificateHolder[]): { gcName: string; jobs: string[] }[] {
  const byGc = new Map<string, { gcName: string; jobs: string[] }>();
  for (const h of holders) {
    const key = h.gcName.trim().toLowerCase();
    const g = byGc.get(key) ?? { gcName: h.gcName.trim(), jobs: [] };
    if (!g.jobs.includes(h.projectName)) g.jobs.push(h.projectName);
    byGc.set(key, g);
  }
  return [...byGc.values()]
    .map((g) => ({ ...g, jobs: [...g.jobs].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.gcName.localeCompare(b.gcName));
}

/** "Sierra Builders", "Sierra Builders and Acme GC", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface JobCertificate {
  id: string;
  name: string;
  /** This job's GC holds it (recorded on the insurance page). */
  held: boolean;
  sentOn: string | null;
}

/**
 * For one job's pay application: each active certificate and whether this job is recorded as holding
 * it, held first. Null when the company has recorded no holder on any certificate: then PayApps
 * cannot tell, and says nothing rather than "not on file".
 */
export function jobCertificates(
  certificates: (Pick<CertificateInput, "id" | "kind" | "label" | "carrier" | "archived"> & {
    holders: Pick<CertificateHolder, "projectId" | "sentOn">[];
  })[],
  projectId: string,
): JobCertificate[] | null {
  if (!certificates.some((c) => c.holders.length > 0)) return null;
  return certificates
    .filter((c) => !c.archived)
    .map((c) => {
      const h = c.holders.find((x) => x.projectId === projectId);
      return { id: c.id, name: certificateName(c), held: Boolean(h), sentOn: h?.sentOn ?? null };
    })
    .sort((a, b) => Number(b.held) - Number(a.held) || a.name.localeCompare(b.name));
}
