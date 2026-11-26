// Proactive team notifications: the weekly digest, deadline nudges and email preferences.
export {
  buildWeeklyDigest,
  CLOSING_SOON_DAYS,
  DIGEST_MIN_FIT,
  DIGEST_TOP_MATCHES,
  digestIsEmpty,
  isoWeek,
  type WeeklyDigest,
} from "./build";
export { runDeadlineNudges, runWeeklyDigest } from "./jobs";
export {
  DEFAULT_PREFERENCES,
  type EmailPreferencesDto,
  getEmailPreferences,
  notificationEmailHash,
  notificationRecipients,
  updateEmailPreferences,
} from "./preferences";
export { renderDeadlineNudgeEmail, renderWeeklyDigestEmail } from "./render";
export {
  DEADLINE_THRESHOLDS,
  deadlineKey,
  deadlineThreshold,
  NUDGE_STATUSES,
  sendDeadlineNudges,
  sendWeeklyDigests,
  weeklyKey,
} from "./send";
export {
  applyNotificationUnsubscribe,
  notificationUnsubscribeToken,
  verifyNotificationUnsubscribeToken,
} from "./unsubscribe";
