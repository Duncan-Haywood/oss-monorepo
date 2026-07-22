/**
 * human-notifications.ts — throttle for out-of-band pings to Duncan (push
 * notification / email), as opposed to blockers.ts's in-repo
 * lastConfirmed/lastConfirmedAt tracking.
 *
 * Why this exists: some agent sessions run inside a harness that can send
 * an actual push notification / email straight to Duncan's phone and inbox
 * (see the "scheduled routine" pattern), separate from anything committed
 * to this repo. blockers.ts already solved the equivalent problem for
 * *in-repo* noise (a fresh branch/commit/PR every hour just to say "still
 * blocked") via recentlyConfirmedWithinHours() — this file solves the same
 * problem for *out-of-band* noise, which is worse if left unthrottled: a
 * notification lands on a phone, not just in a git log nobody has to open.
 * Every human blocker here has been stable for over a month (see
 * blockers.ts's confirmedByCount values), so a session that pings Duncan
 * every time it independently re-discovers "still blocked on you" would
 * turn a genuinely useful signal into something he starts ignoring or
 * muting — the exact failure mode the scheduled-routine guidance warns
 * against ("a notification they didn't need is annoying in a way that
 * accumulates").
 *
 * Pattern: log one entry every time a session actually sends a
 * notification (of any kind — push, email, or both), then have the next
 * session call shouldNotifyHuman() before sending another one. Only
 * genuinely new information (a blocker resolved, a new blocker appeared,
 * a real product/business decision shipped) should bypass the throttle —
 * see shouldNotifyHuman's doc comment.
 */

export type HumanNotificationRecord = {
  /** Real timestamp the notification was sent. */
  notifiedAt: string; // ISO 8601 UTC
  /** Branch/session identifier that sent it, for history. */
  notifiedBy: string;
  /** One-line summary of what the notification said, for future sessions to check for duplication. */
  reason: string;
};

/**
 * Append-only. First entry: 2026-07-19, after a full cheap-check pass found
 * the business had been 100% human-blocked for over a month (all 6
 * blockers in blockers.ts unchanged since 2026-06-13/07-13/07-18) with no
 * evidence any prior session had ever surfaced that fact outside this repo
 * (every prior session's "still blocked" finding only ever produced a git
 * commit or, per the throttle, not even that) — plus a ~21-hour-and-counting
 * GitHub Actions runner outage (blockers.ts's actions-ci-runner-outage,
 * first flagged 2026-07-18) that specifically needs a human to check
 * GitHub billing/Actions settings, which is the kind of time-sensitive
 * infra issue a human would want to know about promptly rather than find
 * by accident. See decisions-log.ts for the full rationale.
 */
export const humanNotificationLog: HumanNotificationRecord[] = [
  {
    notifiedAt: "2026-07-19T01:20:00Z",
    notifiedBy: "claude/dazzling-allen-a4sdsa",
    reason:
      "Business 100% human-blocked for 1+ month (6 blockers, see blockers.ts) plus a ~21h GitHub Actions runner outage needing a billing/quota check.",
  },
  {
    notifiedAt: "2026-07-22T02:10:00Z",
    notifiedBy: "claude/dazzling-allen-czn0ij",
    reason:
      "Repeat reminder per shouldNotifyHuman(72)'s throttle, which this session's check crossed (~72.8h since the last notification). The GitHub Actions runner outage (blockers.ts's actions-ci-runner-outage) is unresolved and now ~94h old with zero sign of self-resolving; business remains 100% human-blocked on the same 7 items as the last notification, none changed.",
  },
];

/** Hours since the last out-of-band notification was sent. Infinity if none ever sent. */
export function hoursSinceLastNotification(now: Date = new Date()): number {
  if (humanNotificationLog.length === 0) return Infinity;
  const last = humanNotificationLog[humanNotificationLog.length - 1];
  return (now.getTime() - new Date(last.notifiedAt).getTime()) / (60 * 60 * 1000);
}

/**
 * True once at least `hours` have passed since the last notification.
 * Default 72h (3 days): frequent enough that a real resolution (Duncan
 * finally does one of the blocked actions) gets acknowledged reasonably
 * promptly, infrequent enough not to read as nagging about facts he
 * already knows. A session with a genuinely NEW finding (a blocker
 * resolved, a new blocker appeared) should notify regardless of this
 * throttle — this function only gates the "still blocked, reminder" case,
 * the out-of-band equivalent of blockers.ts's recentlyConfirmedWithinHours.
 */
export function shouldNotifyHuman(hours: number = 72, now: Date = new Date()): boolean {
  return hoursSinceLastNotification(now) >= hours;
}
