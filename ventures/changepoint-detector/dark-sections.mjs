// A section gone dark: a page-view column (ga4-metrics.mjs --sections writes one per section of the site) whose last
// `days` days average under `frac` of its mean over the `base` days before them, from a level of at least `minLevel`
// a day. A tag lost from one page template takes that section to zero while every total moves only by its share,
// which the watch's change detectors hear on a small section about 1 time in 7 at best; a rise (a post that takes
// off) never trips this check. README "A template-shaped tracking loss" (round 2, pre-registered).
//
// Statistical check on data you supply, not advice. MIT licence.

export const DARK_DEFAULTS = { days: 3, frac: 0.1, base: 28, minLevel: 20 };

/**
 * Dark runs in one column of daily values (oldest first, one per day): [{ start, end }] as indexes, where `start` is
 * the first day of the dark stretch and `end` its last (the series' end if it is still dark). A stretch is found once,
 * on the day it has lasted `days` days.
 */
export function darkRuns(values, opts = {}) {
  const { days, frac, base, minLevel } = { ...DARK_DEFAULTS, ...opts };
  const out = [];
  let open = null;
  for (let t = base + days - 1; t < values.length; t++) {
    let recent = 0, before = 0;
    for (let k = t - days + 1; k <= t; k++) recent += values[k];
    for (let k = t - days - base + 1; k <= t - days; k++) before += values[k];
    recent /= days; before /= base;
    if (open) {
      if (values[t] >= frac * open.level) { out.push({ start: open.start, end: t - 1 }); open = null; }
      continue;
    }
    if (before >= minLevel && recent < frac * before) open = { start: t - days + 1, level: before };
  }
  if (open) out.push({ start: open.start, end: values.length - 1 });
  return out;
}

/** Dark stretches per column of rows [{ date, values }]: [{ column, start, end, level }] with dates. */
export function darkSections(rows, columns, opts = {}) {
  const found = [];
  for (const c of columns) {
    const v = rows.map((r) => Number(r.values[c]) || 0);
    for (const r of darkRuns(v, opts)) found.push({ column: c, start: rows[r.start].date, end: rows[r.end].date, stillDark: r.end === rows.length - 1 });
  }
  return found;
}

const USAGE = `Report sections of a site whose page views have gone dark (near zero), from a CSV with views_ columns
(node ga4-metrics.mjs --sections 5 writes one).

Usage:
  node dark-sections.mjs <file.csv> [--state dark-state.json] [--columns views_blog,views_help] [options]

Options:
  --state <file>        remembers the stretches already reported, so each is reported once (created if missing)
  --columns <a,b,...>   the columns to check (default: every column whose name starts with views_)
  --days <n>            days a section must stay dark before it is reported (default: ${DARK_DEFAULTS.days})
  --frac <x>            dark = under this share of the section's mean over the days before (default: ${DARK_DEFAULTS.frac})
  --min-level <n>       ignore sections with fewer page views a day than this before (default: ${DARK_DEFAULTS.minLevel})
  --webhook-env <NAME>  POST new reports to the URL in environment variable NAME (Slack, Discord, Teams, Mattermost)
  --fail-on-alert       exit 1 when there is a new report (GitHub then emails you)
  -h, --help            this help

Only a section that is still dark on the last day is reported; one that went dark and came back before this run
is history. Checked in simulation, not on a live site: README "A template-shaped tracking loss".`;

/** The text of a report for the stretches given. */
export function darkText(found, rows) {
  const lines = [];
  for (const f of found) {
    const i = rows.findIndex((r) => r.date === f.start);
    const before = rows.slice(Math.max(0, i - DARK_DEFAULTS.base), i).map((r) => Number(r.values[f.column]) || 0);
    const mean = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
    lines.push(`${f.column}: page views near zero since ${f.start} (about ${Math.round(mean)} a day before). The usual cause is a tracking tag lost from that section's page template (a theme or layout change, pages moved to another tool); open a page there with the tag debugger before reading it as lost traffic.`);
  }
  return lines.join('\n');
}

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), fetchImpl = globalThis.fetch } = {}) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const { splitCsvLine } = await import('./ga4-metrics.mjs');
  const { webhookBody } = await import('./watch-core.mjs');
  let file = null, statePath = null, columns = null, hookEnv = null, fail = false;
  const opts = {};
  const val = (k, name) => { const v = argv[k]; if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value (see --help).`); return v; };
  const pos = (s, name) => { const v = Number(s); if (!(v > 0) || !Number.isFinite(v)) throw new Error(`${name} takes a positive number.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--state') statePath = val(++i, '--state');
    else if (a === '--columns') columns = String(val(++i, '--columns')).split(',').map((x) => x.trim()).filter(Boolean);
    else if (a === '--days') opts.days = Math.round(pos(val(++i, '--days'), '--days'));
    else if (a === '--frac') { opts.frac = pos(val(++i, '--frac'), '--frac'); if (opts.frac >= 1) throw new Error('--frac takes a share under 1, e.g. 0.1.'); }
    else if (a === '--min-level') opts.minLevel = pos(val(++i, '--min-level'), '--min-level');
    else if (a === '--webhook-env') hookEnv = val(++i, '--webhook-env');
    else if (a === '--fail-on-alert') fail = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a} (see --help).`);
    else if (!file) file = a;
    else throw new Error('Give one CSV file.');
  }
  if (!file) throw new Error('Give a CSV file (see --help).');
  // A METRIC_CSV link (the self-deploy workflow passes it on): the watch reads those; section columns come from a file.
  if (/^https?:\/\//i.test(file)) return 0;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsvLine(lines[0] ?? '');
  const cols = columns ?? head.filter((c) => c.startsWith('views_'));
  for (const c of cols) if (!head.includes(c)) throw new Error(`${file} has no column ${c}.`);
  // Silent with no views_ columns, so the self-deploy workflow can run it on every source's CSV.
  if (!cols.length) return 0;
  const rows = lines.slice(1).map((l) => { const f = splitCsvLine(l); return { date: f[0], values: Object.fromEntries(cols.map((c) => [c, Number(f[head.indexOf(c)]) || 0])) }; });
  const state = statePath && existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : { reported: [] };
  const key = (f) => `${f.column}@${f.start}`;
  const fresh = darkSections(rows, cols, opts).filter((f) => f.stillDark && !state.reported.includes(key(f)));
  if (!fresh.length) {
    out(`${file}: no section dark (${cols.length} checked: ${cols.join(', ')}; ${rows.length} days to ${rows[rows.length - 1]?.date ?? '-'}).\n`);
    return 0;
  }
  const text = darkText(fresh, rows);
  out(text + '\n');
  if (hookEnv) {
    const url = env[hookEnv];
    if (!url) throw new Error(`--webhook-env ${hookEnv}: that environment variable is empty.`);
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(webhookBody(text)) });
    if (!r.ok) throw new Error(`The webhook answered ${r.status}; the state was not saved, so the next run will try again.`);
  }
  if (statePath) { state.reported.push(...fresh.map(key)); await writeFile(statePath, JSON.stringify(state, null, 2) + '\n'); }
  return fail ? 1 : 0;
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
