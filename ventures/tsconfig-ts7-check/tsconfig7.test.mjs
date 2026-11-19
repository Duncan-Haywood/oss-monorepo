import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc, lineCol, checkConfig, suggestOptions, computed, mergeOptions, extendsList } from './tsconfig7.mjs';

const ids = (cfg, opts) => checkConfig(cfg, opts).findings.map((f) => f.id);
const co = (compilerOptions, extra = {}) => ({ compilerOptions, ...extra });
// A config that pins every changed default, so only the option under test speaks.
const PINNED = { strict: true, types: [], target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', esModuleInterop: true, rootDir: 'src', noUncheckedSideEffectImports: true };

test('parseJsonc reads comments, trailing commas and a BOM, and points at errors', () => {
  const r = parseJsonc('\uFEFF{\n // c\n "a": [1, 2,], /* x */ "b": {"c": "d\\n",},\n}');
  assert.deepEqual(r.value, { a: [1, 2], b: { c: 'd\n' } });
  const bad = parseJsonc('{\n  "a": 1\n  "b": 2\n}');
  assert.match(bad.error, /Expected ','/);
  assert.deepEqual(lineCol('{\n  "a": 1\n  "b": 2\n}', bad.offset), { line: 3, col: 3 });
  assert.match(parseJsonc('{"a": "x').error, /Unterminated string/);
  assert.match(parseJsonc('{} x').error, /after the JSON value/);
});

test('every option TypeScript 7 removed is an error, values matched case-insensitively', () => {
  const cases = [
    [{ target: 'ES5' }, 'removed:target=es5'],
    [{ downlevelIteration: false }, 'removed:downlevelIteration'],
    [{ moduleResolution: 'Node' }, 'removed:moduleResolution=node10'], // tsc names it node10
    [{ moduleResolution: 'node10' }, 'removed:moduleResolution=node10'],
    [{ moduleResolution: 'classic' }, 'removed:moduleResolution=classic'],
    [{ baseUrl: '.' }, 'removed:baseUrl'],
    [{ outFile: 'a.js' }, 'removed:outFile'],
    [{ module: 'AMD' }, 'removed:module=amd'],
    [{ module: 'umd' }, 'removed:module=umd'],
    [{ module: 'System' }, 'removed:module=system'],
    [{ module: 'None' }, 'removed:module=none'], // TS6046 in 7
    [{ esModuleInterop: false }, 'removed:esModuleInterop=false'],
    [{ allowSyntheticDefaultImports: false }, 'removed:allowSyntheticDefaultImports=false'],
    [{ alwaysStrict: false }, 'removed:alwaysStrict=false'],
  ];
  for (const [opt, id] of cases) {
    const r = checkConfig(co({ ...PINNED, ...opt }));
    assert.ok(r.findings.some((f) => f.id === id && f.severity === 'error'), `${JSON.stringify(opt)} -> ${id}: ${r.findings.map((f) => f.id)}`);
  }
  // Values that stay legal are not flagged.
  for (const opt of [{ esModuleInterop: true }, { allowSyntheticDefaultImports: true }, { alwaysStrict: true }, { module: 'commonjs' }, { moduleResolution: 'bundler' }, { target: 'es2015' }]) {
    assert.equal(checkConfig(co({ ...PINNED, ...opt })).summary.errors, 0, JSON.stringify(opt));
  }
});

test('options removed in 5.5 are errors too, as is references[].prepend', () => {
  const r = checkConfig(co({ ...PINNED, target: 'es3', keyofStringsOnly: true, charset: 'utf8', out: 'x.js', importsNotUsedAsValues: 'remove' }, { references: [{ path: '../a', prepend: true }] }));
  for (const id of ['removed:target=es3', 'removed:keyofStringsOnly', 'removed:charset', 'removed:out', 'removed:importsNotUsedAsValues', 'removed:references.prepend']) assert.ok(r.findings.some((f) => f.id === id), id);
  // TypeScript 7 no longer knows them: TS5023 (unknown option), TS6046 for target ES3.
  const charset = r.findings.find((f) => f.id === 'removed:charset');
  assert.equal(charset.ts7Code, 'TS5023');
  assert.equal(charset.ts6, 'error TS5102 (removed)');
  assert.equal(r.findings.find((f) => f.id === 'removed:target=es3').ts7Code, 'TS6046');
  // prepend: TS6 error, TS7 silently ignores it.
  const prepend = r.findings.find((f) => f.id === 'removed:references.prepend');
  assert.equal(prepend.severity, 'warning');
  assert.equal(prepend.ts7, 'ignored');
  // A false value that TypeScript 6 accepted is still unknown to 7.
  const f = checkConfig(co({ ...PINNED, keyofStringsOnly: false })).findings.find((x) => x.id === 'removed:keyofStringsOnly');
  assert.equal(f.ts6, 'accepted');
  assert.match(f.message, /even for this value/);
});

test('ignoreDeprecations: "6.0" is reported as silencing 6 but not 7', () => {
  const r = checkConfig(co({ ...PINNED, ignoreDeprecations: '6.0', baseUrl: '.' }));
  const f = r.findings.find((x) => x.id === 'removed:baseUrl');
  assert.match(f.ts6, /silenced/);
  assert.match(f.ts7, /TS5102/);
  assert.equal(r.findings.find((x) => x.id === 'ignoreDeprecations').severity, 'warning');
  assert.equal(checkConfig(co({ ...PINNED, ignoreDeprecations: '6.0' })).findings.find((x) => x.id === 'ignoreDeprecations').severity, 'info');
});

test('a fully pinned modern config has no findings', () => {
  assert.deepEqual(ids(co(PINNED)), []);
});

test('default changes fire only when the option is absent', () => {
  assert.ok(ids(co({ ...PINNED, strict: undefined })).includes('default:strict'));
  assert.ok(ids(co({ ...PINNED, types: undefined })).includes('default:types'));
  assert.ok(ids(co({ ...PINNED, noUncheckedSideEffectImports: undefined })).includes('default:noUncheckedSideEffectImports'));
  // rootDir: only when emitting into an outDir.
  assert.ok(ids(co({ ...PINNED, rootDir: undefined, outDir: 'dist' })).includes('default:rootDir'));
  assert.ok(!ids(co({ ...PINNED, rootDir: undefined, outDir: 'dist', noEmit: true })).includes('default:rootDir'));
  assert.ok(!ids(co({ ...PINNED, rootDir: undefined })).includes('default:rootDir'));
  // target/module: only when emitting, and only when the default really moved.
  assert.ok(ids(co({ ...PINNED, target: undefined, module: undefined, moduleResolution: undefined })).includes('default:target'));
  assert.ok(!ids(co({ ...PINNED, target: undefined, noEmit: true })).includes('default:target'));
  // module nodenext implied ESNext in 5.9 too... and ES2025 is not ESNext, so it moved.
  assert.ok(ids(co({ ...PINNED, target: undefined })).includes('default:target'));
  // alwaysStrict follows strict:false only in 5.9.
  assert.ok(ids(co({ ...PINNED, strict: false })).includes('default:alwaysStrictWithStrictOff'));
});

test('types: severity and message follow the @types packages the CLI found', () => {
  const cfg = co({ ...PINNED, types: undefined });
  const unknown = checkConfig(cfg).findings.find((f) => f.id === 'default:types');
  assert.equal(unknown.severity, 'warning');
  const none = checkConfig(cfg, { typesPackages: [] }).findings.find((f) => f.id === 'default:types');
  assert.equal(none.severity, 'info');
  const some = checkConfig(cfg, { typesPackages: ['jest', 'node'] }).findings.find((f) => f.id === 'default:types');
  assert.match(some.message, /@types\/jest, @types\/node/);
  assert.match(some.fix, /\["jest","node"\]/);
});

test('computed defaults match the 5.9 and 6.0 compiler sources', () => {
  // 5.9: target ES5 unless module is node16/18/20/nodenext; module follows target; classic unless commonjs/node*/preserve.
  assert.equal(computed.old59Target({}), 'es5');
  assert.equal(computed.old59Target({ module: 'node20' }), 'es2023');
  assert.equal(computed.old59Module({}), 'commonjs');
  assert.equal(computed.old59Module({ target: 'es2017' }), 'es2015');
  assert.equal(computed.old59Resolution({}), 'node10');
  assert.equal(computed.old59Resolution({ module: 'esnext' }), 'classic');
  // 6.0: target ES2025; module from target; bundler unless node*/legacy.
  assert.equal(computed.new6Target({}), 'es2025');
  assert.equal(computed.new6Module({}), 'es2022');
  assert.equal(computed.new6Module({ target: 'esnext' }), 'esnext');
  assert.equal(computed.new6Module({ target: 'es2015' }), 'es2015');
  assert.equal(computed.new6Resolution({}), 'bundler');
  assert.equal(computed.new6Resolution({ module: 'commonjs' }), 'bundler');
  assert.equal(computed.new6Resolution({ module: 'node18' }), 'node16');
});

test('extends: nearer configs win, base findings name their source, unread bases soften warnings', () => {
  assert.deepEqual(mergeOptions([{ a: 1 }, { a: 2, b: 2 }, { c: 3 }]), { a: 1, b: 2, c: 3 });
  assert.deepEqual(extendsList({ extends: ['a', 'b'] }), ['a', 'b']);
  const r = checkConfig(co({ strict: true }), { bases: [{ name: './base.json', config: co({ baseUrl: '.' }) }] });
  assert.match(r.findings.find((f) => f.id === 'removed:baseUrl').message, /set in \.\/base\.json/);
  const u = checkConfig(co({}), { unresolvedExtends: ['@acme/tsconfig'] });
  assert.equal(u.findings.find((f) => f.id === 'default:strict').severity, 'info');
  assert.ok(u.findings.some((f) => f.id === 'extends-unresolved'));
});

test('suggestOptions removes what 7 rejects, folds baseUrl into paths and pins changed defaults', () => {
  const cfg = co({ target: 'es5', module: 'commonjs', moduleResolution: 'node', baseUrl: 'src', paths: { '@lib/*': ['lib/*'] }, downlevelIteration: true, esModuleInterop: false, outDir: 'dist' });
  const { compilerOptions: o, notes } = suggestOptions(cfg, checkConfig(cfg).effective);
  assert.equal(o.target, 'es2015');
  assert.equal(o.module, 'nodenext');
  assert.equal(o.moduleResolution, 'nodenext');
  assert.deepEqual(o.paths, { '@lib/*': ['./src/lib/*'] });
  for (const k of ['baseUrl', 'downlevelIteration', 'esModuleInterop']) assert.ok(!(k in o), k);
  assert.equal(o.strict, false);
  assert.deepEqual(o.types, ['*']);
  assert.equal(o.rootDir, './src');
  assert.ok(notes.length >= 6);
  assert.deepEqual(suggestOptions(co({ baseUrl: '.', paths: { '@/*': ['./src/*'], x: ['lib/x'] } }), {}).compilerOptions.paths, { '@/*': ['./src/*'], x: ['./lib/x'] });
  assert.equal(checkConfig(co(o)).summary.errors, 0);
});
