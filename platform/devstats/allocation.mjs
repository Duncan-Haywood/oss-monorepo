// Where agent runs go: effort by period, by track and by project, and where
// the next runs are headed. Part of the development dashboard (dev/ on the
// site); render.mjs draws it, devstats.mjs's collect() calls it.
//
// Sources, all files in the checkout:
//   - prompts/runs/*.json: one record per agent run (date, track, projects, pr).
//     Records mirrored from the upstream research repo (they carry `source`)
//     are not runs of this repository and are left out.
//   - git log --first-parent: each run's PR number is matched to its merge
//     subject ("chant-forge: ... (#12884)"), whose prefix names the project,
//     for the many records that leave `projects` empty.
//   - prompts/routing.json: the weights `promptctl.py route` draws tracks by.
//   - portfolio/requests/requests.json, portfolio/flagships.yaml and
//     research/PROGRAMMES.md: the order product and research runs take work
//     in (prompt.md), parsed with the same functions as the queue/ page.
//
//   - failing both, the ventures/ or research/ directory the record's text
//     names most often.
// A run whose project cannot be told from any source counts as
// "unattributed", never as some project's.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { orderRequests, parseFlagships, parseProgrammes, requestDir, clip } from '../pages/queue.mjs';

const DAY = 86_400_000;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/** The periods every table reports, newest first. `from` is the first UTC date counted; null means all records. */
export function periods(now) {
  return [
    { key: 'today', label: 'Today (UTC)', from: dayOf(now) },
    { key: '7d', label: '7 days', from: dayOf(now - 6 * DAY) },
    { key: '30d', label: '30 days', from: dayOf(now - 29 * DAY) },
    { key: 'all', label: 'All records', from: null },
  ];
}

/** Tracks drawn in the daily chart; the rest fold into "other". */
export const CHART_TRACKS = ['ventures', 'research', 'creative', 'process', 'redteam'];

/** PR number from a record's `pr` (a number, a "#123" string or a pull URL), or null. */
export function prNumber(pr) {
  if (Number.isInteger(pr) && pr > 0) return pr;
  const m = /(?:^#?|\/pull\/)(\d+)\s*$/.exec(String(pr ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * The project a label names, as `ventures/<slug>`, `research/<slug>` or a
 * repository path or area (`platform/pages`, `polish`); null when the label
 * is not one. A bare slug becomes `ventures/` or `research/` only when that
 * directory exists (`known` holds those two sets of slugs).
 */
export function areaOf(label, known = { ventures: new Set(), research: new Set() }) {
  const l = String(label ?? '').trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (!l) return null;
  const full = /^(ventures|research)\/([a-z0-9][a-z0-9._-]*)/.exec(l);
  if (full) return `${full[1]}/${full[2]}`;
  if (!/^[a-z0-9][a-z0-9/._-]*$/i.test(l) || l.length > 48) return null;
  const head = l.split('/')[0];
  if (known.ventures.has(head)) return `ventures/${head}`;
  if (known.research.has(head)) return `research/${head}`;
  return l.toLowerCase();
}

/** Which portfolio an area belongs to. */
export function portfolioOf(area) {
  if (!area) return 'unattributed';
  if (area.startsWith('ventures/')) return 'products';
  if (area.startsWith('research/')) return 'research';
  return 'platform';
}

/** The project prefix of a merge subject ("chant-forge: --lrc ... (#12884)"), or null. */
export function subjectPrefix(subject) {
  const m = /^([A-Za-z0-9][A-Za-z0-9/._-]*)(?:\s*\([^)]*\))?:\s/.exec(String(subject ?? ''));
  return m ? m[1] : null;
}

/** PR number to merge subject, from first-parent history; `span` is the oldest date it reaches. */
export function mergeSubjects(repo, { now = Date.now(), days = 120 } = {}) {
  let out = '';
  try {
    out = execFileSync('git', ['-C', repo, 'log', 'HEAD', '--first-parent', `--since=${new Date(now - days * DAY).toISOString()}`, '--format=%ct%x09%s'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return { byPr: new Map(), merges: [], from: null };
  }
  const byPr = new Map();
  const merges = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [ct, subject] = line.split('\t');
    const at = Number(ct) * 1000;
    merges.push({ at, subject });
    const m = /\(#(\d+)\)\s*$/.exec(subject) ?? /^Merge pull request #(\d+)/.exec(subject);
    if (m && !byPr.has(Number(m[1]))) byPr.set(Number(m[1]), subject);
  }
  return { byPr, merges, from: merges.length ? dayOf(merges[merges.length - 1].at) : null };
}

/** Run records of this repository, dated, not after today. */
export function loadRecords(repo, { now = Date.now() } = {}) {
  const dir = path.join(repo, 'prompts', 'runs');
  if (!existsSync(dir)) return null;
  const today = dayOf(now);
  const recs = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const r = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
      if (r && typeof r === 'object' && !r.source && /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '') && r.date <= today) recs.push(r);
    } catch {
      // promptctl validate reports malformed records.
    }
  }
  return recs;
}

