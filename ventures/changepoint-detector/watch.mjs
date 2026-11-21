#!/usr/bin/env node
// Watch a growing series and alert once per new, confirmed change.
//
//   node watch.mjs daily.csv --state watch-state.json            # run after each new row (cron, CI)
//   node watch.mjs https://example.com/metric.csv --state s.json --column orders --model poisson
//   WATCH_WEBHOOK_URL=https://hooks.slack.com/... node watch.mjs daily.csv --state s.json --webhook-env WATCH_WEBHOOK_URL
//   node watch.mjs daily.csv --suggest --alerts-per 1/month    # which "How eager" setting suits this history?
//   node watch.mjs daily.csv --state s.json --detector auto     # pick it at the first run and keep it
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
import { parseColumns } from './multivariate.mjs';
import { WATCH_DEFAULTS, DETECTORS, HINT_BUDGET, fillClosed, emptyState, detectChanges, advance, alertText, statusText, webhookBody, eagernessReplay, eagernessText, budgetFromPlain, plainBudgetText, chooseDetector, withCountDefaults, choiceOptions, settingWords } from './watch-core.mjs';
import { pathToFileURL } from 'node:url';

// The logic lives in watch-core.mjs (no file or network access, so the page and the agent tool import it too).
export * from './watch-core.mjs';

