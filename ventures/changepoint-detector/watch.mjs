#!/usr/bin/env node
// Watch a growing series and alert once per new, confirmed change.
//
//   node watch.mjs daily.csv --state watch-state.json            # run after each new row (cron, CI)
//   node watch.mjs https://example.com/metric.csv --state s.json --column orders --model poisson
//   WATCH_WEBHOOK_URL=https://hooks.slack.com/... node watch.mjs daily.csv --state s.json --webhook-env WATCH_WEBHOOK_URL
//
// Each run refits the newest --window points with the same engine as the page and the CLI, then
// compares the changes with the ones it already alerted on (kept in the state file). A change is
// reported once it has --confirm points after it, and never again while it stays within
// --tolerance points of where it was first reported, so a change PELT re-dates by a point or two
// as data arrives is not a second alert. Zero dependencies; the only network calls are the ones
// you ask for (a CSV URL, a webhook URL from an environment variable).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { parseSeries } from './engine.mjs';
import { WATCH_DEFAULTS, DETECTORS, emptyState, detectChanges, advance, alertText, statusText, webhookBody } from './watch-core.mjs';

// The logic lives in watch-core.mjs (no file or network access, so the page and the agent tool import it too).
export * from './watch-core.mjs';

const USAGE = `Watch a growing time series and alert once per new, confirmed change (run it after each new row).

Usage:
  node watch.mjs <file.csv | https://...csv> --state <state.json> [options]

Options:
  --state <file>            where alerted changes are remembered (created if missing; commit it or cache it)
  --column <name|index>     value column (default: last numeric column)
  --label-column <name|i>   label/date column (default: first column)
  --model mean|meanvar|poisson   change in level, in level and volatility, or in the rate of counts (default: mean)
  --penalty bic|aic|<number>     PELT penalty per change (default: bic)
  --period <n>              remove a seasonal cycle of n points first (7 for daily data, 12 for monthly)
  --log                     take logs first (positive values; percentage growth)
  --detector <name>         which detector's changes to alert on: bocpd-ar1-window (default for --model mean: the Bayesian
                            detections allowing for sticky, autocorrelated noise, probability summed over 5 neighbouring
                            points), bocpd-ar1, bocpd (default for poisson and meanvar), bocpd-window, or pelt (finds
                            smaller steps, e.g. 1 noise sd, at several times the false alerts). README, "Watching a growing series".
  --rho-cap <x>             upper bound on the AR(1) detectors' rho (default: ${WATCH_DEFAULTS.rhoCap}; 0.95 is the uncapped estimate,
                            fewer false alerts on noise that wanders like a random walk; 0.5 reaches more real changes at
                            about three times the false alerts on sticky noise). README, "Round 4".
  --confirm <k>             report a change once k points are on its far side (default: ${WATCH_DEFAULTS.confirm})
  --hold-history            after the first check, record (not alert) a change dated where the first check could already have confirmed it
  --persist <k>             alert only on a change found at k checks in a row (default 1)
  --tolerance <k>           a change within k points of one already reported is the same change (default: ${WATCH_DEFAULTS.tolerance})
  --window <n>              refit only the newest n points (default: ${WATCH_DEFAULTS.window})
  --webhook-env <NAME>      POST each new alert to the URL in environment variable NAME (Slack, Discord, Teams, Mattermost)
  --fail-on-alert           exit 1 when there is a new alert (a CI run then fails and its owner is emailed)
  --alert-history           on the first check, alert on the changes already in the history too (default: record them as the baseline)
  --dry-run                 do not write the state file
  --json                    print the result as JSON
  -h, --help                this help

Statistical analysis of data you supply, not advice. MIT licence.`;

export async function main(argv, { out = (s) => process.stdout.write(s), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const o = {};
  let src = null, statePath = null, json = false, failOnAlert = false, dry = false, hookEnv = null;
  const num = (s, name) => { const v = Number(s); if (!(v > 0) || !Number.isInteger(v)) throw new Error(`${name} takes a whole number above 0.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--state') statePath = argv[++i];
    else if (a === '--column') o.column = argv[++i];
    else if (a === '--label-column') o.labelColumn = argv[++i];
    else if (a === '--model') { o.model = argv[++i]; if (!['mean', 'meanvar', 'poisson'].includes(o.model)) throw new Error('--model takes mean, meanvar or poisson.'); }
    else if (a === '--penalty') { const p = argv[++i]; o.penalty = /^\d+(\.\d+)?$/.test(p) ? Number(p) : p; }
    else if (a === '--period') o.period = num(argv[++i], '--period');
    else if (a === '--log') o.log = true;
    else if (a === '--detector') { o.detector = argv[++i]; if (!DETECTORS.includes(o.detector)) throw new Error(`--detector takes ${DETECTORS.join(', ')}.`); }
    else if (a === '--rho-cap') { o.rhoCap = Number(argv[++i]); if (!(o.rhoCap >= 0 && o.rhoCap <= 0.95)) throw new Error('--rho-cap takes a number from 0 to 0.95.'); }
    else if (a === '--confirm') o.confirm = num(argv[++i], '--confirm');
    else if (a === '--tolerance') o.tolerance = Number(argv[++i]);
    else if (a === '--window') o.window = num(argv[++i], '--window');
    else if (a === '--webhook-env') hookEnv = argv[++i];
    else if (a === '--fail-on-alert') failOnAlert = true;
    else if (a === '--dry-run') dry = true;
    else if (a === '--alert-history') o.alertHistory = true;
    else if (a === '--hold-history') o.holdHistory = true;
    else if (a === '--no-hold-history') o.holdHistory = false;
    else if (a === '--persist') { o.persist = num(argv[++i], '--persist'); }
    else if (a === '--json') json = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a} (see --help).`);
    else src = a;
  }
  if (!src) throw new Error('Give a CSV file or URL (see --help).');
  if (!statePath && !dry) throw new Error('Give --state <file> so the next run knows what was already reported (or --dry-run).');
  if (o.column != null && /^\d+$/.test(o.column)) o.column = Number(o.column);
  if (o.labelColumn != null && /^\d+$/.test(o.labelColumn)) o.labelColumn = Number(o.labelColumn);
  let csv;
  if (/^https?:\/\//i.test(src)) {
    const r = await fetchImpl(src);
    if (!r.ok) throw new Error(`Fetching ${src} answered ${r.status}.`);
    csv = await r.text();
  } else csv = await readFile(src, 'utf8');
  const { labels, values, column } = parseSeries(csv, o.column ?? null, o.labelColumn ?? null);
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  const state = statePath && existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : emptyState();
  const { column: _c, labelColumn: _l, alertHistory: _h, holdHistory: _hh, persist: _p, ...detOpts } = o;
  const changes = detectChanges(values, labels, detOpts);
  const res = advance(state, changes, values.length, labels, o);
  const textOpts = { column, model: o.model || 'mean', confirm: o.confirm };
  if (hookEnv && res.alerts.length) {
    const url = env[hookEnv];
    if (!url) throw new Error(`--webhook-env ${hookEnv}: that environment variable is empty.`);
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(webhookBody(alertText(res, textOpts))) });
    if (!r.ok) throw new Error(`The webhook answered ${r.status}; the state was not saved, so the next run will try again.`);
  }
  if (!dry) await writeFile(statePath, JSON.stringify(res.state, null, 2) + '\n');
  out((json ? JSON.stringify({ column, n: values.length, ...res }, null, 2) : statusText(res, textOpts)) + '\n');
  return failOnAlert && res.alerts.length ? 1 : 0;
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(2); });
}
