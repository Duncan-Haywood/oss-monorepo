/**
 * Website contact-form submissions for a client lead (paid or preview).
 * Distinct from outreach Leads — these are end-customer inquiries.
 */

export type ClientInquiryStatus = "new" | "read" | "replied" | "archived";

export interface ClientInquiry {
  id: string;
  leadSlug: string;
  businessName: string;
  name?: string;
  email?: string;
  phone?: string;
  message: string;
  status: ClientInquiryStatus;
  /** Where the POST came from (preview path, production host, etc.). */
  source?: string;
  /** Last operator reply body sent from the dashboard (audit trail). */
  operatorReply?: string;
  /** ISO timestamp of the last successful dashboard reply send. */
  repliedAt?: string;
  /**
   * CAS marker for replyToInquiryAction — mirrors leads.starterUpsellSentCount's
   * expected-count pattern, not a one-shot "already replied" gate: a legitimate
   * follow-up reply must still succeed later. Only rejects a write whose
   * expectedReplySentCount no longer matches the row's current count (an exact
   * concurrent duplicate). See inquiry-reply-send-race-guard.
   */
  replySentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientInquiryInput {
  leadSlug: string;
  businessName: string;
  name?: string;
  email?: string;
  phone?: string;
  message: string;
  source?: string;
}
