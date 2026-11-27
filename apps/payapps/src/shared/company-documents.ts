// Company documents: the compliance papers other than insurance that a GC asks a subcontractor for
// before the first payment and again when they lapse (contractor's licenses, the business license,
// the W-9, the surety's bonding letter, the safety program, the EMR letter, OSHA's 300A summary,
// a DBE/MBE/WBE certification). Insurance certificates have their own page (insurance.ts); these
// share its date rules. Pure: the status is computed on read from the typed expiry date, nothing is
// stored but what the user typed (company_documents).
//
// Rules:
// - The expiry date is optional: a W-9 or a written safety program has none. A document with none
//   is "no_expiry" and is never warned about. With one, it is "expired" on and after that day,
//   "expiring" within COMPANY_DOCUMENT_EXPIRING_DAYS before it, else "current", the same safe-side
//   rule as an insurance certificate (insurance.ts: the day itself counts as expired).
// - A pay application is warned about every active document expired on its application date
//   ("lapsed") or expiring within the window after it ("expiring").
// - A W-9 keeps no number: its number is the company's taxpayer identification number (an EIN, or
//   an SSN for a sole proprietor), which PayApps does not store. The schema refuses one.
// - Files (part 2): each document keeps its own files (the license card, the bonding letter PDF),
//   which a draft pay application offers as backup. A signed W-9 shows the taxpayer identification
//   number, so its file is kept only when the person uploading says so (W9_FILE_CONSENT_FIELD); the
//   typed record still never holds the number.
// - The prequalification summary lists the active documents as text a person pastes into a GC's
//   subcontractor prequalification form: what was typed, nothing looked up or verified.
// PayApps reads only what the user typed. It does not check a license with the state board, and
// says so on the page.
import { daysBetween } from "./insurance";

export const COMPANY_DOCUMENT_KINDS = [
  "contractor_license",
  "business_license",
  "w9",
  "bonding_letter",
  "safety_program",
  "emr_letter",
  "osha_300a",
  "diversity_certification",
  "other",
] as const;
export type CompanyDocumentKind = (typeof COMPANY_DOCUMENT_KINDS)[number];

export const COMPANY_DOCUMENT_KIND_LABELS: Record<CompanyDocumentKind, string> = {
  contractor_license: "Contractor's license",
  business_license: "Business license",
  w9: "W-9",
  bonding_letter: "Bonding letter",
  safety_program: "Safety program",
  emr_letter: "EMR letter",
  osha_300a: "OSHA 300A summary",
  diversity_certification: "DBE / MBE / WBE certification",
  other: "Other",
};

/** What the "number" field holds for each kind, as the form labels it (null: the kind keeps none). */
export const COMPANY_DOCUMENT_NUMBER_LABELS: Record<CompanyDocumentKind, string | null> = {
  contractor_license: "License number",
  business_license: "License number",
  w9: null,
  bonding_letter: "Single / aggregate capacity",
  safety_program: null,
  emr_letter: "EMR (e.g. 0.82)",
  osha_300a: "Year summarized",
  diversity_certification: "Certification number",
  other: "Number",
};

/** Who issued it, as the form labels it. */
export const COMPANY_DOCUMENT_ISSUER_LABELS: Record<CompanyDocumentKind, string> = {
  contractor_license: "Issued by (state board)",
  business_license: "Issued by (city or county)",
  w9: "Given to (optional)",
  bonding_letter: "Surety",
  safety_program: "Written by",
  emr_letter: "Insurer or rating bureau",
  osha_300a: "Establishment",
  diversity_certification: "Certifying agency",
  other: "Issued by",
};

/** Days before the expiry date a document counts as expiring. */
export const COMPANY_DOCUMENT_EXPIRING_DAYS = 30;

export type CompanyDocumentStatus = "current" | "expiring" | "expired" | "no_expiry";

export interface DocumentStatus {
  status: CompanyDocumentStatus;
  /** Days from `today` to the expiry date (0 on the day, negative once past); null with no date. */
  daysLeft: number | null;
}

export function documentStatus(expiresOn: string | null, today: string): DocumentStatus {
  if (!expiresOn) return { status: "no_expiry", daysLeft: null };
  const daysLeft = daysBetween(today, expiresOn);
  const status: CompanyDocumentStatus =
    daysLeft <= 0 ? "expired" : daysLeft <= COMPANY_DOCUMENT_EXPIRING_DAYS ? "expiring" : "current";
  return { status, daysLeft };
}

export interface CompanyDocumentInput {
  id: string;
  kind: CompanyDocumentKind;
  /** The user's own name for it ("Other" kinds, or the trade a license is for). */
  label: string | null;
  issuer: string | null;
  /** State, county or city the document is for (a license is per state). */
  jurisdiction: string | null;
  /** The license class or classification ("C-10 Electrical"). */
  classification: string | null;
  number: string | null;
  effectiveOn: string | null;
  /** YYYY-MM-DD, or null when the document does not expire. */
  expiresOn: string | null;
  archived: boolean;
}

/** "Contractor's license (CA)", "Contractor's license: Electrical (NV)", or "Other: Union letter". */
export function documentName(
  d: Pick<CompanyDocumentInput, "kind" | "label" | "jurisdiction">,
): string {
  const base = COMPANY_DOCUMENT_KIND_LABELS[d.kind];
  const name = d.label ? (d.kind === "other" ? d.label : `${base}: ${d.label}`) : base;
  return d.jurisdiction ? `${name} (${d.jurisdiction})` : name;
}

