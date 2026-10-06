#!/usr/bin/env node
// CLI: lint App Store / Google Play listing text in a fastlane metadata tree
// (or a single locale folder) and exit non-zero when something would block a
// submission. Node 18+, no dependencies, no network; reads .txt files only and
// writes nothing.
//
//   node check.mjs fastlane/metadata
//   node check.mjs fastlane/metadata/android --store play
//   node check.mjs fastlane/metadata/en-US --avoid "uber,lyft" --strict
//   node check.mjs fastlane/metadata --json
//
// Exit codes: 0 clean, 1 a danger finding (or --strict and any finding),
// 2 the arguments or paths could not be used.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkListing, hasBlocking, SPEC_REVIEWED } from './engine.mjs';

const FILES = {
  name: 'name.txt', subtitle: 'subtitle.txt', keywords: 'keywords.txt', promotional_text: 'promotional_text.txt',
  description: 'description.txt', release_notes: 'release_notes.txt',
  title: 'title.txt', short_description: 'short_description.txt', full_description: 'full_description.txt',
};
const PLAY_FIELDS = new Set(['title', 'short_description', 'full_description']);

function readLocale(dir) {
  const fields = {};
  for (const [key, file] of Object.entries(FILES)) {
    const p = join(dir, file);
    if (existsSync(p) && statSync(p).isFile()) fields[key] = readFileSync(p, 'utf8').replace(/\r?\n$/, '');
  }
  return fields;
}

export function collectLocales(root) {
  const here = readLocale(root);
  if (Object.keys(here).length) return [{ locale: root.split('/').filter(Boolean).pop(), fields: here }];
  const out = [];
  for (const entry of readdirSync(root).sort()) {
    const sub = join(root, entry);
    if (!statSync(sub).isDirectory()) continue;
    const f = readLocale(sub);
    if (Object.keys(f).length) out.push({ locale: entry, fields: f });
    else if (entry === 'android') for (const l of collectLocales(sub)) out.push({ locale: `android/${l.locale}`, fields: l.fields });
  }
  return out;
}

export function run(argv, log = console.log) {
  const args = { store: null, avoid: [], json: false, strict: false, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--store') args.store = argv[++i];
    else if (a === '--avoid') args.avoid = String(argv[++i] ?? '').split(',');
    else if (a.startsWith('--')) { log(`unknown option ${a}`); return 2; }
    else args.paths.push(a);
  }
  if (args.paths.length !== 1 || (args.store && !['ios', 'play'].includes(args.store))) {
    log('usage: check.mjs [--store ios|play] [--avoid a,b] [--json] [--strict] <metadata-dir>');
    return 2;
  }
  let locales;
  try { locales = collectLocales(args.paths[0]); } catch (e) { log(`cannot read "${args.paths[0]}": ${e.message}`); return 2; }
  if (!locales.length) { log('no listing text files found (name.txt, keywords.txt, title.txt, ...)'); return 2; }

  const results = locales.map((l) => {
    const store = args.store || (Object.keys(l.fields).some((k) => PLAY_FIELDS.has(k)) ? 'play' : 'ios');
    return { locale: l.locale, ...checkListing({ store, fields: l.fields, avoid: args.avoid }) };
  });
  const all = results.flatMap((r) => r.findings);
  if (args.json) log(JSON.stringify({ specReviewed: SPEC_REVIEWED, results }, null, 2));
  else {
    for (const r of results) {
      log(`${r.locale} (${r.store}): ${r.findings.length ? r.findings.length + ' finding(s)' : 'clean'}`);
      for (const f of r.findings) log(`  [${f.severity}] ${f.title} -- ${f.detail}`);
    }
    log(`Rules reviewed ${SPEC_REVIEWED}; heuristics are advice, not a prediction of review. No warranty.`);
  }
  return hasBlocking(all) || (args.strict && all.length) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(run(process.argv.slice(2)));
