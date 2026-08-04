/**
 * Convex-primary write policy for Stripe webhook fulfillment.
 *
 * Dashboard / operator paths keep Convex→SQLite fallback so a transient
 * Convex blip does not brick CRM edits. The Stripe webhook revenue path must
 * NOT write only to instance-local SQLite when Convex is configured — other
 * instances read Convex-first and would never see the payment.
 */

export type ConvexPrimaryWriteOptions = {
  /**
   * When Convex is configured, rethrow Convex mutation failures instead of
   * falling back to SQLite. Webhook fulfillment passes this so Stripe can
   * retry until the shared store accepts the write.
   */
  requireConvex?: boolean;
};

/**
 * Whether a Convex mutation failure may fall back to SQLite.
 * - Convex not configured → SQLite is the primary store (always fall back / use SQLite).
 * - requireConvex → never fall back (caller should 5xx / retry).
 * - default → fall back (dashboard / non-revenue paths).
 */
export function shouldFallbackToSqliteOnConvexFailure(
  convexConfigured: boolean,
  options?: ConvexPrimaryWriteOptions,
): boolean {
  if (!convexConfigured) {
    return true;
  }
  return options?.requireConvex !== true;
}

/**
 * The read-side twin, for questions whose "no data" answer is the dangerous one.
 *
 * `UNSUBSCRIBE_CONVEX_PRIMARY` made the suppression *write* fail closed: when
 * Convex is configured, GET /api/unsubscribe 500s rather than writing only to
 * instance-local SQLite. That has a consequence nobody followed through on.
 * Because the write never lands in SQLite on a Convex-configured deploy, the
 * local `suppression_list` table on such a deploy is provably always empty — so
 * the SQLite fallback inside `isEmailSuppressed` could only ever return `false`,
 * meaning "not suppressed, go ahead and send".
 *
 * A Convex read failure therefore answered the CAN-SPAM question with the exact
 * answer that keeps emailing someone who just opted out, and the more carefully
 * the write was hardened the more certain that answer became. Absence of
 * evidence is not evidence of consent; this makes the read say "I do not know"
 * instead of "no".
 */
export class ConvexPrimaryReadError extends Error {
  readonly surface: string;

  constructor(surface: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Convex read failed for ${surface} (requireConvex — no SQLite fallback): ${detail}`,
    );
    this.name = "ConvexPrimaryReadError";
    this.surface = surface;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class ConvexPrimaryWriteError extends Error {
  readonly surface: string;

  constructor(surface: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Convex write failed for ${surface} (requireConvex — no SQLite fallback): ${detail}`,
    );
    this.name = "ConvexPrimaryWriteError";
    this.surface = surface;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
