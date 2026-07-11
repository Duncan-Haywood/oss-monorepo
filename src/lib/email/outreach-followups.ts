/**
 * Outreach Email 2/3 cadence helpers — shared by dashboard UI and server actions.
 * Email 1 is sent when stage → outreach_sent (see sendOutreachEmail).
 */

import type { Lead, OutreachStep } from "../leads/types";

/** Days after Email 1 before Email 2 is due in the operator queue. */
export const FOLLOW_UP_2_AFTER_DAYS = 3;
/** Days after Email 2 before Email 3 is due. */
export const FOLLOW_UP_3_AFTER_DAYS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeOutreachStep(value: number | undefined | null): OutreachStep {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

/** Next follow-up to send (2 or 3), or null if Email 1 hasn't landed / sequence complete. */
export function nextFollowUpStep(current: number | undefined | null): 2 | 3 | null {
  const step = normalizeOutreachStep(current);
  if (step === 1) return 2;
  if (step === 2) return 3;
  return null;
}

export function followUpGapMs(afterStep: 1 | 2): number {
  return afterStep === 1
    ? FOLLOW_UP_2_AFTER_DAYS * DAY_MS
    : FOLLOW_UP_3_AFTER_DAYS * DAY_MS;
}

/**
 * Lead is due for the next follow-up when: has email, still in outreach/discovery,
 * Email 1+ already sent, sequence not finished, and enough quiet days since last send.
 * Missing lastOutreachAt with step≥1 counts as due (legacy rows after Email 1).
 */
export function isFollowUpDue(lead: Lead, nowMs: number): boolean {
  if (!lead.email) return false;
  if (lead.stage !== "outreach_sent" && lead.stage !== "discovery_call") {
    return false;
  }
  const step = normalizeOutreachStep(lead.outreachStep);
  const next = nextFollowUpStep(step);
  if (!next) return false;

  if (!lead.lastOutreachAt) return true;
  const last = Date.parse(lead.lastOutreachAt);
  if (Number.isNaN(last)) return true;

  const gapAfter = step === 1 ? 1 : 2;
  return nowMs - last >= followUpGapMs(gapAfter);
}

export function listFollowUpsDue(leads: Lead[], nowMs: number): Lead[] {
  return leads
    .filter((lead) => isFollowUpDue(lead, nowMs))
    .sort((a, b) => {
      const aAt = a.lastOutreachAt ? Date.parse(a.lastOutreachAt) : 0;
      const bAt = b.lastOutreachAt ? Date.parse(b.lastOutreachAt) : 0;
      return aAt - bAt;
    });
}
