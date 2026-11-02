/**
 * The work queue: a read-only, project-management view of what the agents
 * pick up next and in what order, at `queue/` on the site.
 *
 *   node platform/pages/queue.mjs --out=dist [--base-url=https://…/]
 *
 * `prompt.md` fixes the order every scheduled session follows, and this page
 * shows the same order, read from the same files, so a visitor sees the queue
 * the agents see:
 *
 *   0. security alerts          the security-alerts branch (listed, never detailed)
 *   1. the owner's ideas inbox  IDEAS.md, "## New"
 *   2. website requests         portfolio/requests/requests.json (building,
 *                               accepted, received; oldest first), the order
 *                               prompts/ideas.py prints
 *   3. flagship projects        portfolio/flagships.yaml, in file order, with `next`
 *   4. research programmes      research/PROGRAMMES.md, "Open programmes"
 *
 * Beside the queue: what waits on the owner (decision_queue.py --json), the
 * open process improvements (prompts/process/backlog/), and the open pull
 * requests, read in the browser from this site's own dev/stats.json.
 *
 * There is nothing to edit here. A source that cannot be read renders as
 * "not available in this build", never as an empty queue.
 */
import { promises as fs, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, inline, REPO_BLOB, REPO_PULL } from '../devlog/markdown.mjs';
import { REPO_URL, SITE_NAME, renderSiteFooterNav, withSiteHeader } from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const QUEUE_PATH = 'queue/';

/** Request statuses still to build, in the order a session takes them (prompts/ideas.py, OPEN_STATUSES). */
export const OPEN_REQUEST_STATUSES = Object.freeze(['building', 'accepted', 'received']);

// ---------------------------------------------------------------- parsing --

