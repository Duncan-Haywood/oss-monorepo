// EventBridge Scheduler expressions for the grants module call (infra/aws/main.tf `schedules`)
// and the Workers crons they stand for (wrangler.jsonc `triggers.crons`). All UTC.
// test/unit/aws-schedules.test.ts keeps the three in step.
export const AWS_SCHEDULES = {
  /** Daily discovery, retention sweep, digests: Workers "17 13 * * *". */
  daily: "cron(17 13 * * ? *)",
  /** Follow-ups, watchlist, newsletter sequence: Workers "*\/30 * * * *". */
  halfHourly: "cron(0/30 * * * ? *)",
  /** AWS only: drain the JOBS table and apply Paddle entitlements (Cloudflare does both itself). */
  jobs: "rate(1 minute)",
} as const;

const TO_WORKERS: Record<string, string> = {
  [AWS_SCHEDULES.daily]: "17 13 * * *",
  [AWS_SCHEDULES.halfHourly]: "*/30 * * * *",
};

/** The Workers cron handleScheduled() expects for an AWS schedule expression, or null. */
export function workersCronFor(expression: string): string | null {
  return TO_WORKERS[expression] ?? null;
}
