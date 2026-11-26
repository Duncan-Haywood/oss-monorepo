// Which warning an affirmation deadline is in today, for the reminder email
// (src/worker/services/affirmations/reminders.ts). Pure, shared by the Worker and the SPA.
//
// Two stages, the same as the .ics alarms (affirmation-ics.ts): 60 days ahead (DUE_SOON_DAYS, when
// the dashboard turns amber) and 7 days ahead. A deadline gets at most one email per stage per due
// date. If the daily run misses the exact day (a deploy, an outage, an affirmation recorded with the
// date already close), the stage still applies on the next run, so the email is late, not lost.
// Overdue dates get no email: the dashboard shows them in red, and an email every day would be noise.
import { DUE_SOON_DAYS } from "./affirmation";

export const REMINDER_STAGES = [DUE_SOON_DAYS, 7] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

/** 7 within a week (today included), 60 within DUE_SOON_DAYS, otherwise (or overdue) null. */
export function reminderStage(daysLeft: number): ReminderStage | null {
  if (!Number.isFinite(daysLeft) || daysLeft < 0) return null;
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
