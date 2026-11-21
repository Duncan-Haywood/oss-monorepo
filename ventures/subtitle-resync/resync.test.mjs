import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './resync.mjs';

const CLI = fileURLToPath(new URL('./resync.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'subtitle-resync-'));
const input = join(dir, 'in.srt');
writeFileSync(input, '1\n00:00:10,000 --> 00:00:12,000\nOne\n\n2\n00:01:00,000 --> 00:01:02,000\nTwo\n');

function run(...argv) {
  return spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8' });
}

test('--offset shifts and writes to stdout', () => {
  const r = run(input, '--offset', '-2.5');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /00:00:07,500 --> 00:00:09,500/);
  assert.match(r.stderr, /method: offset/);
});

test('--fps 25:23.976 with -o writes the file', () => {
  const out = join(dir, 'out.srt');
  const r = run(input, '--fps', '25:23.976', '-o', out);
  assert.equal(r.status, 0, r.stderr);
  // 60 s * 25025/24000 = 62.5625 s
  assert.match(readFileSync(out, 'utf8'), /00:01:02,563 --> /);
});

test('two --sync points and --to vtt', () => {
  const r = run(input, '--sync', '10=11', '--sync', '00:01:00,000=00:01:03,000', '--to', 'vtt');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^WEBVTT/);
  assert.match(r.stdout, /00:00:11\.000 --> /);
  assert.match(r.stdout, /00:01:03\.000 --> /);
});

test('--json reports the timing, not the file', () => {
  const r = run(input, '--offset', '1', '--json');
  const j = JSON.parse(r.stdout);
  assert.equal(j.offsetMs, 1000);
  assert.equal(j.output, undefined);
});

test('usage errors exit 2', () => {
  assert.equal(run().status, 2);
  assert.equal(run(input, '--fps', '25').status, 2);
  assert.equal(run(input, '--bogus').status, 2);
  assert.equal(run(input, '--fps', '25:24', '--sync', '1=2').status, 2);
});

test('--help exits 0 and carries the no-warranty line', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No warranty/);
});

test('parseArgs reads a negative timestamp offset and the sync pair', () => {
  const a = parseArgs(['x.srt', '--offset', '-00:00:01,500', '--sync', '1=2']);
  assert.equal(a.offsetMs, -1500);
  assert.deepEqual(a.syncPoints, [{ fromMs: 1000, toMs: 2000 }]);
});

// --- red-team guards (2026-11-21) --------------------------------------------

test('an option missing its value is an error, not silently dropped', () => {
  assert.throws(() => parseArgs(['x.srt', '-o']), /-o needs a value/);
  assert.throws(() => parseArgs(['x.srt', '--offset']), /--offset needs a value/);
});

test('an unknown option is named as unknown, even after the input file', () => {
  assert.throws(() => parseArgs(['x.srt', '--bogus']), /unknown option --bogus/);
});

test('"-" reads the subtitle file from standard input', () => {
  assert.equal(parseArgs(['-', '--offset', '1']).input, '-');
  const r = spawnSync(process.execPath, [CLI, '-', '--offset', '1'], {
    encoding: 'utf8', input: '1\n00:00:10,000 --> 00:00:12,000\nOne\n',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /00:00:11,000 --> 00:00:13,000/);
});

test('the help text matches what the CLI does', () => {
  const help = run('--help').stdout;
  // Its two --offset examples are the same shift.
  const m = /seconds \((\S+)\) or a timestamp \((\S+)\)/.exec(help);
  assert.ok(m, 'offset examples in help');
  assert.equal(parseArgs(['x', '--offset', m[1]]).offsetMs, parseArgs(['x', '--offset', m[2]]).offsetMs);
  // The exit code it documents for a usage error is the one returned.
  const code = /\n(\d) usage or input error/.exec(help);
  assert.ok(code, 'usage exit code in help');
  assert.equal(run(input, '--bogus').status, Number(code[1]));
});
