import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { run, parseArgs, splitLocale } from './cli.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const capture = (files = {}) => { const lines = []; return { lines, out: (s) => lines.push(s), read: (p) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; } }; };

test('cli: the bundled examples exit 1 and name each problem', () => {
  const r = spawnSync(process.execPath, ['cli.mjs', 'examples/en.json', 'examples/fr.json', 'examples/pl.json'], { cwd: here, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /examples\/fr.json \(fr\)/);
  assert.match(r.stdout, /An apostrophe before "\{"/);
  assert.match(r.stdout, /Did you mean \{name\}\?/);
  assert.match(r.stdout, /in pl numbers such as 2, 3, 4, 22, 23, 24/);
  assert.match(r.stdout, /4 errors, 5 warnings/);
});

test('cli: warnings alone exit 0, or 1 with --strict', () => {
  const files = { 'en.json': '{"n":"{n, plural, one {#} other {#}}"}', 'pl.json': '{"n":"{n, plural, one {#} other {#}}"}' };
  assert.equal(run(['en.json', 'pl.json'], capture(files)), 0);
  assert.equal(run(['en.json', 'pl.json', '--strict'], capture(files)), 1);
});

test('cli: --source picks the source file and file:locale sets a locale', () => {
  const files = { 'a.json': '{"k":"Hi {name}"}', 'b.json': '{"k":"Salut"}' };
  const c = capture(files);
  assert.equal(run(['b.json:fr', '--source', 'a.json:en'], c), 1);
  assert.match(c.lines.join('\n'), /a.json \(en, source\)[\s\S]*b.json \(fr\)[\s\S]*never uses \{name\}/);
});

test('cli: --message with --locale prints diagnostics and a preview; --json parses', () => {
  const c = capture();
  assert.equal(run(['--message', '{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}', '--locale', 'pl'], c), 0);
  assert.match(c.lines.join('\n'), /n=22 "few"|n=2 "few": 2 pliki/);
  const j = capture();
  run(['--message', "l'{x}", '--json'], j);
  const parsed = JSON.parse(j.lines.join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.diagnostics[0].code, 'quoted-placeholder');
});

test('cli: bad arguments and unreadable files exit 2', () => {
  assert.equal(run([], capture()), 2);
  assert.equal(run(['--bogus'], capture()), 2);
  assert.equal(run(['--message', 'x', '--locale', 'not a locale'], capture()), 2);
  assert.equal(run(['missing.json'], capture()), 2);
  assert.throws(() => parseArgs(['--source']), /needs a value/);
});

test('cli: splitLocale leaves paths without a locale suffix alone', () => {
  assert.deepEqual(splitLocale('locales/app.json:pt-BR'), { path: 'locales/app.json', locale: 'pt-BR' });
  assert.deepEqual(splitLocale('C:\\l10n\\fr.json'), { path: 'C:\\l10n\\fr.json', locale: null });
  assert.deepEqual(splitLocale('fr.json'), { path: 'fr.json', locale: null });
});
