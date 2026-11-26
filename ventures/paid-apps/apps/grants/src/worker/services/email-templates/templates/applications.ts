// Application workflow emails to the org's team: a draft is ready for review, or drafting needs
// answers the fact base doesn't have yet.
import type { ReviewTier } from "@shared/enums";
import { display, formatDate, optional, plural, seg, tierLabel } from "../format";
import { type EmailContent, PRODUCT_NAME, type TemplateContext } from "../layout";

export const teamReason = (orgName: string | null | undefined) =>
  `You received this email because this address receives notifications for ${display(orgName, "your organization")} in ${PRODUCT_NAME}.`;

// ---- applicationReadyForReview ---------------------------------------------------------------

export interface ApplicationReadyForReviewData {
  orgId: string;
  orgName?: string | null;
  applicationId: string;
  applicationTitle: string;
  funderName?: string | null;
  tier: ReviewTier;
  blockers: number;
  warnings: number;
  deadline?: Date | string | null;
}

export function applicationReadyForReview(
  d: ApplicationReadyForReviewData,
  t: TemplateContext,
): EmailContent {
  const title = display(d.applicationTitle, "An application");
  const funder = optional(d.funderName);
  const blockers = Math.max(0, d.blockers || 0);
  return {
    subject: `Ready for review: "${title}"${blockers > 0 ? ` (${plural(blockers, "blocker")})` : ""}`,
    preheader: `${plural(blockers, "blocker")}, ${plural(d.warnings, "warning")}.`,
    heading: "An application is ready for review",
    blocks: [
      {
        type: "paragraph",
        text: `A new draft of "${title}"${funder ? ` for ${funder}` : ""} is ready for your team's review.`,
      },
      {
        type: "details",
        rows: [
          { label: "Review route", value: tierLabel(d.tier) },
          { label: "Blocking issues", value: String(blockers) },
          { label: "Warnings", value: String(Math.max(0, d.warnings || 0)) },
          { label: "Deadline", value: formatDate(d.deadline) ?? "Not set" },
        ],
      },
      blockers > 0 && {
        type: "callout",
        tone: "warning",
        text: `Resolve ${blockers === 1 ? "the blocking issue" : `the ${blockers} blocking issues`} before this application can be approved.`,
      },
      {
        type: "button",
        label: "Review the application",
        url: t.orgUrl(d.orgId, `/applications/${seg(d.applicationId)}`),
      },
      { type: "link", label: "Open the review queue", url: t.orgUrl(d.orgId, "/reviews") },
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}

// ---- needsInfo -------------------------------------------------------------------------------

export interface NeedsInfoData {
  orgId: string;
  orgName?: string | null;
  applicationId?: string | null;
  applicationTitle?: string | null;
  /** Questions the fact base can't answer yet. */
  questions: string[];
  /** The interview that asks these questions, when one was created. */
  interviewId?: string | null;
}

export function needsInfo(d: NeedsInfoData, t: TemplateContext): EmailContent {
  const title = optional(d.applicationTitle);
  const questions = d.questions.map((q) => q.trim()).filter(Boolean);
  const interviewUrl = d.interviewId
    ? t.orgUrl(d.orgId, `/interviews/${seg(d.interviewId)}`)
    : t.orgUrl(d.orgId, "/interviews");
  return {
    subject: title
      ? `Information needed for "${title}"`
      : "Information needed to continue drafting",
    preheader: questions.length
      ? `${plural(questions.length, "question")} to answer before drafting can continue.`
      : "A few questions to answer before drafting can continue.",
    heading: "We need a few answers from your team",
    blocks: [
      {
        type: "paragraph",
        text: `${title ? `To continue drafting "${title}", ` : "To continue drafting, "}${PRODUCT_NAME} needs information your fact base doesn't have yet. It only writes facts your team has provided, so it won't guess.`,
      },
      questions.length > 0
        ? { type: "list", ordered: true, items: questions }
        : { type: "paragraph", text: "Open the interview to see the questions." },
      { type: "button", label: "Answer in a short interview", url: interviewUrl },
      {
        type: "link",
        label: "Or add documents and facts to your knowledge base",
        url: t.orgUrl(d.orgId, "/knowledge/facts"),
      },
      d.applicationId
        ? {
            type: "link",
            label: "Open the application",
            url: t.orgUrl(d.orgId, `/applications/${seg(d.applicationId)}`),
          }
        : null,
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}
