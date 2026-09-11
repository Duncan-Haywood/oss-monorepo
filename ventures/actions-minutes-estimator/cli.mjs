#!/usr/bin/env node
// Estimate what a repository's GitHub Actions workflows cost per month.
//
//   node cli.mjs .github/workflows                 # a directory of workflows
//   node cli.mjs .github/workflows/ci.yml          # one file
//   node cli.mjs --plan free --minutes-per-job 8 .github/workflows
//   node cli.mjs --json .github/workflows          # machine-readable
//   node cli.mjs --max-allowance-percent 80 .github/workflows   # exit 1 over
//
// Zero dependencies, no network. The last form is the one to wire into CI: it
// fails the build when a change pushes projected usage past a share of the
// plan's included minutes, which is the only point at which anyone finds out
// before the allowance is gone.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  DEFAULT_ASSUMPTIONS,
  PLANS,
  RATES_AS_OF,
  estimate,
  formatUsd,
  readWorkflowSource,
} from './estimate.mjs';
import { UnsupportedYamlError } from './workflow-yaml.mjs';

const USAGE = `Estimate monthly GitHub Actions minutes and cost from workflow files.

Usage:
  node cli.mjs [options] <file-or-directory>...

Options:
  --plan <${Object.keys(PLANS).join('|')}>   billing plan (default: ${DEFAULT_ASSUMPTIONS.plan})
  --minutes-per-job <n>       average wall-clock minutes per job (default: ${DEFAULT_ASSUMPTIONS.minutesPerJob})
  --pushes <n>                push-triggered runs per month (default: ${DEFAULT_ASSUMPTIONS.pushRunsPerMonth})
  --prs <n>                   pull_request runs per month (default: ${DEFAULT_ASSUMPTIONS.pullRequestRunsPerMonth})
  --path-filter-share <0-1>   share of pushes matching a workflow's \`paths:\` filter
                              (default: ${DEFAULT_ASSUMPTIONS.pathFilteredShare})
  --max-allowance-percent <n> exit 1 if projected usage exceeds this share
  --json                      print the full estimate as JSON
  -h, --help                  this message

Every figure is an estimate from the workflow files plus the assumptions above.
Rates quoted are GitHub's published list prices as of ${RATES_AS_OF}.
`;

function parseArgs(argv) {
  const opts = { paths: [], assumptions: {}, json: false, maxAllowancePercent: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--plan':
        opts.assumptions.plan = next();
        break;
      case '--minutes-per-job':
        opts.assumptions.minutesPerJob = Number(next());
        break;
      case '--pushes':
        opts.assumptions.pushRunsPerMonth = Number(next());
        break;
      case '--prs':
        opts.assumptions.pullRequestRunsPerMonth = Number(next());
        break;
      case '--path-filter-share':
        opts.assumptions.pathFilteredShare = Number(next());
        break;
      case '--max-allowance-percent':
        opts.maxAllowancePercent = Number(next());
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
        opts.paths.push(arg);
    }
  }
  return opts;
}

/** Collect workflow files from a mix of file and directory arguments. */
export async function collectWorkflowFiles(paths) {
  const files = [];
  for (const target of paths) {
    const info = await stat(target);
    if (info.isDirectory()) {
      for (const entry of (await readdir(target)).sort()) {
        if (/\.ya?ml$/i.test(entry)) files.push(path.join(target, entry));
      }
    } else {
      files.push(target);
    }
  }
  return files;
}