function knownSlugs(repo) {
  const dirs = (d) => (existsSync(path.join(repo, d)) ? new Set(readdirSync(path.join(repo, d), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) : new Set());
  return { ventures: dirs('ventures'), research: dirs('research') };
}

/**
 * Attribute each record to projects: its own `projects` list when it has one,
 * else the prefix of its PR's merge subject, else none. Returns
 * [{ date, track, areas: [..], via: 'record' | 'merge' | null }].
 */
export function attribute(recs, { byPr = new Map(), known } = {}) {
  return recs.map((r) => {
    const own = (Array.isArray(r.projects) ? r.projects : []).map((p) => areaOf(p, known)).filter(Boolean);
    if (own.length) return { date: r.date, track: r.track ?? 'unknown', areas: [...new Set(own)], via: 'record' };
    const n = prNumber(r.pr);
    const area = n && byPr.has(n) ? areaOf(subjectPrefix(byPr.get(n)), known) : null;
    if (area) return { date: r.date, track: r.track ?? 'unknown', areas: [area], via: 'merge' };
    const named = mentioned(r, known);
    return { date: r.date, track: r.track ?? 'unknown', areas: named ? [named] : [], via: named ? 'mention' : null };
  });
}

/**
 * The project directory a record's task, goal, notes and write-ups name most
 * often (`ventures/<slug>` or `research/<slug>` that exists), or null. The
 * weakest of the three sources, so it is used last and counted apart.
 */
export function mentioned(r, known = { ventures: new Set(), research: new Set() }) {
  const text = [r.task, r.goal, r.notes, ...(Array.isArray(r.writeups) ? r.writeups : [])].filter((x) => typeof x === 'string').join(' ');
  const counts = new Map();
  for (const m of text.matchAll(/\b(ventures|research)\/([a-z0-9][a-z0-9-]*)/g)) {
    if (!known[m[1]]?.has(m[2])) continue;
    const k = `${m[1]}/${m[2]}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = null;
  for (const [k, n] of counts) if (!best || n > best[1]) best = [k, n];
  return best ? best[0] : null;
}

function share(counts, total) {
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, { runs: n, share: total ? round(n / total) : null }]));
}

/** Tallies for one period: runs, by track, by portfolio, by project (a run on two projects counts half to each). */
export function tally(rows, from) {
  const inP = rows.filter((r) => from == null || r.date >= from);
  const track = {};
  const portfolio = {};
  const project = {};
  let attributed = 0;
  const via = { record: 0, merge: 0, mention: 0 };
  for (const r of inP) {
    track[r.track] = (track[r.track] ?? 0) + 1;
    if (r.areas.length) attributed += 1;
    if (r.via) via[r.via] += 1;
    const w = r.areas.length ? 1 / r.areas.length : 1;
    for (const a of r.areas.length ? r.areas : [null]) {
      const p = portfolioOf(a);
      portfolio[p] = (portfolio[p] ?? 0) + w;
      if (a) project[a] = (project[a] ?? 0) + w;
    }
  }
  const roundAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v, 1)]));
  return {
    runs: inP.length,
    attributed,
    attributed_via: via,
    days: new Set(inP.map((r) => r.date)).size,
    by_track: share(track, inP.length),
    by_portfolio: share(roundAll(portfolio), inP.length),
    by_project: share(roundAll(project), inP.length),
  };
}

/** Runs per day by track over the last `days` days, the tracks outside CHART_TRACKS folded into "other". */
export function dailyByTrack(rows, now, days = 30) {
  const out = {};
  for (let i = days - 1; i >= 0; i -= 1) out[dayOf(now - i * DAY)] = Object.fromEntries([...CHART_TRACKS, 'other'].map((t) => [t, 0]));
  for (const r of rows) {
    if (!(r.date in out)) continue;
    const t = CHART_TRACKS.includes(r.track) ? r.track : 'other';
    out[r.date][t] += 1;
  }
  return out;
}

/**
 * Where the next runs go. Track shares are routing.json's weights (expired
 * and zero tracks dropped, review excluded: it is drawn when due, not by
 * weight), set beside the share each track actually got in the last 7 days.
 * The forecast multiplies the weights by the run rate of the last 7 full days.
 */
export function forecast({ routing, rows, now, lanes }) {
  if (!routing?.tracks) return { available: false, reason: 'no prompts/routing.json' };
  const today = dayOf(now);
  const weights = Object.fromEntries(
    Object.entries(routing.tracks).filter(([t, c]) => t !== 'review' && Number(c.weight) > 0 && !(c.until && today > c.until)).map(([t, c]) => [t, Number(c.weight)]),
  );
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const weekFrom = dayOf(now - 7 * DAY);
  const week = rows.filter((r) => r.date >= weekFrom && r.date < today);
  const rate = week.length / 7;
  const recent = rows.filter((r) => r.date >= dayOf(now - 6 * DAY));
  const routed = recent.filter((r) => r.track !== 'review');
  const actual = {};
  for (const r of routed) actual[r.track] = (actual[r.track] ?? 0) + 1;

  // Review: due after `review_every` non-review runs since the last review run (by date, so approximate).
  const lastReview = rows.filter((r) => r.track === 'review').map((r) => r.date).sort().pop() ?? null;
  const since = rows.filter((r) => r.track !== 'review' && (lastReview == null || r.date > lastReview)).length;
  const every = Number(routing.review_every) || null;

  const tracks = Object.keys({ ...weights, ...actual })
    .map((t) => {
      const planned = weights[t] ? weights[t] / total : 0;
      const got = routed.length ? (actual[t] ?? 0) / routed.length : null;
      return {
        track: t,
        planned_share: round(planned),
        actual_share_7d: round(got),
        gap: got == null ? null : round(got - planned),
        expected_next_24h: round(rate * planned, 0),
        expected_next_7d: round(rate * planned * 7, 0),
        until: routing.tracks[t]?.until ?? null,
      };
    })
    .sort((a, b) => b.planned_share - a.planned_share || (b.actual_share_7d ?? 0) - (a.actual_share_7d ?? 0));
  const expiring = Object.entries(routing.tracks).filter(([, c]) => c.until && today <= c.until).map(([t, c]) => ({ track: t, until: c.until }));
  return {
    available: true,
    runs_per_day: round(rate, 0),
    rate_note: 'mean of the last 7 full UTC days',
    tracks,
    expiring,
    review: { every, runs_since_last: since, last: lastReview, due: every != null && since >= every, note: 'counted by record date, so a same-day review is approximate; promptctl.py route sends a due review to a share of runs' },
    lanes,
  };
}

/** The first items of the product and research lanes, each with the runs it got in the last 7 days. */
export function lanes(repo, rows, now) {
  const read = (p) => { try { return readFileSync(path.join(repo, p), 'utf8'); } catch { return null; } };
  let requests = null;
  try { requests = orderRequests(JSON.parse(read('portfolio/requests/requests.json') ?? 'null')?.requests); } catch { requests = null; }
  const flagships = parseFlagships(read('portfolio/flagships.yaml'));
  const programmes = parseProgrammes(read('research/PROGRAMMES.md'));
  const from7 = dayOf(now - 6 * DAY);
  const from30 = dayOf(now - 29 * DAY);
  const count = (area, from) => rows.reduce((a, r) => a + (r.date >= from && r.areas.includes(area) ? 1 / r.areas.length : 0), 0);
  const item = (lane, area, title, next) => ({ lane, area, title, next: next ? clip(next, 200) : null, runs_7d: area ? round(count(area, from7), 1) : null, runs_30d: area ? round(count(area, from30), 1) : null });
  const product = [];
  if (requests) for (const r of [...requests.outside, ...requests.owner]) product.push(item(`Request ${r.id ?? ''} (${r.status})`.trim(), requestDir(r), r.title, r.next));
  (flagships ?? []).forEach((f, i) => product.push(item(`Flagship ${i + 1}`, `ventures/${f.venture}`, f.venture, f.next)));
  const research = (programmes ?? []).map((p) => item('Programme', `research/${p.slug}`, p.slug, p.question));
  return {
    product: requests || flagships ? product : null,
    research: programmes ? research : null,
    note: 'Product runs take open website requests first, then flagships in file order (prompt.md); research runs pick among open programmes. Runs are attributed as in the tables above.',
  };
}

/** Everything the dashboard's allocation sections show. */
export function fromAllocation(repo, { now = Date.now() } = {}) {
  const recs = loadRecords(repo, { now });
  if (!recs) return { available: false, reason: 'no prompts/runs' };
  const subjects = mergeSubjects(repo, { now });
  const rows = attribute(recs, { byPr: subjects.byPr, known: knownSlugs(repo) });
  let routing = null;
  try { routing = JSON.parse(readFileSync(path.join(repo, 'prompts', 'routing.json'), 'utf8')); } catch { routing = null; }
  const ps = periods(now);
  const first = recs.map((r) => r.date).sort()[0] ?? null;
  return {
    available: true,
    first_record: first,
    merge_history_from: subjects.from,
    attribution_note: `A run counts toward a project from its record's projects list; else from the prefix of its PR's merge subject; else from the ventures/ or research/ directory its task, goal, notes and write-ups name most (the weakest source, counted apart). Merge history in this build reaches back to ${subjects.from ?? 'nothing'}, so older runs lean on the other two. A run on two projects counts half to each.`,
    periods: ps.map((p) => ({ ...p, ...tally(rows, p.from) })),
    daily_by_track: dailyByTrack(rows, now, 30),
    next: forecast({ routing, rows, now, lanes: lanes(repo, rows, now) }),
  };
}
