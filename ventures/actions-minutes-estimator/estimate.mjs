// Estimates what a set of GitHub Actions workflows costs per month, in
// billable minutes and in dollars, and names the patterns responsible.
//
// The question this answers is the one GitHub's own billing page cannot:
// billing shows you minutes you have *already* spent, aggregated, after the
// fact. It does not tell you which workflow spent them, and it does not tell
// you before you merge a workflow what it is about to cost. `/actions/runs/
// <id>/timing` does not close that gap either -- it reports a billable
// `total_ms` of 0 on private repositories often enough that no per-workflow
// attribution can be built on it.
//
// So this reads the workflow files themselves and does the arithmetic
// forward. Every number below is derived from something in the YAML plus an
// assumption the caller states explicitly (how long a job takes, how often
// you push). Assumptions are inputs, never hidden constants -- an estimate
// whose premises you cannot see is not worth acting on.
//
// Nothing here makes a network call. It is the same module the browser page
// and `cli.mjs` both run.

import { parseYaml, UnsupportedYamlError } from './workflow-yaml.mjs';

export { UnsupportedYamlError };

/**
 * GitHub-hosted *standard* runners. `multiplier` is how many minutes of the
 * plan's included allowance one wall-clock minute consumes; `perMinuteUsd` is
 * the published list rate charged once the allowance is gone.
 *
 * Recorded rather than fetched, because this tool runs with no network: these
 * are GitHub's published list prices for standard runners as documented at
 * RATES_AS_OF. They change. Both the browser page and the CLI let you
 * override them, and the report always prints the date it is quoting, so a
 * stale rate shows as a stale rate instead of masquerading as a reading.
 */
export const RATES_AS_OF = '2025-06';

export const RUNNER_CLASSES = {
  linux: { label: 'Linux', multiplier: 1, perMinuteUsd: 0.008, perCoreMinuteUsd: 0.004 },
  windows: { label: 'Windows', multiplier: 2, perMinuteUsd: 0.016, perCoreMinuteUsd: 0.008 },
  macos: { label: 'macOS', multiplier: 10, perMinuteUsd: 0.08, perCoreMinuteUsd: null },
};

/** Included minutes per month, by plan, for private repositories. */
export const PLANS = {
  free: { label: 'Free', includedMinutes: 2000 },
  pro: { label: 'Pro', includedMinutes: 3000 },
  team: { label: 'Team', includedMinutes: 3000 },
  enterprise: { label: 'Enterprise Cloud', includedMinutes: 50000 },
  public: { label: 'Public repository', includedMinutes: Infinity },
};

/** GitHub refuses to start a matrix that expands past this many jobs. */
export const MAX_MATRIX_JOBS = 256;

/** A job with no `timeout-minutes` is killed by GitHub only at this point. */
export const DEFAULT_JOB_TIMEOUT_MINUTES = 360;

export const DEFAULT_ASSUMPTIONS = {
  plan: 'team',
  minutesPerJob: 5,
  pushRunsPerMonth: 120,
  pullRequestRunsPerMonth: 60,
  manualRunsPerMonth: 4,
  otherEventRunsPerMonth: 10,
  // A workflow with `paths:` / `paths-ignore:` only runs when a push touches
  // the files it names, so counting it against every push overstates it — in a
  // monorepo with one CI workflow per package, by orders of magnitude. What
  // share of pushes actually match is knowable only from the repository's own
  // history, so it is an assumption, printed with every report and settable
  // with `--path-filter-share`. It defaults below 1 because the alternative is
  // not "conservative", it is confidently wrong for every monorepo.
  pathFilteredShare: 0.25,
};

// --- runner classification -------------------------------------------------

/** Labels that identify a standard GitHub-hosted runner image. */
function standardClassFor(label) {
  const text = String(label).toLowerCase();
  if (/^ubuntu[-\d.]*(-latest|-\d+\.\d+)?$/.test(text) || text.startsWith('ubuntu-')) return 'linux';
  if (text.startsWith('windows-')) return 'windows';
  if (text.startsWith('macos-')) return 'macos';
  return null;
}

