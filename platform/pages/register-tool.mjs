#!/usr/bin/env node
// The repository-wide registrations a new tool needs, applied or checked in
// about ten seconds, before the tool's own work is done.
//
// Every new venture touches the same files outside its own folder, and runs
// kept learning each one from a red CI job or a six-minute preflight: the
// launch date in launched.json, its usage module in
// platform/privacy/optout-switches.txt, an inbound link from a sibling's page
// (siblings orphan budget 0), and for a research-algorithm tool the slug in
// build.mjs's RESEARCH_ALGORITHM_SLUGS and a row in
// portfolio/research-tools/README.md. Six run records between 2026-11-14 and
// 2026-11-17 named this list as missing; PRs #16876, #16906 and #16912 each
// touched exactly these files. The CSV formula guard and the row-spread check
// are run here too, filtered to the slug, because the same runs met them only
// in CI.
//
//   node platform/pages/register-tool.mjs <slug>              # fix what can be fixed, list the rest
//   node platform/pages/register-tool.mjs <slug> --check      # change nothing, exit 1 on any gap
//   node platform/pages/register-tool.mjs <slug> --research   # also the research-algorithm registrations
//
// A slug already in RESEARCH_ALGORITHM_SLUGS gets the research checks without
// the flag. What it writes: the build.mjs slug list, launched.json (this slug
// only) and optout-switches.txt (through sync_tree_counts.py). What it only
// reports, because each needs words a script should not write: the README
// row and the sibling link (it names the nearest candidates). Exit 0 when
// nothing is left to do, 1 when something is, 2 on a usage error.
// venture-preflight.mjs is still the before-merge check; this is the
// at-the-start one.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const SLUG_LIST = /^(export const RESEARCH_ALGORITHM_SLUGS = \[)(.*)(\];)$/m;
const README_FILE = 'portfolio/research-tools/README.md';
const SWITCHES_FILE = 'platform/privacy/optout-switches.txt';