/** Ideas under "## New" in IDEAS.md: paragraphs, comments and list markers removed (same rule as prompts/ideas.py). */
export function parseIdeas(src) {
  if (typeof src !== 'string') return null;
  const start = src.indexOf('## New');
  const end = src.indexOf('## Picked up', start);
  if (start < 0 || end < 0) return null;
  const body = src.slice(start + '## New'.length, end).replace(/<!--[\s\S]*?-->/g, '');
  return body
    .split(/\n\s*\n/)
    .map((para) =>
      para
        .split('\n')
        .map((ln) => ln.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean);
}

/**
 * Open requests in the order `prompts/ideas.py` lists them: building, then
 * accepted, then received; oldest first within each. Owner-sourced entries
 * are the standing projects and are returned separately.
 */
export function orderRequests(requests) {
  if (!Array.isArray(requests)) return null;
  const rank = (r) => OPEN_REQUEST_STATUSES.indexOf(r.status);
  const live = requests.filter((r) => rank(r) >= 0);
  const sorted = [...live].sort((a, b) => rank(a) - rank(b) || String(a.received ?? '').localeCompare(String(b.received ?? '')));
  return {
    outside: sorted.filter((r) => r.source !== 'owner'),
    owner: sorted.filter((r) => r.source === 'owner'),
    shipped: requests.filter((r) => r.status === 'shipped').length,
    declined: requests.filter((r) => r.status === 'declined').length,
  };
}

/**
 * Flagships from `portfolio/flagships.yaml`, in file order: { venture, why, next }.
 * The file is a flat list whose `why:` and `next:` are folded `>-` scalars,
 * so a line reader is enough (and keeps the site build free of a YAML parser).
 */
export function parseFlagships(src) {
  if (typeof src !== 'string') return null;
  const out = [];
  let cur = null;
  let key = null;
  for (const line of src.split('\n')) {
    const item = line.match(/^  - venture: ([a-z0-9-]+)\s*$/);
    if (item) {
      cur = { venture: item[1], why: '', next: '' };
      out.push(cur);
      key = null;
      continue;
    }
    if (!cur) continue;
    const field = line.match(/^    (why|next): ?(>-|>|\|)?\s*(.*)$/);
    if (field) {
      key = field[1];
      cur[key] = field[3].replace(/^["']|["']$/g, '');
      continue;
    }
    if (key && /^      \S/.test(line)) {
      cur[key] = `${cur[key]} ${line.trim()}`.trim();
      continue;
    }
    if (/^\S/.test(line) || /^    \S/.test(line)) key = null;
  }
  return out;
}

/** Rows of the "Open programmes" table in research/PROGRAMMES.md: { slug, question, venue }. */
export function parseProgrammes(src) {
  if (typeof src !== 'string') return null;
  const at = src.indexOf('## Open programmes');
  if (at < 0) return null;
  const rest = src.slice(at + 1);
  const section = rest.slice(0, rest.search(/\n## /) >= 0 ? rest.search(/\n## /) : undefined);
  const rows = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*\[`([a-z0-9-]+)`\]\([^)]*\)\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim());
    rows.push({ slug: m[1], question: cells[0] ?? '', venue: cells[cells.length - 1] ?? '' });
  }
  return rows;
}

/** Cut long text at a word boundary. */
export function clip(text, limit = 260) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 40)).replace(/[,;:(]+$/, '')}…`;
}

// ---------------------------------------------------------------- loading --

const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
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
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((f) => /^P\d+.*\.json$/.test(f))
    .sort()
    .map((f) => ({ file: f, ...(readJson(path.join(dir, f)) ?? {}) }))
    .filter((p) => p.id);
}

/** Everything the page reads, in one object (the tests build their own). */
export function loadQueue(root = DEFAULT_ROOT, { published = new Set(), now = Date.now() } = {}) {
  const requests = readJson(path.join(root, 'portfolio', 'requests', 'requests.json'))?.requests ?? null;
  return {
    now,
    published,
    ideas: parseIdeas(readText(path.join(root, 'IDEAS.md'))),
    requests: orderRequests(requests),
    flagships: parseFlagships(readText(path.join(root, 'portfolio', 'flagships.yaml'))),
    programmes: parseProgrammes(readText(path.join(root, 'research', 'PROGRAMMES.md'))),
    decisions: loadDecisions(root),
    backlog: loadBacklog(root),
  };
}

// -------------------------------------------------------------- rendering --

const STYLE = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#1b2129; --muted:#56616f; --line:#dde3ea; --accent:#1f56c9; --soft:#eef2f8;
    --s-build:#12594a; --s-wait:#6b5300; --s-new:#7a3fb0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542;
    --accent:#8fb0ff; --soft:#1c2531; --s-build:#7fd8c0; --s-wait:#e7c76a; --s-new:#d2b0f5; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:960px; margin:0 auto; padding:24px 16px 72px; --pf-hero-pull:24px; }
  a { color:var(--accent); }
  h1 { font-size:clamp(2rem,4.6vw,2.8rem); line-height:1.15; margin:.3em 0 .25em; letter-spacing:-.015em; }
  h2 { font-size:1.35rem; margin:0; letter-spacing:-.01em; }
  h3 { font-size:1.05rem; margin:0 0 .4em; }
  .dek { font-size:1.12rem; color:var(--muted); margin:0 0 1em; max-width:46em; }
  .muted, .note { color:var(--muted); } .note { font-size:.88rem; }
  .meta { font-size:.82rem; color:var(--muted); } .meta a { color:inherit; }
  .jump { display:flex; flex-wrap:wrap; gap:8px; margin:1.2em 0 0; padding:0; list-style:none; }
  .jump a { display:inline-block; padding:5px 12px; border:1px solid var(--line); border-radius:999px; background:var(--panel);
    text-decoration:none; color:var(--ink); font-size:.9rem; }
  .jump a:hover { border-color:var(--accent); }
  .lane { display:grid; grid-template-columns:44px minmax(0,1fr); gap:0 14px; margin:2.2em 0 0; }
  .lane > .num { width:36px; height:36px; border-radius:50%; background:var(--soft); border:1px solid var(--line);
    display:grid; place-items:center; font-weight:750; font-variant-numeric:tabular-nums; }
  .lane > .head { align-self:center; }
  .lane > .head p { margin:.15em 0 0; }
  .lane > .items { grid-column:2; margin-top:12px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 18px; margin:0 0 10px; overflow-wrap:anywhere; }
  .card p { margin:.3em 0 0; }
  ol.q { list-style:none; margin:0; padding:0; counter-reset:q; }
  ol.q > li { counter-increment:q; }
  ol.q > li > .card > h3::before { content:counter(q) ". "; color:var(--muted); font-weight:600; }
  .pill { display:inline-block; font-size:.72rem; font-weight:650; letter-spacing:.02em; text-transform:uppercase;
    border:1px solid currentColor; border-radius:999px; padding:0 7px; margin-left:6px; vertical-align:1px; white-space:nowrap; }
  .s-building { color:var(--s-build); } .s-accepted { color:var(--s-wait); } .s-received { color:var(--s-new); }
  .cols { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:14px; margin-top:12px; }
  .cols .card { margin:0; }
  .log { list-style:none; margin:0; padding:0; }
  .log li { padding:8px 0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
  .log li:last-child { border-bottom:0; }
  details { margin-top:.4em; } details summary { cursor:pointer; color:var(--accent); font-size:.9rem; }
  h2.side { margin:2.6em 0 0; }
  footer { margin-top:3em; font-size:.82rem; color:var(--muted); }
`;

