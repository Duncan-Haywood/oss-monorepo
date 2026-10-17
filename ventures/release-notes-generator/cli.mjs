#!/usr/bin/env node
// node cli.mjs [--from v1.2.0] [--to HEAD] [--version 1.3.0] [--style keepachangelog|github|plain] [--repo https://github.com/o/r] [--authors] [--bump]
// git log | node cli.mjs --stdin   (stdin must use the FORMAT in changelog.mjs)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FORMAT, parseLog, render, summarize, bumpVersion } from './changelog.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const from = opt('--from'), to = opt('--to') || 'HEAD', version = opt('--version'), style = opt('--style') || 'keepachangelog';
const repo = opt('--repo') || '', date = opt('--date');
const authors = flag('--authors'), wantBump = flag('--bump'), stdin = flag('--stdin'), json = flag('--json');
const skip = (opt('--skip') || '').split(',').filter(Boolean);
if (!['keepachangelog', 'github', 'plain'].includes(style)) { console.error('--style must be keepachangelog, github or plain'); process.exit(2); }
if (args.length) { console.error(`unknown arguments: ${args.join(' ')}`); process.exit(2); }

let text;
try {
  text = stdin ? readFileSync(0, 'utf8') : execFileSync('git', ['log', `--format=${FORMAT}`, from ? `${from}..${to}` : to], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) { console.error(`cannot read git log: ${e.message.split('\n')[0]}`); process.exit(2); }
const commits = parseLog(text);
const s = summarize(commits);
if (wantBump) {
  const next = from ? bumpVersion(from, s.bump) : null;
  console.log(json ? JSON.stringify({ bump: s.bump, next }) : `${s.bump}${next ? ` -> ${next}` : ''}`);
  process.exit(0);
}
if (json) { console.log(JSON.stringify({ summary: s, commits }, null, 2)); process.exit(0); }
process.stdout.write(render(commits, { version: version || 'Unreleased', date, style, repo, authors, skip }));
for (const w of s.warnings) console.error(`note: ${w}`);