/** The slugs in build.mjs's RESEARCH_ALGORITHM_SLUGS line. */
export function researchSlugs(buildSource) {
  const m = buildSource.match(SLUG_LIST);
  if (!m) return null;
  return [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** buildSource with slug appended to RESEARCH_ALGORITHM_SLUGS (unchanged if present). */
export function addResearchSlug(buildSource, slug) {
  const slugs = researchSlugs(buildSource);
  if (!slugs) throw new Error('RESEARCH_ALGORITHM_SLUGS line not found in build.mjs');
  if (slugs.includes(slug)) return buildSource;
  return buildSource.replace(SLUG_LIST, (_, open, body, close) =>
    `${open}${body}${body.trim() ? ', ' : ''}'${slug}'${close}`);
}

/** Whether the research-tools README table has a row linking the slug. */
export function readmeHasRow(readme, slug) {
  return readme.includes(`(../../ventures/${slug}/)`);
}

/** Lines of a checker's output that name ventures/<slug>/. */
export function linesFor(output, slug) {
  return output.split('\n').filter((l) => l.startsWith(`ventures/${slug}/`));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function py(args) {
  return spawnSync('python3', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
}

async function main(argv) {
  const slug = argv.find((a) => !a.startsWith('--'));
  const check = argv.includes('--check');
  if (!slug || argv.includes('--help')) {
    console.log('usage: node platform/pages/register-tool.mjs <slug> [--check] [--research]');
    return slug ? 0 : 2;
  }
  const dir = path.join(ROOT, 'ventures', slug);
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`ventures/${slug}/index.html not found: write the page first (or check the slug)`);
    return 2;
  }
  const todo = [];
  const done = [];
  const ok = [];

  // 1. Research-algorithm registrations.
  const buildFile = path.join(HERE, 'build.mjs');
  const buildSource = fs.readFileSync(buildFile, 'utf8');
  const listed = (researchSlugs(buildSource) ?? []).includes(slug);
  const research = listed || argv.includes('--research');
  if (research) {
    if (listed) ok.push('build.mjs RESEARCH_ALGORITHM_SLUGS');
    else if (check) todo.push(`add '${slug}' to RESEARCH_ALGORITHM_SLUGS in platform/pages/build.mjs (run without --check to do it)`);
    else {
      fs.writeFileSync(buildFile, addResearchSlug(buildSource, slug));
      done.push('added to build.mjs RESEARCH_ALGORITHM_SLUGS');
    }
    if (readmeHasRow(read(README_FILE), slug)) ok.push(`${README_FILE} row`);
    else todo.push(`add a row to the Tools table in ${README_FILE}: | [\`${slug}\`](../../ventures/${slug}/) | <papers, Author Year; ...> | <the question it answers, in a searcher's words> |`);
  } else {
    const engines = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
    if (engines.some((f) => /export const PAPERS\b/.test(fs.readFileSync(path.join(dir, f), 'utf8')))) {
      console.log(`note: ventures/${slug} exports PAPERS; if it implements a published paper, rerun with --research`);
    }
  }

  // 2. Launch date.
  const { LAUNCHED_FILE, loadLaunchDates, refreshLaunchDates } = await import('./launched.mjs');
  const existing = await loadLaunchDates();
  if (existing[slug]) ok.push(`launched.json (${existing[slug]})`);
  else if (check) todo.push('launch date missing from platform/pages/launched.json (run without --check to add it)');
  else {
    const { launched } = await refreshLaunchDates([slug], { existing });
    fs.writeFileSync(LAUNCHED_FILE, `${JSON.stringify({ launched }, null, 2)}\n`);
    done.push(`launched.json: ${slug} ${launched[slug]}`);
  }

  // 3. Opt-out switch list (only a venture with a usage module is listed).
  const usage = `ventures/${slug}/usage.mjs`;
  if (!fs.existsSync(path.join(ROOT, usage))) {
    todo.push(`no ${usage}: copy one from a sibling tool (usage counting is part of done; PRODUCT_PLAYBOOK.md)`);
  } else if (read(SWITCHES_FILE).split('\n').includes(usage)) ok.push(SWITCHES_FILE);
  else if (check) todo.push(`${usage} missing from ${SWITCHES_FILE} (run without --check, or python3 platform/ci/sync_tree_counts.py)`);
  else {
    const r = py(['platform/ci/sync_tree_counts.py']);
    if (read(SWITCHES_FILE).split('\n').includes(usage)) done.push(`${SWITCHES_FILE} (sync_tree_counts.py)`);
    else todo.push(`sync_tree_counts.py did not list ${usage}; its switch may not work:\n${(r.stdout + r.stderr).trim()}`);
  }

  // 4. An inbound one-hop link from another tool's page.
  const { surveyTools, findOrphans } = await import('./siblings.mjs');
  const tools = await surveyTools(path.join(ROOT, 'ventures'));
  const me = tools.get(slug);
  if (me?.inbound.size) ok.push(`inbound sibling link (from ${[...me.inbound].sort().slice(0, 3).join(', ')})`);
  else {
    const nearest = findOrphans(tools).find((o) => o.slug === slug)?.nearest?.tool.slug;
    const researchPeers = research ? (researchSlugs(read('platform/pages/build.mjs')) ?? []).filter((s) => s !== slug).slice(-4) : [];
    const names = [...new Set([nearest, ...researchPeers].filter(Boolean))];
    todo.push(`no other tool links href="../${slug}/" (siblings orphan budget is 0): add one sentence to a related tool's index.html` +
      (names.length ? `, e.g. ${names.join(', ')}` : '') +
      ` (research tools: the "More research algorithms on your own data" paragraph), and a page.test.mjs assertion on the href there`);
  }

  // 5. Tree checks that new tools meet only in CI, filtered to this slug.
  for (const [script, label] of [['platform/ci/check_csv_formula_guard.py', 'CSV formula guard'],
    ['platform/ci/check_row_spread.py', 'row spreads into Math.min/max'],
    ['platform/ci/inherited_keys.py', 'object-map lookups without an own-key check']]) {
    const r = py(script.endsWith('inherited_keys.py') ? [script, slug] : [script]);
    const mine = script.endsWith('inherited_keys.py') && r.status !== 0
      ? (r.stdout + r.stderr).trim().split('\n') : linesFor(r.stdout, slug);
    if (mine.length) todo.push(`${label} (${script}):\n      ${mine.join('\n      ')}`);
    else ok.push(label);
  }

  for (const line of ok) console.log(`ok    ${line}`);
  for (const line of done) console.log(`fixed ${line}`);
  for (const line of todo) console.log(`TODO  ${line}`);
  console.log(todo.length
    ? `${todo.length} left for ${slug}; run venture-preflight.mjs ${slug} before merging`
    : `${slug}: registrations complete; run venture-preflight.mjs ${slug} before merging`);
  return todo.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error(e);
    process.exitCode = 2;
  });
}
