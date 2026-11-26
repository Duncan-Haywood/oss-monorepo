// Transactional email templates. One typed entry point:
//
//   const msg = renderEmail("invitation", { orgName, role, email, invitationId }, { appUrl: env.APP_URL });
//   await ctx.email.send({ to, subject: msg.subject, text: msg.text, html: msg.html });
//
// Every interpolated value is HTML-escaped, subjects are single-line (no CR/LF), links are built
// from `appUrl`, and every email carries the standard footer (product, operator, privacy link, why
// the recipient got it, and a manage-notifications link for team notifications).

import {
  createTemplateContext,
  type EmailContent,
  type RenderedEmail,
  renderContent,
  type TemplateContext,
} from "./layout";
import {
  type ExistingAccountData,
  type ExportReadyData,
  existingAccount,
  exportReady,
  type InvitationData,
  invitation,
  type OrgDeletionScheduledData,
  orgDeletionScheduled,
  type PasswordResetData,
  type PaymentFailedData,
  passwordReset,
  paymentFailed,
  type SubscriptionChangedData,
  subscriptionChanged,
  type VerifyEmailData,
  verifyEmail,
} from "./templates/account";
import {
  type ApplicationReadyForReviewData,
  applicationReadyForReview,
  type NeedsInfoData,
  needsInfo,
} from "./templates/applications";
import {
  type DeadlineReminderData,
  deadlineReminder,
  type FollowupDueData,
  followupDue,
  type WeeklyDigestData,
  weeklyDigest,
} from "./templates/reminders";
import {
  type FunderSubmissionData,
  funderSubmission,
  type ManualSubmissionInstructionsData,
  manualSubmissionInstructions,
  type SubmissionSentData,
  submissionSent,
} from "./templates/submissions";

export interface EmailTemplateData {
  // account / team
  invitation: InvitationData;
  verifyEmail: VerifyEmailData;
  passwordReset: PasswordResetData;
  existingAccount: ExistingAccountData;
  exportReady: ExportReadyData;
  orgDeletionScheduled: OrgDeletionScheduledData;
  paymentFailed: PaymentFailedData;
  subscriptionChanged: SubscriptionChangedData;
  // applications
  applicationReadyForReview: ApplicationReadyForReviewData;
  needsInfo: NeedsInfoData;
  // submissions
  submissionSent: SubmissionSentData;
  funderSubmission: FunderSubmissionData;
  manualSubmissionInstructions: ManualSubmissionInstructionsData;
  // reminders and digests
  followupDue: FollowupDueData;
  deadlineReminder: DeadlineReminderData;
  weeklyDigest: WeeklyDigestData;
}

export type EmailTemplateName = keyof EmailTemplateData;

type Template<D> = (data: D, t: TemplateContext) => EmailContent;

const TEMPLATES: { [K in EmailTemplateName]: Template<EmailTemplateData[K]> } = {
  invitation,
  verifyEmail,
  passwordReset,
  existingAccount,
  exportReady,
  orgDeletionScheduled,
  paymentFailed,
  subscriptionChanged,
  applicationReadyForReview,
  needsInfo,
  submissionSent,
  funderSubmission,
  manualSubmissionInstructions,
  followupDue,
  deadlineReminder,
  weeklyDigest,
};

export const EMAIL_TEMPLATE_NAMES = Object.keys(TEMPLATES) as EmailTemplateName[];

export interface RenderEmailOptions {
  /** Public SPA origin (env.APP_URL); every link in the email is built from it. */
  appUrl: string;
  /** Adds an Unsubscribe link to the footer (team notifications sent per recipient). */
  unsubscribeUrl?: string | null;
}

export function renderEmail<K extends EmailTemplateName>(
  template: K,
  data: EmailTemplateData[K],
  opts: RenderEmailOptions,
): RenderedEmail {
  const t = createTemplateContext(opts.appUrl);
  const fn: Template<EmailTemplateData[K]> = TEMPLATES[template];
  const content = fn(data, t);
  if (opts.unsubscribeUrl) {
    content.footer = { ...content.footer, unsubscribeUrl: opts.unsubscribeUrl };
  }
  return renderContent(content, t);
}

export { cleanSubject, escapeHtml } from "./format";
export { OPERATOR_NAME, PRODUCT_NAME, type RenderedEmail } from "./layout";
export type { SubscriptionChange } from "./templates/account";
export type {
  ApplicationReadyForReviewData,
  DeadlineReminderData,
  ExistingAccountData,
  ExportReadyData,
  FollowupDueData,
  FunderSubmissionData,
  InvitationData,
  ManualSubmissionInstructionsData,
  NeedsInfoData,
  OrgDeletionScheduledData,
  PasswordResetData,
  PaymentFailedData,
  SubmissionSentData,
  SubscriptionChangedData,
  VerifyEmailData,
  WeeklyDigestData,
};
