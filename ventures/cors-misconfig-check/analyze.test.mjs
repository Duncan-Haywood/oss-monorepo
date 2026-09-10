import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, PROBE_LABELS } from './analyze.mjs';

function probe(label, requestOrigin, headers = {}, overrides = {}) {
  return {
    label,
    requestOrigin,
    ok: true,
    status: 200,
    headers: {
      'access-control-allow-origin': null,
      'access-control-allow-credentials': null,
      vary: null,
      ...headers,
    },
    error: null,
    ...overrides,
  };
}

function healthySet() {
  return [
    probe('baseline', null),
    probe('reflect', 'https://cors-probe-abc123.invalid'),
    probe('null-origin', 'null'),
    probe('prefix-match', 'https://api.example.com.attacker-controlled.invalid'),
    probe('suffix-match', 'https://evil-api.example.com'),
  ];
}

test('a server with no CORS headers at all reports clean', () => {
  const report = buildReport('https://api.example.com/', healthySet());
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 0);
  assert.deepEqual(report.findings, []);
});

test('reflecting an arbitrary unrelated origin is a danger finding', () => {
  const probes = healthySet();
  const reflect = probes.find((p) => p.label === 'reflect');
  reflect.headers['access-control-allow-origin'] = reflect.requestOrigin;

  const report = buildReport('https://api.example.com/', probes);
  assert.equal(report.ok, false);
  const finding = report.findings.find((f) => f.id === 'reflects-arbitrary-origin');
  assert.ok(finding, 'expected a reflects-arbitrary-origin finding');
  assert.equal(finding.severity, 'danger');
});

test('reflecting an arbitrary origin with credentials mentions the impact in the detail', () => {
  const probes = healthySet();
  const reflect = probes.find((p) => p.label === 'reflect');
  reflect.headers['access-control-allow-origin'] = reflect.requestOrigin;
  reflect.headers['access-control-allow-credentials'] = 'true';

  const report = buildReport('https://api.example.com/', probes);
  const finding = report.findings.find((f) => f.id === 'reflects-arbitrary-origin');
  assert.match(finding.detail, /authenticated/);
});

test('accepting Origin: null is a danger finding', () => {
  const probes = healthySet();
  const nullProbe = probes.find((p) => p.label === 'null-origin');
  nullProbe.headers['access-control-allow-origin'] = 'null';

  const report = buildReport('https://api.example.com/', probes);
  const finding = report.findings.find((f) => f.id === 'accepts-null-origin');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('a prefix-match (startsWith) allow-list bypass is a danger finding', () => {
  const probes = healthySet();
  const p = probes.find((x) => x.label === 'prefix-match');
  p.headers['access-control-allow-origin'] = p.requestOrigin;

  const report = buildReport('https://api.example.com/', probes);
  const finding = report.findings.find(
    (f) => f.id === 'unanchored-origin-match' && f.probeLabel === 'prefix-match',
  );
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('a suffix-match (endsWith) allow-list bypass is a danger finding', () => {
  const probes = healthySet();
  const p = probes.find((x) => x.label === 'suffix-match');
  p.headers['access-control-allow-origin'] = p.requestOrigin;

  const report = buildReport('https://api.example.com/', probes);
  const finding = report.findings.find(
    (f) => f.id === 'unanchored-origin-match' && f.probeLabel === 'suffix-match',
  );
  assert.ok(finding);
});

test('wildcard + credentials is a notice, not a danger', () => {
  const probes = healthySet();
  const baseline = probes.find((p) => p.label === 'baseline');
  baseline.headers['access-control-allow-origin'] = '*';
  baseline.headers['access-control-allow-credentials'] = 'true';

  const report = buildReport('https://api.example.com/', probes);
  assert.equal(report.dangerCount, 0, 'wildcard+credentials alone must not count as danger');
  assert.equal(report.noticeCount, 1);
  assert.equal(report.ok, true, 'a notice-only report is still ok');
  assert.equal(report.findings[0].id, 'wildcard-with-credentials');
});

test('wildcard without credentials is not flagged at all', () => {
  const probes = healthySet();
  const baseline = probes.find((p) => p.label === 'baseline');
  baseline.headers['access-control-allow-origin'] = '*';

  const report = buildReport('https://api.example.com/', probes);
  assert.deepEqual(report.findings, []);
});

test('reflecting an origin with no Vary: Origin is a missing-vary notice, alongside the danger finding', () => {
  const probes = healthySet();
  const reflect = probes.find((p) => p.label === 'reflect');
  reflect.headers['access-control-allow-origin'] = reflect.requestOrigin;
  reflect.headers.vary = 'Accept-Encoding';

  const report = buildReport('https://api.example.com/', probes);
  assert.ok(report.findings.some((f) => f.id === 'reflects-arbitrary-origin'));
  assert.ok(report.findings.some((f) => f.id === 'missing-vary-origin'));
  assert.equal(report.findings.find((f) => f.id === 'missing-vary-origin').severity, 'notice');
});

test('a Vary header that includes Origin suppresses the missing-vary notice', () => {
  const probes = healthySet();
  const reflect = probes.find((p) => p.label === 'reflect');
  reflect.headers['access-control-allow-origin'] = reflect.requestOrigin;
  reflect.headers.vary = 'Accept-Encoding, Origin';

  const report = buildReport('https://api.example.com/', probes);
  assert.ok(!report.findings.some((f) => f.id === 'missing-vary-origin'));
});

test('a probe that failed at the network level marks the report incomplete and not ok', () => {
  const probes = healthySet();
  const reflect = probes.find((p) => p.label === 'reflect');
  reflect.ok = false;
  reflect.status = null;
  reflect.error = 'timed out';
  reflect.headers = {};

  const report = buildReport('https://api.example.com/', probes);
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.failedProbes, ['reflect']);
  // A failed probe's stale headers must never be evaluated as a finding.
  assert.ok(!report.findings.some((f) => f.probeLabel === 'reflect'));
});

test('an empty or missing probes array is handled without throwing', () => {
  assert.doesNotThrow(() => buildReport('https://api.example.com/', []));
  assert.doesNotThrow(() => buildReport('https://api.example.com/', undefined));
  const report = buildReport('https://api.example.com/', null);
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});

test('PROBE_LABELS lists exactly the five probes this tool sends', () => {
  assert.deepEqual(PROBE_LABELS, ['baseline', 'reflect', 'null-origin', 'prefix-match', 'suffix-match']);
});

test('every finding carries the fields the UI and CLI render', () => {
  const probes = healthySet();
  const reflect = probes.find((p) => p.label === 'reflect');
  reflect.headers['access-control-allow-origin'] = reflect.requestOrigin;

  const report = buildReport('https://api.example.com/', probes);
  for (const f of report.findings) {
    assert.equal(typeof f.id, 'string');
    assert.ok(f.severity === 'danger' || f.severity === 'notice');
    assert.equal(typeof f.title, 'string');
    assert.equal(typeof f.detail, 'string');
    assert.equal(typeof f.evidenceHeader, 'string');
  }
});

test('report echoes back a normalised probes array for rendering', () => {
  const report = buildReport('https://api.example.com/', healthySet());
  assert.equal(report.probes.length, 5);
  for (const p of report.probes) {
    assert.ok(PROBE_LABELS.includes(p.label));
    assert.equal(typeof p.ok, 'boolean');
  }
});
