import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMemoryQuantity, parseCpuQuantity, podSpecOf, resourceLabel, flattenLists,
  analyzeDocuments, analyzeSources, summaryLine, CHECKS, RISK, WARN, INFO,
} from './engine.mjs';

test('parseMemoryQuantity reads binary suffixes', () => {
  assert.equal(parseMemoryQuantity('128Mi'), 128 * 2 ** 20);
  assert.equal(parseMemoryQuantity('1Gi'), 2 ** 30);
  assert.equal(parseMemoryQuantity('512Ki'), 512 * 2 ** 10);
});

test('parseMemoryQuantity reads decimal SI suffixes', () => {
  assert.equal(parseMemoryQuantity('128M'), 128e6);
  assert.equal(parseMemoryQuantity('1G'), 1e9);
  assert.equal(parseMemoryQuantity('500k'), 500e3);
});

test('parseMemoryQuantity treats a bare number as bytes', () => {
  assert.equal(parseMemoryQuantity('1000000'), 1_000_000);
});

test('parseMemoryQuantity rejects an uppercase K -- not a valid quantity suffix', () => {
  // The exact typo this check exists to catch: "K" (invalid) for "Ki" (1024
  // bytes) or "k" (1000 bytes). An accepting parser would silently guess.
  assert.equal(parseMemoryQuantity('128K'), null);
});

test('parseMemoryQuantity abstains on garbage rather than guessing', () => {
  assert.equal(parseMemoryQuantity('a lot'), null);
  assert.equal(parseMemoryQuantity(null), null);
  assert.equal(parseMemoryQuantity(undefined), null);
});

test('parseCpuQuantity reads millicores and whole/fractional cores', () => {
  assert.equal(parseCpuQuantity('500m'), 500);
  assert.equal(parseCpuQuantity('1'), 1000);
  assert.equal(parseCpuQuantity('0.5'), 500);
  assert.equal(parseCpuQuantity('2'), 2000);
});

test('parseCpuQuantity abstains on garbage', () => {
  assert.equal(parseCpuQuantity('lots'), null);
  assert.equal(parseCpuQuantity(null), null);
});

test('podSpecOf finds the pod template for every supported workload kind', () => {
  assert.deepEqual(podSpecOf({ kind: 'Pod', spec: { containers: [1] } }), { containers: [1] });
  assert.deepEqual(
    podSpecOf({ kind: 'Deployment', spec: { template: { spec: { containers: [1] } } } }),
    { containers: [1] },
  );
  assert.deepEqual(
    podSpecOf({ kind: 'StatefulSet', spec: { template: { spec: { containers: [2] } } } }),
    { containers: [2] },
  );
  assert.deepEqual(
    podSpecOf({ kind: 'CronJob', spec: { jobTemplate: { spec: { template: { spec: { containers: [3] } } } } } }),
    { containers: [3] },
  );
});

test('podSpecOf returns null for a kind with no known pod template', () => {
  assert.equal(podSpecOf({ kind: 'ConfigMap', data: {} }), null);
  assert.equal(podSpecOf(null), null);
});

test('resourceLabel includes the namespace only when set', () => {
  assert.equal(resourceLabel({ kind: 'Pod', metadata: { name: 'web' } }), 'Pod/web');
  assert.equal(
    resourceLabel({ kind: 'Pod', metadata: { name: 'web', namespace: 'prod' } }),
    'Pod/prod.web',
  );
});

test('flattenLists recurses into a kind: List and drops non-object entries', () => {
  const flat = flattenLists([
    { kind: 'List', items: [{ kind: 'Pod', metadata: { name: 'a' } }] },
    { kind: 'Pod', metadata: { name: 'b' } },
  ]);
  assert.deepEqual(flat.map((d) => d.metadata.name), ['a', 'b']);
});

function deployment({ requests = {}, limits = {}, name = 'web' } = {}) {
  return {
    kind: 'Deployment',
    metadata: { name },
    spec: { template: { spec: { containers: [{ name, resources: { requests, limits } }] } } },
  };
}

test('a container with no requests or limits at all is flagged for every applicable check', () => {
  const result = analyzeDocuments([deployment()]);
  const ids = result.findings.map((f) => f.id).sort();
  assert.deepEqual(ids, ['no-cpu-request', 'no-ephemeral-storage-limit', 'no-memory-limit', 'no-memory-request']);
  assert.equal(result.counts.risk, 1);
  assert.equal(result.counts.warn, 3);
  assert.equal(result.verdict, 'at-risk');
});

test('a fully specified container with no CPU limit is clean', () => {
  const result = analyzeDocuments([deployment({
    requests: { cpu: '250m', memory: '128Mi' },
    limits: { memory: '256Mi', 'ephemeral-storage': '1Gi' },
  })]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.verdict, 'clean');
});

test('a CPU limit is reported as informational, not a problem', () => {
  const result = analyzeDocuments([deployment({
    requests: { cpu: '250m', memory: '128Mi' },
    limits: { cpu: '250m', memory: '256Mi', 'ephemeral-storage': '1Gi' },
  })]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, 'cpu-limit-set');
  assert.equal(result.findings[0].severity, INFO);
  assert.equal(result.verdict, 'clean', 'an info-only finding must not raise the verdict');
});

