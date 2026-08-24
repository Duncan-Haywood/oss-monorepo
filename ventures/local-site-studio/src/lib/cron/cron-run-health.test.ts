import { describe, expect, it } from "vitest";
import {
  CRON_JOBS,
  CRON_RUN_STALE_THRESHOLD_HOURS,
  computeCronJobHealth,
  cronJobsNeedingAttention,
  type CronRunRecord,
} from "./cron-run-health";

const NOW_MS = new Date("2026-07-28T12:00:00.000Z").getTime();

function hoursAgoIso(hours: number): string {
  return new Date(NOW_MS - hours * 60 * 60 * 1000).toISOString();
}

describe("computeCronJobHealth", () => {
  it("returns all three known jobs even when cronRuns is empty, each marked stale-never-run", () => {
    const health = computeCronJobHealth([], NOW_MS);
    expect(health).toHaveLength(CRON_JOBS.length);
    for (const job of health) {
      expect(job.ageHours).toBeNull();
      expect(job.isStale).toBe(true);
      expect(job.isFailing).toBe(false);
    }
  });

  it("marks a job healthy when its last run was recent and successful", () => {
    const cronRuns: CronRunRecord[] = [
      { job: "daily-digest", lastRunAt: hoursAgoIso(2), lastRunSuccess: true },
    ];
    const health = computeCronJobHealth(cronRuns, NOW_MS);
    const digest = health.find((j) => j.job === "daily-digest")!;
    expect(digest.ageHours).toBe(2);
    expect(digest.isStale).toBe(false);
    expect(digest.isFailing).toBe(false);
  });

  it("marks a job stale once its last run exceeds the threshold, even if that run succeeded", () => {
    const cronRuns: CronRunRecord[] = [
      {
        job: "checkout-recovery",
        lastRunAt: hoursAgoIso(CRON_RUN_STALE_THRESHOLD_HOURS + 1),
        lastRunSuccess: true,
      },
    ];
    const health = computeCronJobHealth(cronRuns, NOW_MS);
    const recovery = health.find((j) => j.job === "checkout-recovery")!;
    expect(recovery.isStale).toBe(true);
    expect(recovery.isFailing).toBe(false);
  });

  it("does not mark a job stale exactly at the threshold boundary", () => {
    const cronRuns: CronRunRecord[] = [
      {
        job: "outreach-followups",
        lastRunAt: hoursAgoIso(CRON_RUN_STALE_THRESHOLD_HOURS),
        lastRunSuccess: true,
      },
    ];
    const health = computeCronJobHealth(cronRuns, NOW_MS);
    const followups = health.find((j) => j.job === "outreach-followups")!;
    expect(followups.isStale).toBe(false);
  });

  it("marks a job failing (but not stale) when its most recent recorded run failed recently", () => {
    const cronRuns: CronRunRecord[] = [
      {
        job: "daily-digest",
        lastRunAt: hoursAgoIso(1),
        lastRunSuccess: false,
        lastFailureAt: hoursAgoIso(1),
        lastError: "OPERATOR_DIGEST_EMAIL not set",
      },
    ];
    const health = computeCronJobHealth(cronRuns, NOW_MS);
    const digest = health.find((j) => j.job === "daily-digest")!;
    expect(digest.isStale).toBe(false);
    expect(digest.isFailing).toBe(true);
    expect(digest.lastError).toBe("OPERATOR_DIGEST_EMAIL not set");
  });

  it("treats an unparsable lastRunAt as never-run (stale), not a crash", () => {
    const cronRuns: CronRunRecord[] = [
      { job: "daily-digest", lastRunAt: "not-a-date", lastRunSuccess: true },
    ];
    const health = computeCronJobHealth(cronRuns, NOW_MS);
    const digest = health.find((j) => j.job === "daily-digest")!;
    expect(digest.ageHours).toBeNull();
    expect(digest.isStale).toBe(true);
  });
});

describe("cronJobsNeedingAttention", () => {
  it("returns nothing when every job is fresh and successful", () => {
    const cronRuns: CronRunRecord[] = CRON_JOBS.map((job) => ({
      job,
      lastRunAt: hoursAgoIso(1),
      lastRunSuccess: true,
    }));
    expect(cronJobsNeedingAttention(cronRuns, NOW_MS)).toEqual([]);
  });

  it("flags a job that has never run alongside a failing job, leaving a healthy job out", () => {
    const cronRuns: CronRunRecord[] = [
      { job: "daily-digest", lastRunAt: hoursAgoIso(1), lastRunSuccess: true },
      {
        job: "checkout-recovery",
        lastRunAt: hoursAgoIso(1),
        lastRunSuccess: false,
        lastError: "Resend API error",
      },
      // outreach-followups has no row at all — never run.
    ];
    const flagged = cronJobsNeedingAttention(cronRuns, NOW_MS).map((j) => j.job);
    expect(flagged).toEqual(expect.arrayContaining(["checkout-recovery", "outreach-followups"]));
    expect(flagged).not.toContain("daily-digest");
    expect(flagged).toHaveLength(2);
  });
});
