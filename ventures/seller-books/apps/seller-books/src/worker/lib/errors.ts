import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Throw from anywhere in request handling; the app error handler renders it as JSON. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const forbidden = (msg = "You do not have access to this resource") =>
  new AppError(403, "forbidden", msg);
export const unauthorized = () => new AppError(401, "unauthorized", "Sign in required");
export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, "bad_request", msg, details);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const paymentRequired = (msg: string) => new AppError(402, "payment_required", msg);
export const tooManyRequests = (msg = "Too many requests") =>
  new AppError(429, "rate_limited", msg);
/**
 * The 403 for a signed-in user who has not accepted the current legal documents
 * (middleware/legal.ts). `details.version` is the version to accept at POST /api/me/legal/accept.
 */
export const termsNotAccepted = (version: string) =>
  new AppError(
    403,
    "terms_not_accepted",
    `Accept the current Terms of Service, Privacy Policy, Refund Policy and Acceptable Use Policy (version ${version}) before using your books.`,
    { version },
  );