function bar(percent) {
  const width = 32;
  const filled = Math.min(width, Math.round((percent / 100) * width));
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

function renderReport(result, skipped) {
  const out = [];
  const { totals, plan } = result;
  const pct = totals.allowanceUsedPercent;

  out.push('');
  out.push(`GitHub Actions — projected monthly cost   (plan: ${plan.label})`);
  out.push('='.repeat(66));
  out.push('');
  out.push(
    `  Included minutes used   ${Math.round(totals.includedMinutes).toLocaleString('en-US')}` +
      (plan.includedMinutes === Infinity
        ? '   (public repositories: standard runners are free)'
        : ` of ${plan.includedMinutes.toLocaleString('en-US')}`),
  );
  if (plan.includedMinutes !== Infinity) {
    out.push(`                          ${bar(pct)} ${pct.toFixed(0)}%`);
  }
  for (const [key, entry] of Object.entries(totals.byClass)) {
    out.push(
      `    ${entry.label.padEnd(10)} ${Math.round(entry.billedMinutes)
        .toLocaleString('en-US')
        .padStart(8)} billed min  ->  ${Math.round(entry.includedMinutes)
        .toLocaleString('en-US')
        .padStart(8)} allowance min` + (key === 'macos' ? '   (10x)' : key === 'windows' ? '   (2x)' : ''),
    );
  }
  if (totals.selfHostedMinutes > 0) {
    out.push(
      `    self-hosted ${Math.round(totals.selfHostedMinutes).toLocaleString('en-US').padStart(8)} min          ->  free`,
    );
  }
  if (totals.unknownMinutes > 0) {
    out.push(
      `    unclassified ${Math.round(totals.unknownMinutes).toLocaleString('en-US').padStart(7)} min          ->  not counted (see findings)`,
    );
  }
  out.push('');
  out.push(`  Overage minutes         ${Math.round(totals.overageMinutes).toLocaleString('en-US')}`);
  out.push(`  Overage cost            ${formatUsd(totals.overageCostUsd)}`);
  if (totals.largerRunnerCostUsd > 0) {
    out.push(`  Larger-runner cost      ${formatUsd(totals.largerRunnerCostUsd)}   (billed from minute one)`);
  }
  out.push(`  Estimated monthly bill  ${formatUsd(totals.totalCostUsd)}`);
  out.push('');

  if (result.findings.length) {
    out.push('Findings');
    out.push('-'.repeat(66));
    for (const finding of result.findings) {
      const where = finding.job ? `${finding.workflow} / ${finding.job}` : finding.workflow;
      out.push(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
      out.push(`      in ${where}`);
      out.push(`      ${finding.detail.replace(/\s+/g, ' ')}`);
      if (finding.monthlyMinutes > 0) {
        out.push(`      ~${Math.round(finding.monthlyMinutes).toLocaleString('en-US')} allowance minutes a month`);
      }
      out.push('');
    }
  } else {
    out.push('No cost findings. Nothing here looks avoidably expensive.');
    out.push('');
  }

  if (skipped.length) {
    out.push('Skipped');
    out.push('-'.repeat(66));
    for (const { file, reason } of skipped) out.push(`  ${file}: ${reason}`);
    out.push('');
  }

  const a = result.assumptions;
  out.push('Assumptions (change them with the flags; they drive every number above)');
  out.push('-'.repeat(66));
  out.push(`  ${a.minutesPerJob} wall-clock minutes per job`);
  out.push(`  ${a.pushRunsPerMonth} push runs and ${a.pullRequestRunsPerMonth} pull_request runs per month`);
  out.push(
    `  workflows with a \`paths:\` filter run on ${(a.pathFilteredShare * 100).toFixed(0)}% of those` +
      ' (--path-filter-share)',
  );
  out.push(`  scheduled runs are counted exactly from each cron expression`);
  out.push(`  rates are GitHub's published list prices as of ${result.ratesAsOf} — verify against your billing page`);
  out.push('');
  return out.join('\n');
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help || opts.paths.length === 0) {
    process.stdout.write(USAGE);
    return opts.help ? 0 : 2;
  }
  if (opts.assumptions.plan && !PLANS[opts.assumptions.plan]) {
    process.stderr.write(`unknown plan: ${opts.assumptions.plan}\n`);
    return 2;
  }

  let files;
  try {
    files = await collectWorkflowFiles(opts.paths);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (files.length === 0) {
    process.stderr.write('No .yml or .yaml files found in the given paths.\n');
    return 2;
  }

  const workflows = [];
  const skipped = [];
  for (const file of files) {
    try {
      workflows.push(readWorkflowSource(await readFile(file, 'utf8'), file));
    } catch (error) {
      // A file that is not a workflow, or uses YAML this reader refuses, is
      // named and skipped — never silently dropped, because a missing workflow
      // makes the total look better than it is.
      skipped.push({
        file,
        reason: error instanceof UnsupportedYamlError ? `unsupported YAML: ${error.message}` : error.message,
      });
    }
  }
  if (workflows.length === 0) {
    process.stderr.write('None of the given files could be read as a workflow:\n');
    for (const { file, reason } of skipped) process.stderr.write(`  ${file}: ${reason}\n`);
    return 2;
  }

  const result = estimate(workflows, opts.assumptions);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ...result, skipped }, null, 2)}\n`);
  } else {
    process.stdout.write(renderReport(result, skipped));
  }

  if (opts.maxAllowancePercent != null) {
    const pct = result.totals.allowanceUsedPercent;
    if (pct > opts.maxAllowancePercent) {
      process.stderr.write(
        `Projected usage is ${pct.toFixed(0)}% of the included allowance, over the ${opts.maxAllowancePercent}% budget.\n`,
      );
      return 1;
    }
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
