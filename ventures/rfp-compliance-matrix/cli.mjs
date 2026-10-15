#!/usr/bin/env node
// Usage: node cli.mjs solicitation.txt [--format csv|md|json] > matrix.csv
import { readFileSync } from 'node:fs';
import { extract, toCsv, toMarkdown } from './extract.mjs';

const args = process.argv.slice(2);
const fmtAt = args.indexOf('--format');
const format = fmtAt >= 0 ? args[fmtAt + 1] : 'csv';
const file = args.find((a, i) => !a.startsWith('--') && (fmtAt < 0 || i !== fmtAt + 1));
if (!file || !['csv', 'md', 'json'].includes(format)) {
  console.error('usage: node cli.mjs <solicitation.txt|-> [--format csv|md|json]');
  process.exit(2);
}
const text = readFileSync(file === '-' ? 0 : file, 'utf8');
const result = extract(text);
for (const w of result.warnings) console.error(`note: ${w}`);
process.stdout.write(format === 'json' ? JSON.stringify(result, null, 2) + '\n' : format === 'md' ? toMarkdown(result) : toCsv(result));
