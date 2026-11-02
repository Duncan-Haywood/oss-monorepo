#!/usr/bin/env node
// Writes the usage-and-income blog posts into docs/posts/.
//
//   node platform/daily/usage-report-build.mjs                 # daily post for yesterday (UTC)
//   node platform/daily/usage-report-build.mjs --weekly        # also the week ending yesterday
//   node platform/daily/usage-report-build.mjs --today=2026-11-02 [--weekly] [--force] [--dry-run]
//
// --today is the publication date (default: the current UTC date); the daily
// post covers the day before it and the weekly post the seven days before it,
// so neither reports a day that is still running. An existing post is left
// alone unless --force. Reads only committed files:
//   portfolio/usage/site-visits.json   page loads per day (platform/counter/pull.mjs)
//   portfolio/usage/site-feedback.json feedback-form messages (counted, never quoted)
//   portfolio/usage/income.json        payments the owner has written down
//   portfolio/ledger/<latest>.yaml     mrr_end per venture
//   .github/FUNDING.yml                which ways to pay are open

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, composeDaily, composeWeekly, incomeFacts } from './usage-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const readText = (rel) => {
  const f = path.join(ROOT, rel);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};
const readJson = (rel) => {
  const t = readText(rel);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
};

export function loadSources(root = ROOT) {
  const visits = readJson('portfolio/usage/site-visits.json')?.days || {};
  const feedback = readJson('portfolio/usage/site-feedback.json')?.feedback || [];
  const ledgerDir = path.join(root, 'portfolio', 'ledger');
  const ledgerName = existsSync(ledgerDir)
    ? readdirSync(ledgerDir).filter((n) => /^\d{4}-\d{2}\.yaml$/.test(n)).sort().at(-1) || null
    : null;
  const income = incomeFacts({
    ledger: ledgerName ? readText(`portfolio/ledger/${ledgerName}`) : '',
    ledgerName: ledgerName && `portfolio/ledger/${ledgerName}`,
    funding: readText('.github/FUNDING.yml') || '',
    income: readJson('portfolio/usage/income.json'),
  });
  const firstDay = Object.keys(visits).sort()[0] ?? null;
  return { visits, feedback, income, firstDay };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const flag = (name) => process.argv.includes(`--${name}`);
  const today = arg('today') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD, got ${today}`);
  const src = loadSources();
  const posts = [composeDaily({ day: addDays(today, -1), date: today, ...src })];
  if (flag('weekly')) posts.push(composeWeekly({ end: addDays(today, -1), date: today, ...src }));
  const dir = path.join(ROOT, 'docs', 'posts');
  mkdirSync(dir, { recursive: true });
  for (const { name, text } of posts) {
    const file = path.join(dir, name);
    if (flag('dry-run')) { console.log(`--- ${name}\n${text}`); continue; }
    if (existsSync(file) && !flag('force')) { console.log(`exists, left alone: docs/posts/${name}`); continue; }
    writeFileSync(file, text);
    console.log(`wrote docs/posts/${name}`);
  }
}
