/**
 * Every database-backed rate limiter in this app is two halves that have to
 * agree with each other:
 *
 *   - a counter that asks "how many rows for this key are newer than
 *     `WINDOW_MS`", and
 *   - a reaper that deletes rows older than `RETENTION_MS`, run inside the very
 *     same transaction that records the request being counted.
 *
 * The two halves live in different functions and are tuned for different
 * reasons — one for abuse, one for how long we keep IP-derived rows — so
 * nothing in either function says they are related. They are: if retention
 * ever falls to or below the window, the reaper deletes the rows the counter
 * is about to count. Every count comes back at or near zero, every limiter
 * stops limiting, and no signal of that reaches anybody. The `MAX_*` constants
 * still read exactly as intended, the endpoints still answer 200, no error is
 * logged, and the only difference in the world is that abuse is no longer
 * refused.
 *
 * Retention is precisely the number a later data-minimisation pass lowers, on
 * its own, without opening the file that counts. So the relationship is
 * asserted here rather than described in a comment, and it throws: a limiter
 * whose retention undercuts its window fails to import, which means the venture
 * test run goes red in CI and — if it somehow got past that — the route 500s on
 * the first request instead of quietly serving unlimited writes. A loud failure
 * on a throttled endpoint is recoverable in minutes; a silent one is only
 * discovered by whoever exploits it.
 *
 * The margin is a factor, not merely "greater than". Two instances reaping and
 * counting with clocks a few seconds apart is normal serverless behaviour, and
 * a retention set to exactly the window would let the instance whose clock runs
 * ahead delete rows still inside the other's counting window. Requiring
 * retention to be at least `MIN_RETENTION_FACTOR` windows keeps skew far away
 * from the boundary while leaving every real retention policy — the shortest
 * in this app is 24 hours against a 15-minute window — untouched.
 */

/** How many counting windows a limiter's retention must cover, at minimum. */
export const MIN_RETENTION_FACTOR = 2;

/**
 * Returns `retentionMs` if it safely covers `windowMs`, and throws otherwise.
 *
 * Call it at the constant's declaration, so the check runs at module load and
 * an unsafe pair can never be the value the limiter runs with.
 *
 * @param subject Identifies the limiter in the error, e.g. `"auth.loginAttempt"`.
 */
export function checkedRetentionMs(subject: string, windowMs: number, retentionMs: number): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`${subject}: rate-limit window must be a positive number of milliseconds, got ${windowMs}.`);
  }
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
    throw new Error(`${subject}: retention must be a positive number of milliseconds, got ${retentionMs}.`);
  }
  if (retentionMs < windowMs * MIN_RETENTION_FACTOR) {
    throw new Error(
      `${subject}: retention (${retentionMs}ms) must be at least ${MIN_RETENTION_FACTOR}x the rate-limit ` +
        `window (${windowMs}ms). The reaper deletes rows older than retention in the same transaction that ` +
        `records a request, and the limiter counts rows newer than the window: retention at or below the ` +
        `window deletes the evidence the counter needs, and the limit silently stops limiting.`,
    );
  }
  return retentionMs;
}
