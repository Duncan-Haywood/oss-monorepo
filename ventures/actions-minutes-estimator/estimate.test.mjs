import test from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml, UnsupportedYamlError } from './workflow-yaml.mjs';
import {
  classifyRunner,
  cronRunsPerMonth,
  DEFAULT_JOB_TIMEOUT_MINUTES,
  estimate,
  expandMatrix,
  MAX_MATRIX_JOBS,
  readWorkflowSource,
  resolveMatrixRunner,
  runsPerMonth,
} from './estimate.mjs';

// --- the YAML reader -------------------------------------------------------

test('reads nested mappings, sequences and flow collections', () => {
  const doc = parseYaml(`
name: Build
on:
  push:
    branches: [main, release]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm test
`);
  assert.equal(doc.name, 'Build');
  assert.deepEqual(doc.on.push.branches, ['main', 'release']);
  assert.ok('pull_request' in doc.on);
  assert.equal(doc.jobs.test['runs-on'], 'ubuntu-latest');
  assert.equal(doc.jobs.test.steps.length, 2);
  assert.equal(doc.jobs.test.steps[1].run, 'npm test');
});

test('keeps `on` as a string key rather than YAML 1.1 boolean true', () => {
  // A spec-strict 1.1 loader turns the bare word `on` into `true`, which makes
  // every trigger vanish. This is the single most common way a tool that reads
  // workflow files goes quietly wrong.
  const doc = parseYaml('on:\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n');
  assert.ok(Object.prototype.hasOwnProperty.call(doc, 'on'));
  assert.equal(doc.true, undefined);
});

test('strips comments but not `#` inside a quoted scalar', () => {
  const doc = parseYaml(`
a: 1 # trailing comment
b: "has # inside"
# whole-line comment
c: 2
`);
  assert.equal(doc.a, 1);
  assert.equal(doc.b, 'has # inside');
  assert.equal(doc.c, 2);
});

test('captures a block scalar body without treating it as structure', () => {
  const doc = parseYaml(`
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo one
          echo two: not-a-key
`);
  assert.match(doc.jobs.a.steps[0].run, /echo one/);
  assert.match(doc.jobs.a.steps[0].run, /not-a-key/);
});

test('refuses anchors rather than mis-reading them', () => {
  assert.throws(
    () => parseYaml('defaults: &base\n  runs-on: ubuntu-latest\njobs:\n  a: *base\n'),
    UnsupportedYamlError,
  );
});

// --- runner classification -------------------------------------------------

test('classifies the standard runner images', () => {
  assert.equal(classifyRunner('ubuntu-latest').class, 'linux');
  assert.equal(classifyRunner('ubuntu-22.04').class, 'linux');
  assert.equal(classifyRunner('windows-latest').class, 'windows');
  assert.equal(classifyRunner('macos-14').class, 'macos');
  assert.equal(classifyRunner('macos-latest').kind, 'standard');
});

test('self-hosted is free and never confused with a standard image', () => {
  assert.equal(classifyRunner(['self-hosted', 'linux', 'x64']).kind, 'self-hosted');
  assert.equal(classifyRunner('self-hosted').kind, 'self-hosted');
});

test('a larger runner is its own kind, not a bigger multiplier', () => {
  // Larger runners bill per minute from minute one and do NOT draw on the
  // included allowance; scoring them as standard would overstate allowance use
  // and understate cash cost at the same time.
  const runner = classifyRunner('ubuntu-latest-8-cores');
  assert.equal(runner.kind, 'larger');
  assert.equal(runner.class, 'linux');
  assert.equal(runner.cores, 8);
});

test('an expression with nothing to read is unknown, never guessed', () => {
  assert.equal(classifyRunner('${{ vars.CI_RUNNER }}').kind, 'unknown');
  assert.equal(classifyRunner('${{ matrix.os }}').kind, 'unknown');
});

// --- matrix ----------------------------------------------------------------

test('expands the cartesian product', () => {
  const { jobs } = expandMatrix({ os: ['ubuntu-latest', 'macos-latest'], node: [18, 20, 22] });
  assert.equal(jobs, 6);
});

test('applies exclude then include, per GitHub order', () => {
  const excluded = expandMatrix({
    os: ['ubuntu-latest', 'windows-latest'],
    node: [18, 20],
    exclude: [{ os: 'windows-latest', node: 18 }],
  });
  assert.equal(excluded.jobs, 3);

  // An include matching an existing combination merges into it (no new job)...
  const merged = expandMatrix({ os: ['ubuntu-latest'], include: [{ os: 'ubuntu-latest', extra: 'x' }] });
  assert.equal(merged.jobs, 1);

  // ...and one that matches nothing adds a job.
  const appended = expandMatrix({ os: ['ubuntu-latest'], include: [{ os: 'macos-latest' }] });
  assert.equal(appended.jobs, 2);
});

