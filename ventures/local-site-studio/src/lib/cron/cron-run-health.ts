/**
 * Pure run-health predicate for the three Vercel Cron-triggered routes
 * (daily-digest, checkout-recovery, outreach-followups — all sharing
 * src/lib/security/cron-secret.ts). Until this shipped, none of them
 * persisted anything about their own invocation history: a route that
 * stopped being called at all (Vercel Cron disabled/misconfigured), or one
 * that started 500ing on every run, was invisible everywhere in-app —
 * pipeline-health and the daily digest only ever showed the underlying due
 * queues, which look identical whether the automation is running or has been
 * silently dead for a week. See cron-run-health-visibility.
 *
 * db.ts's recordCronRunOutcome/listCronRuns persist one row per job name
 * (Convex-first with a SQLite fallback, mirroring every other dual-backend
 * surface). This module is the pure aggregator over that list — no I/O, no
 * Date.now() — consumed by both pipeline-health.ts and daily-digest.ts.
 */

export const CRON_JOBS = ["daily-digest", "checkout-recovery", "outreach-followups"] as const;

export type CronJobName = (typeof CRON_JOBS)[number];

export const CRON_JOB_LABELS: Record<CronJobName, string> = {
  "daily-digest": "Daily digest",
  "checkout-recovery": "Checkout recovery",
  "outreach-followups": "Outreach follow-ups",
};

/**
 * Every job is wired as a once-daily vercel.json cron entry — flag a job
 * stale once its last recorded run (success or failure) is older than this,
 * giving real headroom over a single missed invocation before alerting.
 */
export const CRON_RUN_STALE_THRESHOLD_HOURS = 36;

export interface CronRunRecord {
  job: string;
  /** ISO timestamp — set on every invocation regardless of outcome. */
  lastRunAt: string;
  lastRunSuccess: boolean;
  lastFailureAt?: string;
  lastError?: string;
}

export interface CronJobHealth {
  job: CronJobName;
  label: string;
  lastRunAt?: string;
  lastRunSuccess?: boolean;
  lastError?: string;
  /** Whole hours since the last recorded run; null when the job has never recorded one. */
  ageHours: number | null;
  /** True when the job has never run, or its last recorded run is older than the staleness threshold. */
  isStale: boolean;
  /** True when the job's most recently recorded run failed (independent of staleness). */
  isFailing: boolean;
}

/**
 * Computes health for all three known cron jobs, including any that have
 * never recorded a run at all (a job absent from `cronRuns` is exactly as
 * actionable as one whose last run fell off the staleness window — both mean
 * "nothing confirms this automation is working").
 */
export function computeCronJobHealth(
  cronRuns: ReadonlyArray<CronRunRecord>,
  nowMs: number,
  staleThresholdHours: number = CRON_RUN_STALE_THRESHOLD_HOURS,
): CronJobHealth[] {
  const byJob = new Map(cronRuns.map((row) => [row.job, row]));
  return CRON_JOBS.map((job) => {
    const row = byJob.get(job);
    const ageHours =
      row && !Number.isNaN(new Date(row.lastRunAt).getTime())
        ? Math.max(0, Math.floor((nowMs - new Date(row.lastRunAt).getTime()) / (1000 * 60 * 60)))
        : null;
    const isStale = ageHours === null || ageHours > staleThresholdHours;
    const isFailing = row ? !row.lastRunSuccess : false;
    return {
      job,
      label: CRON_JOB_LABELS[job],
      lastRunAt: row?.lastRunAt,
      lastRunSuccess: row?.lastRunSuccess,
      lastError: row?.lastError,
      ageHours,
      isStale,
      isFailing,
    };
  });
}

/** Convenience filter — jobs an operator would actually want to see flagged. */
export function cronJobsNeedingAttention(
  cronRuns: ReadonlyArray<CronRunRecord>,
  nowMs: number,
  staleThresholdHours: number = CRON_RUN_STALE_THRESHOLD_HOURS,
): CronJobHealth[] {
  return computeCronJobHealth(cronRuns, nowMs, staleThresholdHours).filter(
    (job) => job.isStale || job.isFailing,
  );
}
