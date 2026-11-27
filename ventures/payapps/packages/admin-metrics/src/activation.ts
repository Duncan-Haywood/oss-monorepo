// Activation funnel: how many companies reached each getting-started step, and on which required
// step each one stalled. Pure: the product works out which steps each company has done (with its
// own checklist rules) and passes only booleans, so no tenant content reaches this code.
import type { ActivationCohort, ActivationStepCount } from "./contract.ts";

export interface ActivationStepDef {
  key: string;
  label: string;
  optional: boolean;
}

export interface OrgActivation {
  createdAt: Date;
  /** Step key -> done. A key missing from the map counts as not done. */
  done: Record<string, boolean>;
}

/**
 * Counts one cohort. `stalledHere` is the first required step, in checklist order, that the
 * company has not done; a company with every required step done is `complete` and stalled nowhere.
 */
export function activationCohort(
  key: ActivationCohort["key"],
  label: string,
  steps: readonly ActivationStepDef[],
  orgs: readonly OrgActivation[],
): ActivationCohort {
  const counts: ActivationStepCount[] = steps.map((s) => ({
    key: s.key,
    label: s.label,
    optional: s.optional,
    reached: 0,
    stalledHere: s.optional ? null : 0,
  }));
  let complete = 0;
  for (const org of orgs) {
    let stalled = false;
    steps.forEach((s, i) => {
      const done = org.done[s.key] === true;
      const c = counts[i] as ActivationStepCount;
      if (done) c.reached++;
      if (!s.optional && !done && !stalled) {
        stalled = true;
        c.stalledHere = (c.stalledHere ?? 0) + 1;
      }
    });
    if (!stalled) complete++;
  }
  return { key, label, orgs: orgs.length, complete, steps: counts };
}

/** The two cohorts the console shows: every company, and those created at or after `since`. */
export function activationCohorts(
  steps: readonly ActivationStepDef[],
  orgs: readonly OrgActivation[],
  since: Date,
  windowDays: number,
): ActivationCohort[] {
  return [
    activationCohort("all", "All companies", steps, orgs),
    activationCohort(
      "window",
      `Signed up in the last ${windowDays} days`,
      steps,
      orgs.filter((o) => o.createdAt.getTime() >= since.getTime()),
    ),
  ];
}