test('a job with no matrix still runs once', () => {
  assert.equal(expandMatrix(undefined).jobs, 1);
  assert.equal(expandMatrix({}).jobs, 1);
});

// --- cron ------------------------------------------------------------------

test('counts an hourly and a daily schedule', () => {
  // 24 a day over a 365-day year, divided by 12.
  assert.equal(Math.round(cronRunsPerMonth('0 * * * *')), Math.round((365 * 24) / 12));
  assert.equal(Math.round(cronRunsPerMonth('0 3 * * *')), Math.round(365 / 12));
});

test('counts a weekday-only schedule', () => {
  const runs = cronRunsPerMonth('0 6 * * 1-5');
  // 261 weekdays in 2025, over 12 months.
  assert.equal(Math.round(runs), Math.round(261 / 12));
});

test('treats 0 and 7 alike as Sunday', () => {
  assert.equal(cronRunsPerMonth('0 0 * * 0'), cronRunsPerMonth('0 0 * * 7'));
});

test('when both day fields are restricted, cron fires if EITHER matches', () => {
  // This is the documented cron quirk and the easiest one to get backwards:
  // day-of-month AND day-of-week both set is an OR, not an AND.
  const either = cronRunsPerMonth('0 0 1 * 1'); // the 1st, OR any Monday
  const justFirst = cronRunsPerMonth('0 0 1 * *');
  assert.ok(either > justFirst, 'restricting both day fields must widen, not narrow');
});

test('every-five-minutes is counted as the large number it is', () => {
  const runs = cronRunsPerMonth('*/5 * * * *');
  assert.equal(Math.round(runs), Math.round((365 * 24 * 12) / 12));
});

test('returns null for an expression it cannot read', () => {
  assert.equal(cronRunsPerMonth('not a cron'), null);
  assert.equal(cronRunsPerMonth('0 0 * *'), null); // four fields
  assert.equal(cronRunsPerMonth('99 * * * *'), null); // out of range
});

// --- frequency -------------------------------------------------------------

const PUSH_PR = `
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: npm test
`;

test('schedule runs are derived, event runs come from stated assumptions', () => {
  const workflow = readWorkflowSource(
    'on:\n  schedule:\n    - cron: "0 * * * *"\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n',
  );
  const { runs, sources } = runsPerMonth(workflow, { pushRunsPerMonth: 100 });
  const schedule = sources.find((s) => s.trigger === 'schedule');
  const push = sources.find((s) => s.trigger === 'push');
  assert.equal(schedule.derived, true, 'a cron count is arithmetic, not an assumption');
  assert.equal(push.derived, false, 'push frequency is the caller\'s assumption');
  assert.equal(Math.round(runs), Math.round(730 + 100));
});

// --- the estimate ----------------------------------------------------------

test('bills a simple Linux workflow at 1x with per-job rounding', () => {
  const workflow = readWorkflowSource(PUSH_PR, 'ci.yml');
  const result = estimate([workflow], {
    plan: 'team',
    minutesPerJob: 4.2,
    pushRunsPerMonth: 50,
    pullRequestRunsPerMonth: 50,
  });
  // 100 runs x 1 job, 4.2 wall minutes rounded up to 5 billed, 1x multiplier.
  assert.equal(result.totals.includedMinutes, 500);
  assert.equal(result.rows[0].roundingWasteMinutes, 100 * (5 - 4.2));
});

test('macOS draws ten allowance minutes per wall minute', () => {
  const mac = readWorkflowSource(PUSH_PR.replace('ubuntu-latest', 'macos-latest'), 'mac.yml');
  const linux = readWorkflowSource(PUSH_PR, 'linux.yml');
  const opts = { minutesPerJob: 5, pushRunsPerMonth: 10, pullRequestRunsPerMonth: 0 };
  const macTotal = estimate([mac], opts).totals.includedMinutes;
  const linuxTotal = estimate([linux], opts).totals.includedMinutes;
  assert.equal(macTotal, linuxTotal * 10);
});

