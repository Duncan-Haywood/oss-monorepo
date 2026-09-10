import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeProbes(overrides = {}) {
  const base = [
    { label: 'baseline', requestOrigin: null, ok: true, status: 200, headers: {}, error: null },
    { label: 'reflect', requestOrigin: 'https://cors-probe-x.invalid', ok: true, status: 200, headers: {}, error: null },
    { label: 'null-origin', requestOrigin: 'null', ok: true, status: 200, headers: {}, error: null },
    { label: 'prefix-match', requestOrigin: 'https://api.example.com.attacker.invalid', ok: true, status: 200, headers: {}, error: null },
    { label: 'suffix-match', requestOrigin: 'https://evil-api.example.com', ok: true, status: 200, headers: {}, error: null },
  ];
  return base.map((p) => (overrides[p.label] ? { ...p, ...overrides[p.label] } : p));
}

test('runCheck calls the injected probeFn with the target and builds a report from its result', async () => {
  let calledWith = null;
  const probeFn = async (target) => {
    calledWith = target;
    return fakeProbes();
  };
  const report = await runCheck('https://api.example.com/', { probeFn });
  assert.equal(calledWith, 'https://api.example.com/');
  assert.equal(report.target, 'https://api.example.com/');
  assert.equal(report.ok, true);
});

test('runCheck surfaces a danger finding produced from the probe results', async () => {
  const probeFn = async () => fakeProbes({
    reflect: { headers: { 'access-control-allow-origin': 'https://cors-probe-x.invalid' } },
  });
  const report = await runCheck('https://api.example.com/', { probeFn });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].id, 'reflects-arbitrary-origin');
});

test('runCheck passes timeoutMs through to the probe function only when given', async () => {
  const seen = [];
  const probeFn = async (target, opts) => {
    seen.push(opts);
    return fakeProbes();
  };
  await runCheck('https://api.example.com/', { probeFn });
  await runCheck('https://api.example.com/', { probeFn, timeoutMs: 5000 });
  assert.deepEqual(seen[0], {});
  assert.deepEqual(seen[1], { timeoutMs: 5000 });
});

test('runCheck defaults to the real runProbes when no probeFn is injected', async () => {
  // Point at a port nothing listens on so this resolves fast as a network
  // failure rather than actually reaching anywhere -- confirms the default
  // wiring calls the real network layer without this test depending on the
  // network being up.
  const report = await runCheck('http://127.0.0.1:1/', {});
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});
