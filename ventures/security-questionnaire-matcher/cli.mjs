#!/usr/bin/env node
// Usage: node cli.mjs questionnaire.csv --library answers.csv [--format csv|md|json] > filled.csv
import { readFileSync } from 'node:fs';
import { parseQuestions, parseLibrary, fill, toCsv, toMarkdown } from './matcher.mjs';

const args = process.argv.slice(2);
const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const format = val('--format') || 'csv';
const libFile = val('--library');
const skip = new Set(['--format', '--library'].flatMap((f) => { const i = args.indexOf(f); return i >= 0 ? [i, i + 1] : []; }));
const file = args.find((a, i) => !skip.has(i) && !a.startsWith('--'));
if (!file || !libFile || !['csv', 'md', 'json'].includes(format)) {
  console.error('usage: node cli.mjs <questionnaire.csv|txt> --library <answers.csv> [--format csv|md|json]');
  process.exit(2);
}
const questions = parseQuestions(readFileSync(file, 'utf8'));
const library = parseLibrary(readFileSync(libFile, 'utf8'));
if (!questions.length) { console.error('note: no questions found'); process.exit(1); }
if (!library.length) console.error('note: the library is empty, so every question will need a written answer');
const result = fill(questions, library);
console.error(`note: ${result.counts.strong} strong, ${result.counts.review} to review, ${result.counts.none} need a new answer`);
process.stdout.write(format === 'json' ? JSON.stringify(result, null, 2) + '\n' : format === 'md' ? toMarkdown(result) : toCsv(result));
