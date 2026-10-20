// Collects the repository's development analyses for `dev/analyses/` on the
// Pages site: the experiments log, the process backlog, process and drift
// reports, portfolio studies, and what run records say got in the way.
//
// Everything is read from files on `main`. Nothing here is typed by hand, and
// a source that is missing yields an empty section rather than a guess.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { summaryOf, titleOf } from './markdown.mjs';

const read = (p) => readFileSync(p, 'utf8');
const dateIn = (s) => (/(\d{4}-\d{2}-\d{2})/.exec(s) || [])[1] ?? null;

/**
 * `prompts/experiments.md` → one entry per `## E<n>: title`, with its bullet
 * fields (Change, Why, Measure, Result, and any others such as Audit) and a
 * verdict read from Result: pending until a review fills it in.
 */
export function parseExperiments(src) {
  const out = [];
  const parts = String(src).split(/^## (?=E\d+:)/m).slice(1);
  for (const part of parts) {
    const [head, ...body] = part.split('\n');
    const m = /^E(\d+):\s*(.*)$/.exec(head.trim());
    if (!m) continue;
    const fields = {};
    let key = null;
    for (const line of body) {
      const fm = /^- ([A-Z][A-Za-z -]{1,30}):\s?(.*)$/.exec(line);
      if (fm) {
        key = fm[1].trim();
        fields[key] = fm[2];
      } else if (key && /^\s+\S/.test(line)) {
        fields[key] += ` ${line.trim()}`;
      } else if (!line.trim()) {
        // blank lines end nothing: fields are introduced by their own bullet
      } else {
        key = null;
      }
    }
    for (const k of Object.keys(fields)) fields[k] = fields[k].trim();
    out.push({
      id: `E${m[1]}`,
      n: Number(m[1]),
      title: m[2].trim(),
      date: dateIn(m[2]),
      fields,
      verdict: verdictOf(fields.Result),
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** helped | no change | worse | too few runs | pending. A Result still in parentheses is pending. */
export function verdictOf(result) {
  const r = String(result ?? '').trim().toLowerCase();
  if (!r || /^\((next|first) review\)/.test(r) || r.startsWith('(')) return 'pending';
  if (/^helped|\bhelped\b/.test(r)) return 'helped';
  if (/^worse|\bworse\b/.test(r)) return 'worse';
  if (/too few|too early/.test(r)) return 'too few runs';
  if (/no change/.test(r)) return 'no change';
  return 'reported';
}

/** `prompts/process/backlog/P*.json`, newest id first. Malformed files are skipped, not fatal. */
export function readBacklog(dir) {
  if (!existsSync(dir)) return [];
  const items = [];
  for (const f of readdirSync(dir).filter((n) => /^P\d+.*\.json$/.test(n)).sort()) {
    try {
      const j = JSON.parse(read(path.join(dir, f)));
      items.push({
        id: j.id,
        title: j.title,
        status: j.status,
        owner: j.owner,
        effect: j.effect,
        cost: j.cost,
        metric: j.metric,
        baseline: j.baseline,
        result: j.result,
        pr: j.pr,
        opened: j.opened,
        problem: j.problem,
        file: `prompts/process/backlog/${f}`,
      });
    } catch {
      // validate() owns schema errors; the page shows what parses.
    }
  }
  return items.reverse();
}

/** Every `*.md` in `dir` except README, as {slug, path, title, date, summary, markdown}, newest first. */
export function readDocs(dir, repoRoot) {
  if (!existsSync(dir)) return [];
  const docs = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || /^readme\.md$/i.test(f)) continue;
    const full = path.join(dir, f);
    const md = read(full);
    docs.push({
      slug: f.replace(/\.md$/, ''),
      path: path.relative(repoRoot, full).split(path.sep).join('/'),
      title: titleOf(md) ?? f.replace(/\.md$/, ''),
      date: dateIn(f),
      summary: summaryOf(md),
      markdown: md,
    });
  }
  return docs.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || b.slug.localeCompare(a.slug));
}

/** `portfolio/research/<study>/README.md`: one study per directory. Dated by the newest date in its text. */
export function readStudies(dir, repoRoot) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const readme = path.join(dir, name, 'README.md');
    if (!statSync(path.join(dir, name)).isDirectory() || !existsSync(readme)) continue;
    const md = read(readme);
    const dates = md.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    out.push({
      slug: name,
      path: path.relative(repoRoot, readme).split(path.sep).join('/'),
      title: titleOf(md) ?? name,
      date: dates.sort().at(-1) ?? null,
      summary: summaryOf(md),
      markdown: md,
    });
  }
  return out.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || a.slug.localeCompare(b.slug));
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const textOf = (x) => (typeof x === 'string' ? x : x?.issue ?? x?.why ?? x?.note ?? JSON.stringify(x));