test('a self-hosted job costs nothing and is kept out of the allowance', () => {
  const workflow = readWorkflowSource(
    PUSH_PR.replace('runs-on: ubuntu-latest', 'runs-on: [self-hosted, linux]'),
    'sh.yml',
  );
  const result = estimate([workflow], { pushRunsPerMonth: 100, pullRequestRunsPerMonth: 0 });
  assert.equal(result.totals.includedMinutes, 0);
  assert.ok(result.totals.selfHostedMinutes > 0);
  assert.equal(result.totals.totalCostUsd, 0);
});

test('a larger runner is costed in cash and excluded from the allowance', () => {
  const workflow = readWorkflowSource(
    PUSH_PR.replace('ubuntu-latest', 'ubuntu-latest-4-cores'),
    'big.yml',
  );
  const result = estimate([workflow], {
    minutesPerJob: 10,
    pushRunsPerMonth: 10,
    pullRequestRunsPerMonth: 0,
  });
  assert.equal(result.totals.includedMinutes, 0, 'larger runners do not draw the allowance');
  // 100 billed minutes x 4 cores x $0.004.
  assert.ok(Math.abs(result.totals.largerRunnerCostUsd - 1.6) < 1e-9);
});

test('overage is charged only past the plan allowance', () => {
  const workflow = readWorkflowSource(PUSH_PR, 'ci.yml');
  const under = estimate([workflow], {
    plan: 'team',
    minutesPerJob: 1,
    pushRunsPerMonth: 100,
    pullRequestRunsPerMonth: 0,
  });
  assert.equal(under.totals.overageMinutes, 0);
  assert.equal(under.totals.totalCostUsd, 0);

  const over = estimate([workflow], {
    plan: 'free',
    minutesPerJob: 10,
    pushRunsPerMonth: 300,
    pullRequestRunsPerMonth: 0,
  });
  assert.equal(over.totals.includedMinutes, 3000);
  assert.equal(over.totals.overageMinutes, 1000); // 3000 used, 2000 included
  assert.ok(Math.abs(over.totals.overageCostUsd - 8) < 1e-9); // 1000 x $0.008
});

test('a public repository has no allowance to exhaust', () => {
  const workflow = readWorkflowSource(PUSH_PR, 'ci.yml');
  const result = estimate([workflow], { plan: 'public', minutesPerJob: 60, pushRunsPerMonth: 500 });
  assert.equal(result.totals.overageMinutes, 0);
  assert.equal(result.totals.totalCostUsd, 0);
});

test('a matrix multiplies the job count', () => {
  const workflow = readWorkflowSource(
    `
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      matrix:
        os: [a, b]
        node: [18, 20, 22]
    steps:
      - run: npm test
`,
    'm.yml',
  );
  const result = estimate([workflow], { minutesPerJob: 1, pushRunsPerMonth: 10 });
  assert.equal(result.rows[0].matrixJobs, 6);
  assert.equal(result.totals.includedMinutes, 60);
});

test('a job that only calls a reusable workflow is not double-counted', () => {
  const workflow = readWorkflowSource(
    'on: [push]\njobs:\n  call:\n    uses: ./.github/workflows/other.yml\n',
    'r.yml',
  );
  const result = estimate([workflow], { pushRunsPerMonth: 100 });
  assert.equal(result.rows.length, 0);
  assert.equal(result.totals.includedMinutes, 0);
});

// --- findings --------------------------------------------------------------

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test('flags a workflow that builds every PR commit twice', () => {
  const both = readWorkflowSource(
    'on:\n  push:\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n',
    'dup.yml',
  );
  assert.ok(findingIds(estimate([both])).includes('push-and-pr-double-run'));

  // Restricting push to the default branch is the documented fix, so a
  // workflow that already does it must not be flagged.
  const filtered = readWorkflowSource(PUSH_PR, 'ok.yml');
  assert.ok(!findingIds(estimate([filtered])).includes('push-and-pr-double-run'));
});

test('flags a missing cancel-in-progress and accepts one that is present', () => {
  assert.ok(findingIds(estimate([readWorkflowSource(PUSH_PR, 'a.yml')])).includes('no-cancel-in-progress'));

  const cancels = readWorkflowSource(
    `${PUSH_PR}
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true
`,
    'b.yml',
  );
  assert.ok(!findingIds(estimate([cancels])).includes('no-cancel-in-progress'));
});

