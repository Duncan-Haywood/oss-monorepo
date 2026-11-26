// Channel selection + the copy-paste guide shown in the UI for manual submissions.
//
// Why there is no Grants.gov system-to-system (S2S) channel: S2S submission requires the applicant
// to be registered in SAM.gov, a Grants.gov S2S client certificate issued to the submitting system,
// and an Authorized Organization Representative (AOR) role granted by the applicant's E-Business
// Point of Contact. Those are legal credentials of the applicant organization that a SaaS cannot
// hold on its behalf without a formal delegation, so federal applications are prepared here as a
// package and submitted by the org's AOR through Grants.gov Workspace ("manual" channel), then
// confirmed with the Grants.gov tracking number.
import type { SubmissionChannel, SubmissionMethodHint } from "@shared/enums";
import { isSafeEmailAddress } from "../../ports/email";
import { formatAddress, type SubmissionPackage } from "./package";

export interface ChannelChoice {
  channel: Extract<SubmissionChannel, "email" | "manual">;
  method: SubmissionMethodHint;
  recipient: string | null;
  /** Why email was not used even though the funder accepts email (shown to users). */
  fallbackReason?: string;
}

/**
 * A single bare address. Funder addresses come from scraped/imported opportunity data, so anything
 * with a display name, comma, angle brackets or whitespace (e.g. "a@x.org,b@evil.test") is rejected
 * and the submission falls back to the manual channel.
 */
export const isEmail = (s: string | null | undefined): s is string => !!s && isSafeEmailAddress(s);

/** Public catalog sources whose submission addresses come from an official API or our own curation. */
const TRUSTED_EMAIL_SOURCES: ReadonlySet<string> = new Set([
  "grants_gov",
  "simpler_grants",
  "manual",
]);

export const UNVERIFIED_EMAIL_REASON =
  "The funder's email address was read from an imported page or file and has not been confirmed by your team. Confirm it on the opportunity page, or submit manually.";

/**
 * Whether the email channel may send to opp.submissionEmail. Fails closed: an address is trusted
 * only if a person in the org confirmed it, or it sits on a PUBLIC catalog row from a trusted source.
 * Addresses extracted from imported pages / RFPs / watchlist pages (org-private rows) are untrusted
 * until confirmed: a prompt-injected page could otherwise redirect the application to an attacker.
 */
export function isSubmissionEmailVerified(opp: {
  submissionEmailVerified?: boolean | null;
  source?: string | null;
  privateToOrgId?: string | null;
}): boolean {
  if (opp.submissionEmailVerified === true) return true;
  return opp.privateToOrgId === null && !!opp.source && TRUSTED_EMAIL_SOURCES.has(opp.source);
}

export function selectChannel(
  opp: {
    submissionMethod: SubmissionMethodHint;
    submissionEmail: string | null;
    submissionUrl: string | null;
    /** Omitted fields count as unverified (fail closed). */
    submissionEmailVerified?: boolean | null;
    source?: string | null;
    privateToOrgId?: string | null;
  },
  gate: { emailAllowed: boolean; reason?: string },
): ChannelChoice {
  if (opp.submissionMethod === "email" && isEmail(opp.submissionEmail)) {
    if (!isSubmissionEmailVerified(opp)) {
      // Never auto-send (autopilot OR human-approved) to an unconfirmed, possibly injected address.
      return {
        channel: "manual",
        method: "email",
        recipient: opp.submissionEmail,
        fallbackReason: UNVERIFIED_EMAIL_REASON,
      };
    }
    if (gate.emailAllowed) {
      return { channel: "email", method: "email", recipient: opp.submissionEmail };
    }
    return {
      channel: "manual",
      method: "email",
      recipient: opp.submissionEmail,
      fallbackReason: gate.reason ?? "Automatic email to the funder is not allowed.",
    };
  }
  return {
    channel: "manual",
    method: opp.submissionMethod,
    recipient: opp.submissionUrl ?? opp.submissionEmail ?? null,
  };
}

export interface ManualGuide {
  method: SubmissionMethodHint;
  title: string;
  url: string | null;
  steps: string[];
  notes: string[];
}