/**
 * Work out what a `runs-on:` value bills as.
 *
 * Returns `{ kind, class, cores, label }` where `kind` is one of:
 *   `standard`    — consumes included minutes at `RUNNER_CLASSES[class].multiplier`
 *   `larger`      — a larger GitHub-hosted runner: billed per minute from the
 *                   first minute and, per GitHub's own docs, NOT drawn from
 *                   the included allowance. Getting this backwards is the
 *                   single easiest way to produce a wrong total, which is why
 *                   it is a separate kind rather than a bigger multiplier.
 *   `self-hosted` — free; runs on hardware you already pay for elsewhere
 *   `unknown`     — an expression (`${{ vars.CI_RUNNER }}`) or an unrecognised
 *                   label. Never guessed at: it is reported as unknown and the
 *                   caller is told which job it was.
 */
export function classifyRunner(runsOn) {
  const labels = [];
  if (typeof runsOn === 'string') labels.push(runsOn);
  else if (Array.isArray(runsOn)) labels.push(...runsOn.map(String));
  else if (runsOn && typeof runsOn === 'object') {
    if (runsOn.labels) labels.push(...[].concat(runsOn.labels).map(String));
    if (runsOn.group) labels.push(String(runsOn.group));
  }

  if (labels.length === 0) return { kind: 'unknown', class: null, cores: null, label: '(none)' };
  const joined = labels.join(', ');

  if (labels.some((l) => /self-hosted/i.test(l))) {
    return { kind: 'self-hosted', class: null, cores: null, label: joined };
  }
  // An unresolved expression could be anything, including a self-hosted label.
  // But `${{ vars.CI_RUNNER || 'ubuntu-latest' }}` is a common way to keep a
  // repository switchable between hosted and self-hosted runners, and it names
  // its own default. Reading that quoted fallback is far more useful than
  // dropping the job's minutes out of the totals — a repository that uses the
  // idiom everywhere would otherwise have almost nothing counted. The guess is
  // marked `presumed` so the report can say it made one.
  if (labels.some((l) => /\$\{\{/.test(l))) {
    for (const label of labels) {
      for (const [, quoted] of String(label).matchAll(/['"]([^'"]+)['"]/g)) {
        if (/self-hosted/i.test(quoted)) {
          return { kind: 'self-hosted', class: null, cores: null, label: joined, presumed: true };
        }
        const cls = standardClassFor(quoted);
        if (cls) {
          return { kind: 'standard', class: cls, cores: null, label: joined, presumed: true };
        }
      }
    }
    return { kind: 'unknown', class: null, cores: null, label: joined };
  }

  for (const label of labels) {
    const cores = /-(\d+)-cores?\b/.exec(String(label).toLowerCase());
    const cls = standardClassFor(label);
    if (cores && cls) {
      return { kind: 'larger', class: cls, cores: Number(cores[1]), label: joined };
    }
  }
  for (const label of labels) {
    const cls = standardClassFor(label);
    if (cls) return { kind: 'standard', class: cls, cores: null, label: joined };
  }
  return { kind: 'unknown', class: null, cores: null, label: joined };
}

// --- matrix expansion ------------------------------------------------------

function sameOnSharedKeys(combo, entry) {
  return Object.keys(entry).every(
    (key) => !(key in combo) || String(combo[key]) === String(entry[key]),
  );
}

/**
 * Expand `strategy.matrix` into the job list GitHub would actually run,
 * following the documented order: cartesian product of the axis values, then
 * `exclude`, then `include` (an include that matches an existing combination
 * on its shared keys is merged into it; one that does not becomes a new job).
 *
 * Returns `{ jobs, axes, capped }`. `jobs` is at least 1: a job with no matrix
 * still runs once.
 */
export function expandMatrix(matrix) {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return { jobs: 1, combos: [], axes: {}, capped: false };
  }
  const axes = {};
  for (const [key, value] of Object.entries(matrix)) {
    if (key === 'include' || key === 'exclude') continue;
    // An axis given as an expression cannot be counted; treat it as one value
    // and let the caller surface the uncertainty rather than inventing a size.
    if (Array.isArray(value)) axes[key] = value;
    else if (value != null) axes[key] = [value];
  }

  let combos = [{}];
  for (const [key, values] of Object.entries(axes)) {
    const next = [];
    for (const combo of combos) {
      for (const value of values) next.push({ ...combo, [key]: value });
    }
    combos = next;
    // Guard against a pathological product; GitHub itself refuses past 256.
    if (combos.length > MAX_MATRIX_JOBS * 8) {
      return { jobs: combos.length, combos: [], axes, capped: true };
    }
  }

  const excludes = [].concat(matrix.exclude ?? []).filter((e) => e && typeof e === 'object');
  if (excludes.length) {
    combos = combos.filter(
      (combo) => !excludes.some((entry) => sameOnSharedKeys(combo, entry)),
    );
  }

  const includes = [].concat(matrix.include ?? []).filter((e) => e && typeof e === 'object');
  for (const entry of includes) {
    const matched = combos.filter((combo) => sameOnSharedKeys(combo, entry));
    if (matched.length > 0) {
      for (const combo of matched) Object.assign(combo, entry);
    } else {
      combos.push({ ...entry });
    }
  }

  return { jobs: Math.max(combos.length, 1), combos, axes, capped: false };
}

// --- cron -----------------------------------------------------------------

function parseCronField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(',')) {
    const text = part.trim();
    if (text === '') continue;
    const [range, stepText] = text.split('/');
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isFinite(step) || step < 1) return null;
    let lo = min;
    let hi = max;
    if (range !== '*' && range !== '') {
      const bounds = range.split('-');
      lo = Number(bounds[0]);
      hi = bounds.length > 1 ? Number(bounds[1]) : lo;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      if (bounds.length === 1 && stepText) hi = max;
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

/**
 * How many times a 5-field cron expression fires in an average month.
 *
 * Counted over a full reference year and divided by 12, so a monthly or
 * day-of-month schedule lands on a real figure rather than one distorted by
 * whichever 30 days were sampled. Days are walked one at a time and multiplied
 * by the number of matching times of day, which is exactly equivalent to
 * walking every minute and about 1400x cheaper — this runs on every keystroke
 * in a browser tab.
 *
 * Returns `null` for an expression this cannot read, which the caller reports
 * rather than silently scoring as zero.
 */
export function cronRunsPerMonth(expression) {
  const fields = String(expression ?? '').trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minutes = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dowRaw = parseCronField(fields[4], 0, 7);
  if (!minutes || !hours || !dom || !month || !dowRaw) return null;

  // Cron treats both 0 and 7 as Sunday.
  const dow = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)));
  const domRestricted = fields[2].trim() !== '*';
  const dowRestricted = fields[4].trim() !== '*';

  const timesPerDay = minutes.size * hours.size;
  let days = 0;
  // 2025 is a common (non-leap) year: an average month over a plain year.
  const cursor = new Date(Date.UTC(2025, 0, 1));
  while (cursor.getUTCFullYear() === 2025) {
    const m = cursor.getUTCMonth() + 1;
    if (month.has(m)) {
      const dayMatches = dom.has(cursor.getUTCDate());
      const weekdayMatches = dow.has(cursor.getUTCDay());
      // When both day fields are restricted, cron fires if EITHER matches.
      const matches =
        domRestricted && dowRestricted
          ? dayMatches || weekdayMatches
          : (!domRestricted || dayMatches) && (!dowRestricted || weekdayMatches);
      if (matches) days++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return (days * timesPerDay) / 12;
}

// --- workflow model --------------------------------------------------------

function triggerNames(on) {
  if (!on) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  if (typeof on === 'object') return Object.keys(on);
  return [];
}

function scheduleEntries(on) {
  if (!on || typeof on !== 'object' || Array.isArray(on)) return [];
  return [].concat(on.schedule ?? []).filter((e) => e && typeof e === 'object' && e.cron);
}

/**
 * Substitute `${{ matrix.<key> }}` in a `runs-on` value from one combination.
 *
 * `runs-on: ${{ matrix.os }}` over `os: [ubuntu-latest, macos-latest]` is the
 * single most common matrix in existence, and it is exactly the shape where
 * getting the runner wrong matters most — an OS matrix that includes macOS is
 * the classic 10x surprise. Treating it as one unclassifiable runner would
 * drop the whole job out of the totals, which reads as "free".
 */
export function resolveMatrixRunner(runsOn, combo) {
  if (typeof runsOn !== 'string' || !combo) return runsOn;
  return runsOn.replace(/\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/g, (whole, key) =>
    key in combo ? String(combo[key]) : whole,
  );
}

/**
 * Group a job's matrix legs by the runner each one lands on.
 *
 * Most jobs are one leg. A job whose `runs-on` varies across the matrix is
 * several, each costed at its own multiplier.
 */
export function runnerLegs(runsOn, matrix) {
  const combos = matrix?.combos ?? [];
  const usesMatrix = typeof runsOn === 'string' && /\$\{\{\s*matrix\./.test(runsOn);
  if (!usesMatrix || combos.length === 0) {
    return [{ runner: classifyRunner(runsOn), count: matrix?.jobs ?? 1 }];
  }
  const byLabel = new Map();
  for (const combo of combos) {
    const runner = classifyRunner(resolveMatrixRunner(runsOn, combo));
    const existing = byLabel.get(runner.label);
    if (existing) existing.count += 1;
    else byLabel.set(runner.label, { runner, count: 1 });
  }
  return [...byLabel.values()];
}

/** Read one workflow document into the shape the estimator works on. */
export function readWorkflow(doc, path = 'workflow.yml') {
  const name = typeof doc?.name === 'string' ? doc.name : path.split('/').pop();
  const on = doc?.on ?? doc?.true; // `true` catches a spec-strict loader upstream
  const jobs = [];

  for (const [id, job] of Object.entries(doc?.jobs ?? {})) {
    if (!job || typeof job !== 'object') continue;
    // A job that only calls a reusable workflow bills inside that workflow.
    const reusable = typeof job.uses === 'string' ? job.uses : null;
    const matrix = expandMatrix(job.strategy?.matrix);
    jobs.push({
      id,
      name: typeof job.name === 'string' ? job.name : id,
      reusable,
      runsOn: job['runs-on'] ?? null,
      runner: classifyRunner(job['runs-on']),
      legs: runnerLegs(job['runs-on'], matrix),
      matrixJobs: matrix.jobs,
      matrixAxes: matrix.axes,
      matrixCapped: matrix.capped,
      timeoutMinutes:
        typeof job['timeout-minutes'] === 'number' ? job['timeout-minutes'] : null,
      failFast: job.strategy?.['fail-fast'],
      steps: Array.isArray(job.steps) ? job.steps : [],
      conditional: typeof job.if === 'string' ? job.if : null,
    });
  }

  return {
    path,
    name,
    triggers: triggerNames(on),
    on: on && typeof on === 'object' && !Array.isArray(on) ? on : {},
    schedules: scheduleEntries(on),
    concurrency: doc?.concurrency ?? null,
    jobs,
  };
}

/** Parse workflow source text into the estimator's model. */
export function readWorkflowSource(text, path = 'workflow.yml') {
  const doc = parseYaml(text);
  // An empty mapping is what pasting prose or a fragment produces. Saying
  // "no `jobs:` block" there sends the reader looking for a key in a file that
  // was never a workflow at all, so the two cases get different messages.
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || Object.keys(doc).length === 0) {
    throw new Error(`${path}: this does not look like a workflow file (no top-level keys)`);
  }
  if (!doc.jobs || typeof doc.jobs !== 'object') {
    throw new Error(`${path}: no \`jobs:\` block — is this a GitHub Actions workflow?`);
  }
  return readWorkflow(doc, path);
}

// --- frequency -------------------------------------------------------------

/**
 * How many times a month this workflow runs, and where that number came from.
 *
 * A `schedule:` is arithmetic we can do exactly. Everything else depends on how
 * busy the repository is, which only the caller knows — so those come from the
 * stated assumptions and the report says so next to the number.
 */
/** True when `event`'s config restricts which file paths trigger it. */
export function hasPathFilter(workflow, event) {
  const config = workflow.on?.[event];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  return Boolean(config.paths || config['paths-ignore']);
}

export function runsPerMonth(workflow, assumptions) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  let total = 0;
  const sources = [];
  let unreadableCron = false;

  for (const entry of workflow.schedules) {
    const fires = cronRunsPerMonth(entry.cron);
    if (fires == null) {
      unreadableCron = true;
      continue;
    }
    total += fires;
    sources.push({ trigger: 'schedule', runs: fires, derived: true, detail: entry.cron });
  }

  const triggers = new Set(workflow.triggers);

  // Path filters are per-event, so a workflow can be filtered on push and
  // unfiltered on pull_request. Scale each event by its own filter.
  const share = (event) => (hasPathFilter(workflow, event) ? a.pathFilteredShare : 1);

  if (triggers.has('push')) {
    const runs = a.pushRunsPerMonth * share('push');
    total += runs;
    sources.push({
      trigger: 'push',
      runs,
      derived: false,
      pathFiltered: hasPathFilter(workflow, 'push'),
    });
  }
  if (triggers.has('pull_request') || triggers.has('pull_request_target')) {
    const event = triggers.has('pull_request') ? 'pull_request' : 'pull_request_target';
    const runs = a.pullRequestRunsPerMonth * share(event);
    total += runs;
    sources.push({
      trigger: 'pull_request',
      runs,
      derived: false,
      pathFiltered: hasPathFilter(workflow, event),
    });
  }
  if (triggers.has('workflow_dispatch')) {
    total += a.manualRunsPerMonth;
    sources.push({ trigger: 'workflow_dispatch', runs: a.manualRunsPerMonth, derived: false });
  }
  const otherTriggers = [...triggers].filter(
    (t) =>
      !['push', 'pull_request', 'pull_request_target', 'workflow_dispatch', 'schedule'].includes(t),
  );
  for (const trigger of otherTriggers) {
    total += a.otherEventRunsPerMonth;
    sources.push({ trigger, runs: a.otherEventRunsPerMonth, derived: false });
  }

  return { runs: total, sources, unreadableCron };
}

// --- the estimate ----------------------------------------------------------

function billableMinutesPerJobRun(minutes) {
  // GitHub rounds each job's duration up to the next whole minute, per job,
  // not per workflow run. On a wide matrix of short jobs this is most of the
  // bill, which is the whole reason it is modelled rather than assumed away.
  return Math.max(1, Math.ceil(minutes));
}

function costOfLargerRunner(runner, wallMinutes) {
  const cls = RUNNER_CLASSES[runner.class];
  if (!cls || cls.perCoreMinuteUsd == null || !runner.cores) return null;
  return wallMinutes * runner.cores * cls.perCoreMinuteUsd;
}

/**
 * Estimate monthly cost across a set of workflows.
 *
 * @param {object[]} workflows models from `readWorkflowSource`
 * @param {object} assumptions overrides for `DEFAULT_ASSUMPTIONS`; may also
 *   carry `minutesPerJobByWorkflow: {[path]: minutes}` and a `rates` override.
 */
export function estimate(workflows, assumptions = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const rates = { ...RUNNER_CLASSES, ...(assumptions.rates ?? {}) };
  const plan = PLANS[a.plan] ?? PLANS.team;

  const rows = [];
  let includedMinutes = 0;
  let largerRunnerCostUsd = 0;
  let selfHostedMinutes = 0;
  let unknownMinutes = 0;
  let conditionalMinutes = 0;

  for (const workflow of workflows) {
    const frequency = runsPerMonth(workflow, a);
    const perJobMinutes =
      assumptions.minutesPerJobByWorkflow?.[workflow.path] ?? a.minutesPerJob;

    for (const job of workflow.jobs) {
      if (job.reusable) continue; // billed inside the workflow it calls
      const wallPerJob = perJobMinutes;
      const billablePerJob = billableMinutesPerJobRun(wallPerJob);

      // One row per (job, runner) leg: a matrix whose `runs-on` varies bills at
      // a different multiplier on each leg, so collapsing them would average
      // away the very thing worth seeing.
      for (const leg of job.legs) {
        const jobRunsPerMonth = frequency.runs * leg.count;
        const wallMinutes = jobRunsPerMonth * wallPerJob;
        const billedMinutes = jobRunsPerMonth * billablePerJob;

        const row = {
          workflow: workflow.name,
          path: workflow.path,
          job: job.id,
          runner: leg.runner,
          matrixJobs: leg.count,
          totalMatrixJobs: job.matrixJobs,
          runsPerMonth: frequency.runs,
          jobRunsPerMonth,
          wallMinutes,
          billedMinutes,
          includedMinutes: 0,
          costUsd: 0,
          roundingWasteMinutes: jobRunsPerMonth * (billablePerJob - wallPerJob),
          conditional: job.conditional ?? null,
        };

        if (leg.runner.kind === 'standard') {
          const cls = rates[leg.runner.class];
          row.includedMinutes = billedMinutes * cls.multiplier;
          includedMinutes += row.includedMinutes;
          if (job.conditional) conditionalMinutes += row.includedMinutes;
        } else if (leg.runner.kind === 'larger') {
          const cost = costOfLargerRunner(leg.runner, billedMinutes);
          row.costUsd = cost ?? 0;
          row.largerRunnerUnpriced = cost == null;
          largerRunnerCostUsd += row.costUsd;
        } else if (leg.runner.kind === 'self-hosted') {
          selfHostedMinutes += billedMinutes;
        } else {
          unknownMinutes += billedMinutes;
        }
        rows.push(row);
      }
    }
  }

  const overageMinutes = Math.max(0, includedMinutes - plan.includedMinutes);
  // Overage is charged at the rate of whichever runner produced it. Attributing
  // it exactly would need an ordering GitHub does not publish, so it is priced
  // at the blended rate of the standard minutes actually consumed — stated
  // plainly in the report rather than presented as an exact figure.
  const standardRows = rows.filter((r) => r.runner.kind === 'standard');
  const blendedPerIncludedMinute =
    includedMinutes > 0
      ? standardRows.reduce(
          (sum, r) => sum + r.billedMinutes * rates[r.runner.class].perMinuteUsd,
          0,
        ) / includedMinutes
      : 0;
  const overageCostUsd = overageMinutes * blendedPerIncludedMinute;

  const byClass = {};
  for (const row of standardRows) {
    const key = row.runner.class;
    byClass[key] ??= { label: rates[key].label, billedMinutes: 0, includedMinutes: 0 };
    byClass[key].billedMinutes += row.billedMinutes;
    byClass[key].includedMinutes += row.includedMinutes;
  }

  return {
    assumptions: a,
    ratesAsOf: RATES_AS_OF,
    plan: { key: a.plan, ...plan },
    rows,
    totals: {
      includedMinutes,
      includedMinutesLimit: plan.includedMinutes,
      allowanceUsedPercent:
        plan.includedMinutes === Infinity
          ? 0
          : (includedMinutes / plan.includedMinutes) * 100,
      overageMinutes,
      overageCostUsd,
      largerRunnerCostUsd,
      totalCostUsd: overageCostUsd + largerRunnerCostUsd,
      selfHostedMinutes,
      unknownMinutes,
      conditionalMinutes,
      byClass,
    },
    findings: findFindings(workflows, rows, a, rates),
  };
}

// --- findings --------------------------------------------------------------

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

function findFindings(workflows, rows, a, rates) {
  const findings = [];
  const add = (f) => findings.push(f);

  for (const workflow of workflows) {
    const triggers = new Set(workflow.triggers);
    const frequency = runsPerMonth(workflow, a);

    if (frequency.unreadableCron) {
      add({
        id: 'cron-unreadable',
        severity: 'info',
        workflow: workflow.name,
        title: 'A cron expression could not be read',
        detail:
          'One of this workflow\'s `schedule:` entries is not a 5-field cron expression this tool can count, so its runs are NOT included in the total below. The real cost is higher than what is shown.',
      });
    }

    // Pushing to a branch that has an open PR fires both events, so the same
    // commit is built twice. This is the most common avoidable doubling there
    // is, and it is invisible in the billing page because both runs are real.
    const pushConfig = workflow.on?.push;
    const pushBranches = pushConfig && typeof pushConfig === 'object' ? pushConfig.branches : null;
    if (triggers.has('push') && triggers.has('pull_request') && !pushBranches) {
      const wasted = rows
        .filter((r) => r.path === workflow.path)
        .reduce((sum, r) => sum + r.includedMinutes * (a.pullRequestRunsPerMonth / Math.max(frequency.runs, 1)), 0);
      add({
        id: 'push-and-pr-double-run',
        severity: 'high',
        workflow: workflow.name,
        title: 'Every PR commit is built twice',
        detail:
          'This workflow triggers on both `push` and `pull_request`, and `push` has no `branches:` filter. A commit pushed to a branch with an open PR therefore fires both events and runs the whole workflow twice. Restricting push to your default branch (`on: push: branches: [main]`) keeps the main-branch run and drops the duplicate.',
        monthlyMinutes: wasted,
      });
    }

    const cancels =
      workflow.concurrency &&
      typeof workflow.concurrency === 'object' &&
      workflow.concurrency['cancel-in-progress'] === true;
    if ((triggers.has('pull_request') || triggers.has('push')) && !cancels) {
      add({
        id: 'no-cancel-in-progress',
        severity: 'medium',
        workflow: workflow.name,
        title: 'Superseded runs keep running',
        detail:
          'There is no `concurrency` block with `cancel-in-progress: true`, so pushing three times in quick succession leaves the first two runs going to completion and billing in full, even though nobody will read their results. Adding a `concurrency` group keyed on the ref cancels them.',
      });
    }

    for (const entry of workflow.schedules) {
      const fires = cronRunsPerMonth(entry.cron);
      if (fires != null && fires > 720) {
        add({
          id: 'cron-very-frequent',
          severity: 'high',
          workflow: workflow.name,
          title: `A schedule fires ${Math.round(fires)} times a month`,
          detail: `\`${entry.cron}\` runs more often than hourly. A scheduled workflow bills every firing whether or not anything changed; this is the one cost that keeps accruing on a repository nobody is touching.`,
        });
      }
    }
  }

  for (const row of rows) {
    const workflow = workflows.find((w) => w.path === row.path);
    const job = workflow?.jobs.find((j) => j.id === row.job);
    if (!job) continue;
    // Job-level findings (matrix size, timeout, fail-fast) belong to the job,
    // not to each of its runner legs — emit them once, on the first leg.
    const firstLegOfJob = rows.find((r) => r.path === row.path && r.job === row.job) === row;

    if (row.runner.kind === 'standard' && row.runner.class === 'macos') {
      const asLinux = row.billedMinutes * rates.linux.multiplier;
      add({
        id: 'macos-multiplier',
        severity: 'high',
        workflow: row.workflow,
        job: row.job,
        title: 'macOS bills at 10x',
        detail: `A minute on a macOS runner consumes 10 minutes of your included allowance (Windows is 2x, Linux 1x). This job's ${Math.round(row.billedMinutes)} wall minutes a month draw ${Math.round(row.includedMinutes)} minutes from the allowance; the same work on Linux would draw ${Math.round(asLinux)}. Keep macOS for the jobs that genuinely need Apple hardware — a build or a codesign step — and move linting and unit tests off it.`,
        monthlyMinutes: row.includedMinutes - asLinux,
      });
    }

    if (row.runner.kind === 'standard' && row.runner.class === 'windows') {
      add({
        id: 'windows-multiplier',
        severity: 'low',
        workflow: row.workflow,
        job: row.job,
        title: 'Windows bills at 2x',
        detail: `This job draws ${Math.round(row.includedMinutes)} allowance minutes from ${Math.round(row.billedMinutes)} wall minutes. If it is not testing Windows-specific behaviour, Linux halves it.`,
        monthlyMinutes: row.includedMinutes - row.billedMinutes,
      });
    }

    if (firstLegOfJob && job.matrixJobs > MAX_MATRIX_JOBS) {
      add({
        id: 'matrix-over-limit',
        severity: 'high',
        workflow: row.workflow,
        job: row.job,
        title: `Matrix expands to ${job.matrixJobs} jobs — over GitHub's limit`,
        detail: `GitHub refuses to start a matrix larger than ${MAX_MATRIX_JOBS} jobs, so this workflow fails before it runs. Reduce an axis, or split the matrix across two jobs.`,
      });
    }

    if (firstLegOfJob && job.timeoutMinutes == null && row.runner.kind !== 'self-hosted') {
      // Worst case is summed across every leg at that leg's own multiplier.
      // Taking the first leg's multiplier and scaling by the whole matrix
      // understates a mixed-OS matrix badly: three macOS legs at 10x dominate
      // six Linux ones, and this figure is the one that makes people act.
      const worstCase = job.legs.reduce((sum, leg) => {
        const multiplier =
          leg.runner.kind === 'standard' ? rates[leg.runner.class].multiplier : 1;
        return sum + DEFAULT_JOB_TIMEOUT_MINUTES * multiplier * leg.count;
      }, 0);
      const mixed = job.legs.length > 1;
      add({
        id: 'no-timeout-minutes',
        severity: worstCase >= 1000 ? 'high' : 'medium',
        workflow: row.workflow,
        job: row.job,
        title: 'No `timeout-minutes` — one wedged run can cost a month',
        detail: `Without \`timeout-minutes\`, GitHub lets a job run for ${DEFAULT_JOB_TIMEOUT_MINUTES} minutes before killing it. A single hung job here — a test waiting on a port, a prompt nobody answers — would bill ${Math.round(worstCase)} allowance minutes${job.matrixJobs > 1 ? ` (${job.matrixJobs} matrix jobs × ${DEFAULT_JOB_TIMEOUT_MINUTES} minutes${mixed ? ', each at its own multiplier' : ''})` : ''}. Set it to a little above the job's normal runtime.`,
        monthlyMinutes: null,
        worstCaseMinutes: worstCase,
      });
    }

    if (job.matrixJobs > 1 && row.roundingWasteMinutes >= 5) {
      add({
        id: 'matrix-rounding-waste',
        severity: 'medium',
        workflow: row.workflow,
        job: row.job,
        title: 'Short matrix jobs lose most of a minute each',
        detail: `Every job is rounded up to a whole minute independently. At ${a.minutesPerJob} minutes each across ${job.matrixJobs} matrix jobs, rounding alone adds about ${Math.round(row.roundingWasteMinutes)} billed minutes a month. A wide matrix of very short jobs can spend more on rounding than on work — combining several axis values into one job removes it.`,
        monthlyMinutes: row.roundingWasteMinutes,
      });
    }

    if (firstLegOfJob && job.matrixJobs > 5 && job.failFast === false) {
      add({
        id: 'fail-fast-disabled',
        severity: 'low',
        workflow: row.workflow,
        job: row.job,
        title: `\`fail-fast: false\` across ${job.matrixJobs} jobs`,
        detail:
          'When one matrix job fails the rest keep running to completion and bill in full. That is often what you want for a compatibility matrix; on a pre-merge check it buys nothing.',
      });
    }

    if (firstLegOfJob && job.conditional) {
      // A job-level `if:` decides at run time whether the job exists at all.
      // A condition on a repository variable or a deployment gate can mean the
      // job is switched off entirely and bills nothing, so counting its
      // minutes as spend would overstate the bill -- the one direction this
      // tool must not be wrong in is *understating*, but presenting a
      // conditional upper bound as a live projection is its own error, and a
      // reader acting on the wrong one wastes a day chasing spend that is not
      // happening. Counted, and said out loud.
      const gated = /\bvars\.|\bgithub\.event_name\b|\binputs\./.test(job.conditional);
      add({
        id: 'job-conditional',
        severity: 'info',
        workflow: row.workflow,
        job: row.job,
        title: gated
          ? 'This job is gated — it may bill nothing at all'
          : 'This job has an `if:` condition',
        detail:
          `The job runs only when \`${job.conditional}\` is true, so its minutes above are an upper bound rather than a projection.` +
          (gated
            ? ' The condition reads a repository variable, the event name, or a workflow input, so the job can be switched off entirely — a skipped job is decided before a runner is assigned and bills nothing. Check the current value before treating this line as spend.'
            : ' How often the condition holds is not knowable from the file.'),
      });
    }

    if (row.runner.presumed) {
      add({
        id: 'runner-presumed',
        severity: 'info',
        workflow: row.workflow,
        job: row.job,
        title: `Assumed \`${row.runner.label}\` resolves to its quoted default`,
        detail:
          'This `runs-on` is an expression with a literal fallback, so the fallback was used for costing. If the variable is actually set to something else at run time — a self-hosted label, a larger runner — this job\'s minutes belong in a different column.',
      });
    }

    if (row.runner.kind === 'unknown') {
      add({
        id: 'runner-unknown',
        severity: 'info',
        workflow: row.workflow,
        job: row.job,
        title: `Could not classify \`runs-on: ${row.runner.label}\``,
        detail:
          'This is usually an expression such as `${{ vars.CI_RUNNER }}`, which resolves at run time to something this tool cannot see. Its minutes are excluded from the totals — substitute the real label to include them.',
      });
    }

    if (row.largerRunnerUnpriced) {
      add({
        id: 'larger-runner-unpriced',
        severity: 'info',
        workflow: row.workflow,
        job: row.job,
        title: `Larger runner \`${row.runner.label}\` has no published per-core rate here`,
        detail:
          'Larger macOS runners are priced per machine rather than per core, so this job is counted but not costed. Check your billing page for the machine rate.',
      });
    }
  }

  return findings.sort(
    (x, y) =>
      SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] ||
      (y.monthlyMinutes ?? 0) - (x.monthlyMinutes ?? 0),
  );
}

/** Round a dollar figure for display without pretending to false precision. */
export function formatUsd(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0.00';
  const size = Math.abs(value);
  const text = size < 10 ? `$${size.toFixed(2)}` : `$${Math.round(size).toLocaleString('en-US')}`;
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}