test('flags a missing timeout-minutes and quantifies the worst case', () => {
  const noTimeout = readWorkflowSource(
    'on: [push]\njobs:\n  a:\n    runs-on: macos-latest\n    steps:\n      - run: x\n',
    't.yml',
  );
  const finding = estimate([noTimeout]).findings.find((f) => f.id === 'no-timeout-minutes');
  assert.ok(finding, 'a job with no timeout must be flagged');
  // One wedged macOS job: 360 wall minutes at the 10x multiplier.
  assert.equal(finding.worstCaseMinutes, DEFAULT_JOB_TIMEOUT_MINUTES * 10);
  assert.equal(finding.severity, 'high');

  const withTimeout = readWorkflowSource(PUSH_PR, 'u.yml');
  assert.ok(!findingIds(estimate([withTimeout])).includes('no-timeout-minutes'));
});

test('flags a matrix GitHub would refuse to start', () => {
  const axis = Array.from({ length: 20 }, (_, i) => i);
  const workflow = readWorkflowSource(
    `on: [push]
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      matrix:
        x: [${axis.join(', ')}]
        y: [${axis.join(', ')}]
`,
    'big.yml',
  );
  const result = estimate([workflow]);
  assert.ok(result.rows[0].matrixJobs > MAX_MATRIX_JOBS);
  assert.ok(findingIds(result).includes('matrix-over-limit'));
});

test('flags per-job rounding waste on a wide matrix of short jobs', () => {
  const workflow = readWorkflowSource(
    `on: [push]
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      matrix:
        x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
`,
    'w.yml',
  );
  const result = estimate([workflow], { minutesPerJob: 0.5, pushRunsPerMonth: 20 });
  const finding = result.findings.find((f) => f.id === 'matrix-rounding-waste');
  assert.ok(finding, 'rounding waste on a wide short matrix must be reported');
  // 200 job-runs, each billed 1 minute for 0.5 minutes of work.
  assert.equal(Math.round(finding.monthlyMinutes), 100);
});

test('an unreadable cron is reported, never silently counted as zero', () => {
  const workflow = readWorkflowSource(
    'on:\n  schedule:\n    - cron: "every tuesday"\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n',
    'c.yml',
  );
  assert.ok(findingIds(estimate([workflow])).includes('cron-unreadable'));
});

test('an unclassifiable runner is reported and left out of the totals', () => {
  const workflow = readWorkflowSource(
    "on: [push]\njobs:\n  a:\n    runs-on: ${{ vars.CI_RUNNER }}\n    timeout-minutes: 5\n",
    'x.yml',
  );
  const result = estimate([workflow], { pushRunsPerMonth: 100, minutesPerJob: 5 });
  assert.equal(result.totals.includedMinutes, 0);
  assert.ok(result.totals.unknownMinutes > 0);
  assert.ok(findingIds(result).includes('runner-unknown'));
});

