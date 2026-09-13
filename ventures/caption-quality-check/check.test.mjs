import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheck } from './check.mjs';

test('runCheck: a clean track reports ok with zero findings', () => {
  const vtt = [
    'WEBVTT', '', '00:00:01.000 --> 00:00:04.000', 'Hello there', '',
    '00:00:05.000 --> 00:00:07.000', 'Friend', '',
  ].join('\n');
  const result = runCheck(vtt);
  assert.equal(result.ok, true);
  assert.equal(result.dangerCount, 0);
});

test('runCheck: options thread through to the underlying engine', () => {
  const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'x'.repeat(15), ''].join('\n');
  const withoutOverride = runCheck(vtt);
  const withOverride = runCheck(vtt, { maxCps: 10 });
  assert.equal(withoutOverride.ok, true, '15 cps is under the default 20 cap');
  assert.equal(withOverride.ok, false, '15 cps is over a lowered 10 cap');
});

function withTempFile(content, ext, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'caption-check-'));
  const path = join(dir, `sample${ext}`);
  writeFileSync(path, content);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI: exits 0 and prints a report for a clean SRT file', () => {
  const srt = ['1', '00:00:01,000 --> 00:00:04,000', 'Hello world', ''].join('\n');
  withTempFile(srt, '.srt', (path) => {
    const out = execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname, path], { encoding: 'utf8' });
    assert.match(out, /Format detected: srt/);
    assert.match(out, /None of the checked caption-quality issues were found/);
  });
});

test('CLI: exits 1 for a track with a danger finding', () => {
  const srt = ['1', '00:00:01,000 --> 00:00:02,000', 'x'.repeat(60), ''].join('\n');
  withTempFile(srt, '.srt', (path) => {
    assert.throws(() => {
      execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname, path], { encoding: 'utf8' });
    }, (err) => err.status === 1);
  });
});

test('CLI: --json emits parseable JSON with the report fields', () => {
  const srt = ['1', '00:00:01,000 --> 00:00:04,000', 'Hello world', ''].join('\n');
  withTempFile(srt, '.srt', (path) => {
    const out = execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname, path, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.format, 'srt');
  });
});

test('CLI: a missing file exits 2, not 1 -- a read failure is not a caption-quality finding', () => {
  assert.throws(() => {
    execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname, '/nonexistent/no-such-file.srt'], { encoding: 'utf8' });
  }, (err) => err.status === 2);
});

test('CLI: no arguments exits 2 with a usage message', () => {
  assert.throws(() => {
    execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  }, (err) => err.status === 2);
});

test('CLI: a numeric threshold flag changes the verdict', () => {
  const srt = ['1', '00:00:01,000 --> 00:00:02,000', 'x'.repeat(15), ''].join('\n'); // 15 cps
  withTempFile(srt, '.srt', (path) => {
    // Default cap (20) should pass.
    const out = execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname, path], { encoding: 'utf8' });
    assert.match(out, /None of the checked/);
    // A lowered cap should fail.
    assert.throws(() => {
      execFileSync('node', [new URL('./check.mjs', import.meta.url).pathname, path, '--max-cps', '10'], { encoding: 'utf8' });
    }, (err) => err.status === 1);
  });
});
