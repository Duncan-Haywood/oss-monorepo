#!/usr/bin/env node
// node cli.mjs [file.json ...] [--style ts|zod|jsonschema|go] [--name Root] [--readonly]
// cat samples.ndjson | node cli.mjs --style zod
import { readFileSync } from 'node:fs';
import { parseSamples, infer, generate, STYLES } from './types.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const style = opt('--style') || 'ts', rootName = opt('--name') || 'Root', readonly = flag('--readonly');
if (!STYLES.includes(style)) { console.error(`--style must be one of ${STYLES.join(', ')}`); process.exit(2); }
const files = args.filter((a) => a !== '-');
if (files.some((f) => f.startsWith('--'))) { console.error(`unknown arguments: ${files.filter((f) => f.startsWith('--')).join(' ')}`); process.exit(2); }

try {
  const texts = files.length ? files.map((f) => readFileSync(f, 'utf8')) : [readFileSync(0, 'utf8')];
  const samples = texts.flatMap((t) => parseSamples(t));
  const { code, warnings } = generate(infer(samples), { style, rootName, readonly });
  process.stdout.write(code);
  for (const w of warnings) console.error(`note: ${w}`);
} catch (e) { console.error(e.message); process.exit(2); }