test('findings come back most severe first', () => {
  const workflow = readWorkflowSource(
    'on:\n  push:\n  pull_request:\njobs:\n  a:\n    runs-on: macos-latest\n',
    'all.yml',
  );
  const severities = estimate([workflow]).findings.map((f) => f.severity);
  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  const ranks = severities.map((s) => rank[s]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

// --- input handling --------------------------------------------------------

test('rejects a file that is not a workflow, with a usable message', () => {
  assert.throws(() => readWorkflowSource('name: not a workflow\n', 'x.yml'), /no `jobs:` block/);
  assert.throws(() => readWorkflowSource('just a string', 'y.yml'), /does not look like a workflow/);
});

test('reads a real workflow from this repository end to end', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../.github/workflows/portfolio-validate.yml', import.meta.url),
    'utf8',
  );
  const workflow = readWorkflowSource(source, 'portfolio-validate.yml');
  assert.ok(workflow.jobs.length > 0);
  assert.ok(workflow.triggers.includes('push'));
  const result = estimate([workflow]);
  assert.ok(Array.isArray(result.findings));
});

test('reads the quoted fallback out of a parameterised runs-on', () => {
  // `${{ vars.CI_RUNNER || 'ubuntu-latest' }}` is a common switchable-runner
  // idiom. Dropping every job that uses it would leave a repository that uses
  // it everywhere with an almost-empty total, which reads as cheap.
  const runner = classifyRunner("${{ vars.CI_RUNNER || 'ubuntu-latest' }}");
  assert.equal(runner.kind, 'standard');
  assert.equal(runner.class, 'linux');
  assert.equal(runner.presumed, true);

  const selfHosted = classifyRunner("${{ vars.CI_RUNNER || 'self-hosted' }}");
  assert.equal(selfHosted.kind, 'self-hosted');

  // An expression with no literal to read is still unknown, not a guess.
  assert.equal(classifyRunner('${{ vars.CI_RUNNER }}').kind, 'unknown');
});

test('says when a runner class was presumed rather than read', () => {
  const workflow = readWorkflowSource(
    "on: [push]\njobs:\n  a:\n    runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}\n    timeout-minutes: 5\n",
    'p.yml',
  );
  const result = estimate([workflow], { pushRunsPerMonth: 10, minutesPerJob: 5 });
  assert.ok(result.totals.includedMinutes > 0, 'a presumed runner still bills');
  assert.ok(result.findings.some((f) => f.id === 'runner-presumed'));
});

test('a path-filtered workflow is not counted against every push', () => {
  // The monorepo case: 200 per-package CI workflows, each firing only when its
  // own directory changes. Counting each against every push overstates the
  // total by orders of magnitude.
  const filtered = readWorkflowSource(
    'on:\n  push:\n    paths:\n      - "pkg/a/**"\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n',
    'f.yml',
  );
  const unfiltered = readWorkflowSource(
    'on:\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n',
    'u.yml',
  );
  const opts = { pushRunsPerMonth: 100, minutesPerJob: 1, pathFilteredShare: 0.25 };
  assert.equal(runsPerMonth(filtered, opts).runs, 25);
  assert.equal(runsPerMonth(unfiltered, opts).runs, 100);

  // And the share is settable, including back to "count every push".
  assert.equal(runsPerMonth(filtered, { ...opts, pathFilteredShare: 1 }).runs, 100);
});

test('path filters are read per event, not per workflow', () => {
  // Filtered on push, unfiltered on pull_request: a real and common shape.
  const workflow = readWorkflowSource(
    'on:\n  push:\n    paths:\n      - "src/**"\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n',
    'm.yml',
  );
  const { sources } = runsPerMonth(workflow, {
    pushRunsPerMonth: 100,
    pullRequestRunsPerMonth: 40,
    pathFilteredShare: 0.5,
  });
  assert.equal(sources.find((s) => s.trigger === 'push').runs, 50);
  assert.equal(sources.find((s) => s.trigger === 'pull_request').runs, 40);
});

test('costs each leg of an OS matrix at its own multiplier', () => {
  // `runs-on: ${{ matrix.os }}` is the most common matrix there is, and an OS
  // matrix containing macOS is the classic 10x surprise. Treating the job as
  // one unclassifiable runner would drop it from the totals entirely.
  const workflow = readWorkflowSource(
    `on: [push]
jobs:
  test:
    runs-on: \${{ matrix.os }}
    timeout-minutes: 10
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
`,
    'os.yml',
  );
  const result = estimate([workflow], { pushRunsPerMonth: 10, minutesPerJob: 1, plan: 'team' });

  assert.equal(result.totals.unknownMinutes, 0, 'no leg may fall through as unclassified');
  const classes = result.rows.map((r) => r.runner.class).sort();
  assert.deepEqual(classes, ['linux', 'macos', 'windows']);
  // 10 runs x 1 billed minute on each leg: 10x1 + 10x10 + 10x2.
  assert.equal(result.totals.includedMinutes, 10 + 100 + 20);
  assert.ok(result.findings.some((f) => f.id === 'macos-multiplier'));
});

test('a job-level finding is reported once, not once per matrix leg', () => {
  const workflow = readWorkflowSource(
    `on: [push]
jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
`,
    'once.yml',
  );
  const timeouts = estimate([workflow]).findings.filter((f) => f.id === 'no-timeout-minutes');
  assert.equal(timeouts.length, 1, 'the missing timeout belongs to the job, not to each leg');
});

test('resolves matrix references and leaves unknown ones alone', () => {
  assert.equal(resolveMatrixRunner('${{ matrix.os }}', { os: 'macos-14' }), 'macos-14');
  assert.equal(resolveMatrixRunner('${{ matrix.nope }}', { os: 'x' }), '${{ matrix.nope }}');
});

test('the wedged-job worst case sums each leg at its own multiplier', () => {
  // A mixed-OS matrix is where taking one multiplier for the whole job goes
  // most wrong, and this figure is the one that makes people set a timeout.
  const workflow = readWorkflowSource(
    `on: [push]
jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
`,
    'mix.yml',
  );
  const finding = estimate([workflow]).findings.find((f) => f.id === 'no-timeout-minutes');
  // 360x1 (Linux) + 360x10 (macOS) + 360x2 (Windows), not 3 x 360 x 1.
  assert.equal(finding.worstCaseMinutes, 360 * 1 + 360 * 10 + 360 * 2);
});