export interface PayAppDocumentWarning {
  id: string;
  name: string;
  expiresOn: string;
  /** "lapsed": expired on the application date; "expiring": within the window after it. */
  kind: "lapsed" | "expiring";
  /** Days from the application date to the expiry date (0 or negative when lapsed). */
  days: number;
  message: string;
}

/** The documents a pay application dated `applicationDate` should be warned about, lapsed first. */
export function payAppDocumentWarnings(
  documents: CompanyDocumentInput[],
  applicationDate: string,
): PayAppDocumentWarning[] {
  const out: PayAppDocumentWarning[] = [];
  for (const d of documents) {
    if (d.archived || !d.expiresOn) continue;
    const days = daysBetween(applicationDate, d.expiresOn);
    if (days > COMPANY_DOCUMENT_EXPIRING_DAYS) continue;
    const name = documentName(d);
    const lapsed = days <= 0;
    out.push({
      id: d.id,
      name,
      expiresOn: d.expiresOn,
      kind: lapsed ? "lapsed" : "expiring",
      days,
      message: lapsed
        ? `${name} expired ${d.expiresOn}, on or before this application's date. If the GC keeps a copy on file, send the renewed one with this application.`
        : `${name} expires ${d.expiresOn}, ${days} day${days === 1 ? "" : "s"} after this application's date. Renew it and send the GC the new copy before then.`,
    });
  }
  return out.sort(
    (a, b) =>
      (a.kind === "lapsed" ? 0 : 1) - (b.kind === "lapsed" ? 0 : 1) ||
      a.expiresOn.localeCompare(b.expiresOn),
  );
}

/** Active documents expired or expiring on `today`, soonest first (the Projects page note). */
export function documentsNeedingRenewal(
  documents: CompanyDocumentInput[],
  today: string,
): (CompanyDocumentInput & DocumentStatus)[] {
  return documents
    .filter((d) => !d.archived)
    .map((d) => ({ ...d, ...documentStatus(d.expiresOn, today) }))
    .filter((d) => d.status === "expired" || d.status === "expiring")
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
}

/** One line of the prequalification summary: "Contractor's license (CA): C-10 Electrical, No. 1234567, CSLB, expires 2027-06-30". */
export function documentLine(d: CompanyDocumentInput, today: string): string {
  const parts: string[] = [];
  if (d.classification) parts.push(d.classification);
  const numberLabel = COMPANY_DOCUMENT_NUMBER_LABELS[d.kind];
  if (d.number && numberLabel) {
    parts.push(
      d.kind === "contractor_license" ||
        d.kind === "business_license" ||
        d.kind === "diversity_certification"
        ? `No. ${d.number}`
        : d.kind === "emr_letter"
          ? `EMR ${d.number}`
          : d.kind === "osha_300a"
            ? `year ${d.number}`
            : d.kind === "bonding_letter"
              ? `capacity ${d.number}`
              : d.number,
    );
  }
  if (d.issuer) parts.push(d.issuer);
  const s = documentStatus(d.expiresOn, today);
  if (d.expiresOn) {
    parts.push(s.status === "expired" ? `EXPIRED ${d.expiresOn}` : `expires ${d.expiresOn}`);
  } else if (d.effectiveOn) {
    parts.push(`dated ${d.effectiveOn}`);
  } else if (d.kind === "w9") {
    parts.push("on file");
  }
  const name = documentName(d);
  return parts.length ? `${name}: ${parts.join(", ")}` : name;
}

/**
 * The company's active documents as plain text for a GC's prequalification form or an email, in
 * the order the kinds are listed (licenses first), then by name. An expired one is still listed,
 * marked EXPIRED, so nothing is hidden from the person pasting it.
 */
export function prequalificationSummary(
  documents: CompanyDocumentInput[],
  companyName: string,
  today: string,
): string {
  const order = new Map(COMPANY_DOCUMENT_KINDS.map((k, i) => [k, i]));
  const active = documents
    .filter((d) => !d.archived)
    .sort(
      (a, b) =>
        (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) ||
        documentName(a).localeCompare(documentName(b)),
    );
  const head = `${companyName.trim() || "Our company"}: licenses and compliance documents (as of ${today})`;
  if (active.length === 0) return `${head}\n(none recorded)`;
  return [head, ...active.map((d) => `- ${documentLine(d, today)}`)].join("\n");
}

/**
 * The multipart field a W-9's file upload must carry, set to "yes": the signed form shows the
 * company's taxpayer identification number, which PayApps keeps only by the contractor's choice.
 */
export const W9_FILE_CONSENT_FIELD = "keepTaxId";

/** Why a file cannot be kept with a document of this kind, or null. */
export function documentFileProblem(
  kind: CompanyDocumentKind,
  consent: string | null,
): string | null {
  if (kind === "w9" && consent !== "yes") {
    return (
      "A signed W-9 shows your taxpayer identification number. To keep the file, confirm that " +
      `PayApps may store it (send ${W9_FILE_CONSENT_FIELD}=yes)`
    );
  }
  return null;
}