test('a memory request above its own limit is a risk finding, not silently accepted', () => {
  const result = analyzeDocuments([deployment({
    requests: { cpu: '100m', memory: '512Mi' },
    limits: { cpu: '200m', memory: '256Mi', 'ephemeral-storage': '1Gi' },
  })]);
  const hit = result.findings.find((f) => f.id === 'requests-exceed-limits');
  assert.ok(hit, 'requests-exceed-limits should fire');
  assert.equal(hit.severity, RISK);
  assert.match(hit.impact, /512Mi/);
  assert.match(hit.impact, /256Mi/);
  assert.equal(result.verdict, 'at-risk');
});

test('a CPU request above its own limit is caught independently of memory', () => {
  const result = analyzeDocuments([deployment({
    requests: { cpu: '2', memory: '128Mi' },
    limits: { cpu: '1', memory: '256Mi', 'ephemeral-storage': '1Gi' },
  })]);
  const hit = result.findings.find((f) => f.id === 'requests-exceed-limits' && f.impact.includes('CPU'));
  assert.ok(hit, 'a CPU-specific requests-exceed-limits finding should fire');
});

test('binary vs. decimal suffixes are compared correctly, not as equal numbers', () => {
  // 100Mi (104,857,600 bytes) is ABOVE 100M (100,000,000 bytes) -- a request
  // of "100Mi" against a limit of "100M" really does exceed it.
  const result = analyzeDocuments([deployment({
    requests: { cpu: '100m', memory: '100Mi' },
    limits: { cpu: '200m', memory: '100M', 'ephemeral-storage': '1Gi' },
  })]);
  assert.ok(result.findings.some((f) => f.id === 'requests-exceed-limits'));
});

test('init containers are checked too, and labelled distinctly from regular containers', () => {
  const doc = {
    kind: 'Pod',
    metadata: { name: 'migrator' },
    spec: {
      initContainers: [{ name: 'migrate', resources: {} }],
      containers: [{ name: 'app', resources: { requests: { cpu: '100m', memory: '64Mi' }, limits: { memory: '128Mi', 'ephemeral-storage': '512Mi' } } }],
    },
  };
  const result = analyzeDocuments([doc]);
  const initFindings = result.findings.filter((f) => f.role === 'init container');
  assert.ok(initFindings.length > 0);
  assert.ok(initFindings.every((f) => f.container === 'migrate'));
});

test('a workload kind with no pod template is skipped, not silently treated as clean', () => {
  const result = analyzeDocuments([
    { kind: 'ConfigMap', metadata: { name: 'settings' }, data: {} },
    deployment(),
  ]);
  assert.deepEqual(result.skipped, ['ConfigMap/settings']);
  assert.equal(result.workloads.length, 1);
});

test('no workloads at all reports the no-workloads verdict', () => {
  const result = analyzeDocuments([{ kind: 'ConfigMap', metadata: { name: 'x' }, data: {} }]);
  assert.equal(result.verdict, 'no-workloads');
  assert.match(summaryLine(result), /No Pod, Deployment/);
});

test('a kind: List is flattened before analysis', () => {
  const result = analyzeDocuments([{ kind: 'List', items: [deployment()] }]);
  assert.equal(result.workloads.length, 1);
});

test('analyzeSources collects a parse error per bad file without losing the rest', () => {
  const result = analyzeSources([
    { name: 'good.yaml', text: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n      - name: web\n        resources: {}\n' },
    { name: 'bad.yaml', text: 'foo: &anchor bar\nbaz: *anchor\n' },
  ]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'bad.yaml');
  assert.equal(result.workloads.length, 1);
});

test('summaryLine covers all four verdicts', () => {
  assert.match(summaryLine(analyzeDocuments([deployment({
    requests: { cpu: '1', memory: '1Gi' }, limits: { memory: '1Gi', 'ephemeral-storage': '1Gi' },
  })])), /No resource-limit problems/);
  assert.match(summaryLine(analyzeDocuments([deployment({
    requests: { cpu: '1', memory: '1Gi' }, limits: { cpu: '1', memory: '1Gi', 'ephemeral-storage': '1Gi' },
  })])), /No resource-limit problems/, 'an info-only page should still read as clean in the summary');
  assert.match(summaryLine(analyzeDocuments([deployment({ requests: {}, limits: { memory: '1Gi', 'ephemeral-storage': '1Gi' } })])), /worth reviewing/);
  assert.match(summaryLine(analyzeDocuments([deployment()])), /left unbounded or invalid/);
});

test('every declared check has a title and a severity CHECKS lists', () => {
  const ids = new Set(CHECKS.map((c) => c.id));
  assert.equal(ids.size, CHECKS.length, 'no duplicate check ids');
  for (const check of CHECKS) {
    assert.ok([RISK, WARN, INFO].includes(check.severity), `${check.id} has an unknown severity`);
    assert.ok(check.title.length > 0);
  }
});
