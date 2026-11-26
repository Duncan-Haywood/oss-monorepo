// Submission emails: the team's "submitted" notice, the formal cover note sent to a funder, and the
// manual-submission instructions. The funder note carries only applicant identity, the request and
// the attachment description: no internal review, grounding or autopilot details.
import { display, formatDate, formatMoney, optional, seg } from "../format";
import type { EmailContent, TemplateContext } from "../layout";
import { teamReason } from "./applications";

// ---- submissionSent (to the org) -------------------------------------------------------------

export interface SubmissionSentData {
  orgId: string;
  orgName?: string | null;
  applicationId: string;
  applicationTitle: string;
  funderName: string;
  channel: "email" | "manual";
  /** The funder address, for emailed submissions. */
  recipient?: string | null;
  /** Confirmation / tracking number from the funder, if recorded. */
  externalRef?: string | null;
  packageSha256: string;
  /** Days until the scheduled status-check reminder, if one was scheduled. */
  statusCheckInDays?: number | null;
}

export function submissionSent(d: SubmissionSentData, t: TemplateContext): EmailContent {
  const title = display(d.applicationTitle, "Application");
  const funder = display(d.funderName, "the funder");
  const recipient = d.channel === "email" ? optional(d.recipient) : null;
  const ref = optional(d.externalRef);
  return {
    subject: `Submitted: "${title}" to ${funder}`,
    preheader: recipient ? `Sent by email to ${recipient}.` : `Recorded as submitted to ${funder}.`,
    heading: "Application submitted",
    blocks: [
      {
        type: "paragraph",
        text: `"${title}" was submitted to ${funder}${recipient ? ` by email (${recipient})` : ""}.`,
      },
      {
        type: "details",
        rows: [
          { label: "Funder", value: funder },
          { label: "Channel", value: d.channel === "email" ? "Email" : "Submitted by your team" },
          { label: "Confirmation / tracking number", value: ref },
          { label: "Package SHA-256", value: d.packageSha256 },
        ],
      },
      !!d.statusCheckInDays && {
        type: "paragraph",
        text: `A status check reminder is scheduled in ${d.statusCheckInDays} days.`,
      },
      {
        type: "button",
        label: "View the submission",
        url: t.orgUrl(d.orgId, `/applications/${seg(d.applicationId)}`),
      },
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}

// ---- funderSubmission (to the funder) --------------------------------------------------------

export interface FunderSubmissionData {
  funderName: string;
  opportunityTitle: string;
  opportunityNumber?: string | null;
  applicant: {
    legalName: string;
    dba?: string | null;
    ein?: string | null;
    uei?: string | null;
    /** One-line postal address. */
    address?: string | null;
    websiteUrl?: string | null;
    contact: { name?: string | null; email?: string | null; phone?: string | null };
  };
  requestedAmountCents?: number | null;
  executiveSummary?: string | null;
  attachments: { filename: string; description: string }[];
  reference: { submissionId: string; packageSha256: string };
}

/** Same format the funder email has always used: "Grant application: <title> (<number>) — <org>". */
export function funderSubmissionSubject(d: FunderSubmissionData): string {
  const num = optional(d.opportunityNumber);
  return `Grant application: ${display(d.opportunityTitle, "Grant opportunity")}${num ? ` (${num})` : ""} — ${display(d.applicant.legalName, "Applicant")}`;
}

export function funderSubmission(d: FunderSubmissionData, _t: TemplateContext): EmailContent {
  const a = d.applicant;
  const org = display(a.legalName, "The applicant");
  const funder = display(d.funderName, "Grants");
  const title = display(d.opportunityTitle, "your grant opportunity");
  const num = optional(d.opportunityNumber);
  const amount = formatMoney(d.requestedAmountCents);
  const summary = d.executiveSummary?.trim();
  const dba = optional(a.dba);
  const contactName = optional(a.contact.name);
  return {
    subject: funderSubmissionSubject(d),
    preheader: `Application from ${org} for "${title}".`,
    brandName: org,
    greeting: `Dear ${funder} grants team,`,
    blocks: [
      {
        type: "paragraph",
        text: `Please find attached the application from ${org} for "${title}"${num ? ` (opportunity ${num})` : ""}.`,
      },
      amount ? { type: "paragraph", text: `Requested amount: ${amount}.` } : null,
      summary ? { type: "heading", text: "Summary" } : null,
      summary ? { type: "quote", text: summary } : null,
      { type: "heading", text: "Applicant" },
      {
        type: "details",
        rows: [
          { label: "Legal name", value: dba ? `${org} (DBA ${dba})` : org },
          { label: "EIN", value: optional(a.ein) },
          { label: "UEI", value: optional(a.uei) },
          { label: "Address", value: optional(a.address) },
          { label: "Website", value: optional(a.websiteUrl) },
          { label: "Contact", value: contactName },
          { label: "Email", value: optional(a.contact.email) },
          { label: "Phone", value: optional(a.contact.phone) },
        ],
      },
      d.attachments.length > 0 && { type: "heading", text: "Attachments" },
      d.attachments.length > 0 && {
        type: "list",
        items: d.attachments.map((x) => ({
          text: display(x.filename, "attachment"),
          detail: optional(x.description),
        })),
      },
      {
        type: "paragraph",
        text: "Please reply to this email with any questions or to confirm receipt.",
      },
    ],
    signoff: ["Sincerely,", contactName ?? org, ...(contactName ? [org] : [])],
    trailer: `Reference: ${d.reference.submissionId} · package SHA-256 ${d.reference.packageSha256}`,
    footer: {
      reason: `You received this email because ${org} submitted this application to ${funder} at the submission address listed for this opportunity. Replies go to ${org}.`,
      sentOnBehalfOf: org,
    },
  };
}

// ---- manualSubmissionInstructions ------------------------------------------------------------

export interface ManualSubmissionInstructionsData {
  orgId: string;
  orgName?: string | null;
  applicationId: string;
  applicationTitle: string;
  funderName: string;
  guide: { title: string; url?: string | null; steps: string[]; notes?: string[] };
  deadline?: Date | string | null;
}

export function manualSubmissionInstructions(
  d: ManualSubmissionInstructionsData,
  t: TemplateContext,
): EmailContent {
  const title = display(d.applicationTitle, "Your application");
  const funder = display(d.funderName, "the funder");
  const steps = d.guide.steps.map((s) => s.trim()).filter(Boolean);
  const notes = (d.guide.notes ?? []).map((s) => s.trim()).filter(Boolean);
  const guideTitle = optional(d.guide.title);
  return {
    subject: `Action needed: submit "${title}" to ${funder}`,
    preheader: `The submission package is ready. Deadline: ${formatDate(d.deadline) ?? "not set"}.`,
    heading: "Your submission package is ready",
    blocks: [
      {
        type: "paragraph",
        text: `The application "${title}" is approved and its submission package is ready. Someone on your team needs to submit it to ${funder}.`,
      },
      {
        type: "details",
        rows: [{ label: "Deadline", value: formatDate(d.deadline) ?? "Not set" }],
      },
      guideTitle ? { type: "heading", text: guideTitle } : null,
      steps.length > 0 && { type: "list", ordered: true, items: steps },
      ...notes.map((n) => ({ type: "callout" as const, tone: "warning" as const, text: n })),
      {
        type: "button",
        label: "Open the package and guide",
        url: t.orgUrl(d.orgId, `/applications/${seg(d.applicationId)}`),
      },
      d.guide.url ? { type: "link", label: `${funder} submission page`, url: d.guide.url } : null,
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}
