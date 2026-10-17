#!/usr/bin/env node
// Usage: node cli.mjs solicitation.txt [--format csv|md|json] > matrix.csv
//        node cli.mjs rfp.txt --outline            # proposal skeleton (Markdown)
//        node cli.mjs rfp.txt --coverage draft.txt # which requirements the draft misses
//        ANTHROPIC_API_KEY=... node cli.mjs rfp.txt --refine   # LLM split of compound requirements
import { readFileSync } from 'node:fs';
import { extract, toCsv, toMarkdown, csvCell } from './extract.mjs';
import { toOutlineMarkdown, coverage, coverageToCsv } from './shred.mjs';
import { refine } from './llm.mjs';

const args = process.argv.slice(2);
const valueOf = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined; };
const fmtAt = args.indexOf('--format');
const covAt = args.indexOf('--coverage');
const format = valueOf('--format') ?? 'csv';
const file = args.find((a, i) => !a.startsWith('--') && (fmtAt < 0 || i !== fmtAt + 1) && (covAt < 0 || i !== covAt + 1));
if (!file || !['csv', 'md', 'json'].includes(format) || (covAt >= 0 && !valueOf('--coverage'))) {
  console.error('usage: node cli.mjs <solicitation.txt|-> [--format csv|md|json] [--outline] [--coverage draft.txt] [--refine]');
  process.exit(2);
}
const text = readFileSync(file === '-' ? 0 : file, 'utf8');
let result = extract(text);
if (args.includes('--refine')) {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('--refine needs ANTHROPIC_API_KEY (your own key; the text of the requirements is sent to the Anthropic API)'); process.exit(2); }
  result = await refine(result, { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.LLM_MODEL || undefined });
}
for (const w of result.warnings) console.error(`note: ${w}`);
if (args.includes('--outline')) {
  process.stdout.write(toOutlineMarkdown(result));
} else if (covAt >= 0) {
  const cov = coverage(result, readFileSync(valueOf('--coverage'), 'utf8'));
  console.error(`coverage: ${cov.summary.addressed} addressed, ${cov.summary.partial} partial, ${cov.summary.missing} missing; mandatory gaps: ${cov.mandatoryGaps.join(', ') || 'none'}`);
  process.stdout.write(format === 'json' ? JSON.stringify(cov, null, 2) + '\n' : coverageToCsv(cov, csvCell));
} else {
  process.stdout.write(format === 'json' ? JSON.stringify(result, null, 2) + '\n' : format === 'md' ? toMarkdown(result) : toCsv(result));
}
