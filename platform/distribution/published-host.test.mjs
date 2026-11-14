// Regression tests for the 2026-11-07 quality audit of platform/distribution
// (portfolio/quality/audits/2026-11-07-distribution.json): metadata published to
// npm, PyPI and the stores cannot be edited after release, so it must name the
// served host; the PyPI import allowlist must hold on the declared Python floor;
// a Homebrew desc cut must never split an escape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, PUBLISHER, toolUrl } from './bluesky.mjs';
import { BASE_URL as HUB_BASE } from './hub/compose.mjs';
import { STDLIB_OK, PYTHON_FLOOR, pyproject } from './pypi.mjs';
import { formula } from './homebrew.mjs';
import { packageId } from './android.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('every generator links to the served host, not the retired github.io one', async () => {
  assert.equal(BASE_URL, 'https://marisstella.app/');
  assert.equal(HUB_BASE, BASE_URL);
  assert.ok(toolUrl('x').startsWith('https://marisstella.app/'));
  const files = (await fs.readdir(HERE)).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  files.push(...(await fs.readdir(path.join(HERE, 'hub'))).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map((f) => `hub/${f}`));
  for (const f of files) {
    const src = await fs.readFile(path.join(HERE, f), 'utf8');
    assert.doesNotMatch(src, /duncan-haywood\.github\.io\/oss-monorepo/, `${f} still links to the github.io host`);
  }
});

test('app ids come from the GitHub owner, so moving the site never renames them', () => {
  assert.equal(PUBLISHER, 'duncan-haywood');
  assert.equal(packageId('demo-tool'), 'io.github.duncanhaywood.demotool');
});

// Modules added to the standard library after 3.9, by version.
const ADDED_AFTER = { tomllib: '3.11' };
const ver = (v) => v.split('.').map(Number).reduce((a, n) => a * 100 + n, 0);

test('the PyPI allowlist only names modules present on the declared Python floor', () => {
  const py = pyproject({ name: 'x', slug: 'x', description: 'd', version: '0.1.0' });
  assert.match(py, new RegExp(`requires-python = ">=${PYTHON_FLOOR.replace('.', '\\.')}"`));
  for (const [mod, since] of Object.entries(ADDED_AFTER)) {
    if (STDLIB_OK.has(mod)) assert.ok(ver(PYTHON_FLOOR) >= ver(since), `${mod} needs Python ${since}, floor is ${PYTHON_FLOOR}`);
  }
});

test('a Homebrew desc cut at 80 never leaves a dangling escape', () => {
  // 79 plain characters then a quote: escaping first and cutting at 80 left `\` alone, ending the Ruby string early.
  const description = `${'a'.repeat(79)}"quoted"`;
  const rb = formula({ slug: 'demo-tool', description, sha256: '0'.repeat(64) });
  const desc = /^ {2}desc "((?:[^"\\]|\\.)*)"$/m.exec(rb);
  assert.ok(desc, `desc line is not a terminated Ruby string:\n${rb.split('\n')[1]}`);
  assert.equal(desc[1].replace(/\\(.)/g, '$1').length, 80);
});
