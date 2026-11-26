// EmailSender that tries a primary provider and hands the message to a secondary one only when the
// primary *definitely* did not accept it. Used for `EMAIL_PROVIDER=ses-with-fallback` (SES first,
// then Resend / Cloudflare Email Service).
//
// Never double-send: with SES that means falling back only on an HTTP 4xx answer (SesSendError with
// `rejected`): throttling (TooManyRequestsException, LimitExceededException), auth/IAM (403),
// sending paused, account suspended, unverified identity (MessageRejected), unknown configuration
// set (NotFoundException), BadRequestException. In each case SES refused the request before queuing
// anything. Not on:
// - 5xx (InternalFailure, ServiceUnavailable): SES gives no guarantee nothing was queued;
// - no response (network error, timeout): the request may have been accepted;
// - our own validation errors (bad address, too many recipients): another provider would refuse too.
// Those propagate, so the caller releases its claim and retries later on the same path, as it does
// today with any provider.
import type { EmailMessage, EmailSender } from "./email";
import { SesSendError } from "./ses-email";

export interface EmailFallbackEvent {
  from: string;
  to: string;
  status: number | null;
  code: string;
  category: "transactional" | "marketing";
}

/** The default rule: only a definite SES refusal may go to another provider. */
export const isDefinitelyNotSent = (err: unknown): boolean =>
  err instanceof SesSendError &&
  err.rejected &&
  (err.status === 429 || err.status === 403 || PROVIDER_SIDE_REFUSALS.has(err.code));

/**
 * SES 4xx codes that describe our account or setup, not the message or the recipient. Only these
 * fail over. `MessageRejected` and `BadRequestException` are about this message (a suppressed or
 * invalid recipient, bad content): re-sending it through another provider would mail someone SES
 * refused for a reason, e.g. an address on the suppression list after a bounce or complaint.
 */
export const PROVIDER_SIDE_REFUSALS: ReadonlySet<string> = new Set([
  "TooManyRequestsException",
  "LimitExceededException",
  "AccountSuspendedException",
  "SendingPausedException",
  "MailFromDomainNotVerifiedException",
  "NotFoundException",
  "AccessDeniedException",
  "AccessDenied",
  "UnrecognizedClientException",
  "InvalidClientTokenId",
  "InvalidSignatureException",
  "SignatureDoesNotMatch",
  "ExpiredTokenException",
]);

export class FallbackEmailSender implements EmailSender {
  constructor(
    private readonly primary: EmailSender,
    private readonly secondary: EmailSender,
    private readonly names: { primary: string; secondary: string },
    private readonly onFallback?: (e: EmailFallbackEvent) => void,
    private readonly canFallBack: (err: unknown) => boolean = isDefinitelyNotSent,
  ) {}

  async send(msg: EmailMessage): Promise<{ id: string }> {
    try {
      return await this.primary.send(msg);
    } catch (err) {
      if (!this.canFallBack(err)) throw err;
      this.onFallback?.({
        from: this.names.primary,
        to: this.names.secondary,
        status: err instanceof SesSendError ? err.status : null,
        code: err instanceof SesSendError ? err.code : "unknown",
        category: msg.category ?? "transactional",
      });
      return this.secondary.send(msg);
    }
  }
}
