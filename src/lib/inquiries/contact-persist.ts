import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Contact-form success policy for Starter sites.
 * Persist (clientInquiries ledger) is required before claiming success —
 * Notify is a best-effort side effect after a durable inbox row exists —
 * sendEmail resolves `{ success: false }` without throwing, so callers must
 * inspect that shape (and typically surface notifySent) rather than assuming
 * a bare await means delivery.
 *
 * When Convex is configured, the contact route must pass
 * CONTACT_FORM_CONVEX_PRIMARY so a Convex mutation failure returns 503
 * instead of writing only to instance-local SQLite (dashboard/other
 * instances read Convex-first and would never see the inquiry).
 */

/** Fail-closed write options for visitor contact-form ledger inserts. */
export const CONTACT_FORM_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};

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
