/**
 * Contact-form success policy for Starter sites.
 * Persist (clientInquiries ledger) is required before claiming success —
 * email notify is a best-effort side effect after a durable inbox row exists.
 */

export type ContactPersistOutcome =
  | {
      ok: true;
      status: 200;
      inquiryId: string;
      message: string;
    }
  | {
      ok: false;
      status: 503;
      error: string;
    };

/** Map insertClientInquiry result to the HTTP contract for POST /api/contact/[slug]. */
export function contactPersistOutcome(
  inquiryId: string | undefined,
): ContactPersistOutcome {
  if (inquiryId) {
    return {
      ok: true,
      status: 200,
      inquiryId,
      message: "Thanks — your message was received.",
    };
  }
  return {
    ok: false,
    status: 503,
    error:
      "Could not save your message right now. Please try again in a moment.",
  };
}

/** Whether the notify email should run — only after a durable inquiry row exists. */
export function shouldSendContactNotify(inquiryId: string | undefined): boolean {
  return Boolean(inquiryId);
}
