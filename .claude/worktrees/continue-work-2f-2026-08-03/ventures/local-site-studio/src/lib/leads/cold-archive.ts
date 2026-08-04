/**
 * Cold-lead disposition — one-click re-engage or close after Email 1–3 silence.
 * Pure helpers so validation stays unit-testable (see /docs/process cold-lead-archive-action).
 */

import { isColdLead } from "../email/outreach-followups";
import type { Lead, LeadPipelineStage, OutreachStep } from "./types";

/** Operator choice on a Cold-badged lead. */
export type ColdLeadDisposition = "reengage" | "close";

export function isColdLeadDisposition(
  value: string,
): value is ColdLeadDisposition {
  return value === "reengage" || value === "close";
}

/**
 * Optional flags for Re-engage. Default (no flags) keeps Email 1 intentional:
 * stage parks at discovered until the operator moves to outreach_sent.
 */
export interface ColdLeadDispositionOptions {
  /**
   * When true with disposition=reengage: stage → outreach_sent (cadence reset)
   * so the caller can immediately send Email 1. Requires lead.email.
   */
  sendEmail1?: boolean;
}

/**
 * Planned field updates after a cold-lead disposition.
 * Re-engage resets cadence and parks the lead at discovered so Email 1 fires
 * only when the operator intentionally moves stage → outreach_sent again —
 * unless sendEmail1 is set, in which case stage is outreach_sent for an
 * immediate send. Close moves to the terminal `closed` stage (keeps outreach history).
 */
export interface ColdLeadDispositionPatch {
  stage: LeadPipelineStage;
  outreachStep: OutreachStep;
  lastOutreachAt: string | undefined;
  /** Cleared on both dispositions so a parked timer does not surprise later. */
  snoozedUntil: undefined;
}

export function planColdLeadDisposition(
  lead: Lead,
  disposition: ColdLeadDisposition,
  nowMs: number,
  options: ColdLeadDispositionOptions = {},
):
  | { ok: true; patch: ColdLeadDispositionPatch; sendEmail1: boolean }
  | { ok: false; error: string } {
  if (lead.stage === "paid" || lead.stage === "live") {
    return {
      ok: false,
      error: "Paid or live leads cannot be re-engaged or closed as cold",
    };
  }
  if (lead.stage === "closed") {
    return {
      ok: false,
      error:
        disposition === "reengage"
          ? "Lead is already closed — set stage to Discovered first, then re-engage from Cold"
          : "Lead is already closed",
    };
  }
  if (!isColdLead(lead, nowMs)) {
    return {
      ok: false,
      error:
        "Lead is not cold yet — wait until Email 3 + quiet days, or edit stage/notes manually",
    };
  }

  const sendEmail1 = disposition === "reengage" && Boolean(options.sendEmail1);

  if (sendEmail1 && !lead.email?.trim()) {
    return {
      ok: false,
      error: "Cannot send Email 1 on re-engage — lead has no email address",
    };
  }

  switch (disposition) {
    case "reengage":
      return {
        ok: true,
        patch: {
          stage: sendEmail1 ? "outreach_sent" : "discovered",
          outreachStep: 0,
          lastOutreachAt: undefined,
          snoozedUntil: undefined,
        },
        sendEmail1,
      };
    case "close":
      return {
        ok: true,
        patch: {
          stage: "closed",
          // Preserve outreach history for audit; closed exits isColdLead via stage.
          outreachStep: (lead.outreachStep ?? 3) as OutreachStep,
          lastOutreachAt: lead.lastOutreachAt,
          snoozedUntil: undefined,
        },
        sendEmail1: false,
      };
    default: {
      const _exhaustive: never = disposition;
      return _exhaustive;
    }
  }
}

export function coldLeadDispositionLabel(
  disposition: ColdLeadDisposition,
): string {
  switch (disposition) {
    case "reengage":
      return "Re-engage";
    case "close":
      return "Close";
    default: {
      const _exhaustive: never = disposition;
      return _exhaustive;
    }
  }
}
