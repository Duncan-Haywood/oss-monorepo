#!/usr/bin/env node
// Writes the development dashboard: <out>/index.html and <out>/stats.json.
//
//   node platform/devstats/build.mjs --out=_site/dev
//
// With GITHUB_TOKEN and GITHUB_REPOSITORY set (the publish workflow sets both)
// it adds PR, review, CI and branch metrics from the GitHub API; without them
// those rows read "not measured". --previous=<stats.json> (the published copy)
// lets it reuse CI counts for days that copy already counted in full.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './devstats.mjs';
import { renderDashboard } from './render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = path.resolve(outArg ? outArg.slice(6) : path.join(repo, '_site', 'dev'));

const prevArg = process.argv.find((a) => a.startsWith('--previous='));
let previous = null;
if (prevArg && existsSync(prevArg.slice(11))) {
  try {
    previous = JSON.parse(readFileSync(prevArg.slice(11), 'utf8'));
  } catch {
    // An unreadable previous copy only costs a full recount.
  }
}

const stats = await collect(repo, {
  token: process.env.GITHUB_TOKEN,
  ghRepo: process.env.GITHUB_REPOSITORY,
  previous,
});
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
writeFileSync(path.join(out, 'index.html'), renderDashboard(stats));
console.log(`dev dashboard -> ${out} (github: ${stats.github.available ? 'measured' : stats.github.reason}; ci: ${stats.ci.available ? `${stats.ci.runs} runs, ${stats.ci.coverage.reused_days} days reused` : stats.ci.reason})`);
