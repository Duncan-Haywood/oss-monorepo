/**
 * The open book: what this repository shipped, what is in progress, where it
 * is going and how it is built, as two indexed pages on the Pages site.
 *
 *   updates/     the overview: this week in numbers, highlights, the research
 *                log, work in progress, the owner's direction, the process
 *   changelog/   every merge to main the build can see, by day, filterable by
 *                area, with an Atom feed (changelog/feed.xml)
 *
 *   node platform/pages/updates.mjs --out=dist [--base-url=https://…/]
 *
 * `build.mjs` calls `buildUpdates` on every site build, after the research
 * pages, so a merge can link the tool or research page it changed.
 *
 * Every line is read from something committed, never typed:
 *
 *   git log --first-parent         what landed on main (engineering.mjs's loadMerges)
 *   research/*\/LOG.md             dated research log entries
 *   platform/pages/launched.json   when each tool first shipped
 *   prompts/runs/*.json            agent sessions and what they cost
 *   prompts/goals.md               the owner's mission, goals and directions
 *   prompts/process/backlog/*.json open process improvements
 *   portfolio/ledger/decision_queue.py --json   what waits on the owner
 *   dev/stats.json (same origin, in the browser) the open pull requests
 *
 * The open pull requests are the one live section. `publish-branch.sh` writes
 * `dev/stats.json` after this build, with the GitHub token the build itself
 * does not have, so the page reads it from its own site when it loads. No
 * third-party request: a visitor's browser only ever talks to this site.
 *
 * A source that cannot be read renders as "not available in this build",
 * never as zero or an empty week. A shallow checkout says how far back its
 * history goes.
 */
import { promises as fs, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, inline, REPO_BLOB, REPO_PULL } from '../devlog/markdown.mjs';
import { loadMerges, loadRuns, runSpend } from './engineering.mjs';
import { REPO_URL, SITE_NAME, renderSiteFooterNav, withSiteHeader } from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const UPDATES_PATH = 'updates/';
export const CHANGELOG_PATH = 'changelog/';

/** How far back the changelog reaches, when the history goes that far. */
export const CHANGELOG_DAYS = 14;
/** Enough first-parent commits for CHANGELOG_DAYS at ~100-150 merges a day. */
export const CHANGELOG_MERGES = 2500;
export const FEED_ENTRIES = 60;

const DAY = 86400000;

/** The areas a merge is filed under, in the order a visitor cares about. */
export const KINDS = Object.freeze([
  Object.freeze({ id: 'tools', label: 'Tools', blurb: 'new and improved products' }),
  Object.freeze({ id: 'research', label: 'Research', blurb: 'studies, results and write-ups' }),
  Object.freeze({ id: 'site', label: 'Website', blurb: 'the public site and its pages' }),
  Object.freeze({ id: 'platform', label: 'Platform & process', blurb: 'agents, checks, CI and prompts' }),
]);
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));

// ---------------------------------------------------------------- loading --

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * File a merge under one area. A merge that touched a product is a product
 * change even when it also touched the site generator; then research, then
 * the site, then everything else.
 */