function unavailable(what) {
  return `<p class="note">${esc(what)} is not available in this build.</p>`;
}

function lane(n, id, title, blurb, items) {
  return `<section class="lane" id="${id}" aria-labelledby="${id}-h">
<div class="num" aria-hidden="true">${n}</div>
<div class="head"><h2 id="${id}-h">${esc(title)}</h2><p class="muted">${blurb}</p></div>
<div class="items">${items}</div>
</section>`;
}

function statusPill(status) {
  return `<span class="pill s-${esc(status)}">${esc(status)}</span>`;
}

function requestCard(r, toRoot) {
  const id = /^R-\d{4}$/.test(r.id || '') ? r.id : '';
  const title = id ? `<a href="${esc(`${toRoot}custom-development/${id}/`)}">${esc(r.title || id)}</a>` : esc(r.title || 'Untitled request');
  return `<li><div class="card"><h3>${title}${statusPill(r.status)}</h3>
<p class="meta">${id ? `${esc(id)} · ` : ''}asked ${esc(r.received || 'date unknown')}${r.updated ? ` · updated ${esc(r.updated)}` : ''}${r.project ? ` · <a href="${REPO_URL}/tree/main/${esc(r.project)}">${esc(r.project)}</a>` : ''}</p>
${r.next ? `<p><strong>Next:</strong> ${inline(clip(r.next, 320), '', { linkPrs: false })}</p>` : ''}</div></li>`;
}

