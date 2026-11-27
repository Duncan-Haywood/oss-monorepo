// The "send the renewal" email: one draft a GC holding a certificate (insurance certificates, part 5),
// from the certificate as typed on the insurance page (src/shared/insurance.ts). Pure and offline: no
// LLM, nothing sent. The contractor reads it, edits it, attaches the certificate PDF and sends it from
// their own mail program. Every fact in it is one the insurance page already shows (coverage, insurer,
// policy number, policy period, limits and endorsements as typed, the jobs) and nothing is invented:
// no claim that a file is attached (the contractor attaches it), no claim about what the policy covers
// beyond what was typed from the certificate, no view on what the subcontract requires.
//
// Which draft:
// - "renewal": a certificate of the same coverage with an earlier expiry date had holders (the one
//   this renews): says the policy renewed, names the old expiry date and asks the GC to update its
//   records for each of its jobs.
// - "current": no earlier certificate: asks the GC to keep this one on file for its jobs.
// A certificate that is itself expired gets no draft: the renewal has to come from the agent first.
//
// Who it goes to: each GC once, however many of its jobs hold the certificate (holdersByGc). The
// recipient is the GC project manager entered on its jobs when they all name the same address; with
// none, or different ones, the recipient is left blank and the page lists the addresses it saw.

import {
  type CertificateHolder,
  certificateName,
  holdersByGc,
  type InsuranceKind,
} from "./insurance";
import { ENDORSEMENTS, formatLimit, LIMIT_LABELS } from "./insurance-requirements";

export type RenewalEmailKind = "renewal" | "current";

export interface RenewalEmailCertificate {
  id: string;
  kind: InsuranceKind;
  label: string | null;
  carrier: string | null;
  policyNumber: string | null;
  effectiveOn: string | null;
  expiresOn: string;
  archived: boolean;
  eachOccurrenceCents?: number | null;
  aggregateCents?: number | null;
  additionalInsured?: boolean;
  waiverOfSubrogation?: boolean;
  primaryNoncontributory?: boolean;
  holders: CertificateHolder[];
}

