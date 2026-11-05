#!/usr/bin/env node
// usage: node cli.mjs checklist.txt file1.pdf file2.pdf ...   (or a folder: it lists names)
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { preflight, report } from './engine.mjs';
const [cl, ...rest] = process.argv.slice(2);
if (!cl) { console.error('usage: node cli.mjs checklist.txt <files or folder>...'); process.exit(2); }
const names = rest.flatMap(p => statSync(p).isDirectory() ? readdirSync(p) : [p.split('/').pop()]);
const res = preflight(readFileSync(cl, 'utf8'), names);
console.log(report(res));
process.exit(res.ok && !res.missing.length ? 0 : 1);