export function renderQueue(data, { baseUrl = '', socialCard = '' } = {}) {
  const toRoot = '../';
  const canonical = baseUrl ? `${baseUrl}${QUEUE_PATH}` : '';
  const today = new Date(data.now ?? Date.now()).toISOString().slice(0, 10);
  const published = data.published ?? new Set();

  const security = lane(
    1,
    'security',
    'Security alerts',
    'Any open code-scanning alert is fixed before anything else. The alerts themselves are not listed here, so a weakness is not advertised before it is patched.',
    '',
  );

  const ideas = data.ideas;
  const ideasLane = lane(
    2,
    'ideas',
    "The owner's ideas inbox",
    `Ideas the owner dictates into <a href="${REPO_BLOB}IDEAS.md"><code>IDEAS.md</code></a>, oldest first. Each one is a direct request.`,
    ideas == null
      ? unavailable('The ideas inbox')
      : ideas.length
        ? `<ol class="q">${ideas.map((t, i) => `<li><div class="card"><h3>Idea</h3><p>${inline(clip(t, 400), 'IDEAS.md', { linkPrs: false })}</p></div></li>`).join('')}</ol>`
        : '<p class="note">Empty right now: every idea in the inbox has been picked up.</p>',
  );

  const req = data.requests;
  const requestsLane = lane(
    3,
    'requests',
    'Requests from the website',
    `Tools, features and research people asked for through the <a href="${toRoot}custom-development/">custom development</a> page. Being built first, then accepted, then newly received, oldest first in each group.`,
    req == null
      ? unavailable('The request queue')
      : `${
          req.outside.length
            ? `<ol class="q">${req.outside.map((r) => requestCard(r, toRoot)).join('')}</ol>`
            : `<p class="note">No outside requests are open right now. <a href="${toRoot}custom-development/">Ask for something to be built</a>: it is free, and the result stays open source.</p>`
        }${
          req.owner.length
            ? `<details${req.outside.length ? '' : ' open'}><summary>${req.owner.length} long-running project${req.owner.length === 1 ? '' : 's'} the owner asked for</summary><ol class="q">${req.owner.map((r) => requestCard(r, toRoot)).join('')}</ol></details>`
            : ''
        }<p class="note">${req.shipped} shipped and ${req.declined} declined so far.</p>`,
  );

  const flags = data.flagships;
  const flagshipLane = lane(
    4,
    'flagships',
    'Flagship projects',
    `With no request waiting, product sessions deepen the flagships, in the order <a href="${REPO_BLOB}portfolio/flagships.yaml"><code>flagships.yaml</code></a> lists them. Each shows the milestone it is working towards.`,
    flags == null
      ? unavailable('The flagship list')
      : flags.length
        ? `<ol class="q">${flags
            .map((f) => {
              const name = published.has(f.venture) ? `<a href="${esc(`${toRoot}${f.venture}/`)}">${esc(f.venture)}</a>` : esc(f.venture);
              return `<li><div class="card"><h3>${name}</h3>
${f.why ? `<p class="muted">${inline(clip(f.why, 240), '', { linkPrs: false })}</p>` : ''}
${f.next ? `<p><strong>Working towards:</strong> ${inline(clip(f.next, 300), '', { linkPrs: false })}</p>${f.next.length > 300 ? `<details><summary>Full milestone</summary><p>${inline(f.next, '', { linkPrs: false })}</p></details>` : ''}` : ''}
<p class="meta"><a href="${REPO_URL}/tree/main/ventures/${esc(f.venture)}">Source</a></p></div></li>`;
            })
            .join('')}</ol>`
        : '<p class="note">No flagships are listed.</p>',
  );

  const progs = data.programmes;
  const researchLane = lane(
    5,
    'research',
    'Research programmes',
    `Research sessions run in parallel with product work. These are the open multi-session programmes aimed at a paper, from <a href="${REPO_BLOB}research/PROGRAMMES.md"><code>PROGRAMMES.md</code></a>.`,
    progs == null
      ? unavailable('The research programme list')
      : progs.length
        ? `<ol class="q">${progs
            .map((p) => `<li><div class="card"><h3><a href="${REPO_URL}/tree/main/research/${esc(p.slug)}">${esc(p.slug)}</a></h3>
<p>${inline(clip(p.question, 320), 'research/PROGRAMMES.md', { linkPrs: false })}</p>${p.venue ? `<p class="meta">Aimed at: ${inline(p.venue, 'research/PROGRAMMES.md', { linkPrs: false })}</p>` : ''}</div></li>`)
            .join('')}</ol>`
        : '<p class="note">No open programmes.</p>',
  );

  const decisions = data.decisions;
  const backlog = data.backlog;
  const openBacklog = (backlog ?? []).filter((p) => p.status === 'open');
  const side = `<h2 class="side" id="alongside">Alongside the queue</h2>
<div class="cols">
<div class="card"><h3>Open pull requests</h3>
<div id="open-prs" data-src="../dev/stats.json"><p class="note">Work in flight right now loads from this site's
<a href="../dev/">development dashboard</a>. You can also see it <a href="${REPO_URL}/pulls">on GitHub</a>.</p></div></div>
<div class="card"><h3>Waiting on the owner</h3>${
    decisions == null
      ? unavailable('The decision queue')
      : decisions.length
        ? `<p>${decisions.length} decision${decisions.length === 1 ? '' : 's'} only the owner can make (money, accounts, publishing under the portfolio's name). Agents work around these rather than wait.</p>
<ul class="log">${decisions.slice(0, 8).map((d) => `<li><code>${esc(d.id)}</code>${d.gates ? ` <span class="meta">· blocks ${esc(d.gates)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="note">Nothing is waiting on the owner.</p>'
  }</div>
<div class="card"><h3>Process improvements</h3>${
    backlog == null
      ? unavailable('The process backlog')
      : openBacklog.length
        ? `<ul class="log">${openBacklog.map((p) => `<li>${inline(p.title || p.id, '', { linkPrs: false })} <span class="meta">· <a href="${REPO_BLOB}prompts/process/backlog/${esc(p.file)}">${esc(p.id)}</a></span></li>`).join('')}</ul>`
        : '<p class="note">None open right now.</p>'
  }<p class="note">How the agents themselves get better; ${(backlog ?? []).filter((p) => p.status === 'done').length} done so far.</p></div>
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

  const title = `Work queue: what gets built next · ${SITE_NAME}`;
  const description = 'What the AI agents building this site work on next, in order: owner ideas, website requests, flagship projects and research programmes. Read-only.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${SITE_NAME}: work queue`,
    description,
    url: canonical || undefined,
    dateModified: today,
    isPartOf: baseUrl ? { '@type': 'WebSite', name: SITE_NAME, url: baseUrl } : undefined,
  };

  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}${socialCard ? `<meta property="og:image" content="${esc(socialCard)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="${socialCard ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<main>
<header class="pf-hero"><p class="eyebrow">Built in public</p>
<h1>Work queue</h1>
<p class="dek">What the AI agents building this site work on next, and in what order. Each session takes the first thing
in this list that has work waiting. This page shows that order; nothing here can be edited. It is rebuilt from the
<a href="${REPO_URL}">repository</a> on every publish (last built ${esc(today)}).</p>
<ul class="jump">
<li><a href="#ideas">Owner ideas</a></li><li><a href="#requests">Website requests</a></li><li><a href="#flagships">Flagships</a></li>
<li><a href="#research">Research</a></li><li><a href="#alongside">In flight and blocked</a></li><li><a href="../updates/">What shipped</a></li>
</ul></header>
${security}
${ideasLane}
${requestsLane}
${flagshipLane}
${researchLane}
${side}
<p class="note" style="margin-top:2em">The order comes from <a href="${REPO_BLOB}prompt.md"><code>prompt.md</code></a>, the master prompt every
session reads. Some sessions are drawn to other tracks (process, review, writing, design) by a weighted draw, so the queue is the default, not the only work.
For what already landed, see <a href="../updates/">updates</a> and the <a href="../changelog/">changelog</a>.</p>
</main>
<footer>
  <p>Generated on every publish from files in the repository: the ideas inbox, the request queue, the flagship list, the
  research programme list, the owner's decision queue and the process backlog. Nothing on this page is typed by hand. Provided
  as-is, with no warranty of accuracy or completeness, and not advice of any kind. MIT-licensed, like everything here.</p>
  ${renderSiteFooterNav({ toRoot })}
</footer>
</div>
${script}
</body>
</html>
`, { toRoot, current: 'updates' });
}

/** Write `queue/index.html` into outDir. */
export async function buildQueue(outDir, baseUrl = '', { root = DEFAULT_ROOT, published, socialCard = '', now } = {}) {
  const data = loadQueue(root, { published, now });
  const dir = path.join(outDir, QUEUE_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderQueue(data, { baseUrl, socialCard }));
  return data;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(HERE, 'dist');
  const data = await buildQueue(out, arg('base-url') ?? '');
  console.log(`queue: wrote ${path.join(out, QUEUE_PATH)} (${data.flagships?.length ?? 'no'} flagships, ${data.programmes?.length ?? 'no'} programmes)`);
}
