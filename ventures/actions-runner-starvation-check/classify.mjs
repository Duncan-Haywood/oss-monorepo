// Browser port of check.py's classify/report logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain job objects shaped like the GitHub Actions API's
// `/actions/runs/<id>/jobs` response — nothing here calls that API; the page
// asks a visitor to paste the JSON they already have.

export const STARVED = "starved";
export const RAN = "ran";
export const PENDING = "pending";
export const SKIPPED = "skipped";

const UNASSIGNED_RUNNER_ID = 0;

/** Return {verdict, reason} for one job object. Mirrors check.py's classify(). */
export function classify(job) {
  const status = job.status;
  if (["queued", "in_progress", "waiting", "requested", "pending"].includes(status)) {
    return { verdict: PENDING, reason: `still ${status} — no verdict until it finishes` };
  }

  if (job.conclusion === "skipped" && (job.runner_id === undefined || job.runner_id === null)) {
    return { verdict: SKIPPED, reason: "skipped by the workflow — never needed a runner" };
  }

  const runnerId = job.runner_id;
  if (runnerId === undefined || runnerId === null) {
    throw new Error(`job ${job.id ?? "?"} has no runner_id field; cannot classify without it`);
  }

  if (runnerId === UNASSIGNED_RUNNER_ID) {
    return { verdict: STARVED, reason: "runner_id: 0 — no runner was ever assigned, so no step ran" };
  }
  return { verdict: RAN, reason: `ran on runner ${runnerId} (${job.runner_name || "unnamed"})` };
}

/** Wall-clock seconds between started_at and completed_at, or null. Context only. */
export function seconds(job) {
  const { started_at: started, completed_at: completed } = job;
  if (!started || !completed) return null;
  const startMs = Date.parse(started);
  const endMs = Date.parse(completed);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  const elapsed = Math.round((endMs - startMs) / 1000);
  // A skipped job is stamped completed a second before it starts — an API
  // quirk, not a duration to show.
  return elapsed >= 0 ? elapsed : null;
}

/** Build the per-job rows. Throws if any job cannot be classified. */
export function report(jobs) {
  return jobs.map((job) => {
    const { verdict, reason } = classify(job);
    return {
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
      verdict,
      reason,
      seconds: seconds(job),
    };
  });
}

/** Normalise whatever shape a saved Actions payload arrived in. */
export function jobsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.jobs)) return payload.jobs;
    return [payload];
  }
  throw new Error("expected a job object, a list of jobs, or {jobs: [...]}");
}

/** One-line summary verdict for the whole set of rows. */
export function summarize(rows) {
  const starved = rows.filter((r) => r.verdict === STARVED);
  const pending = rows.filter((r) => r.verdict === PENDING);
  const ran = rows.filter((r) => r.verdict === RAN);

  if (starved.length) {
    return {
      status: STARVED,
      text: `${starved.length} of ${rows.length} job(s) never got a runner — this is not your code failing.`,
    };
  }
  if (pending.length) {
    return {
      status: PENDING,
      text: `${pending.length} of ${rows.length} job(s) have not finished yet. Nothing that did finish was starved.`,
    };
  }
  const skipped = rows.length - ran.length;
  return {
    status: RAN,
    text: `All ${ran.length} job(s) that ran got a real runner. Any failure here is a real result.${
      skipped ? ` (${skipped} skipped by the workflow.)` : ""
    }`,
  };
}
