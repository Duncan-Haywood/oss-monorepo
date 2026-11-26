// Friendly, actionable messages for API errors ({ error: { code, message } } -> ApiError).
// Shared by the knowledge, interview and grants UIs. Per-call-site overrides win over the defaults;
// unknown codes fall back to the server's message (backend messages are written for end users).
import { ApiError } from "@client/lib/api";

export type ErrorMessages = Partial<Record<string, string>>;

const DEFAULTS: ErrorMessages = {
  // ingestion / uploads
  file_too_large: "That file is too large. Compress it or split it into smaller files.",
  too_large: "That's too large to process. Try a smaller file or a shorter excerpt.",
  unsupported_file_type:
    "We can't read that file type. Upload a PDF, Word, text, HTML, CSV, Excel or image file.",
  unsupported_media_type: "That recording format isn't supported. Try again in another browser.",
  consent_required:
    "Please confirm you have the right to share this and agree to it being processed.",
  document_processing: "This document is already being processed. Give it a minute and try again.",
  // imports
  robots_disallowed:
    "That site doesn't allow automated access. Download the RFP from the page and upload it instead.",
  not_an_opportunity:
    "That page doesn't look like a grant opportunity. Try the funder's page for the specific program, or upload the RFP.",
  fetch_failed:
    "We couldn't load that page. Check the address, or download the RFP and upload it instead.",
  unsupported_content: "That link isn't a web page, text file or PDF. Upload the RFP file instead.",
  no_text:
    "We couldn't read enough text from that source. If it's a scanned PDF, try a text-based copy.",
  crawl_not_enabled:
    "Website crawling is turned off. An admin can enable it in Settings → Privacy.",
  // billing
  payment_required: "Your plan doesn't include more application drafts right now.",
  // voice
  transcription_failed: "We couldn't transcribe that recording. Please try again.",
  // generic
  validation_error: "Some of the information isn't valid. Check the form and try again.",
  unauthorized: "Your session has expired. Sign in again to continue.",
  forbidden: "You don't have permission to do that. Ask an admin for editor access.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  internal_error: "Something went wrong on our side. Please try again.",
};

/** Codes whose server message carries specifics worth keeping (plan name, duplicate title, ...). */
const PREFER_SERVER_MESSAGE = new Set([
  "payment_required",
  "duplicate_document",
  "conflict",
  "not_found",
  "bad_request",
  "crawl_not_enabled",
  "consent_required",
]);

export const apiErrorCode = (err: unknown): string | undefined =>
  err instanceof ApiError ? err.code : undefined;

export const apiErrorStatus = (err: unknown): number | undefined =>
  err instanceof ApiError ? err.status : undefined;

export const isPaymentRequired = (err: unknown) =>
  err instanceof ApiError && (err.status === 402 || err.code === "payment_required");

/** A message to show the user for any thrown error. */
export function friendlyError(err: unknown, overrides: ErrorMessages = {}): string {
  if (err instanceof ApiError) {
    const override = overrides[err.code] ?? overrides[String(err.status)];
    if (override) return override;
    const server = err.message?.trim();
    if (server && PREFER_SERVER_MESSAGE.has(err.code) && err.code !== "http_error") return server;
    const byCode = DEFAULTS[err.code];
    if (byCode) return byCode;
    if (err.status === 413) return DEFAULTS.file_too_large as string;
    if (err.status === 415) return DEFAULTS.unsupported_file_type as string;
    // Unhandled server errors ("internal_error", or a proxy page without our JSON body) are opaque;
    // a specific 5xx code (e.g. a provider outage) carries a message meant for the user.
    if (err.status >= 500 && (err.code === "http_error" || !server))
      return DEFAULTS.internal_error as string;
    return server || "Something went wrong. Please try again.";
  }
  if (err instanceof TypeError) return "We couldn't reach the server. Check your connection.";
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