export function kindOf(files) {
  if (files.some((f) => /^ventures\/[^/_.][^/]*\//.test(f))) return 'tools';
  if (files.some((f) => /^research\/[^/_.][^/]*\//.test(f))) return 'research';
  if (files.some((f) => /^(platform\/(pages|devstats|devlog|deploy|marketing)\/|research\/_homepage\/|docs\/posts\/)/.test(f))) return 'site';
  return 'platform';
}

/** A merge subject worth listing: not main merged into itself, not a bare revert of nothing. */
export function isListable(merge) {
  return Boolean(merge.title) && !/^Merge (remote-tracking )?branch /.test(merge.title);
}

/**
 * The changelog entries: merges to main, newest first, each with its area and
 * links to the published pages it changed. `published` is the set of venture
 * slugs this build published, `researchSlugs` the research pages it wrote.
 * Returns null when there is no history to read.
 */
export function changelogEntries(merges, { published = new Set(), researchSlugs = new Set(), titles = new Map(), now = Date.now(), days = CHANGELOG_DAYS } = {}) {
  if (!merges) return null;
  const cutoff = new Date(now - days * DAY).toISOString().slice(0, 10);
  const out = [];
  for (const m of merges) {
    if (m.date < cutoff) break;
    if (!isListable(m)) continue;
    const pages = [];
    const seen = new Set();
    for (const f of m.files) {
      const v = /^ventures\/([^/_.][^/]*)\//.exec(f);
      if (v && published.has(v[1]) && !seen.has(`v:${v[1]}`)) {
        seen.add(`v:${v[1]}`);
        pages.push({ href: `${v[1]}/`, label: titles.get(v[1]) || v[1], kind: 'tool' });
      }
      const r = /^research\/([^/_.][^/]*)\//.exec(f);
      if (r && researchSlugs.has(r[1]) && !seen.has(`r:${r[1]}`)) {
        seen.add(`r:${r[1]}`);
        pages.push({ href: `research/${r[1]}/`, label: r[1], kind: 'research' });
      }
    }
    const projects = [...new Set(m.files.map((f) => /^research\/([^/_.][^/]*)\//.exec(f)?.[1]).filter(Boolean))];
    out.push({ sha: m.sha, date: m.date, pr: m.pr, title: m.title, kind: kindOf(m.files), pages: pages.slice(0, 4), projects });
  }
  return out;
}

/**
 * Research projects changed in the window, most recently active first: how
 * many merges touched each, and the newest one's title.
 */
export function activeResearch(entries) {
  const by = new Map();
  for (const e of entries ?? []) {
    for (const slug of e.projects ?? []) {
      const row = by.get(slug);
      if (row) row.changes += 1;
      else by.set(slug, { slug, changes: 1, latest: e });
    }
  }
  return [...by.values()];
}

/** Dated entries from every research/<slug>/LOG.md, newest first. */
export function loadResearchLog(root) {
  const dir = path.join(root, 'research');
  if (!existsSync(dir)) return [];
  const logs = [];
  for (const slug of readdirSync(dir)) {
    const file = path.join(dir, slug, 'LOG.md');
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/^## (\d{4}-\d{2}-\d{2})\s*[·\-–—:]\s*(.+)$/gm)) {
      logs.push({ slug, date: m[1], title: m[2].trim() });
    }
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/**
 * The owner's direction, from `prompts/goals.md`: the mission's opening, and
 * for each "Long-term goal:" and "Direction:" section a summary paragraph and
 * the bold lead of each standing instruction inside it. The summary skips a
 * paragraph that is a verbatim quote (the owner's own words stay in the file,
 * linked), and drops the "Set by the owner on <date>." preamble into `set`.
 */
export function parseDirection(src) {
  if (!src) return null;
  const text = String(src).replace(/\r\n?/g, '\n');
  const sections = [];
  for (const block of text.split(/^## /m).slice(1)) {
    const nl = block.indexOf('\n');
    const heading = block.slice(0, nl).trim();
    const m = /^(Long-term goal|Direction):\s*(.+)$/.exec(heading);
    if (!m) continue;
    const paras = block
      .slice(nl + 1)
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter((p) => p && !p.startsWith('#'));
    let set = '';
    let summary = '';
    for (const p of paras) {
      const s = /^Set by the owner on (\d{4}-\d{2}-\d{2})[.:]?\s*/.exec(p);
      if (s && !set) set = s[1];
      const rest = s ? p.slice(s[0].length) : p;
      if (!rest || /^["“]/.test(rest) || /:\s*"/.test(rest.slice(0, 200)) || /^\*\*/.test(rest) || /^[-*] /.test(rest)) continue;
      summary = rest;
      break;
    }
    const leads = [];
    for (const p of paras) {
      const b = /^\*\*([^*]+)\*\*(?:\s*\((?:the owner, )?(\d{4}-\d{2}-\d{2})\))?/.exec(p);
      if (b) leads.push({ text: b[1].replace(/[.:]$/, ''), date: b[2] || '' });
    }
    sections.push({ kind: m[1], title: m[2].trim(), set, summary, leads });
  }
  return sections;
}

/**
 * The mission's pillars from `prompts/goals.md`: each top-level bullet under
 * "## Mission" written as `- **Name** (where): first sentence…`.
 */
export function parseMission(src) {
  if (!src) return [];
  const block = /^## Mission\n([\s\S]*?)(?=^## )/m.exec(String(src).replace(/\r\n?/g, '\n'));
  if (!block) return [];
  const out = [];
  for (const m of block[1].matchAll(/^- \*\*([^*]+)\*\*(?: \(([^)]*)\))?:?\s*([\s\S]*?)(?=^- |^\S|$(?![\s\S]))/gm)) {
    const text = m[3].replace(/\s*\n\s*/g, ' ').trim();
    const sentence = /^[\s\S]*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
    out.push({ name: m[1].trim(), where: (m[2] || '').trim(), text: sentence });
  }
  return out;
}

function loadDecisions(root) {
  try {
    const out = execFileSync('python3', [path.join(root, 'portfolio', 'ledger', 'decision_queue.py'), '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const rows = JSON.parse(out);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function loadBacklog(root) {
  const dir = path.join(root, 'prompts', 'process', 'backlog');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^P\d+.*\.json$/.test(f))
    .sort()
    .map((f) => ({ file: f, ...(readJson(path.join(dir, f)) ?? {}) }))
    .filter((p) => p.id);
}

function historyStart(root) {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return shallow === 'true';
  } catch {
    return null;
  }
}

/** Everything the two pages read, in one object (the tests build their own). */
export function loadUpdates(root = DEFAULT_ROOT, { published = new Set(), researchSlugs = new Set(), titles = new Map(), now = Date.now() } = {}) {
  const goals = existsSync(path.join(root, 'prompts', 'goals.md')) ? readFileSync(path.join(root, 'prompts', 'goals.md'), 'utf8') : null;
  const merges = loadMerges(root, CHANGELOG_MERGES);
  return {
    now,
    // History may end inside the window: a shallow checkout, or the merge cap.
    shallow: historyStart(root) || (merges?.length ?? 0) >= CHANGELOG_MERGES,
    entries: changelogEntries(merges, { published, researchSlugs, titles, now }),
    researchLog: loadResearchLog(root),
    researchSlugs,
    launched: readJson(path.join(root, 'platform', 'pages', 'launched.json'))?.launched ?? {},
    published,
    titles,
    runs: loadRuns(root),
    direction: parseDirection(goals),
    mission: parseMission(goals),
    backlog: loadBacklog(root),
    decisions: loadDecisions(root),
  };
}

// ------------------------------------------------------------ summarising --

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function summarise(data) {
  const today = isoDay(data.now);
  const weekAgo = isoDay(data.now - 7 * DAY);
  const entries = data.entries ?? [];
  const week = entries.filter((e) => e.date > weekAgo);
  const byKind = Object.fromEntries(KINDS.map((k) => [k.id, week.filter((e) => e.kind === k.id).length]));
  const launchedWeek = Object.entries(data.launched)
    .filter(([slug, date]) => date > weekAgo && date <= today && data.published.has(slug))
    .sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]));
  const runsWeek = data.runs.filter((r) => r.date > weekAgo && r.date <= today);
  const spend = runsWeek.reduce((sum, r) => sum + (runSpend(r) ?? 0), 0);
  const costed = runsWeek.filter((r) => runSpend(r) != null).length;
  const researchWeek = activeResearch(week);
  const oldest = entries.length ? entries[entries.length - 1].date : null;
  return {
    today,
    weekAgo,
    merges: data.entries ? week.length : null,
    byKind,
    launchedWeek,
    runsWeek: runsWeek.length,
    spend,
    costed,
    researchWeek: researchWeek.length,
    oldest,
    // A shallow checkout that ends inside the window cannot vouch for the days before it.
    truncated: Boolean(data.shallow && oldest && oldest > isoDay(data.now - CHANGELOG_DAYS * DAY)),
  };
}

// -------------------------------------------------------------- rendering --

const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const STYLE = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#1b2129; --muted:#56616f; --line:#dde3ea; --accent:#1f56c9; --soft:#eef2f8;
    --k-tools:#12594a; --k-research:#7a3fb0; --k-site:#1f56c9; --k-platform:#6b5300; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542;
    --accent:#8fb0ff; --soft:#1c2531; --k-tools:#7fd8c0; --k-research:#d2b0f5; --k-site:#8fb0ff; --k-platform:#e7c76a; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:960px; margin:0 auto; padding:24px 16px 72px; --pf-hero-pull:24px; }
  a { color:var(--accent); }
  h1 { font-size:2.1rem; line-height:1.15; margin:.3em 0 .25em; letter-spacing:-.015em; }
  h2 { font-size:1.4rem; margin:2.2em 0 .5em; letter-spacing:-.01em; }
  h3 { font-size:1.05rem; margin:1.4em 0 .4em; }
  .dek { font-size:1.12rem; color:var(--muted); margin:0 0 1em; max-width:46em; }
  .muted, .note { color:var(--muted); } .note { font-size:.88rem; }
  .jump { display:flex; flex-wrap:wrap; gap:8px; margin:1.2em 0 0; padding:0; list-style:none; }
  .jump a { display:inline-block; padding:5px 12px; border:1px solid var(--line); border-radius:999px; background:var(--panel);
    text-decoration:none; color:var(--ink); font-size:.9rem; }
  .jump a:hover { border-color:var(--accent); }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap:12px; margin:1em 0; }
  @media (max-width:600px) { .tiles { grid-template-columns:repeat(2, minmax(0, 1fr)); } .tile b { font-size:1.6rem; } }
  .tile { position:relative; overflow:hidden; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px 15px;
    transition:transform .18s, border-color .18s, box-shadow .18s; }
  .tile::before { content:""; position:absolute; left:0; right:0; top:0; height:3px; background:linear-gradient(90deg,#1f4e8c,#3a6ea5,#5b7799); }
  .tile:hover { transform:translateY(-2px); border-color:var(--accent); box-shadow:0 10px 28px rgba(20,30,60,.10); }
  .tile b { display:block; font-size:2rem; line-height:1.1; letter-spacing:-.025em; font-variant-numeric:tabular-nums; }
  .tile span { display:block; margin-top:4px; font-size:.86rem; line-height:1.4; color:var(--muted); }
  .card { transition:border-color .18s; } .card:hover { border-color:var(--accent); }
  .pf-hero h1 { font-size:clamp(2rem,4.6vw,2.8rem); } .pf-hero .jump a { background:var(--panel); color:var(--ink); border-color:var(--line); }
  .pf-hero .jump a:hover { border-color:var(--accent); }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin:0 0 14px; }
  .cols { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; }
  .cols .card { margin:0; }
  .log { list-style:none; margin:0; padding:0; }
  .log li { padding:9px 0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
  .log li:last-child { border-bottom:0; }
  .pill { display:inline-block; font-size:.72rem; font-weight:650; letter-spacing:.02em; text-transform:uppercase;
    border:1px solid currentColor; border-radius:999px; padding:0 7px; margin-right:6px; vertical-align:1px; white-space:nowrap; }
  .k-tools { color:var(--k-tools); } .k-research { color:var(--k-research); } .k-site { color:var(--k-site); } .k-platform { color:var(--k-platform); }
  .meta { font-size:.82rem; color:var(--muted); }
  .meta a { color:inherit; }
  .goto { font-size:.88rem; margin-left:4px; }
  .day { margin:1.8em 0 .3em; font-size:1.05rem; display:flex; flex-wrap:wrap; gap:4px 12px; align-items:baseline; }
  .day small { font-weight:400; color:var(--muted); font-size:.85rem; }
  .filters { display:flex; flex-wrap:wrap; gap:8px; margin:1em 0; }
  .filters button { font:inherit; font-size:.9rem; padding:6px 12px; border-radius:999px; border:1px solid var(--line);
    background:var(--panel); color:var(--ink); cursor:pointer; }
  .filters button[aria-pressed="true"] { border-color:var(--accent); background:var(--soft); font-weight:650; }
  .goal h3 { margin-top:0; }
  .goal ul { margin:.4em 0 0; padding-left:1.2em; }
  .steps { counter-reset:step; list-style:none; padding:0; margin:0; }
  .steps li { position:relative; padding:0 0 12px 40px; }
  .steps li::before { counter-increment:step; content:counter(step); position:absolute; left:0; top:0; width:28px; height:28px;
    border-radius:50%; background:var(--soft); border:1px solid var(--line); display:grid; place-items:center; font-weight:700; font-size:.9rem; }
  details summary { cursor:pointer; color:var(--accent); }
  footer { margin-top:3em; font-size:.82rem; color:var(--muted); }
  [hidden] { display:none !important; }
`;

function shell({ title, description, canonical, toRoot, current, body, jsonLd, feedHref, socialCard, script = '' }) {
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)}: changelog" href="${esc(feedHref)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}${socialCard ? `<meta property="og:image" content="${esc(socialCard)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="${socialCard ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<main>
${body}
</main>
<footer>
  <p>Generated on every publish from the <a href="${REPO_URL}">repository</a>: merge history, research logs, run records and the
  owner's goals file. Nothing on this page is typed by hand. Provided as-is, with no warranty of accuracy or completeness,
  and not advice of any kind. MIT-licensed, like everything here.</p>
  ${renderSiteFooterNav({ toRoot })}
</footer>
</div>
${script}
</body>
</html>
`, { toRoot, current });
}

function entryHtml(e, toRoot, { pill = true } = {}) {
  const pr = e.pr ? `<a href="${REPO_PULL}${e.pr}">#${e.pr}</a>` : `<a href="${REPO_URL}/commit/${esc(e.sha)}">${esc(e.sha.slice(0, 7))}</a>`;
  const pages = e.pages
    .map((p) => `<a class="goto" href="${esc(toRoot + p.href)}">${p.kind === 'tool' ? 'Open' : 'Read'} ${esc(p.label)} →</a>`)
    .join(' ');
  return `<li data-kind="${e.kind}">${pill ? `<span class="pill k-${e.kind}">${esc(KIND_LABEL[e.kind])}</span>` : ''}${inline(e.title, '', { linkPrs: false })}
<span class="meta"> · ${pr}</span>${pages ? `<br>${pages}` : ''}</li>`;
}

function unavailable(what) {
  return `<p class="note">${esc(what)} is not available in this build.</p>`;
}

/** Group entries by day, newest first. */
export function byDay(entries) {
  const days = new Map();
  for (const e of entries) {
    if (!days.has(e.date)) days.set(e.date, []);
    days.get(e.date).push(e);
  }
  return [...days.entries()];
}

function historyNote(s) {
  if (!s.oldest) return '';
  return s.truncated
    ? `<p class="note">This build could read history back to ${esc(longDate(s.oldest))}; older merges are on
<a href="${REPO_URL}/commits/main">GitHub</a>.</p>`
    : '';
}

export function renderChangelog(data, { baseUrl = '', socialCard = '' } = {}) {
  const s = summarise(data);
  const canonical = baseUrl ? `${baseUrl}${CHANGELOG_PATH}` : '';
  const toRoot = '../';
  const entries = data.entries;
  const counts = Object.fromEntries(KINDS.map((k) => [k.id, (entries ?? []).filter((e) => e.kind === k.id).length]));
  const days = entries ? byDay(entries) : [];
  const list = days
    .map(([day, items]) => {
      const tally = KINDS.filter((k) => items.some((e) => e.kind === k.id))
        .map((k) => `${items.filter((e) => e.kind === k.id).length} ${k.label.toLowerCase()}`)
        .join(', ');
      return `<section data-day="${day}">
<h2 class="day" id="d-${day}"><time datetime="${day}">${esc(longDate(day))}</time> <small>${items.length} merged: ${esc(tally)}</small></h2>
<ul class="log">
${items.map((e) => entryHtml(e, toRoot)).join('\n')}
</ul>
</section>`;
    })
    .join('\n');
  const filters = `<div class="filters" role="group" aria-label="Show changes in">
<button type="button" data-filter="all" aria-pressed="true">Everything (${(entries ?? []).length})</button>
${KINDS.map((k) => `<button type="button" data-filter="${k.id}" aria-pressed="false">${esc(k.label)} (${counts[k.id]})</button>`).join('\n')}
</div>`;
  // Progressive: without JavaScript every entry shows. The filter only hides.
  const script = `<script>
(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const apply = (kind) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.filter === kind));
    for (const li of document.querySelectorAll('li[data-kind]')) li.hidden = kind !== 'all' && li.dataset.kind !== kind;
    for (const sec of document.querySelectorAll('section[data-day]')) sec.hidden = !sec.querySelector('li[data-kind]:not([hidden])');
    try { history.replaceState(null, '', kind === 'all' ? location.pathname : '#' + kind); } catch {}
  };
  for (const b of buttons) b.addEventListener('click', () => apply(b.dataset.filter));
  const start = location.hash.slice(1);
  if (buttons.some((b) => b.dataset.filter === start)) apply(start);
})();
</script>`;
  return shell({
    title: `Changelog: what shipped, day by day · ${SITE_NAME}`,
    description: `Every change merged into the repository in the last ${CHANGELOG_DAYS} days, by day: new free tools, research results, website and platform updates.`,
    canonical,
    socialCard,
    toRoot,
    current: 'updates',
    feedHref: 'feed.xml',
    script,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${SITE_NAME}: changelog`,
      description: 'Every change merged into the repository, by day.',
      url: canonical || undefined,
      dateModified: entries?.[0]?.date,
      isPartOf: baseUrl ? { '@type': 'WebSite', name: SITE_NAME, url: baseUrl } : undefined,
    },
    body: `<header class="pf-hero"><p class="meta"><a href="../${UPDATES_PATH}">Updates</a> › Changelog</p>
<h1>Changelog</h1>
<p class="dek">Everything merged into the <a href="${REPO_URL}">repository</a> in the last ${CHANGELOG_DAYS} days, newest first:
new free tools, research results, website changes and the platform that builds them. Each line links to its pull request,
and to the live page it changed. Follow along with the <a href="feed.xml">Atom feed</a>.</p></header>
${entries ? `${filters}\n${historyNote(s)}\n${list || '<p>Nothing merged in this window.</p>'}` : unavailable('Merge history')}`,
  });
}

/** Atom feed of the changelog: product and research changes link to their page, the rest to the pull request. */
export function renderChangelogFeed(data, { baseUrl = '' } = {}) {
  const root = `${baseUrl}${CHANGELOG_PATH}`;
  const entries = (data.entries ?? []).slice(0, FEED_ENTRIES);
  const updated = entries[0] ? `${entries[0].date}T00:00:00Z` : '1970-01-01T00:00:00Z';
  const items = entries
    .map((e) => {
      const page = e.pages[0];
      const link = page && baseUrl ? `${baseUrl}${page.href}` : e.pr ? `${REPO_PULL}${e.pr}` : `${REPO_URL}/commit/${e.sha}`;
      const id = e.pr ? `${REPO_PULL}${e.pr}` : `${REPO_URL}/commit/${e.sha}`;
      return `  <entry>
    <title>${esc(`${KIND_LABEL[e.kind]}: ${e.title}`)}</title>
    <link href="${esc(link)}"/>
    <id>${esc(id)}</id>
    <updated>${e.date}T00:00:00Z</updated>
    <category term="${e.kind}"/>
    <summary>${esc(`${e.title}${e.pr ? ` (pull request #${e.pr})` : ''}`)}</summary>
  </entry>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(SITE_NAME)}: changelog</title>
  <subtitle>Every change merged into the repository: tools, research, website and platform.</subtitle>
  <link href="${esc(root)}"/>
  <link rel="self" href="${esc(`${root}feed.xml`)}"/>
  <id>${esc(root)}</id>
  <updated>${updated}</updated>
  <author><name>${esc(SITE_NAME)}</name></author>
${items}
</feed>
`;
}

const money = (v) => `$${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2)}`;

function tile(value, label) {
  return `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
}

function renderDirection(direction) {
  if (!direction) return unavailable('The goals file');
  if (!direction.length) return '<p class="note">No goals or directions are recorded yet.</p>';
  return `<div class="cols">
${direction
  .map(
    (d) => `<div class="card goal"><h3>${esc(d.title.charAt(0).toUpperCase() + d.title.slice(1))}</h3>
<p class="meta">${esc(d.kind)}${d.set ? ` · set ${esc(shortDate(d.set))} ${esc(d.set.slice(0, 4))}` : ''}</p>
${d.summary ? `<p>${inline(d.summary, 'prompts/goals.md')}</p>` : ''}${
      d.leads.length
        ? `<ul>${d.leads.map((l) => `<li>${inline(l.text, 'prompts/goals.md')}${l.date ? ` <span class="meta">(${esc(shortDate(l.date))})</span>` : ''}</li>`).join('')}</ul>`
        : ''
    }</div>`,
  )
  .join('\n')}
</div>`;
}

export function renderUpdates(data, { baseUrl = '', socialCard = '' } = {}) {
  const s = summarise(data);
  const canonical = baseUrl ? `${baseUrl}${UPDATES_PATH}` : '';
  const toRoot = '../';
  const entries = data.entries ?? [];
  const highlights = (kind, n) => entries.filter((e) => e.kind === kind).slice(0, n);
  const tools = highlights('tools', 12);
  const research = highlights('research', 8);
  const other = entries.filter((e) => e.kind === 'site').slice(0, 6);

  const tiles = `<div class="tiles">
${tile(s.merges == null ? '—' : s.merges, s.merges == null ? 'merges this week (history not available)' : 'changes merged in the last 7 days')}
${tile(s.launchedWeek.length, 'new free tools launched this week')}
${tile(s.byKind.tools ?? 0, 'product changes this week')}
${tile(s.merges == null ? '—' : s.researchWeek, 'research projects worked on this week')}
${tile(s.runsWeek, 'AI agent sessions recorded this week')}
${tile(s.costed ? money(s.spend) : '—', s.costed ? `measured compute cost of ${s.costed} recorded sessions` : 'compute cost (not measured this week)')}
</div>`;

  const launched = s.launchedWeek.length
    ? `<h3>New tools this week</h3>
<ul class="log">${s.launchedWeek
        .slice(0, 15)
        .map(([slug, date]) => `<li><a href="${esc(toRoot + slug)}/">${esc(data.titles.get(slug) || slug)}</a> <span class="meta">· launched ${esc(shortDate(date))}</span></li>`)
        .join('')}</ul>${s.launchedWeek.length > 15 ? `<p class="note">And ${s.launchedWeek.length - 15} more; see the <a href="../feed.xml">new tools feed</a>.</p>` : ''}`
    : '';

  const active = activeResearch(entries);
  const projectLink = (slug) =>
    data.researchSlugs.has(slug)
      ? `<a href="${esc(`${toRoot}research/${slug}/`)}">${esc(slug)}</a>`
      : `<a href="${REPO_URL}/tree/main/research/${esc(slug)}">${esc(slug)}</a>`;
  const activeHtml = !data.entries
    ? unavailable('Merge history')
    : active.length
      ? `<ul class="log">${active
          .slice(0, 16)
          .map((r) => `<li><strong>${projectLink(r.slug)}</strong> <span class="meta">· ${r.changes} change${r.changes === 1 ? '' : 's'} · latest ${esc(shortDate(r.latest.date))}</span><br>${inline(r.latest.title, '', { linkPrs: false })}</li>`)
          .join('')}</ul>${active.length > 16 ? `<p class="note">And ${active.length - 16} more in the <a href="../${CHANGELOG_PATH}#research">changelog</a>.</p>` : ''}`
      : '<p class="note">No research projects changed in this window.</p>';
  // At most two notebook entries per project, so one busy project does not fill the list.
  const perProject = new Map();
  const researchLog = data.researchLog
    .filter((l) => {
      perProject.set(l.slug, (perProject.get(l.slug) ?? 0) + 1);
      return perProject.get(l.slug) <= 2;
    })
    .slice(0, 8);
  const researchLogHtml = researchLog.length
    ? `<h3>Lab notebook entries</h3><p class="muted">The newest dated entries from projects that keep a <code>LOG.md</code>.</p><ul class="log">${researchLog
        .map((l) => `<li><span class="pill k-research">${esc(shortDate(l.date))}</span>${projectLink(l.slug)}: ${inline(l.title, `research/${l.slug}/LOG.md`, { linkPrs: false })}</li>`)
        .join('')}</ul>`
    : '';

  const openBacklog = data.backlog.filter((p) => p.status === 'open');
  const decisions = data.decisions;
  const inProgress = `<div class="cols">
<div class="card"><h3>Open pull requests</h3>
<div id="open-prs" data-src="../dev/stats.json"><p class="note">The live list of open pull requests loads from this site's
<a href="../dev/">development dashboard</a>. You can also see them <a href="${REPO_URL}/pulls">on GitHub</a>.</p></div></div>
<div class="card"><h3>Process improvements underway</h3>${
    openBacklog.length
      ? `<ul class="log">${openBacklog.map((p) => `<li>${inline(p.title || p.id, '', { linkPrs: false })} <span class="meta">· <a href="${REPO_BLOB}prompts/process/backlog/${esc(p.file)}">${esc(p.id)}</a></span></li>`).join('')}</ul>`
      : '<p class="note">None open right now.</p>'
  }<p class="note">From the <a href="../dev/analyses/">process backlog</a>: ${data.backlog.filter((p) => p.status === 'done').length} done so far.</p></div>
<div class="card"><h3>Waiting on the owner</h3>${
    decisions == null
      ? unavailable('The decision queue')
      : decisions.length
        ? `<p>${decisions.length} decision${decisions.length === 1 ? '' : 's'} only the owner can make (money, accounts, publishing under the portfolio's name):</p>
<ul class="log">${decisions.slice(0, 6).map((d) => `<li><code>${esc(d.id)}</code>${d.gates ? ` <span class="meta">· blocks ${esc(d.gates)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="note">Nothing is waiting on the owner.</p>'
  }<p class="note">Agents work around these rather than wait; the full list is on the <a href="../engineering/">engineering status page</a>.</p></div>
</div>`;

  // Same origin only: the dashboard's stats.json, written at publish time.
  const script = `<script>
(() => {
  const box = document.getElementById('open-prs');
  if (!box || !window.fetch) return;
  fetch(box.dataset.src, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((stats) => {
    const open = stats && stats.github && stats.github.open_prs;
    if (!open || !Array.isArray(open.recent)) return;
    const ul = document.createElement('ul');
    ul.className = 'log';
    for (const pr of open.recent.slice(0, 12)) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = ${JSON.stringify(REPO_PULL)} + Number(pr.number);
      a.textContent = pr.title;
      li.append(a);
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = ' · #' + Number(pr.number) + (pr.draft ? ' · draft' : '') + ' · opened ' + String(pr.created_at || '').slice(0, 10);
      li.append(meta);
      ul.append(li);
    }
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = open.count + ' open now' + (stats.generated_at ? ', as of ' + String(stats.generated_at).slice(0, 16).replace('T', ' ') + ' UTC' : '') + '.';
    box.replaceChildren(p, ul);
  }).catch(() => {});
})();
</script>`;

  const processHtml = `<ol class="steps">
<li><strong>A session starts from one prompt.</strong> Every AI agent run reads the master prompt,
<a href="${REPO_BLOB}prompt.md"><code>prompt.md</code></a>, which routes it to a track: products, research, process or review.
The owner's goals and guardrails, summarised above, bind every track.</li>
<li><strong>It ships something real.</strong> A run must land a useful change on <code>main</code>: a tool, a fix, a research result, a page.
Nothing is fabricated; every figure on the site traces to a file.</li>
<li><strong>Checks, not ceremony.</strong> Each change goes up as a pull request, runs CI (tests, the site checker, accessibility and link checks),
is cross-reviewed by other agents, and is merged when green. Changes are fixed forward, not held.</li>
<li><strong>Every run is recorded.</strong> Each session commits a run record: track, outcome, what it cost and what slowed it down.
${data.runs.length.toLocaleString('en-US')} are in the repository so far, in <a href="${REPO_BLOB}prompts/runs/README.md"><code>prompts/runs/</code></a>.</li>
<li><strong>The process improves itself.</strong> A review track reads those records, proposes changes to the prompts, measures them
and keeps what works. Experiments and their verdicts are on the <a href="../dev/analyses/">development analyses</a> page.</li>
</ol>
<p>Go deeper: the <a href="../dev/">development dashboard</a> (merges, CI and cost per day), the
<a href="../engineering/">engineering status page</a>, <a href="../${'writing/'}">essays on how it is built</a>, and the
<a href="${REPO_URL}">source on GitHub</a>.</p>`;

  return shell({
    title: `Updates, roadmap and how it is built · ${SITE_NAME}`,
    description: 'An open book: what shipped this week, what is in progress, where the project is going, and how AI agents build it, from the repository itself.',
    canonical,
    socialCard,
    toRoot,
    current: 'updates',
    feedHref: `../${CHANGELOG_PATH}feed.xml`,
    script,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${SITE_NAME}: updates and roadmap`,
      description: 'What shipped, what is in progress, the direction and the development process.',
      url: canonical || undefined,
      dateModified: s.today,
      isPartOf: baseUrl ? { '@type': 'WebSite', name: SITE_NAME, url: baseUrl } : undefined,
    },
    body: `<header class="pf-hero"><p class="eyebrow">Built in public</p>
<h1>Updates</h1>
<p class="dek">An open book on this project: what shipped this week, what is in progress, where it is going and how it is built.
Free tools and open research, built in public by AI coding agents and checked by automated tests. Everything here is generated from the
<a href="${REPO_URL}">repository</a> on each publish.</p>
<ul class="jump">
<li><a href="#week">This week</a></li><li><a href="#shipped">Recently shipped</a></li><li><a href="../${CHANGELOG_PATH}">Full changelog</a></li>
<li><a href="#research-log">Active research</a></li><li><a href="#in-progress">In progress</a></li><li><a href="#direction">Direction</a></li>
<li><a href="#process">How it is built</a></li><li><a href="../${CHANGELOG_PATH}feed.xml">Atom feed</a></li>
</ul></header>

<h2 id="week">This week in numbers</h2>
<p class="muted">The seven days to ${esc(longDate(s.today))}.</p>
${tiles}
${launched}

<h2 id="shipped">Recently shipped</h2>
${
  data.entries
    ? `${historyNote(s)}<div class="cols">
<div class="card"><h3><span class="pill k-tools">Tools</span>Products</h3>${tools.length ? `<ul class="log">${tools.map((e) => entryHtml(e, toRoot, { pill: false })).join('\n')}</ul>` : '<p class="note">No product changes in this window.</p>'}
<p><a href="../${CHANGELOG_PATH}#tools">All product changes →</a></p></div>
<div class="card"><h3><span class="pill k-research">Research</span>Studies</h3>${research.length ? `<ul class="log">${research.map((e) => entryHtml(e, toRoot, { pill: false })).join('\n')}</ul>` : '<p class="note">No research changes in this window.</p>'}
<p><a href="../${CHANGELOG_PATH}#research">All research changes →</a></p></div>
</div>
${other.length ? `<div class="card"><h3><span class="pill k-site">Website</span>The site</h3><ul class="log">${other.map((e) => entryHtml(e, toRoot, { pill: false })).join('\n')}</ul>
<p><a href="../${CHANGELOG_PATH}#site">All website changes →</a></p></div>` : ''}
<p><a href="../${CHANGELOG_PATH}"><strong>Read the full changelog</strong></a>: every merge in the last ${CHANGELOG_DAYS} days, by day.</p>`
    : unavailable('Merge history')
}

<h2 id="research-log">Active research</h2>
<p class="muted">Research projects changed in the last ${CHANGELOG_DAYS} days, most recently active first. All projects, with their write-ups,
are on the <a href="../research/">research page</a>.</p>
${activeHtml}
${researchLogHtml}

<h2 id="in-progress">In progress</h2>
${inProgress}

<h2 id="direction">Direction: where this is going</h2>
<p class="muted">The owner's standing goals, summarised from <a href="${REPO_BLOB}prompts/goals.md"><code>prompts/goals.md</code></a>,
which every agent run reads. The file has the full text, in the owner's own words.</p>
${(data.mission ?? []).length ? `<div class="card"><h3>The mission</h3><ul class="log">${data.mission
  .map((m) => `<li><strong>${esc(m.name)}</strong>${m.where ? ` <span class="meta">${inline(m.where, 'prompts/goals.md')}</span>` : ''}: ${inline(m.text, 'prompts/goals.md')}</li>`)
  .join('')}</ul></div>` : ''}
${renderDirection(data.direction)}

<h2 id="process">How it is built</h2>
${processHtml}`,
  });
}

/** Write `updates/` and `changelog/` into outDir. */
export async function buildUpdates(outDir, baseUrl = '', { root = DEFAULT_ROOT, published, researchSlugs, titles, socialCard = '', now } = {}) {
  const data = loadUpdates(root, { published, researchSlugs, titles, now });
  const updatesDir = path.join(outDir, UPDATES_PATH);
  const changelogDir = path.join(outDir, CHANGELOG_PATH);
  await fs.mkdir(updatesDir, { recursive: true });
  await fs.mkdir(changelogDir, { recursive: true });
  await fs.writeFile(path.join(updatesDir, 'index.html'), renderUpdates(data, { baseUrl, socialCard }));
  await fs.writeFile(path.join(changelogDir, 'index.html'), renderChangelog(data, { baseUrl, socialCard }));
  await fs.writeFile(path.join(changelogDir, 'feed.xml'), renderChangelogFeed(data, { baseUrl }));
  return data;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(HERE, 'dist');
  const data = await buildUpdates(out, arg('base-url') ?? '');
  console.log(`updates: wrote ${path.join(out, UPDATES_PATH)} and ${path.join(out, CHANGELOG_PATH)} (${data.entries?.length ?? 'no'} changelog entries)`);
}
