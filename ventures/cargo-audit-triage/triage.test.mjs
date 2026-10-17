import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCrates, isTestPath, parseAudit, triage, summaryLine, crateIdent, BUCKETS } from './triage.mjs';

const advisory = (id, pkg, patched = ['>=1.2.0'], extra = {}) => ({
  advisory: { id, package: pkg, title: `${pkg} issue`, aliases: [`CVE-${id}`], ...extra },
  versions: { patched, unaffected: [] },
  package: { name: pkg, version: '1.0.0' },
});

const AUDIT = {
  vulnerabilities: { found: true, count: 3, list: [advisory('RUSTSEC-2020-0001', 'serde-json'), advisory('RUSTSEC-2021-0002', 'tokio-test'), advisory('RUSTSEC-2022-0003', 'openssl-sys', [])] },
  warnings: { unmaintained: [{ kind: 'unmaintained', package: { name: 'atty', version: '0.2.14' }, advisory: { id: 'RUSTSEC-2021-0145', package: 'atty', title: 'unmaintained' }, versions: { patched: [] } }] },
};

test('crateIdent turns dashes into underscores', () => {
  assert.equal(crateIdent('Serde-Json'), 'serde_json');
});

test('extractCrates reads use, extern crate, brace groups and paths', () => {
  const src = `
    extern crate openssl;
    use serde_json::Value;
    use {tokio::spawn, reqwest};
    pub use ::regex::Regex;
    fn f() { let _ = chrono::Utc::now(); }
  `;
  const c = extractCrates(src);
  for (const n of ['openssl', 'serde_json', 'tokio', 'reqwest', 'regex', 'chrono']) assert.ok(c.has(n), n);
});

test('comments and string literals do not count', () => {
  const c = extractCrates(`// use leftpad::pad;\n/* use ghost::x; */\nlet s = "use phantom::Thing;";\nlet r = r#"use raw::A;"#;`);
  for (const n of ['leftpad', 'ghost', 'phantom', 'raw']) assert.ok(!c.has(n), n);
});

test('test, bench, example and build-script paths are not runtime', () => {
  for (const p of ['tests/api.rs', 'benches/b.rs', 'examples/demo.rs', 'build.rs', 'crates/a/build.rs', 'src/foo_test.rs']) assert.ok(isTestPath(p), p);
  for (const p of ['src/main.rs', 'src/lib.rs', 'crates/a/src/util.rs']) assert.ok(!isTestPath(p), p);
});

test('parseAudit merges vulnerabilities and warnings per crate and version', () => {
  const { entries } = parseAudit(AUDIT);
  assert.equal(entries.length, 4);
  const atty = entries.find((e) => e.name === 'atty');
  assert.equal(atty.kind, 'unmaintained');
});

test('parseAudit rejects bad input with a message', () => {
  assert.match(parseAudit('{nope').error, /not valid JSON/);
  assert.match(parseAudit({ foo: 1 }).error, /cargo audit --json/);
});

test('imported vulnerable crates rank first and are urgent', () => {
  const files = [
    { path: 'src/main.rs', text: 'use serde_json::json;\nuse atty::is;' },
    { path: 'tests/it.rs', text: 'use tokio_test::block_on;' },
  ];
  const r = triage(AUDIT, files);
  assert.deepEqual(r.items.map((i) => [i.name, i.bucket]), [
    ['serde-json', 'imported'], ['atty', 'imported'], ['tokio-test', 'test-only'], ['openssl-sys', 'not-referenced'],
  ]);
  assert.deepEqual(r.urgent.map((i) => i.name), ['serde-json']);
  assert.equal(r.counts.imported, 2);
});

test('a used-but-only-warned crate is not a failing finding', () => {
  const r = triage(AUDIT, [{ path: 'src/lib.rs', text: 'use atty::is;' }]);
  assert.equal(r.urgent.length, 0);
});

test('fix text names patched ranges and flags unpatched advisories', () => {
  const r = triage(AUDIT, []);
  assert.equal(r.items.find((i) => i.name === 'serde-json').fix, 'upgrade to >=1.2.0');
  assert.match(r.items.find((i) => i.name === 'openssl-sys').fix, /no patched version/);
  assert.match(r.items.find((i) => i.name === 'atty').fix, /maintained replacement/);
});

test('an empty report says so', () => {
  const r = triage({ vulnerabilities: { found: false, count: 0, list: [] }, warnings: {} }, []);
  assert.equal(r.total, 0);
  assert.match(summaryLine(r), /no vulnerable/);
});

test('summaryLine counts every bucket', () => {
  const r = triage(AUDIT, [{ path: 'src/main.rs', text: 'use serde_json::json;' }]);
  assert.match(summaryLine(r), /^4 flagged crate\(s\): 1 used by your runtime code, 0 only in tests/);
  assert.deepEqual(BUCKETS, ['imported', 'test-only', 'not-referenced']);
});
