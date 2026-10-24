#!/usr/bin/env node
// Writes the daily editions under <out> (dev/daily/ on the site):
//
//   index.html               newest engineering brief
//   show/index.html          newest Merge Report
//   <day>/index.html         the brief for each of the last 7 complete UTC days
//   <day>/show/index.html    the Merge Report for each of those days
//   <day>/facts.json         the facts both were written from
//   feed.xml                 Atom feed of every edition
//
//   node platform/daily/build.mjs --out=_site/dev/daily \
//     [--stats=<dev/stats.json>] [--asks=<decision_queue.py --json output>] [--days=7] [--now=<ISO time>]
//
// Archive editions come straight from git history, so a fresh build recreates
// the whole week with no stored state. Only the newest edition carries the CI
// and pull-request snapshot from --stats, because that is the moment it describes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEditions } from './collect.mjs';
import { composeBrief, composeShow } from './compose.mjs';
import { renderEdition, renderFeed } from './render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = path.resolve(arg('out') ?? path.join(repo, '_site', 'dev', 'daily'));
const days = Number(arg('days') ?? 7);
const baseUrl = process.env.PAGES_BASE_URL || 'https://duncan-haywood.github.io/oss-monorepo/';

const readJson = (file) => {
  if (!file || !existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null; // A missing source is reported in the page as not recorded, never invented.
  }
};

const now = arg('now') ? Date.parse(arg('now')) : Date.now();
const facts = collectEditions(repo, { now, days, stats: readJson(arg('stats')), asks: readJson(arg('asks')) });
const editions = facts.editions.map((f) => ({ facts: f, brief: composeBrief(f), show: composeShow(f) }));
const archive = editions.map((e) => e.facts.day);

const write = (rel, body) => {
  const file = path.join(out, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
};
const opts = { archive, generatedAt: facts.generated_at, baseUrl };
for (const [i, e] of editions.entries()) {
  const day = e.facts.day;
  write(`${day}/index.html`, renderEdition(e.brief, { ...opts, toDaily: '../', toRoot: '../../../' }));
  write(`${day}/show/index.html`, renderEdition(e.show, { ...opts, toDaily: '../../', toRoot: '../../../../' }));
  write(`${day}/facts.json`, `${JSON.stringify(e.facts, null, 2)}\n`);
  if (i === 0) {
    write('index.html', renderEdition(e.brief, { ...opts, latest: true, toDaily: '', toRoot: '../../' }));
    write('show/index.html', renderEdition(e.show, { ...opts, latest: true, toDaily: '../', toRoot: '../../../' }));
  }
}
write('feed.xml', renderFeed(editions, { baseUrl, generatedAt: facts.generated_at }));

const newest = editions[0];
console.log(`daily -> ${out} (${editions.length} days; newest ${newest.facts.day}: ${newest.facts.merges} merges, brief ${newest.brief.minutes} min, show ${newest.show.minutes} min; snapshot ${newest.facts.snapshot ? 'yes' : 'no'}; git ${facts.git.available ? 'ok' : facts.git.reason})`);