/** The job fields a draft reads (ProjectDto has them all). */
export interface RenewalEmailJob {
  id: string;
  name: string;
  number: string | null;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

export interface RenewalEmail {
  kind: RenewalEmailKind;
  gcName: string;
  /** The jobs of this GC the draft names, by job id (the ones "Record as sent" updates). */
  projectIds: string[];
  /** The one PM address all of the GC's jobs name, or null (the contractor adds it). */
  to: string | null;
  /** Every distinct PM address on the GC's jobs, so the page can offer them when `to` is null. */
  addresses: string[];
  subject: string;
  body: string;
}

/**
 * The certificate this one renews: the same coverage, an earlier expiry date and at least one holder,
 * the latest such (archived or not: the old one may still be active until the user archives it).
 */
export function renewedCertificate<
  C extends Pick<RenewalEmailCertificate, "id" | "kind" | "expiresOn" | "holders">,
>(cert: Pick<RenewalEmailCertificate, "id" | "kind" | "expiresOn">, all: C[]): C | null {
  return (
    all
      .filter(
        (x) =>
          x.id !== cert.id &&
          x.kind === cert.kind &&
          x.expiresOn < cert.expiresOn &&
          x.holders.length > 0,
      )
      .sort((a, b) => b.expiresOn.localeCompare(a.expiresOn))[0] ?? null
  );
}

/** "Policy period 2026-12-01 to 2027-12-01", or "Expires 2027-12-01" when no start date was typed. */
function periodText(c: Pick<RenewalEmailCertificate, "effectiveOn" | "expiresOn">): string {
  return c.effectiveOn
    ? `Policy period: ${c.effectiveOn} to ${c.expiresOn}`
    : `Expires: ${c.expiresOn}`;
}

/** The limits as typed, labelled per coverage; null when none typed. */
function limitsText(c: RenewalEmailCertificate): string | null {
  const labels = LIMIT_LABELS[c.kind];
  const parts: string[] = [];
  if (c.eachOccurrenceCents != null) {
    parts.push(`${labels.each.toLowerCase()} ${formatLimit(c.eachOccurrenceCents)}`);
  }
  if (c.aggregateCents != null) {
    parts.push(`${labels.aggregate.toLowerCase()} ${formatLimit(c.aggregateCents)}`);
  }
  return parts.length ? `Limits shown: ${parts.join(", ")}` : null;
}

function endorsementsText(c: RenewalEmailCertificate): string | null {
  const parts = ENDORSEMENTS.filter((e) => c[e.key]).map((e) => e.label.toLowerCase());
  return parts.length ? `The certificate shows: ${parts.join(", ")}` : null;
}

const jobLabel = (j: Pick<RenewalEmailJob, "name" | "number">) =>
  j.number ? `${j.name} (#${j.number})` : j.name;

/**
 * One draft for each GC holding `cert` (or, when nobody is recorded as holding it yet, each GC holding
 * the certificate it renews), by GC name. Empty when the certificate is archived or expired on `today`,
 * or nobody holds either.
 */
export function renewalEmails(
  cert: RenewalEmailCertificate,
  all: RenewalEmailCertificate[],
  jobs: RenewalEmailJob[],
  from: { name: string; company: string },
  today: string,
): RenewalEmail[] {
  if (cert.archived || cert.expiresOn <= today) return [];
  const previous = renewedCertificate(cert, all);
  const holders = cert.holders.length > 0 ? cert.holders : (previous?.holders ?? []);
  if (holders.length === 0) return [];
  const kind: RenewalEmailKind = previous ? "renewal" : "current";
  const name = certificateName(cert);
  const company = from.company.trim() || "[your company]";
  const signer = from.name.trim() || "[your name]";
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const facts = [
    `Coverage: ${name}`,
    cert.carrier ? `Insurer: ${cert.carrier}` : null,
    cert.policyNumber ? `Policy number: ${cert.policyNumber}` : null,
    periodText(cert),
    limitsText(cert),
    endorsementsText(cert),
  ].filter((x): x is string => Boolean(x));

  return holdersByGc(holders).map((g) => {
    const key = g.gcName.trim().toLowerCase();
    const gcHolders = holders.filter((h) => h.gcName.trim().toLowerCase() === key);
    const projectIds = [...new Set(gcHolders.map((h) => h.projectId))];
    const gcJobs = projectIds.map(
      (id) =>
        jobById.get(id) ?? {
          id,
          name: gcHolders.find((h) => h.projectId === id)?.projectName ?? id,
          number: null,
        },
    );
    const jobLines = [...gcJobs]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((j) => `- ${jobLabel(j)}`);
    const addresses = [
      ...new Set(
        gcJobs.map((j) => j.gcPmEmail?.trim().toLowerCase()).filter((x): x is string => Boolean(x)),
      ),
    ];
    const pmNames = [
      ...new Set(gcJobs.map((j) => j.gcPmName?.trim()).filter((x): x is string => Boolean(x))),
    ];
    const greeting =
      pmNames.length === 1 ? `Hello ${pmNames[0]},` : `Hello ${g.gcName} project team,`;
    const jobsWord = gcJobs.length === 1 ? "this job" : "these jobs";

    const subject =
      kind === "renewal"
        ? `Renewed certificate of insurance: ${company}, ${name}, to ${cert.expiresOn}`
        : `Certificate of insurance: ${company}, ${name}, to ${cert.expiresOn}`;
    const opening =
      kind === "renewal" && previous
        ? `Our ${name} policy has renewed. The certificate you hold for us ${previous.expiresOn <= today ? "expired" : "expires"} ${previous.expiresOn}; please replace it with the renewed certificate for ${jobsWord}:`
        : `Please keep our current ${name} certificate of insurance on file for ${jobsWord}:`;
    const body = [
      greeting,
      "",
      opening,
      ...jobLines,
      "",
      ...facts,
      "",
      "If you need the certificate issued with different wording or a different certificate holder, let me know and I will ask our agent.",
      "",
      "Thank you,",
      signer,
      company,
    ].join("\n");
    return {
      kind,
      gcName: g.gcName,
      projectIds,
      to: addresses.length === 1 ? (addresses[0] ?? null) : null,
      addresses,
      subject,
      body,
    };
  });
}

/**
 * The holder list to save once the draft for `projectIds` was sent on `today`: the certificate's own
 * holders kept as they are, those jobs added or given today's date. The PUT replaces the whole list.
 */
export function holdersAfterSend(
  current: Pick<CertificateHolder, "projectId" | "sentOn">[],
  projectIds: string[],
  today: string,
): { projectId: string; sentOn: string | null }[] {
  const out = new Map(current.map((h) => [h.projectId, h.sentOn ?? null]));
  for (const id of projectIds) out.set(id, today);
  return [...out.entries()].map(([projectId, sentOn]) => ({ projectId, sentOn }));
}
