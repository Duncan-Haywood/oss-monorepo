export function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number`);
  return parsed;
}

export function compare(input) {
  const jobs = number(input.jobsPerMonth, 'Jobs per month');
  if (jobs <= 0) throw new Error('Jobs per month must be greater than zero');
  const baselineRevenue = number(input.revenuePerJob, 'Revenue per job');
  const baseFixed = number(input.baseFixedMonthly, 'Current fixed monthly cost');
  const baseVariable = number(input.baseVariablePerJob, 'Current variable cost per job');
  const scenarios = (input.scenarios ?? []).map((scenario, index) => {
    const fixed = number(scenario.fixedMonthly, `Scenario ${index + 1} fixed cost`);
    const variable = number(scenario.variablePerJob, `Scenario ${index + 1} variable cost`);
    const monthlyCost = fixed + variable * jobs;
    const costPerJob = monthlyCost / jobs;
    const savingsPerJob = baseVariable + baseFixed / jobs - costPerJob;
    const variableSavings = baseVariable - variable;
    const breakEvenJobs = variableSavings > 0 ? Math.max(0, Math.ceil((fixed - baseFixed) / variableSavings)) : null;
    return { name: String(scenario.name || `Scenario ${index + 1}`), fixed, variable, monthlyCost, costPerJob, savingsPerJob, breakEvenJobs };
  });
  return { jobs, revenuePerJob: baselineRevenue, baseline: { fixed: baseFixed, variable: baseVariable, monthlyCost: baseFixed + baseVariable * jobs, costPerJob: baseVariable + baseFixed / jobs }, scenarios };
}
