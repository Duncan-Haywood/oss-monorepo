#!/usr/bin/env node
// The fact sheet a progress blog post is written from: daily, every three days
// or weekly. Software for the routine (counting, grouping, ranking what to
// look at), so the session writing the post spends its time on judgment:
// which of these things was most interesting, and whether the work is going
// where the flagships and goals say it should.
//
//   node platform/daily/progress.mjs --cadence=daily|3day|weekly [--end=YYYY-MM-DD] [--json]
//
// The window is the `days` complete UTC days ending on --end (default:
// yesterday, UTC). It needs main's history back to the window start; in a
// shallow clone run `git fetch origin main --shallow-since=<start minus a day>`.
// Runbook: .github/prompts/daily-progress-post.md.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY, readMerges, readRuns, summariseRuns } from './collect.mjs';

export const CADENCES = {
  daily: { days: 1, tag: 'daily-progress', label: 'Daily' },
  '3day': { days: 3, tag: 'three-day-progress', label: 'Three-day' },
  weekly: { days: 7, tag: 'weekly-progress', label: 'Weekly' },
};

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const startOf = (day) => Date.parse(`${day}T00:00:00Z`);

/** The first and last UTC day of a window of `days` days ending on `end`. */
export function windowOf(cadence, end) {
  const c = CADENCES[cadence];
  if (!c) throw new Error(`unknown cadence ${cadence}; use ${Object.keys(CADENCES).join(', ')}`);
  return { ...c, cadence, first: dayOf(startOf(end) - (c.days - 1) * DAY), last: end };
}

/** Flagship venture slugs in their ranked order, read from flagships.yaml without a YAML parser. */
export function readFlagships(text) {
  return [...text.matchAll(/^\s*-\s*venture:\s*([\w-]+)/gm)].map((m) => m[1]);
}

/** Front matter fields a post index needs, read the same loose way check_post_frontmatter.py does. */
export function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith(' ')) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  out.tags = (out.tags ?? '').replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
  return out;
}

/** The newest post carrying `tag`, or null. */
export function previousEdition(postsDir, tag) {
  if (!existsSync(postsDir)) return null;
  const names = readdirSync(postsDir).filter((n) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(n)).sort().reverse();
  for (const n of names) {
    const fm = frontMatter(readFileSync(path.join(postsDir, n), 'utf8'));
    if (fm.tags.includes(tag)) return { file: `docs/posts/${n}`, title: fm.title ?? n, date: fm.date ?? n.slice(0, 10) };
  }
  return null;
}

const size = (m) => m.lines_added + m.lines_removed;
const ref = (m) => (m.pr ? `#${m.pr}` : m.sha.slice(0, 9));

