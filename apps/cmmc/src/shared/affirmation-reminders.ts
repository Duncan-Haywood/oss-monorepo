// Which warning an affirmation deadline is in today, for the reminder email
// (src/worker/services/affirmations/reminders.ts). Pure, shared by the Worker and the SPA.
//
// Two stages, the same as the .ics alarms (affirmation-ics.ts): 60 days ahead (DUE_SOON_DAYS, when
// the dashboard turns amber) and 7 days ahead. A deadline gets at most one email per stage per due
// date. If the daily run misses the exact day (a deploy, an outage, an affirmation recorded with the
// date already close), the stage still applies on the next run, so the email is late, not lost.
//
// A third stage, OVERDUE_STAGE, is one notice once a date has passed with no newer affirmation
// recorded: an email every day would be noise, so it goes once per due date, and only while the date
// passed at most OVERDUE_NOTICE_DAYS ago (a missed run still sends it; a date that lapsed months
// before the workspace was set up does not start mailing on the first run, the page shows it red).
import { DUE_SOON_DAYS } from "./affirmation";

/** Stored as 0 in `affirmation_reminder_sent.stage`: the date has passed. */
export const OVERDUE_STAGE = 0;
export const OVERDUE_NOTICE_DAYS = 30;

export const REMINDER_STAGES = [DUE_SOON_DAYS, 7, OVERDUE_STAGE] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

/**
 * 7 within a week (today included), 60 within DUE_SOON_DAYS, OVERDUE_STAGE (0) from the day after
 * the due date through OVERDUE_NOTICE_DAYS after it, otherwise null.
 */
export function reminderStage(daysLeft: number): ReminderStage | null {
  if (!Number.isFinite(daysLeft)) return null;
  if (daysLeft < 0) return daysLeft >= -OVERDUE_NOTICE_DAYS ? OVERDUE_STAGE : null;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= DUE_SOON_DAYS) return DUE_SOON_DAYS;
  return null;
}

/** GET/PUT /api/orgs/:orgId/affirmations/reminders: the signed-in member's own setting. */
export interface AffirmationReminderSettings {
  /** On unless this member turned it off. */
  on: boolean;
  /** Only admins and owners get the email; editors and viewers see the setting but get nothing. */
  eligible: boolean;
  /** False when this deployment cannot send mail yet (no sender configured). */
  delivers: boolean;
}

/** GET/POST /api/unsubscribe/affirmation-reminders */
export interface ReminderUnsubscribeStatus {
  orgName: string | null;
  on: boolean;
}
