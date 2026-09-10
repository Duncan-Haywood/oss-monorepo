import test from 'node:test';
import assert from 'node:assert/strict';
import { run, normalizeDomainArg, formatText } from './cli.mjs';

function cleanReport(domain = 'example.com') {
  return {
    domain,
    findings: [
      { id: 'spf-hardfail-all', severity: 'info', title: 'SPF ends in -all (hardfail)', detail: 'detail', evidence: 'TXT example.com: v=spf1 -all' },
    ],
    dangerCount: 0,
    noticeCount: 0,
    infoCount: 1,
    incomplete: false,
    ok: true,
  };
}

function dangerReport() {
  return {
    domain: 'vulnerable.example',
    findings: [
      { id: 'spf-plus-all', severity: 'danger', title: 'SPF ends in +all', detail: 'authorizes anyone', evidence: 'TXT vulnerable.example: v=spf1 +all' },
    ],
    dangerCount: 1,
    noticeCount: 0,
    infoCount: 0,
    incomplete: false,
    ok: false,
  };
}

test('normalizeDomainArg strips a scheme and any trailing path', () => {
  assert.equal(normalizeDomainArg('https://Example.com/some/path'), 'example.com');
  assert.equal(normalizeDomainArg('example.com'), 'example.com');
  assert.equal(normalizeDomainArg('  example.com  '), 'example.com');
});

test('run calls the injected checkFn with the normalized domain', async () => {
  let calledWith = null;
  const checkFn = async (domain) => { calledWith = domain; return cleanReport(domain); };
  const { exitCode } = await run(['https://Example.com/'], { checkFn });
  assert.equal(calledWith, 'example.com');
  assert.equal(exitCode, 0);
});

test('run exits 0 for a clean report and 1 for one with a danger finding', async () => {
  const clean = await run(['example.com'], { checkFn: async () => cleanReport() });
  assert.equal(clean.exitCode, 0);

  const bad = await run(['vulnerable.example'], { checkFn: async () => dangerReport() });
  assert.equal(bad.exitCode, 1);
  assert.match(bad.output, /SPF ends in \+all/);
});

test('run exits 1 for an incomplete report even with zero danger findings', async () => {
  const incomplete = { ...cleanReport(), incomplete: true };
  const { exitCode } = await run(['example.com'], { checkFn: async () => incomplete });
  assert.equal(exitCode, 1);
});

test('run --json prints the report as JSON', async () => {
  const { output } = await run(['example.com', '--json'], { checkFn: async () => cleanReport() });
  const parsed = JSON.parse(output);
  assert.equal(parsed.domain, 'example.com');
});

test('run passes --timeout through to checkFn only when given', async () => {
  const seen = [];
  const checkFn = async (domain, opts) => { seen.push(opts); return cleanReport(domain); };
  await run(['example.com'], { checkFn });
  await run(['example.com', '--timeout', '5000'], { checkFn });
  assert.deepEqual(seen[0], {});
  assert.deepEqual(seen[1], { timeoutMs: 5000 });
});

test('run with no domain prints usage and exits 2', async () => {
  const { exitCode, output } = await run([], {});
  assert.equal(exitCode, 2);
  assert.match(output, /Usage:/);
});

test('run --help exits 0', async () => {
  const { exitCode } = await run(['--help'], {});
  assert.equal(exitCode, 0);
});

test('formatText names the exact evidence for every finding, not a bare score', () => {
  const text = formatText(dangerReport());
  assert.match(text, /evidence: TXT vulnerable\.example: v=spf1 \+all/);
  assert.match(text, /1 danger, 0 notice, 0 informational/);
});
