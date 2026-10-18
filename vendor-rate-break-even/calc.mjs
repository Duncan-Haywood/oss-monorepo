export function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number`);
  return parsed;
}

// Revenue per job travels all the way through the form -- collected,
// validated, persisted, and shared -- but until now `compare` threw it away
// after validating it (`baselineRevenue` was computed only to satisfy the
// "must be entered" check). The FAQ copy on this page and on
// `is-switching-vendors-worth-it.html` already talks about vendor choices in
// terms of profit ("adding a fixed fee ... never turns a profit at any
// volume"), but nothing ever computed one. A cheaper cost per job is not
// always the same decision as more profit per job once revenue is in the
// picture, so both are reported here rather than only cost.
function profitFields(revenuePerJob, costPerJob, jobs) {
  const profitPerJob = revenuePerJob - costPerJob;
  return {
    profitPerJob,
    monthlyProfit: profitPerJob * jobs,
    // Margin is undefined, not zero, at $0 revenue per job -- there is no
    // sale to take a share of, so this reports `null` rather than a
    // misleading -Infinity or 0%.
    marginPercent: revenuePerJob > 0 ? (profitPerJob / revenuePerJob) * 100 : null,
  };
}

export function compare(input) {
  const jobs = number(input.jobsPerMonth, 'Jobs per month');
  if (jobs <= 0) throw new Error('Jobs per month must be greater than zero');
  const revenuePerJob = number(input.revenuePerJob, 'Revenue per job');
  const baseFixed = number(input.baseFixedMonthly, 'Current fixed monthly cost');
  const baseVariable = number(input.baseVariablePerJob, 'Current variable cost per job');
  const baselineCostPerJob = baseVariable + baseFixed / jobs;
  const scenarios = (input.scenarios ?? []).map((scenario, index) => {
    const fixed = number(scenario.fixedMonthly, `Scenario ${index + 1} fixed cost`);
    const variable = number(scenario.variablePerJob, `Scenario ${index + 1} variable cost`);
    const monthlyCost = fixed + variable * jobs;
    const costPerJob = monthlyCost / jobs;
    const savingsPerJob = baselineCostPerJob - costPerJob;
    const variableSavings = baseVariable - variable;
    const fixedDelta = fixed - baseFixed;
    // Three ways a scenario relates to the baseline, not two: a lower (or
    // equal) per-job cost is cheaper immediately or once its fixed fee is
    // paid back (breakEvenJobs); a *higher* per-job cost paired with a
    // *lower* fixed cost is cheaper only up to a volume where the fixed
    // saving runs out (cheaperUpToJobs) -- previously collapsed into the
    // same "not cheaper" result as a scenario that is worse on both costs.
    let breakEvenJobs = null;
    let cheaperUpToJobs = null;
    if (variableSavings > 0) {
      breakEvenJobs = Math.max(0, Math.ceil(fixedDelta / variableSavings));
    } else if (variableSavings === 0) {
      if (fixedDelta < 0) breakEvenJobs = 0;
    } else if (fixedDelta < 0) {
      cheaperUpToJobs = Math.max(1, Math.ceil(fixedDelta / variableSavings));
    }
    return {
      name: String(scenario.name || `Scenario ${index + 1}`),
      fixed,
      variable,
      monthlyCost,
      costPerJob,
      savingsPerJob,
      breakEvenJobs,
      cheaperUpToJobs,
      ...profitFields(revenuePerJob, costPerJob, jobs),
    };
  });
  return {
    jobs,
    revenuePerJob,
    baseline: {
      fixed: baseFixed,
      variable: baseVariable,
      monthlyCost: baseFixed + baseVariable * jobs,
      costPerJob: baselineCostPerJob,
      ...profitFields(revenuePerJob, baselineCostPerJob, jobs),
    },
    scenarios,
  };
}
