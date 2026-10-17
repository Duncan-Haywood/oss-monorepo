import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DISCLAIMER, describePolicy, main } from './cli.mjs';
import { normalisePolicy } from './guard.mjs';
import { fileStore } from './store-file.mjs';
import { EXAMPLE_POLICY, exampleRunawayLog, normaliseRow, parseLog, simulate } from './simulate.mjs';

async function run(argv) {
  const out = [];
  const err = [];
  const code = await main(argv, { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {} });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('help carries the no-warranty disclaimer', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /No warranty/);
  assert.match(DISCLAIMER, /not financial advice/);
});

test('init writes a valid example policy and will not overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsg-'));
  const p = join(dir, 'policy.json');
  assert.equal((await run(['init', p])).code, 0);
  normalisePolicy(JSON.parse(readFileSync(p, 'utf8')));
  assert.equal((await run(['init', p])).code, 2);
});

test('check-policy summarises and names gaps', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsg-'));
  const p = join(dir, 'p.json');
  writeFileSync(p, JSON.stringify({ prices: { m: { in: 1, out: 1 } }, requireOutputCap: false }));
  const r = await run(['check-policy', p]);
  assert.equal(r.code, 0);
  assert.match(r.out, /gap: no global dollar budget/);
  assert.match(r.out, /gap: no breakers/);
  assert.match(r.out, /gap: calls without an output cap/);
  const { gaps } = describePolicy(normalisePolicy(EXAMPLE_POLICY));
  assert.deepEqual(gaps, [], 'the shipped example has no gaps');
  writeFileSync(p, '{"budgets":[{"window":"week","limitUsd":1}]}');
  const bad = await run(['check-policy', p]);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /budgets\[0\]\.window/);
});

test('simulate: the synthetic runaway loop is stopped by the repeat breaker, ordinary traffic is not', () => {
  const r = simulate(EXAMPLE_POLICY, exampleRunawayLog());
  assert.equal(r.totals.rows, 640);
  assert.equal(r.firstBlock.reasons[0].code, 'breaker-tripped');
  assert.equal(r.firstBlock.reasons[0].breaker, 'loop');
  assert.ok(r.totals.blockedUsd > 10 * r.totals.allowedUsd, 'most of the loop\'s spend is refused');
  // Every one of the 40 ordinary calls still goes through.
  const ordinaryRefused = r.refusals.filter((x) => x.row < 40);
  assert.equal(ordinaryRefused.length, 0);
  assert.ok(r.events.some((e) => e.type === 'trip'));
});

test('simulate CLI on a JSONL file, text and --json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsg-'));
  const p = join(dir, 'p.json');
  const log = join(dir, 'u.jsonl');
  writeFileSync(p, JSON.stringify(EXAMPLE_POLICY));
  writeFileSync(log, exampleRunawayLog().map((r) => JSON.stringify(r)).join('\n'));
  const text = await run(['simulate', p, log]);
  assert.equal(text.code, 0);
  assert.match(text.out, /refused \d+ \(\$[\d.]+ that would not have been spent\)/);
  assert.match(text.out, /not your invoice/);
  const json = JSON.parse((await run(['simulate', p, log, '--json'])).out);
  assert.equal(json.totals.rows, 640);
  assert.equal((await run(['simulate', p, join(dir, 'missing.jsonl')])).code, 2);
});

test('log parsing: JSONL, JSON array, CSV; Anthropic and OpenAI fields', () => {
  assert.equal(parseLog('{"a":1}\n{"a":2}\n').length, 2);
  assert.equal(parseLog('[{"a":1}]').length, 1);
  const csv = parseLog('created_at,model,input_tokens,output_tokens,user\n2026-10-01T00:00:00Z,m,"1,000",5,ann\n');
  assert.equal(csv[0].user, 'ann');
  assert.equal(csv[0].input_tokens, '1,000');
  assert.throws(() => parseLog('{"a":1}\nnope'), /line 2/);
  const o = normaliseRow({ model: 'g', timestamp: 1760000000, usage: { prompt_tokens: 100, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 40 } } }, 0);
  assert.deepEqual(o.usage, { input: 60, output: 3, cacheRead: 40, cacheWrite: 0 });
  assert.equal(o.t, 1760000000 * 1000);
  const a = normaliseRow({ model: 'c', input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 5, trace_id: 't' }, 1);
  assert.deepEqual(a.usage, { input: 10, output: 2, cacheRead: 5, cacheWrite: 0 });
  assert.equal(a.scope.run, 't');
  assert.notEqual(normaliseRow({}, 1).fingerprint, normaliseRow({}, 2).fingerprint, 'no hash in the log: rows are never counted as repeats');
});

test('file store persists across instances and refuses a corrupt file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsg-'));
  const p = join(dir, 'state.json');
  const a = fileStore(p, { flushMs: 0 });
  a.set('b|d|*|2026-10-16', { spent: 1, reserved: 0, calls: 1 });
  assert.equal(fileStore(p).get('b|d|*|2026-10-16').spent, 1);
  writeFileSync(p, '{broken');
  assert.throws(() => fileStore(p), /not valid JSON/);
});
