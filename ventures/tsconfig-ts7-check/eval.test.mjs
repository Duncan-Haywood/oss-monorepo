// Replays what the real compilers said (recorded by the probes in eval/)
// against checkConfig, so CI checks the rules against tsc 6.0.3 and 7.0.2
// without downloading them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkConfig } from './tsconfig7.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const REJECT = /^(TS5102|TS5108|TS5023|TS6046) /;

test('option matrix: the checker reports exactly the single options tsc 7.0.2 rejects, with its code', () => {
  const matrix = read('./eval/option-matrix.json');
  assert.ok(matrix.length > 200, `matrix has ${matrix.length} rows`);
  let rejected = 0;
  for (const row of matrix) {
    if (row.name === 'references.prepend') continue; // checked below
    const codes7 = row['7.0'].split(' | ').filter((d) => REJECT.test(d)).map((d) => d.slice(0, 6));
    const cfg = { compilerOptions: { [row.name]: row.value } };
    const got = checkConfig(cfg).findings.filter((f) => f.ts7Code).map((f) => f.ts7Code);
    assert.deepEqual(got.sort(), [...new Set(codes7)].filter((c) => c !== 'TS5095').sort(), `${row.name}=${JSON.stringify(row.value)}: tsc 7 said "${row['7.0']}"`);
    if (codes7.length) rejected++;
  }
  assert.ok(rejected >= 25, `${rejected} rejected single options`);
});

test('option matrix: TypeScript 6 deprecation codes match the ts6 field', () => {
  for (const row of read('./eval/option-matrix.json')) {
    if (row.name === 'references.prepend' || row.name === 'ignoreDeprecations') continue;
    const m = /^(TS5101|TS5107|TS5102|TS5108) /.exec(row['6.0']);
    const f = checkConfig({ compilerOptions: { [row.name]: row.value } }).findings.find((x) => x.ts7Code);
    if (!m) { if (f) assert.equal(f.ts6, 'accepted', `${row.name}=${JSON.stringify(row.value)}`); continue; }
    assert.ok(f, `${row.name}=${JSON.stringify(row.value)} is ${m[1]} in tsc 6 but not flagged`);
    assert.match(f.ts6, new RegExp(m[1]), `${row.name}=${JSON.stringify(row.value)}`);
  }
});

test('option matrix: prepend is an error in 6 and silently ignored in 7, as the checker says', () => {
  const row = read('./eval/option-matrix.json').find((r) => r.name === 'references.prepend');
  assert.match(row['6.0'], /TS5102/);
  assert.doesNotMatch(row['7.0'], /TS5102|TS5023/);
  const f = checkConfig({ compilerOptions: {}, references: [{ path: './ref', prepend: true }] }).findings.find((x) => x.id === 'removed:references.prepend');
  assert.equal(f.ts7, 'ignored');
});

test('defaults probe: each changed default shows the behaviour change the checker describes', () => {
  const d = read('./eval/defaults.json');
  assert.equal(d.strict['5.9'], '');
  assert.match(d.strict['7.0'], /TS7006/);
  assert.match(d.target_module['5.9'], /__awaiter[\s\S]*exports\./);
  assert.match(d.target_module['7.0'], /export const f = async/);
  assert.match(d.esModuleInterop['5.9'], /TS1259/);
  assert.equal(d.esModuleInterop['7.0'], '');
  assert.equal(d.types['5.9'], '');
  assert.match(d.types['7.0'], /TS2304/);
  assert.match(d.rootDir['5.9'], /emitted: out\/a\.js$/);
  assert.match(d.rootDir['7.0'], /TS5011[\s\S]*emitted: out\/src\/a\.js$/);
  assert.equal(d.sideEffect['5.9'], '');
  assert.match(d.sideEffect['7.0'], /TS2882/);
  assert.match(d.moduleResolution_exports['5.9'], /TS2792/);
  assert.equal(d.moduleResolution_exports['7.0'], '');
  for (const k of Object.keys(d)) assert.equal(d[k]['6.0'].replace(/\(1,\d+\)/g, ''), d[k]['7.0'].replace(/\(1,\d+\)/g, ''), `6 and 7 agree on ${k}`);
});

test('corpus eval: every config agrees with tsc 7.0.2 and every suggestion compiles clean', () => {
  const { summary, rows } = read('./eval/results.json');
  assert.equal(summary.tsc7, 'Version 7.0.2');
  assert.equal(summary.tsc6, 'Version 6.0.3');
  for (const r of rows) {
    assert.ok(r.removedMatch, `${r.id}: predicted ${r.predicted} vs tsc7 ${r.tsc7Removed}`);
    assert.ok(r.rootDirMatch, `${r.id}: rootDir`);
    assert.ok(r.suggestionClean, `${r.id}: suggestion -> tsc6 ${r.afterTsc6} tsc7 ${r.afterTsc7}`);
  }
  assert.equal(summary.agree, rows.length);
});

test('corpus eval: today\'s rules still predict what tsc 7.0.2 recorded for each bundled config', async () => {
  const { parseJsonc } = await import('./tsconfig7.mjs');
  const { rows } = read('./eval/results.json');
  let n = 0;
  for (const r of rows.filter((x) => !x.id.startsWith('repo/'))) {
    const cfg = parseJsonc(readFileSync(new URL(`./eval/corpus/${r.id}`, import.meta.url), 'utf8')).value;
    const got = [...new Set(checkConfig({ compilerOptions: cfg.compilerOptions || {} }).findings.filter((f) => f.ts7Code).map((f) => `${f.option}:${f.ts7Code}`))].sort();
    assert.deepEqual(got, r.tsc7Removed, r.id);
    n++;
  }
  assert.ok(n >= 40, `${n} bundled configs`);
});
