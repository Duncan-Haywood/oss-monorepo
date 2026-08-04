/**
 * leads-log.ts — a typed place to log real outreach/booking activity once a
 * human starts using process/outreach-templates.ts against real prospects.
 *
 * This file intentionally starts empty. Agents must never fabricate leads,
 * bookings, or revenue here — only a human (or an agent transcribing what a
 * human reports back) appends real entries. Its purpose is to give
 * p2-first-deliveries a structured landing spot so the first real
 * outreach/booking/payment doesn't have to be re-derived from a chat log or
 * a human's memory, and so the docs site can show real funnel state instead
 * of just "blocked on human" prose.
 */

import type { OutreachTemplate } from "./outreach-templates";
import type { PaymentMethodOption } from "./payment-collection";

export type LeadStage =
  | "identified"
  | "contacted"
  | "responded"
  | "booked"
  | "shot_complete"
  | "delivered"
  | "paid"
  | "declined";

export type Lead = {
  id: string;
  audience: OutreachTemplate["audience"];
  /** Non-identifying label, e.g. "Agent — Keller Williams downtown", not a real name/PII, unless Duncan chooses to log it himself. */
  contactLabel: string;
  channel: OutreachTemplate["channel"];
  templateId?: string;
  stage: LeadStage;
  dateLogged: string; // YYYY-MM-DD
  notes?: string;
  /** Only set once stage reaches "paid" — which of payment-collection.ts's paymentMethodOptions was actually used. */
  paymentMethod?: PaymentMethodOption["id"];
  /** Only set once stage reaches "paid" — a non-identifying reference (e.g. last 4 of a Zelle/PayPal confirmation), not full account/card details. */
  paymentReference?: string;
};

/**
 * Append-only. No entries yet — nothing has been outreached to in the real
 * world as of this writing (see decisions-log.ts: no automated/bulk
 * outreach, manual-only, human-executed).
 */
export const leadsLog: Lead[] = [];

export const LEAD_STAGE_ORDER: LeadStage[] = [
  "identified",
  "contacted",
  "responded",
  "booked",
  "shot_complete",
  "delivered",
  "paid",
  "declined",
];

export function funnelCounts(): Record<LeadStage, number> {
  const counts = Object.fromEntries(LEAD_STAGE_ORDER.map((s) => [s, 0])) as Record<LeadStage, number>;
  for (const lead of leadsLog) {
    counts[lead.stage] += 1;
  }
  return counts;
}

export function paidCount(): number {
  return leadsLog.filter((l) => l.stage === "paid").length;
}
