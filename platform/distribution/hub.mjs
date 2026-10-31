/**
 * Distribution hub: one command for every platform, and one scoreboard for
 * what works. Spec: portfolio/distribution/README.md, "The hub".
 *
 *   node platform/distribution/hub.mjs platforms            # every platform: mode, limits, what it measures, why
 *   node platform/distribution/hub.mjs plan                 # dry run: every variant for recent items
 *   node platform/distribution/hub.mjs pack --out <dir>     # paste-ready drafts per platform (+ drafts.csv)
 *   node platform/distribution/hub.mjs publish              # live on enabled `api` platforms, dry run elsewhere
 *   node platform/distribution/hub.mjs score [--json] [--since YYYY-MM-DD] [--readings <file>]
 *   node platform/distribution/hub.mjs kit [--slug <post-slug>] [--out <dir>]   # every native shape for recent posts
 *
 * Options: --days N (tool launch window, default 3), --post-days N (writing
 * window, default 7), --max N (posts per platform per run, default 3),
 * --only a,b (platform ids), --today YYYY-MM-DD.
 *
 * Items are tools launched in the window (platform/pages/launched.json) and
 * posts in docs/posts/ dated in their window. Each platform gets the variant
 * `hub/compose.mjs` writes for it. Platforms in `api` mode publish only when
 * DISTRIBUTE_<PLATFORM>=true and their secrets are set (see
 * hub/platforms.mjs); `delegated` platforms are published by their existing
 * scripts; `draft` platforms (X, LinkedIn, Substack, Medium, TikTok, YouTube,
 * Reddit, Hacker News) only ever get drafts for the owner. Nothing here
 * spends money or writes to the repository.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, byId } from './hub/platforms.mjs';
import { toolItem, postItem, variant, digest, kit, kitMarkdown } from './hub/compose.mjs';
import { ADAPTERS } from './hub/adapters.mjs';
import { collect, scoreboard, formatScoreboard } from './hub/metrics.mjs';
import { readMeta, recentLaunches } from './bluesky.mjs';
import { loadPosts } from '../pages/writing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const DEFAULTS = Object.freeze({ days: 3, postDays: 7, max: 3, drafts: 10 });
/** The email digest covers a week, goes out on one weekday (UTC, 1 = Monday) and lists at most this many items. */
export const EMAIL = Object.freeze({ days: 7, weekday: 1, maxItems: 25 });

export function parseArgs(argv) {
  const [cmd = 'plan', ...rest] = argv;
  const opts = { cmd, ...DEFAULTS, only: null, out: null, json: false, since: '', readings: null, today: null, slug: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => rest[++i];
    if (a === '--json') opts.json = true;
    else if (a === '--days') opts.days = Number(next());
    else if (a === '--post-days') opts.postDays = Number(next());
    else if (a === '--max') opts.max = Number(next());
    else if (a === '--only') opts.only = next().split(',').map((s) => s.trim());
    else if (a === '--out') opts.out = next();
    else if (a === '--since') opts.since = next();
    else if (a === '--readings') opts.readings = next();
    else if (a === '--today') opts.today = next();
    else if (a === '--slug') opts.slug = next();
    else throw new Error(`unknown option ${a}`);
  }
  if (opts.only) for (const id of opts.only) if (!byId(id)) throw new Error(`unknown platform "${id}"`);
  return opts;
}

