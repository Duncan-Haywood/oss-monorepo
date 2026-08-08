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
  /**
   * This write records money that Stripe has already taken, so it may not land
   * in a store that will not survive the pod. See
   * `assertDurableLedgerStore` — set by the Stripe webhook alone.
   */
  requireDurableLedger?: boolean;
};

/**
 * Whether a Convex mutation failure may fall back to SQLite.
 * - Convex not configured → SQLite is the primary store (always fall back / use SQLite).
 * - requireConvex → never fall back (caller should 5xx / retry).
 * - default → fall back (dashboard / non-revenue paths).
 *
 * Note this is consulted only from a Convex `catch`, so it is reached only when
 * Convex was configured and the call failed. When Convex is unconfigured the
 * caller never enters the `try` at all and goes straight to SQLite — which is
 * the correct default, and is why the paid-order path needs the separate
 * precondition in `assertDurableLedgerStore` rather than another branch here.
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
 * Refuse a paid-order write that has nowhere durable to go.
 *
 * `requireConvex` only ever hardened the case where Convex *was* configured and
 * the mutation failed. The case nobody guarded is the one every image built
 * without `NEXT_PUBLIC_CONVEX_URL` is actually in: `convexClient` is null, no
 * Convex call is attempted, and the write goes straight to SQLite at
 * `process.cwd()/local.db`. `platform/k8s/apps/local-site-studio/deployment.yaml`
 * mounts no volume, so that file lives on the container's writable layer. A
 * customer pays, Stripe gets its 200, and the only record of the sale is
 * deleted by the next restart, rollout or rescale — with nothing to retry
 * against, because Stripe was told the delivery succeeded.
 *
 * The venture already draws this line itself. `.env.example` says SQLite-only
 * "is fine for solo local demos" but that a real Convex URL is "required before
 * first paid order", and `convex-url-env-readiness.ts` puts a banner on the
 * dashboard saying so. Both of those *report* the condition; nothing refused on
 * it. This refuses on it, and only on it: the flag is set by the Stripe webhook
 * and by nothing else, so the contact form, the CRM, unsubscribe and every
 * other `requireConvex` surface keep the SQLite path the demo depends on.
 *
 * Failing here is strictly better than succeeding here. The throw becomes a 500
 * (`webhookFulfillmentFailureResponse`), Stripe redelivers for ~3 days, and the
 * order lands as soon as an operator sets the URL. Cf. the sibling rule in
 * `ConvexPrimaryReadError`: absence of a durable store is not permission to
 * pretend the write happened.
 */
export function assertDurableLedgerStore(
  surface: string,
  convexConfigured: boolean,
  options?: ConvexPrimaryWriteOptions,
): void {
  if (options?.requireDurableLedger === true && !convexConfigured) {
    throw new DurableLedgerUnavailableError(surface);
  }
}

export class DurableLedgerUnavailableError extends Error {
  readonly surface: string;

  constructor(surface: string) {
    super(
      `Refusing to record ${surface}: NEXT_PUBLIC_CONVEX_URL is not configured, ` +
        "so the only store available is instance-local SQLite, which does not " +
        "survive a restart. Stripe has taken the money — returning an error so " +
        "it redelivers rather than recording the sale somewhere it will be lost.",
    );
    this.name = "DurableLedgerUnavailableError";
    this.surface = surface;
  }
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
