/**
 * Did an email actually reach a mailbox, or did it only reach a log line?
 *
 * sendEmail() mock-logs and resolves `{ success: true, mock: true }` whenever
 * RESEND_API_KEY is missing or a documented placeholder (see
 * assessResendEmailEnvReadiness, which mirrors the same gate for the operator
 * banner). `success: true` therefore means "the send path completed", not "the
 * customer has it".
 *
 * That distinction only matters where a *durable* record is written off the
 * result. The Stripe webhook writes permanent sent-markers
 * (commerceOrders.clientReceiptEmailSentAt, the bundle receipt / DNS handoff
 * handoff-notes) so that a Stripe redelivery can skip mail that already went
 * out. Written off `success` alone, a mock send marks the message permanently
 * delivered: the buyer pays, receives nothing, and every subsequent redelivery
 * reports `already_notified`. There is then no state anywhere that says the
 * mail is outstanding.
 *
 * So: a sent-marker records *delivery*, and delivery excludes the mock. A mock
 * send leaves the marker unwritten, exactly as a suppressed or failed send
 * does, and the message stays recoverable once a real key is configured.
 *
 * Pure and dependency-free so the webhook can import it at module scope while
 * the Resend client itself stays behind a dynamic import.
 */

/** The shape every send helper in lib/email/resend.ts resolves to. */
export type EmailSendResult = {
  success: boolean;
  /** True when no real Resend key was configured and the send was logged only. */
  mock?: boolean;
  /** Set on a refusal we chose (currently "suppressed"). */
  reason?: string;
  /** Set when the Resend request itself threw or returned non-2xx. */
  error?: string;
  emailId?: string;
};

/**
 * True only when the message was handed to Resend and accepted.
 *
 * Use this — never bare `.success` — to gate any write that records a message
 * as sent, because such a write is what stops the message being retried.
 */
export function emailWasDelivered(
  result: EmailSendResult | null | undefined,
): boolean {
  return result?.success === true && result.mock !== true;
}

/**
 * Operator-facing reason a message is still outstanding, for the log line that
 * accompanies an unwritten sent-marker. Names the missing key explicitly for
 * the mock case: "not sent (unknown)" would read as a transient Resend blip
 * when the real cause is a production environment that cannot send mail at all.
 */
export function describeUndeliveredEmail(
  result: EmailSendResult | null | undefined,
): string {
  if (!result) return "no result";
  if (result.mock === true) {
    return "mock send — RESEND_API_KEY is unset or a placeholder, so no mail left this process";
  }
  return result.reason ?? result.error ?? "unknown";
}
