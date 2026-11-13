// Guards for rows-reserve.mjs (docs/reports/polish-2026-11-13-rows-reserve.md):
// tools that fill an empty host with starting rows from a module script keep
// the rows' height reserved until DOMContentLoaded, so the page does not jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bands, renderBlock, writeBlock, bareDivIds, START, END, READY_CLASS, SKIP } from './rows-reserve.mjs';

const VENTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

test('bands never reserve more than the smallest height measured in them', () => {
  const samples = [];
  for (let w = 320; w <= 1600; w += 4) samples.push([w, w < 784 ? 1300 + (784 - w) / 10 : 250]);
  const out = bands(samples);
  assert.equal(out[0].from, 0);
  for (const [i, b] of out.entries()) {
    const to = i + 1 < out.length ? out[i + 1].from - 1 : Infinity;
    const inBand = samples.filter(([w]) => w >= b.from && w <= to).map(([, h]) => h);
    assert.ok(b.reserve <= Math.min(...inBand), `band from ${b.from} reserves ${b.reserve}`);
  }
  // The scrollbar margin: the desktop band starts at 784 but must also fit 760 to 783 as a real
  // window of 784 lays out ~15 px narrower; here those widths are taller, so it stays 250.
  assert.equal(out.at(-1).reserve, 250);
  assert.ok(out.length <= 6);
});

test('the block only reserves while scripting is on, the host is empty and the page is not ready', () => {
  const block = renderBlock([{ id: 'openings', bands: [{ from: 0, reserve: 900 }, { from: 984, reserve: 400 }] }]);
  assert.ok(block.startsWith(START) && block.endsWith(END));
  assert.match(block, /@media \(scripting:enabled\)\{html:not\(\.pf-rows-ready\) #openings:empty\{min-height:900px\}\}/);
  assert.match(block, /@media \(scripting:enabled\) and \(min-width:984px\)\{html:not\(\.pf-rows-ready\) #openings:empty\{min-height:400px\}\}/);
  assert.match(block, new RegExp(`addEventListener\\('DOMContentLoaded'.*classList\\.add\\('${READY_CLASS}'\\)`));
  const html = '<html><head>\n  <title>t</title>\n</head><body></body></html>';
  const once = writeBlock(html, block);
  assert.equal(writeBlock(once, block), once, 'writing twice replaces, not appends');
  assert.ok(once.indexOf(END) < once.indexOf('</head>'));
});

const ventures = fs.readdirSync(VENTURES).filter((s) => fs.existsSync(path.join(VENTURES, s, 'index.html')));

test('every tool that builds STARTING_* rows into an empty host reserves their height', () => {
  const missing = [];
  for (const slug of ventures) {
    if (SKIP.has(slug)) continue;
    const html = fs.readFileSync(path.join(VENTURES, slug, 'index.html'), 'utf8');
    if (!/STARTING_[A-Z_]+\.forEach\(add\w+\)/.test(html) || !bareDivIds(html).length) continue;
    if (!html.includes(START)) missing.push(slug);
  }
  assert.deepEqual(missing, [], 'run node platform/pages/rows-reserve.mjs --base <server> --write <slug>');
});

test('every reservation names a host the page still ships empty', () => {
  for (const slug of ventures) {
    const html = fs.readFileSync(path.join(VENTURES, slug, 'index.html'), 'utf8');
    if (!html.includes(START)) continue;
    const block = html.slice(html.indexOf(START), html.indexOf(END));
    const ids = new Set([...block.matchAll(/#([\w-]+):empty/g)].map((m) => m[1]));
    assert.ok(ids.size, `${slug}: empty rows-reserve block`);
    const bare = new Set(bareDivIds(html));
    for (const id of ids) assert.ok(bare.has(id), `${slug}: #${id} is reserved but no longer an empty <div id="${id}"></div>`);
    assert.ok(html.indexOf(END) < html.indexOf('</head>'), `${slug}: block outside <head>`);
  }
});