/**
 * Run records (`prompts/runs/*.json`): which files runs report friction with,
 * which instructions they chose not to follow, and the integrity issues they
 * caught — the qualitative side the metrics dashboard does not show.
 */
export function summariseRuns(dir) {
  const empty = { records: 0, friction: [], deviations: [], integrity: [], outcomes: {}, by_day: {} };
  if (!existsSync(dir)) return empty;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const byFile = new Map();
  const devByFile = new Map();
  const integrity = [];
  const outcomes = {};
  const byDay = {};
  let records = 0;
  for (const f of files) {
    let r;
    try {
      r = JSON.parse(read(path.join(dir, f)));
    } catch {
      continue;
    }
    records++;
    const date = r.date ?? dateIn(f);
    outcomes[r.outcome ?? 'unknown'] = (outcomes[r.outcome ?? 'unknown'] ?? 0) + 1;
    if (date) {
      const d = (byDay[date] ??= { runs: 0, friction: 0, tracks: {} });
      d.runs++;
      d.tracks[r.track ?? 'unknown'] = (d.tracks[r.track ?? 'unknown'] ?? 0) + 1;
      d.friction += asList(r.doc_friction).length;
    }
    const ref = { date, track: r.track ?? null, record: `prompts/runs/${f}` };
    const tally = (map, item) => {
      const file = (typeof item === 'object' && item?.file) || '(unnamed)';
      const e = map.get(file) ?? { file, count: 0, examples: [] };
      e.count++;
      e.examples.push({ ...ref, text: textOf(item) });
      map.set(file, e);
    };
    for (const x of asList(r.doc_friction)) tally(byFile, x);
    for (const x of asList(r.deviations)) tally(devByFile, x);
    for (const x of asList(r.integrity_issues)) integrity.push({ ...ref, text: textOf(x) });
  }
  const rank = (map) =>
    [...map.values()]
      .map((e) => ({
        ...e,
        latest: e.examples.map((x) => x.date).filter(Boolean).sort().at(-1) ?? null,
        examples: e.examples.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))).slice(0, 5),
      }))
      .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  integrity.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const days = Object.keys(byDay).sort();
  return {
    records,
    friction: rank(byFile),
    deviations: rank(devByFile),
    integrity,
    outcomes,
    by_day: Object.fromEntries(days.map((d) => [d, byDay[d]])),
  };
}

/** Everything the page shows. `now` is injectable for tests. */
export function collect(repoRoot, { now = new Date() } = {}) {
  const p = (...s) => path.join(repoRoot, ...s);
  const experimentsPath = p('prompts', 'experiments.md');
  const experiments = existsSync(experimentsPath) ? parseExperiments(read(experimentsPath)) : [];
  const backlog = readBacklog(p('prompts', 'process', 'backlog'));
  const verdicts = {};
  for (const e of experiments) verdicts[e.verdict] = (verdicts[e.verdict] ?? 0) + 1;
  const status = {};
  for (const b of backlog) status[b.status ?? 'unknown'] = (status[b.status ?? 'unknown'] ?? 0) + 1;
  return {
    generated: now.toISOString(),
    experiments,
    experiment_verdicts: verdicts,
    backlog,
    backlog_status: status,
    reports: readDocs(p('prompts', 'process', 'reports'), repoRoot),
    drift: readDocs(p('prompts', 'drift'), repoRoot),
    studies: readStudies(p('portfolio', 'research'), repoRoot),
    runs: summariseRuns(p('prompts', 'runs')),
  };
}
