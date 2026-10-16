#!/usr/bin/env node
// Writes the development analyses: <out>/index.html, <out>/analyses.json,
// <out>/experiments/, and one page per report, drift report and study.
//
//   node platform/devlog/build.mjs --out=_site/dev/analyses

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './devlog.mjs';
import { renderDoc, renderExperiments, renderIndex, toJson } from './render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = path.resolve(outArg ? outArg.slice(6) : path.join(repo, '_site', 'dev', 'analyses'));

const a = collect(repo);
const write = (rel, body) => {
  const file = path.join(out, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
};
write('index.html', renderIndex(a));
write('analyses.json', JSON.stringify(toJson(a), null, 2) + '\n');
write(path.join('experiments', 'index.html'), renderExperiments(a));
let pages = 2;
for (const kind of ['reports', 'drift', 'studies']) {
  for (const doc of a[kind]) {
    write(path.join(kind, doc.slug, 'index.html'), renderDoc(doc, kind, a.generated));
    pages++;
  }
}
console.log(`dev analyses -> ${out} (${pages} pages, ${a.runs.records} run records)`);