const USAGE = `Watch a growing time series and alert once per new, confirmed change (run it after each new row).

Usage:
  node watch.mjs <file.csv | https://...csv> --state <state.json> [options]

Options:
  --state <file>            where alerted changes are remembered (created if missing; commit it or cache it)
  --column <name|index>     value column (default: last numeric column)
  --label-column <name|i>   label/date column (default: first column)
  --columns <list|all>      watch several metrics of one CSV in one run: a comma list (orders,revenue,signups) or
                            all (every numeric column). A column may name its own model after a colon
                            (orders:poisson,revenue:meanvar) and its own detector after another
                            (orders:poisson:bocpd-window, README "A detector per column"); --detector applies to the
                            columns that name none, and --detector auto leaves a named one alone. Each column keeps its own record in the one state file and
                            all new changes go out as one webhook message. With --detector auto or --suggest each column
                            is picked against the whole budget, as a one-column watch would be (splitting it across the
                            columns was tested and failed, README "Several metrics in one watch").
                            Every column is one more chance for noise: on the normal run of an 8-sensor pump testbed
                            (SKAB), Quiet on all 8 columns sent 8.5 alert lines per 100 checks, over 4 times the
                            default budget (README "Round 12"). Replay with --suggest first and drop the loud columns.
                            Waiting for two columns to agree does not fix it: sensors that move together (two
                            accelerometers, two temperatures) agree on noise too, so the normal run still sent 2.7
                            messages per 100 checks, and 9 of 33 faults seen by one column alone were missed
                            (README "Round 13"; not offered). A floor per column read off the normal run (--min-shift,
                            below) cut false lines out of sample from 6.3 to 2.3 per 100 checks but lost 5 of 33 faults:
                            set the floor by hand on the loud columns that do not matter, not on the one that sees the
                            faults (README "Round 14"; the automatic version is not offered). One floor for all columns
                            in units of each column's spread over the 5 minutes before the move cut false lines to 1.4
                            per 100 checks, but lost 6 of 33 faults (README "Round 15"; not offered) Giving the loudest
                            column its own k caught 30 of 33 but let 2.5 false lines per 100 checks through, mostly a
                            slowly drifting temperature (README "Round 16"; not offered). A floor re-read from the
                            column's own last 5 minutes (alert only on a move bigger than any it made there) caught 32
                            of 33 but let 4.7 false lines per 100 checks through (README "Round 17"; not offered). On
                            a fresh set, 28 servers with about 30 metrics each (SMD), the quiet default sent 76 false
                            lines per 100 checks, and every floor read from a normal stretch lost most labelled events
                            (14-37% of the unfloored catches; README "Round 18"). Watch the few metrics you choose, and
                            set --min-spread by hand.
  --model mean|meanvar|poisson   change in level, in level and volatility, or in the rate of counts (default: mean)
  --penalty bic|aic|<number>     PELT penalty per change (default: bic)
  --period <n>              remove a seasonal cycle of n points first (7 for daily data, 12 for monthly)
  --log                     take logs first (positive values; percentage growth)
  --closed <dates|@file>    days the business was shut (bank holidays, a Christmas closure): a comma list of labels
                            (2024-12-25,2024-12-26) or @file with one per line. Each listed day is replaced, before any
                            detector sees it, by the same weekday one week earlier (one --period earlier; the day
                            before when labels are not daily), so a closed day's zero is not read as a drop and a
                            recovery. Do not list days the shop is always shut (a Saturday): --period 7 handles those.
                            On 100 simulated shops it took series with an alert at a closure from 100 to 16, the chance
                            rate (21 at random dates), and kept steps that start just before a closure (52 caught
                            against 57 had the shop never shut). A closure 1 to 7 days before a step costs about
                            1 step in 100 (179 of 300 caught against 183); left as zeros it lends alerts instead
                            (122 of 274 'catches' were only the closure). README, "Steps beside a closure" and
                            "A closure in the week before a step".
  --detector <name>         which detector's changes to alert on: bocpd-ar1-window (default for --model mean: the Bayesian
                            detections allowing for sticky, autocorrelated noise, probability summed over 5 neighbouring
                            points), bocpd-ar1, bocpd (default for meanvar), bocpd-window (default for poisson, with the nb cost at
                            threshold 0.3), or pelt (finds
                            smaller steps, e.g. 1 noise sd, at several times the false alerts). README, "Watching a growing series".
                            drift: jumps on a level that wanders all the time (a price, a stock level, a slowly growing
                            count), where the others alert on the wander itself (--model mean only). README, "Round 8".
                            auto: at the first run, replay the history once per setting and keep the most eager one
                            within the alert budget (below); later runs reuse it from the state file. README, "Round 6".
  --suggest                 replay the history once per setting (quiet, middle, eager), print the alerts each would have
                            sent and the suggested one, and stop (no state is read or written)
  --alerts-per <n>/<period> the alert budget for --suggest and --detector auto in plain terms: 1/month, 2/week, 6/year
                            (default ${HINT_BUDGET} per 100 checks, about 7 a year at a daily check)
  --check-every hour|day|week   how often this runs, to turn --alerts-per into a rate per check (default: day)
  --budget <x>              the same budget as alerts per 100 checks (round 6 pre-registered ${HINT_BUDGET})
  --rho-cap <x>             upper bound on the AR(1) detectors' rho (default: ${WATCH_DEFAULTS.rhoCap}; 0.95 is the uncapped estimate,
                            fewer false alerts on noise that wanders like a random walk; 0.5 reaches more real changes at
                            about three times the false alerts on sticky noise). README, "Round 4".
  --confirm <k>             report a change once k points are on its far side (default: ${WATCH_DEFAULTS.confirm})
  --tolerance <k>           a change within k points of one already reported is the same change (default: ${WATCH_DEFAULTS.tolerance})
  --window <n>              refit only the newest n points (default: ${WATCH_DEFAULTS.window})
  --alert-old-history       also alert on a change found later but dated inside the history the first check called quiet
                            (default since round 5: record it as held, not alerted)
  --persist <k>             2 (the default since round 7): alert only on a change also found at the previous check, one
                            check later; 1: alert at once. Both are flicker guards: README, "Round 5" and "Round 7".
  --min-shift <x|col=x,...> the smallest move to alert on, in the column's own units: a detection whose level moved by
                            less is dropped at every check (it is sent later if more points show it larger). A number
                            applies to every watched column; temperature=0.5,flow=2 sets it per column (--columns).
                            README, "Round 14".
  --min-spread <k|col=k,...>  the smallest move to alert on, in units of the column's own spread over the 60 points
                            before the move (a robust standard deviation): 3 drops a detection that moved less than 3
                            times the recent wiggle. One number serves columns in different units; temperature=4 sets it
                            per column (--columns). Your own threshold: the automatic k was tested and is not offered
                            (README "Round 15", "Round 16").
  --overdispersion <nb|nb1|phi>  for counts (--model poisson): score clumped counts (busy days come in bunches, so the
                            variance is above the mean) with a negative-binomial cost (nb), one that clumps in
                            proportion to the level (nb1), or a dispersion-tempered Poisson cost (phi), read from the
                            watched window at each check. In --columns, a count column takes it per column after its
                            model (orders:poisson:bocpd-window:nb); a global one applies to the count columns only.
                            With --model poisson and no --detector or --overdispersion, the watch already runs
                            bocpd-window with nb at alert threshold 0.3 (README "A count default for clumped orders":
                            on 2,200 fresh simulated shops 1.03 false alerts per 1,000 checks against old bocpd's 3.26,
                            1,056 of 1,200 drops and rises heard against 701). Naming either keeps threshold 0.5.
  --trend robust            for counts (--model poisson): read one growth rate across the window from a robust slope
                            of the log counts and look for steps about it, so a steadily growing or shrinking site is
                            not read as a staircase of steps. Measured with --detector pelt --overdispersion nb
                            (README "A Middle that allows for growth").
  --trend gated             for counts: the growth rate refitted under the steps (alternating with them), kept only
                            when it beats a flat level by log n; steadier from one check to the next than robust,
                            about 2.5x its time a check; the count Middle since 2026-11-21 (README "The joint growth fit, gated").
  --wander gated            for counts: when the window's level wanders at random (the drift model's random-walk level
                            beats a flat level with jumps by log n on the log counts), keep only the changes the drift
                            model also places a jump at, so the wander is not read as a staircase of steps; whether it
                            wanders is read on the days before the newest change, so a real fall cannot open the gate
                            (README "A wandering level under Middle", "A calmer wander gate").
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
  let closedSpec = null, suggest = false, auto = false, budget = null, plain = null, every = 'day', columnsSpec = null, floorSpec = null, spreadSpec = null;
  const num = (s, name) => { const v = Number(s); if (!(v > 0) || !Number.isInteger(v)) throw new Error(`${name} takes a whole number above 0.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--state') statePath = argv[++i];
    else if (a === '--column') o.column = argv[++i];
    else if (a === '--label-column') o.labelColumn = argv[++i];
    else if (a === '--columns') { columnsSpec = argv[++i]; if (!columnsSpec || columnsSpec.startsWith('-')) throw new Error('--columns takes a comma list of columns (orders,revenue:poisson) or all.'); }
    else if (a === '--model') { o.model = argv[++i]; if (!['mean', 'meanvar', 'poisson'].includes(o.model)) throw new Error('--model takes mean, meanvar or poisson.'); }
    else if (a === '--penalty') { const p = argv[++i]; o.penalty = /^\d+(\.\d+)?$/.test(p) ? Number(p) : p; }
    else if (a === '--period') o.period = num(argv[++i], '--period');
    else if (a === '--log') o.log = true;
    else if (a === '--closed') { closedSpec = argv[++i]; if (!closedSpec || closedSpec.startsWith('-')) throw new Error('--closed takes a comma list of dates (2024-12-25,2024-12-26) or @file.'); }
    else if (a === '--detector' && argv[i + 1] === 'auto') { auto = true; i++; }
    else if (a === '--suggest') suggest = true;
    else if (a === '--budget') { budget = Number(argv[++i]); if (!(budget >= 0) || !Number.isFinite(budget)) throw new Error('--budget takes a number of 0 or more (alerts per 100 checks).'); }
    else if (a === '--alerts-per') { const m = /^(\d+(?:\.\d+)?)\/(week|month|year)$/.exec(String(argv[++i] ?? '')); if (!m) throw new Error('--alerts-per takes <n>/week, <n>/month or <n>/year, e.g. 1/month.'); plain = { alerts: Number(m[1]), per: m[2] }; }
    else if (a === '--check-every') { every = argv[++i]; if (!['hour', 'day', 'week'].includes(every)) throw new Error('--check-every takes hour, day or week.'); }
    else if (a === '--detector') { o.detector = argv[++i]; if (!DETECTORS.includes(o.detector)) throw new Error(`--detector takes ${DETECTORS.join(', ')}.`); }
    else if (a === '--overdispersion') o.overdispersion = parseClumping(argv[++i], '--overdispersion');
    else if (a === '--trend') { o.trend = argv[++i]; if (o.trend !== 'robust' && o.trend !== 'gated') throw new Error('--trend takes robust (counts: one growth rate read from a robust slope) or gated (counts: the growth rate refitted under the steps, kept when it earns its place).'); }
    else if (a === '--wander') { o.wander = argv[++i]; if (o.wander !== 'gated') throw new Error('--wander takes gated (counts: keep only the changes a wandering level cannot explain).'); }
    else if (a === '--rho-cap') { o.rhoCap = Number(argv[++i]); if (!(o.rhoCap >= 0 && o.rhoCap <= 0.95)) throw new Error('--rho-cap takes a number from 0 to 0.95.'); }
    else if (a === '--confirm') o.confirm = num(argv[++i], '--confirm');
    else if (a === '--tolerance') o.tolerance = Number(argv[++i]);
    else if (a === '--window') o.window = num(argv[++i], '--window');
    else if (a === '--alert-old-history') o.holdHistory = false;
    else if (a === '--persist') { o.persist = num(argv[++i], '--persist'); if (o.persist > 2) throw new Error('--persist takes 1 or 2.'); }
    else if (a === '--min-shift') floorSpec = parseMinShift(argv[++i]);
    else if (a === '--min-spread') spreadSpec = parseMinSpread(argv[++i]);
    else if (a === '--webhook-env') hookEnv = argv[++i];
    else if (a === '--fail-on-alert') failOnAlert = true;
    else if (a === '--dry-run') dry = true;
    else if (a === '--alert-history') o.alertHistory = true;
    else if (a === '--json') json = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a} (see --help).`);
    else src = a;
  }
  if (!src) throw new Error('Give a CSV file or URL (see --help).');
  if (budget != null && plain) throw new Error('Give --budget or --alerts-per, not both.');
  if (plain) budget = budgetFromPlain({ ...plain, per: plain.per, every });
  if (auto && o.detector) throw new Error('Give --detector auto or a named detector, not both.');
  if (o.overdispersion != null && !columnsSpec && (o.model ?? 'mean') !== 'poisson') throw new Error('--overdispersion is for counts: add --model poisson.');
  if (o.trend != null && !columnsSpec && (o.model ?? 'mean') !== 'poisson') throw new Error(`--trend ${o.trend} is for counts: add --model poisson.`);
  if (o.wander != null && !columnsSpec && (o.model ?? 'mean') !== 'poisson') throw new Error('--wander gated is for counts: add --model poisson.');
  if (!statePath && !dry && !suggest) throw new Error('Give --state <file> so the next run knows what was already reported (or --dry-run).');
  if (o.column != null && /^\d+$/.test(o.column)) o.column = Number(o.column);
  if (o.labelColumn != null && /^\d+$/.test(o.labelColumn)) o.labelColumn = Number(o.labelColumn);
  let csv;
  if (/^https?:\/\//i.test(src)) {
    const r = await fetchImpl(src);
    if (!r.ok) throw new Error(`Fetching ${src} answered ${r.status}.`);
    csv = await r.text();
  } else csv = await readFile(src, 'utf8');
  const closed = closedSpec == null ? null : await closedList(closedSpec);
  if (columnsSpec) {
    if (o.column != null) throw new Error('Give --column or --columns, not both.');
    return watchColumns({ csv, closed, specs: columnSpecs(csv, columnsSpec, o.labelColumn ?? null), o, statePath, json, failOnAlert, dry, hookEnv, suggest, auto, budget, every, out, env, fetchImpl, floorSpec, spreadSpec });
  }
  if (floorSpec?.byColumn) throw new Error('--min-shift column=x,... is for --columns; with one column give a number.');
  if (spreadSpec?.byColumn) throw new Error('--min-spread column=k,... is for --columns; with one column give a number.');
  const { labels, values: raw, column } = parseSeries(csv, o.column ?? null, o.labelColumn ?? null);
  if (raw.length < 4) throw new Error(`Need at least 4 numbers; got ${raw.length}.`);
  const fill = closedFill(raw, labels, closed, o);
  const values = fill.values;
  const { column: _c, labelColumn: _l, alertHistory: _h, ...detOpts } = o;
  if (suggest) {
    if (values.length < 10) throw new Error(`--suggest needs at least 10 points; got ${values.length}.`);
    const r = eagernessReplay(values, labels, { ...detOpts, ...(budget != null ? { budget } : {}) });
    out((json ? JSON.stringify({ column, ...r, plain: plainBudgetText(r.budget, every), ...fill.json }, null, 2) : fill.line + eagernessText(r, { column, every })) + '\n');
    return 0;
  }
  const state = statePath && existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : emptyState();
  let picked = null;
  if (auto) {
    // The first run picks from the history and the state keeps the pick; later runs reuse it, so the watch does not
    // change setting under the person as the series grows. Delete "choice" from the state file to pick again.
    if (choiceOptions(state.choice)) Object.assign(detOpts, choiceOptions(state.choice));
    else {
      const { replay: _r, ...c } = chooseDetector(values, labels, { ...detOpts, ...(budget != null ? { budget } : {}) });
      state.choice = c;
      picked = c;
      Object.assign(detOpts, choiceOptions(c));
    }
  }
  if (floorSpec?.all) detOpts.minShift = floorSpec.all;
  if (spreadSpec?.all) detOpts.minSpreadRatio = spreadSpec.all;
  const changes = detectChanges(values, labels, detOpts);
  const countDefault = withCountDefaults(detOpts) !== detOpts;
  const res = advance(state, changes, values.length, labels, o);
  const textOpts = { column, model: o.model || 'mean', confirm: o.confirm };
  if (hookEnv && res.alerts.length) {
    const url = env[hookEnv];
    if (!url) throw new Error(`--webhook-env ${hookEnv}: that environment variable is empty.`);
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(webhookBody(alertText(res, textOpts))) });
    if (!r.ok) throw new Error(`The webhook answered ${r.status}; the state was not saved, so the next run will try again.`);
  }
  if (!dry) await writeFile(statePath, JSON.stringify(res.state, null, 2) + '\n');
  const NAME = { quiet: 'Quiet', middle: 'Middle', eager: 'Eager' };
  const pickLine = picked
    ? `How eager: ${NAME[picked.key]} (${settingWords(picked)}), picked from ${picked.n} points of history: ${picked.reason}${picked.per100 != null ? ` (${picked.per100} per 100 checks there)` : ''}; budget ${plainBudgetText(picked.budget, every)}. Later runs keep it.`
    : null;
  out((json ? JSON.stringify({ column, n: values.length, ...(picked ? { picked } : {}), ...fill.json, ...res }, null, 2) : fill.line + (pickLine ? pickLine + '\n' : '') + (countDefault ? COUNT_DEFAULT_LINE + '\n' : '') + statusText(res, textOpts)) + '\n');
  return failOnAlert && res.alerts.length ? 1 : 0;
}

/** `--closed`: the listed dates, from "a,b" or "@file" (one per line, # comments and blank lines skipped). */
export async function closedList(spec) {
  const s = String(spec).trim();
  const text = s.startsWith('@') ? await readFile(s.slice(1), 'utf8') : s;
  const dates = text.split(/[,\n]/).map((t) => t.replace(/#.*/, '').trim()).filter(Boolean);
  if (!dates.length) throw new Error('--closed lists no dates.');
  return dates;
}

/**
 * The `--closed` fill (README "Steps beside a closure", eval/closed-steps.prereg.md: fillClosed with lags 1, rounded for
 * counts). Returns { values, line, json }: line is the text note ('' with no fill), json the fields for --json.
 */
export function closedFill(values, labels, closed, opts = {}) {
  if (!closed) return { values, line: '', json: {} };
  const r = fillClosed(values, labels, closed, { period: opts.period ?? null, round: opts.model === 'poisson', lags: 1 });
  const n = r.filled.length;
  const line = `Closed: ${n} of ${closed.length} listed day${closed.length === 1 ? '' : 's'} in this series, each read as the same day one cycle earlier${n ? ` (${r.filled.slice(0, 5).map((f) => f.label).join(', ')}${n > 5 ? ', ...' : ''})` : ''}.\n`;
  return { values: r.values, line, json: { closed: { listed: closed.length, filled: r.filled } } };
}

/** Clumping costs for counts, by the name the CLI takes, as the engine's `overdispersion` option. */
export const CLUMPING = { nb: 'nb', nb1: 'nb1', phi: true };
// Printed on a count column that runs the count default (watch-core.mjs COUNT_DEFAULTS, README "A count default for clumped orders").
export const COUNT_DEFAULT_LINE = 'Detector: bocpd-window, negative-binomial cost, alert threshold 0.3 (the count default; --detector bocpd for the old one).';
const clumpingName = (v) => (v === 'nb' ? 'negative-binomial cost' : v === 'nb1' ? 'negative-binomial cost in proportion to the level' : 'dispersion-tempered Poisson cost');

/** `--overdispersion nb|nb1|phi` as the engine's option. */
export function parseClumping(t, flag = '--overdispersion') {
  const k = String(t ?? '').trim().toLowerCase();
  if (!(k in CLUMPING)) throw new Error(`${flag} takes ${Object.keys(CLUMPING).join(', ')}.`);
  return CLUMPING[k];
}

/**
 * `--columns`: [{ column, model, detector?, overdispersion? }] from "a,b:poisson" or "all" (every numeric column but the label column).
 * After the name, up to two colon parts, each a model (mean, meanvar, poisson) or a detector (DETECTORS), in either
 * order: "orders:poisson:bocpd-window" watches orders as counts with the windowed Bayesian pass while the other
 * columns keep --detector or their model's default (README "A detector per column"). A count column may also name a
 * clumping cost (nb, nb1, phi; README "Clumped counts in the watch"): "orders:poisson:bocpd-window:nb".
 * Column names are matched as the single-column watch matches them (case-insensitive, or a 0-based index).
 */
export function columnSpecs(csv, spec, labelColumn = null) {
  const MODELS = ['mean', 'meanvar', 'poisson'];
  const CLUMP = Object.keys(CLUMPING);
  let specs;
  if (String(spec).trim().toLowerCase() === 'all') specs = parseColumns(csv, null, labelColumn).names.map((column) => ({ column, model: null }));
  else {
    specs = String(spec).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      // A column name may itself hold a colon only if no part after it reads as a model or detector.
      const parts = s.split(':');
      let model = null, detector = null, clump = null;
      while (parts.length > 1) {
        const t = parts[parts.length - 1].trim().toLowerCase();
        if (MODELS.includes(t) && model == null) model = t;
        else if (DETECTORS.includes(t) && detector == null) detector = t;
        else if (CLUMP.includes(t) && clump == null) clump = t;
        else break;
        parts.pop();
      }
      const column = parts.join(':').trim();
      if (!column) throw new Error(`--columns: "${s}" names no column.`);
      if (parts.length > 1 || (s.includes(':') && model == null && detector == null && clump == null)) {
        throw new Error(`--columns: "${s}": each part after a colon is a model (${MODELS.join(', ')}), a detector (${DETECTORS.join(', ')}) or a clumping cost for counts (${CLUMP.join(', ')}), at most one of each.`);
      }
      return { column: /^\d+$/.test(column) ? Number(column) : column, model, ...(detector ? { detector } : {}), ...(clump ? { overdispersion: CLUMPING[clump] } : {}) };
    });
  }
  if (!specs.length) throw new Error('--columns: no column to watch.');
  const seen = new Set();
  for (const s of specs) {
    const k = String(s.column).toLowerCase();
    if (seen.has(k)) throw new Error(`--columns: "${s.column}" is listed twice.`);
    seen.add(k);
  }
  return specs;
}

/**
 * `--min-shift`: the smallest move to alert on, in the column's own units (README "Round 14"). A number applies to
 * every watched column; "column=x,column=y" sets it per column (names case-insensitive, or 0-based indexes) and leaves
 * the others without one. Returns { all } or { byColumn: Map(lowercased name -> x) }.
 */
export function parseMinShift(spec) { return parseColumnNumbers(spec, '--min-shift', 'the floor', '(0.5) or column=number pairs (temperature=0.5,flow=2)'); }

/**
 * `--min-spread`: the smallest move to alert on in units of the column's spread over the SPREAD_WINDOW points before
 * it (README "Round 15", "Round 16"; option minSpreadRatio). Same forms as --min-shift: { all } or { byColumn }.
 */
export function parseMinSpread(spec) { return parseColumnNumbers(spec, '--min-spread', 'k', '(3) or column=number pairs (temperature=4,flow=2)'); }

function parseColumnNumbers(spec, flag, what0, forms) {
  const s = String(spec ?? '').trim();
  const pos = (t, what) => { const v = Number(t); if (!(v > 0) || !Number.isFinite(v)) throw new Error(`${flag}: ${what} takes a number above 0, got "${t}".`); return v; };
  if (!s || s.startsWith('-')) throw new Error(`${flag} takes a number ${forms}.`);
  if (!s.includes('=')) return { all: pos(s, what0) };
  if (!s.includes('=')) return { all: pos(s, 'the floor') };
  const byColumn = new Map();
  for (const part of s.split(',').map((t) => t.trim()).filter(Boolean)) {
    const i = part.lastIndexOf('=');
    const name = part.slice(0, i).trim().toLowerCase();
    if (i < 0 || !name) throw new Error(`${flag}: "${part}" is not column=number.`);
    if (byColumn.has(name)) throw new Error(`${flag}: "${name}" is given twice.`);
    byColumn.set(name, pos(part.slice(i + 1).trim(), name));
  }
  return { byColumn };
}

/** The record for several columns: { version, columns: { <name>: <one column's state> } }. */
export function emptyMultiState() { return { version: 1, columns: {} }; }

async function watchColumns({ csv, closed = null, specs, o, statePath, json, failOnAlert, dry, hookEnv, suggest, auto, budget, every, out, env, fetchImpl, floorSpec = null, spreadSpec = null }) {
  const k = specs.length;
  // Each column is picked against the whole budget, as a one-column watch would be. Splitting it (1/k each) was
  // pre-registered and failed (eval/watch-columns.mjs): on 5 noise columns the unsplit picks already sent 1.33 alerts per
  // 100 checks of the whole watch, and on the UK seat-belt columns the split sent more (8 against 5), because Quiet sent
  // more than Middle on those seasonal monthly series.
  const whole = budget ?? HINT_BUDGET;
  const { column: _c, labelColumn, alertHistory: _h, ...base } = o;
  const series = specs.map((s) => {
    const { labels, values: raw, column } = parseSeries(csv, s.column, labelColumn ?? null);
    if (raw.length < 4) throw new Error(`${column}: need at least 4 numbers; got ${raw.length}.`);
    const opts = { ...base, ...(s.model ? { model: s.model } : {}), ...(s.detector ? { detector: s.detector } : {}) };
    // A clumping cost is for counts: a named one needs a count column; a global --overdispersion skips the others.
    if (s.overdispersion != null) {
      if ((opts.model ?? 'mean') !== 'poisson') throw new Error(`--columns: ${column}: a clumping cost (nb, nb1, phi) is for counts; name the model too (${column}:poisson:...).`);
      opts.overdispersion = s.overdispersion;
    } else if ((opts.model ?? 'mean') !== 'poisson') delete opts.overdispersion;
    if ((opts.model ?? 'mean') !== 'poisson') delete opts.wander;
    if ((opts.model ?? 'mean') !== 'poisson') delete opts.trend;  // a global --trend robust applies to the count columns only
    const fill = closedFill(raw, labels, closed, opts);
    return { ...s, column: String(column), labels, values: fill.values, fill, opts };
  });
  const applyPerColumn = (spec, key, flag) => {
    if (spec?.byColumn) {
      const watched = new Map(series.map((c) => [c.column.toLowerCase(), c]));
      for (const [name, x] of spec.byColumn) {
        const c = watched.get(name) ?? (/^\d+$/.test(name) ? series.find((t) => t.column === String(parseColumns(csv, null, labelColumn ?? null).names[Number(name)])) : null);
        if (!c) throw new Error(`${flag}: "${name}" is not one of the watched columns (${series.map((t) => t.column).join(', ')}).`);
        c.opts[key] = x;
      }
    } else if (spec?.all) for (const c of series) c.opts[key] = spec.all;
  };
  applyPerColumn(floorSpec, 'minShift', '--min-shift');
  applyPerColumn(spreadSpec, 'minSpreadRatio', '--min-spread');
  if (suggest) {
    const rows = series.map((c) => {
      if (c.values.length < 10) throw new Error(`--suggest needs at least 10 points; ${c.column} has ${c.values.length}.`);
      return { column: c.column, ...eagernessReplay(c.values, c.labels, { ...c.opts, budget: whole }), ...c.fill.json };
    });
    if (json) out(JSON.stringify({ budget: whole, plain: plainBudgetText(whole, every), columns: rows }, null, 2) + '\n');
    else out(`Budget: ${plainBudgetText(whole, every)} per column, ${k} column${k === 1 ? '' : 's'}.\n${series[0].fill.line}\n`
      + rows.map((r) => `== ${r.column} ==\n${eagernessText(r, { column: r.column, every })}`).join('\n\n') + '\n');
    return 0;
  }
  let state = emptyMultiState();
  if (statePath && existsSync(statePath)) {
    const raw = JSON.parse(await readFile(statePath, 'utf8'));
    if (!raw.columns && (raw.n || (raw.alerted && raw.alerted.length))) throw new Error(`${statePath} holds the record of a one-column watch; give --columns a new --state file (or keep --column).`);
    if (raw.columns) state = { version: 1, columns: { ...raw.columns } };
  }
  const NAME = { quiet: 'Quiet', middle: 'Middle', eager: 'Eager' };
  const results = [];
  for (const c of series) {
    const st = state.columns[c.column] ?? emptyState();
    const det = { ...c.opts };
    let picked = null;
    // A detector named in --columns is the person's own choice for that column: --detector auto leaves it alone.
    if (auto && !c.detector) {
      if (choiceOptions(st.choice)) Object.assign(det, choiceOptions(st.choice));
      else {
        const { replay: _r, ...ch } = chooseDetector(c.values, c.labels, { ...det, budget: whole });
        st.choice = ch;
        picked = ch;
        Object.assign(det, choiceOptions(ch));
      }
    }
    const res = advance(st, detectChanges(c.values, c.labels, det), c.values.length, c.labels, { ...o, ...det });
    state.columns[c.column] = res.state;
    results.push({ column: c.column, model: det.model || 'mean', detector: c.detector ?? null, clumping: c.overdispersion ?? null, countDefault: withCountDefaults(det) !== det, n: c.values.length, picked, res, fill: c.fill });
  }
  const alerting = results.filter((r) => r.res.alerts.length);
  const message = alerting.map((r) => alertText(r.res, { column: r.column, model: r.model })).join('\n');
  if (hookEnv && alerting.length) {
    const url = env[hookEnv];
    if (!url) throw new Error(`--webhook-env ${hookEnv}: that environment variable is empty.`);
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(webhookBody(message)) });
    if (!r.ok) throw new Error(`The webhook answered ${r.status}; the state was not saved, so the next run will try again.`);
  }
  if (!dry) await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
  if (json) {
    out(JSON.stringify({ alerts: alerting.reduce((s, r) => s + r.res.alerts.length, 0), budget: auto ? whole : undefined,
      columns: results.map((r) => ({ column: r.column, model: r.model, ...(r.detector ? { detector: r.detector } : {}), ...(r.clumping != null ? { overdispersion: r.clumping === true ? 'phi' : r.clumping } : {}), n: r.n, ...(r.picked ? { picked: r.picked } : {}), ...r.fill.json, ...r.res })) }, null, 2) + '\n');
  } else {
    const head = alerting.length
      ? `New changes in ${alerting.length} of ${k} column${k === 1 ? '' : 's'}: ${alerting.map((r) => r.column).join(', ')}.`
      : `No new confirmed change in ${k} column${k === 1 ? '' : 's'}.`;
    const blocks = results.map((r) => {
      const pick = r.picked ? `How eager: ${NAME[r.picked.key]} (${settingWords(r.picked)}), picked from ${r.picked.n} points: ${r.picked.reason}; budget ${plainBudgetText(whole, every)}. Later runs keep it.\n` : '';
      const named = r.detector || r.clumping != null ? `${r.detector ? `Detector: ${r.detector}` : 'Detector: default'}${r.clumping != null ? `, ${clumpingName(r.clumping)}` : ''} (named for this column).\n` : '';
      const dflt = r.countDefault ? `${COUNT_DEFAULT_LINE}\n` : '';
      return `== ${r.column} ==\n${named}${dflt}${pick}${statusText(r.res, { column: r.column, model: r.model, confirm: o.confirm })}`;
    });
    out([head + (results[0].fill.line ? '\n' + results[0].fill.line.trimEnd() : ''), ...blocks].join('\n\n') + '\n');
  }
  return failOnAlert && alerting.length ? 1 : 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(2); });
}
