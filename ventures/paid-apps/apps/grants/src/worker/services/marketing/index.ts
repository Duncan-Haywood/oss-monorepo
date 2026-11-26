// Newsletter / marketing email (docs/EMAIL_MARKETING.md). Not tenant data.
export { type MarketingBlocker, type MarketingConfig, marketingConfig } from "./config";
export {
  confirmPageUrl,
  listUnsubscribeHeaders,
  newsletterOneClickUrl,
  notificationOneClickUrl,
  ONE_CLICK_BODY,
  unsubscribePageUrl,
} from "./headers";
export { renderConfirmEmail, renderSequenceEmail } from "./render";
export {
  dueSequenceStep,
  NURTURE_SEQUENCE,
  NURTURE_STEP_KEYS,
  type NurtureStepKey,
  nextSequenceDue,
  SEQUENCE_MIN_GAP_DAYS,
} from "./sequence";
export {
  CONFIRM_MAX_SENDS_PER_DAY,
  CONFIRM_RESEND_MIN_INTERVAL_MS,
  CONFIRM_TOKEN_TTL_MS,
  type ConfirmOutcome,
  canResendConfirmation,
  confirmSubscription,
  normalizeEmail,
  PENDING_RETENTION_MS,
  purgeStalePending,
  SEQUENCE_BATCH_SIZE,
  type SequenceRunResult,
  type SubscribeOutcome,
  sendDueSequenceEmails,
  subscribe,
  subscriberCounts,
  type UnsubscribeMethod,
  unsubscribeWithToken,
} from "./subscribers";
export {
  hashConfirmToken,
  newsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
} from "./tokens";