export function buildManualGuide(pkg: SubmissionPackage, choice: ChannelChoice): ManualGuide {
  const o = pkg.opportunity;
  const a = pkg.applicant;
  const num = o.opportunityNumber ? ` ${o.opportunityNumber}` : "";
  const sectionList = pkg.sections.map(
    (s) =>
      `"${s.title}" (${s.wordCount} words${s.wordLimit !== null ? ` / limit ${s.wordLimit}` : ""})`,
  );
  const toAttach = pkg.attachmentsChecklist.filter((x) => x.status !== "waived");
  const attachmentStep =
    toAttach.length > 0
      ? `Attach: ${toAttach
          .map(
            (x) =>
              `${x.name}${x.required ? "" : " (optional)"}${x.filename ? ` (download "${x.filename}" from Knowledge → Documents)` : ""}`,
          )
          .join("; ")}.`
      : pkg.attachmentsChecklist.length > 0
        ? "All listed attachments were waived; no files to attach."
        : "Check the funder's instructions for any required attachments.";
  const identity = `Use the applicant identity from the package: ${a.legalName}${a.ein ? `, EIN ${a.ein}` : ""}${a.uei ? `, UEI ${a.uei}` : ""}${formatAddress(a.address) ? `, ${formatAddress(a.address)}` : ""}.`;
  const confirm =
    'When done, click "Confirm submitted" here and paste the confirmation / tracking number.';
  const notes: string[] = [];
  if (choice.fallbackReason) notes.push(choice.fallbackReason);
  if (pkg.grounding && !pkg.grounding.passed) {
    notes.push("The grounding check did not fully pass — review flagged claims before submitting.");
  }
  if (pkg.sections.some((s) => s.overLimit)) {
    notes.push("At least one section is over the funder's length limit.");
  }

  switch (choice.method) {
    case "grants_gov":
      notes.push(
        "Grants.gov system-to-system submission is not supported: it requires SAM.gov registration, Grants.gov S2S certificates and an AOR role held by your organization. Submit through Grants.gov Workspace instead.",
      );
      return {
        method: "grants_gov",
        title: `Submit via Grants.gov Workspace${num}`,
        url:
          o.submissionUrl ??
          (o.opportunityNumber
            ? `https://www.grants.gov/search-results-detail/${encodeURIComponent(o.opportunityNumber)}`
            : "https://www.grants.gov/"),
        steps: [
          "Sign in to Grants.gov with an account that holds the AOR (Authorized Organization Representative) role for your organization (SAM.gov registration must be active).",
          `Find opportunity${num || ` "${o.title}"`} and create a Workspace (or open the existing one).`,
          `Complete the SF-424 and other forms. ${identity}`,
          `Copy each narrative section from the package into the matching form or narrative attachment: ${sectionList.join(", ")}.`,
          attachmentStep,
          "Run Check for Errors, then Sign and Submit. Save the Grants.gov tracking number (GRANT########).",
          confirm,
        ],
        notes,
      };
    case "portal":
      return {
        method: "portal",
        title: `Submit on ${o.funderName}'s portal`,
        url: o.submissionUrl ?? o.sourceUrl,
        steps: [
          "Open the funder's application portal and sign in (create an account for your organization if needed).",
          identity,
          `Copy each section from the package into the matching portal field: ${sectionList.join(", ")}. Check word/character limits in the portal.`,
          attachmentStep,
          "Submit and save the confirmation email or number.",
          confirm,
        ],
        notes,
      };
    case "mail":
      return {
        method: "mail",
        title: `Mail the application to ${o.funderName}`,
        url: o.submissionUrl ?? o.sourceUrl,
        steps: [
          "Download the application as a Word document (Export → Word), print it and have an authorized signer sign any required cover sheet.",
          attachmentStep,
          "Mail it to the address in the funder's instructions using a tracked service, well before the deadline.",
          confirm,
        ],
        notes,
      };
    case "email":
      return {
        method: "email",
        title: `Email the application to ${choice.recipient ?? o.funderName}`,
        url: null,
        steps: [
          `Send an email to ${choice.recipient ?? "the funder"} from your organization's address with the application attached as a Word document (Export → Word). Don't send the internal package file.`,
          attachmentStep,
          confirm,
        ],
        notes,
      };
    default:
      return {
        method: "unknown",
        title: `Submit to ${o.funderName}`,
        url: o.submissionUrl ?? o.sourceUrl,
        steps: [
          "The funder's submission method is not known yet. Open the opportunity page and read the submission instructions.",
          identity,
          `Copy each section from the package: ${sectionList.join(", ")}.`,
          attachmentStep,
          confirm,
        ],
        notes,
      };
  }
}