/** Items in the windows, newest first: tools from launched.json, posts from docs/posts. */
export async function gatherItems({ today, days, postDays, root = REPO_ROOT, launched, posts, readPage } = {}) {
  launched ??= JSON.parse(await fs.readFile(path.join(root, 'platform/pages/launched.json'), 'utf8')).launched;
  posts ??= loadPosts(root);
  readPage ??= (slug) => fs.readFile(path.join(root, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
  const items = [];
  for (const slug of recentLaunches(launched, today, days)) {
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (meta) items.push(toolItem(slug, launched[slug], meta));
  }
  const t = Date.parse(today);
  for (const p of posts) {
    const age = t - Date.parse(p.date);
    if (age >= 0 && age <= postDays * 864e5) items.push(postItem(p));
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/**
 * Every variant per platform (pure). Tools older than `days` are left to the
 * email digest, which covers EMAIL.days in one message instead of one per item.
 */
export function planAll(items, { only = null, max = DEFAULTS.max, today, days = DEFAULTS.days } = {}) {
  const cutoff = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  const recent = items.filter((it) => it.type !== 'tool' || it.date >= cutoff);
  const out = [];
  for (const p of PLATFORMS) {
    if (only && !only.includes(p.id)) continue;
    if (p.mode === 'discovery') { out.push({ platform: p, variants: [], note: p.why }); continue; }
    const mine = p.id === 'email' ? items.slice(0, EMAIL.maxItems) : recent;
    if (!mine.length) { out.push({ platform: p, variants: [] }); continue; }
    const variants = p.id === 'email' ? [digest(mine, p, { date: today })] : mine.map((it) => variant(it, p));
    out.push({ platform: p, variants: variants.slice(0, p.mode === 'draft' ? DEFAULTS.drafts : max) });
  }
  return out;
}

const csvCell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

export function toMarkdown({ platform: p, variants, note }) {
  const lines = [`# ${p.name}`, '', `Mode: **${p.mode}**. ${p.why}`, ''];
  if (p.delegate) lines.push(`Published by \`node ${p.delegate}\`; the text below is the hub's version for comparison.`, '');
  if (note && !variants.length) lines.push('Nothing to post.', '');
  for (const v of variants) {
    lines.push(`## ${v.item ?? 'digest'}${v.template ? ` (template: ${v.template})` : ''}`, '');
    if (v.title) lines.push(`**Title:** ${v.title}`, '');
    if (v.script) lines.push('**Video script:**', '', '```', v.script, '```', '');
    if (v.text) lines.push('```', v.text, '```', '');
    if (v.thread) { lines.push(`**As a thread (${v.thread.length} posts):**`, ''); for (const t of v.thread) lines.push('```', t, '```', ''); }
    if (v.comment) lines.push('**First comment:**', '', '```', v.comment, '```', '');
    if (v.slides) { lines.push('**Carousel slides:**', ''); v.slides.forEach((x, i) => lines.push(`${i + 1}. *(${x.role})* ${x.text}`)); lines.push(''); }
    if (v.link) lines.push(`Link: ${v.link}`, '');
  }
  return lines.join('\n');
}

export function toCsv(plan) {
  const rows = [['platform', 'mode', 'item', 'template', 'kind', 'title', 'text', 'link']];
  for (const { platform: p, variants } of plan) {
    for (const v of variants) rows.push([p.id, p.mode, v.item ?? (v.items || []).join(' '), v.template ?? '', v.kind, v.title ?? '', v.text ?? '', v.link ?? '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export async function writePack(plan, dir) {
  await fs.mkdir(dir, { recursive: true });
  const index = ['# Distribution pack', '', '| Platform | Mode | Pieces |', '|---|---|---|'];
  for (const entry of plan) {
    await fs.writeFile(path.join(dir, `${entry.platform.id}.md`), toMarkdown(entry));
    index.push(`| [${entry.platform.name}](${entry.platform.id}.md) | ${entry.platform.mode} | ${entry.variants.length} |`);
  }
  await fs.writeFile(path.join(dir, 'README.md'), index.join('\n') + '\n');
  await fs.writeFile(path.join(dir, 'drafts.csv'), toCsv(plan));
}

/** Publish on every enabled `api` platform. Returns one result row per platform. */
export async function publish(plan, { env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const results = [];
  for (const { platform: p, variants } of plan) {
    if (p.mode !== 'api') continue;
    const a = ADAPTERS[p.id];
    let why = a.ready(env);
    if (!why && p.id === 'email' && now.getUTCDay() !== EMAIL.weekday) why = 'the digest goes out on Mondays (UTC) only';
    if (why) { results.push({ platform: p.id, posted: 0, planned: variants.length, dry: why }); continue; }
    const ctx = { env, fetchImpl };
    const seen = await a.seen(ctx);
    let posted = 0;
    const skipped = [];
    for (let v of variants) {
      if (v.kind === 'digest') {
        // A digest lists only items no earlier issue mentioned.
        const fresh = v.source.filter((it) => !seen.includes(it.url));
        if (!fresh.length) { skipped.push('digest: every item already sent'); continue; }
        v = digest(fresh, p, { date: now.toISOString().slice(0, 10) });
      } else if (seen.includes(v.url)) { skipped.push(`${v.item}: already posted`); continue; }
      const r = await a.publish(ctx, v);
      if (r?.skipped) { skipped.push(`${v.item}: ${r.skipped}`); continue; }
      posted += 1;
      log(`${p.id}: posted ${v.item ?? 'digest'}`);
    }
    results.push({ platform: p.id, posted, planned: variants.length, skipped });
  }
  return results;
}

async function readDays() {
  try {
    return JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'portfolio/usage/site-visits.json'), 'utf8')).days || {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

export async function main(argv = process.argv.slice(2), { env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const o = parseArgs(argv);
  const today = o.today || now.toISOString().slice(0, 10);

  if (o.cmd === 'platforms') {
    if (o.json) return log(JSON.stringify(PLATFORMS, null, 2));
    for (const p of PLATFORMS) {
      const how = p.mode === 'api' ? `${p.env} + ${[...(p.secrets || []), ...(p.vars || [])].join(', ')}` : p.delegate || '';
      log(`${p.id.padEnd(14)} ${p.mode.padEnd(10)} ${p.ref ? `?ref=${p.ref}`.padEnd(15) : '-'.padEnd(15)} ${p.limits.text ? `${p.limits.text} chars` : 'title + link'}${p.limits.media !== 'none' ? `, needs ${p.limits.media}` : ''}`);
      log(`${''.padEnd(14)} ${p.why}`);
      if (how) log(`${''.padEnd(14)} enable: ${how}`);
      log(`${''.padEnd(14)} measures: ${p.metrics.what}`);
    }
    return;
  }

  if (o.cmd === 'score') {
    const { readings, status } = o.readings ? { readings: JSON.parse(await fs.readFile(o.readings, 'utf8')), status: { file: o.readings } } : await collect({ env, fetchImpl });
    const s = scoreboard({ platforms: PLATFORMS, readings, days: await readDays(), since: o.since });
    if (o.out) await fs.writeFile(o.out, JSON.stringify({ today, status, readings, scoreboard: s }, null, 2) + '\n');
    if (o.json) return log(JSON.stringify({ status, scoreboard: s }, null, 2));
    log(`Readers: ${Object.entries(status).map(([k, v]) => `${k} ${v}`).join('; ')}`);
    return log(formatScoreboard(s));
  }

  if (o.cmd === 'kit') {
    const posts = loadPosts(REPO_ROOT);
    const chosen = o.slug ? posts.filter((p) => p.slug === o.slug) : posts.filter((p) => { const age = Date.parse(today) - Date.parse(p.date); return age >= 0 && age <= o.postDays * 864e5; });
    if (o.slug && !chosen.length) throw new Error(`no post with slug "${o.slug}" in docs/posts`);
    const kits = chosen.map((p) => kit(postItem(p), PLATFORMS)).filter(Boolean);
    if (o.json) return log(JSON.stringify(kits, null, 2));
    if (o.out) {
      await fs.mkdir(o.out, { recursive: true });
      for (const k of kits) await fs.writeFile(path.join(o.out, `${k.item.split(':')[1]}.md`), kitMarkdown(k) + '\n');
      return log(`wrote ${kits.length} kit(s) to ${o.out} (${chosen.length - kits.length} post(s) had no findings to extract)`);
    }
    return log(kits.map(kitMarkdown).join('\n\n---\n\n') || 'No posts with findings in the window.');
  }

  const items = await gatherItems({ today, days: Math.max(o.days, EMAIL.days), postDays: o.postDays });
  const plan = planAll(items, { only: o.only, max: o.max, today, days: o.days });

  if (o.cmd === 'plan') {
    if (o.json) return log(JSON.stringify(plan.map((e) => ({ platform: e.platform.id, mode: e.platform.mode, variants: e.variants })), null, 2));
    log(`${items.length} item(s) in the window ending ${today}: ${items.map((i) => i.id).join(', ') || 'none'}`);
    for (const e of plan) {
      log(`\n=== ${e.platform.name} [${e.platform.mode}] ${e.variants.length} piece(s)`);
      for (const v of e.variants.slice(0, 1)) log((v.title ? `${v.title}\n` : '') + (v.text || v.script || ''));
      if (e.variants.length > 1) log(`(+${e.variants.length - 1} more; \`pack --out <dir>\` writes them all)`);
    }
    return;
  }
  if (o.cmd === 'pack') {
    if (!o.out) throw new Error('pack needs --out <dir>');
    await writePack(plan, o.out);
    return log(`wrote ${plan.length} platform file(s), README.md and drafts.csv to ${o.out}`);
  }
  if (o.cmd === 'publish') {
    const results = await publish(plan, { env, fetchImpl, log, now });
    for (const r of results) log(`${r.platform}: ${r.dry ? `DRY RUN (${r.dry}), ${r.planned} planned` : `${r.posted} posted of ${r.planned}${r.skipped.length ? `; skipped ${r.skipped.join('; ')}` : ''}`}`);
    return results;
  }
  throw new Error(`unknown command "${o.cmd}" (platforms | plan | pack | publish | score | kit)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