/** Everything the post needs, from merges and run records already read. */
export function progressFacts(win, merges, runsByDate, { flagships = [], posts = [], previous = null } = {}) {
  const inWin = merges.filter((m) => dayOf(m.at) >= win.first && dayOf(m.at) <= win.last);
  const perDay = {};
  for (let t = startOf(win.first); t <= startOf(win.last); t += DAY) perDay[dayOf(t)] = 0;
  for (const m of inWin) perDay[dayOf(m.at)] += 1;

  const groups = new Map();
  for (const m of inWin) {
    const key = `${m.area.kind}\t${m.area.name}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(m);
  }
  const areas = [...groups.entries()]
    .map(([key, ms]) => {
      const [kind, name] = key.split('\t');
      return {
        kind,
        name,
        merges: ms.length,
        lines: ms.reduce((s, m) => s + size(m), 0),
        flagship_rank: kind === 'product' && flagships.includes(name) ? flagships.indexOf(name) + 1 : null,
        // Biggest first: a reader looking for "the most interesting thing" starts there.
        top: [...ms].sort((a, b) => size(b) - size(a)).slice(0, 4).map((m) => ({ ref: ref(m), title: m.title, detail: m.detail, lines: size(m) })),
      };
    })
    .sort((a, b) => b.merges - a.merges || b.lines - a.lines);

  const added = (re) => [...new Set(inWin.flatMap((m) => m.added_files.filter((f) => re.test(f)).map((f) => f.match(re)[1])))];
  const newPosts = added(/^docs\/posts\/([^/]+)\.md$/);
  const postTags = {};
  for (const p of posts.filter((x) => newPosts.includes(x.slug))) for (const t of p.tags) postTags[t] = (postTags[t] ?? 0) + 1;

  const recs = [];
  for (const [date, rs] of runsByDate) if (date >= win.first && date <= win.last) recs.push(...rs);
  const runs = summariseRuns(recs);

  return {
    cadence: win.cadence,
    window: { first: win.first, last: win.last, days: win.days },
    tag: win.tag,
    previous_edition: previous,
    merges: inWin.length,
    merges_per_day: perDay,
    lines_added: inWin.reduce((s, m) => s + m.lines_added, 0),
    lines_removed: inWin.reduce((s, m) => s + m.lines_removed, 0),
    agents: Object.entries(inWin.reduce((o, m) => ((o[m.agent ?? 'unattributed'] = (o[m.agent ?? 'unattributed'] ?? 0) + 1), o), {})).sort((a, b) => b[1] - a[1]),
    by_kind: Object.entries(inWin.reduce((o, m) => ((o[m.area.kind] = (o[m.area.kind] ?? 0) + 1), o), {})).sort((a, b) => b[1] - a[1]),
    flagships: flagships.map((name, i) => {
      const a = areas.find((x) => x.kind === 'product' && x.name === name);
      return { rank: i + 1, name, merges: a?.merges ?? 0, top: a?.top ?? [] };
    }),
    areas,
    new_ventures: added(/^ventures\/([^/]+)\/VENTURE\.yaml$/),
    new_research: added(/^research\/([^_./][^/]*)\/README\.md$/),
    new_posts: newPosts.length,
    new_post_tags: Object.entries(postTags).sort((a, b) => b[1] - a[1]).slice(0, 12),
    reverts: inWin.filter((m) => m.revert).map((m) => ({ ref: ref(m), title: m.title })),
    fix_forwards: inWin.filter((m) => m.fix_forward && !m.revert).map((m) => ({ ref: ref(m), title: m.title })),
    biggest: [...inWin].sort((a, b) => size(b) - size(a)).slice(0, 8).map((m) => ({ ref: ref(m), title: m.title, area: m.area.name, lines: size(m) })),
    runs: { ...runs, notes: runs.notes.slice(0, 10), errors: runs.errors.slice(0, 10) },
  };
}

const list = (xs, f) => (xs.length ? xs.map(f).join('\n') : '- none');

/** The fact sheet as Markdown, for a session to read before writing. */
export function renderFacts(f) {
  const w = f.window;
  const range = w.first === w.last ? w.first : `${w.first} to ${w.last}`;
  const prev = f.previous_edition ? `${f.previous_edition.file} (${f.previous_edition.date}: ${f.previous_edition.title})` : 'none yet: this is the first';
  const n = (x) => (x == null ? 'not recorded' : x);
  return `# ${CADENCES[f.cadence].label} progress facts, ${range} (UTC)

Tag the post \`progress-report\` and \`${f.tag}\`. Previous edition: ${prev}.

## Throughput

| Day | Merges |
|---|---|
${Object.entries(f.merges_per_day).map(([d, c]) => `| ${d} | ${c} |`).join('\n')}

${f.merges} merges, +${f.lines_added} / -${f.lines_removed} lines. By kind: ${f.by_kind.map(([k, c]) => `${k} ${c}`).join(', ') || 'none'}.
Co-authors: ${f.agents.map(([a, c]) => `${a} ${c}`).join(', ') || 'none'}.
New blog posts: ${f.new_posts}${f.new_post_tags.length ? ` (top tags: ${f.new_post_tags.map(([t, c]) => `${t} ${c}`).join(', ')})` : ''}.

## New this window

Products:
${list(f.new_ventures, (v) => `- ventures/${v}`)}

Research projects:
${list(f.new_research, (r) => `- research/${r}`)}

## Flagships (portfolio/flagships.yaml order) against their \`next\`

${f.flagships.map((x) => `${x.rank}. **${x.name}**: ${x.merges} merges${x.top.length ? `\n${x.top.map((t) => `   - ${t.ref} ${t.title} (${t.lines} lines)`).join('\n')}` : ''}`).join('\n') || '- no flagships file'}

## Where the merges went (busiest areas, biggest merges first)

${f.areas.slice(0, 15).map((a) => `- **${a.kind}: ${a.name}**, ${a.merges} merges, ${a.lines} lines${a.flagship_rank ? ` (flagship ${a.flagship_rank})` : ''}\n${a.top.map((t) => `  - ${t.ref} ${t.title}${t.detail ? `: ${t.detail}` : ''}`).join('\n')}`).join('\n')}

## Biggest single merges

${list(f.biggest, (b) => `- ${b.ref} ${b.title} (${b.area}, ${b.lines} lines)`)}

## Reverts and fix-forwards

${list([...f.reverts.map((r) => ({ ...r, k: 'revert' })), ...f.fix_forwards.map((r) => ({ ...r, k: 'fix-forward' }))], (r) => `- ${r.k}: ${r.ref} ${r.title}`)}

## Runs (prompts/runs/*.json dated in the window)

${f.runs.runs} records. Tracks: ${f.runs.by_track.map(([k, c]) => `${k} ${c}`).join(', ') || 'none'}. Outcomes: ${f.runs.by_outcome.map(([k, c]) => `${k} ${c}`).join(', ') || 'none'}.
API-equivalent cost: ${f.runs.api_usd == null ? 'not recorded' : `$${f.runs.api_usd}`} from ${f.runs.measured} of ${f.runs.runs} records that report it; active minutes ${n(f.runs.active_minutes)}.
Most-named friction: ${f.runs.friction.slice(0, 5).map((x) => `${x.file} (${x.n})`).join(', ') || 'none'}.

Notes from runs (first ${f.runs.notes.length}):
${list(f.runs.notes, (x) => `- ${x.replace(/\s+/g, ' ').slice(0, 300)}`)}
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const end = arg('end') ?? dayOf(startOf(dayOf(Date.now())) - DAY);
  const win = windowOf(arg('cadence') ?? 'daily', end);
  const gitRef = arg('ref') ?? 'origin/main';
  const read = readMerges(repo, { since: startOf(win.first), until: startOf(win.last) + DAY, ref: gitRef });
  if (!read.available) {
    console.error(`no git history: ${read.reason}`);
    process.exit(1);
  }
  const flagFile = path.join(repo, 'portfolio', 'flagships.yaml');
  const flagships = existsSync(flagFile) ? readFlagships(readFileSync(flagFile, 'utf8')) : [];
  const postsDir = path.join(repo, 'docs', 'posts');
  const posts = existsSync(postsDir)
    ? readdirSync(postsDir).filter((n) => n.endsWith('.md')).map((n) => ({ slug: n.slice(0, -3), tags: frontMatter(readFileSync(path.join(postsDir, n), 'utf8')).tags }))
    : [];
  const facts = progressFacts(win, read.merges, readRuns(repo), { flagships, posts, previous: previousEdition(postsDir, win.tag) });
  if (read.merges.length && dayOf(read.merges[0].at) > win.first) {
    console.error(`warning: the oldest merge read is ${dayOf(read.merges[0].at)}; fetch more history (git fetch origin main --shallow-since=${win.first}) if the window looks short`);
  }
  process.stdout.write(process.argv.includes('--json') ? `${JSON.stringify(facts, null, 1)}\n` : renderFacts(facts));
}
