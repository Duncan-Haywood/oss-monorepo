import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocuments } from './yaml.mjs';
import {
  analyzeDocuments,
  analyzeSources,
  resolveReplicaCount,
  preStopSleepSeconds,
  pdbSelects,
  servingContainers,
  summaryLine,
  CHECKS,
  RISK,
  WARN,
} from './engine.mjs';

const run = (yaml) => analyzeDocuments(parseDocuments(yaml));
const ids = (result) => result.findings.map((f) => f.id);

/** A Deployment with every rollout-safety control set correctly. Each test
 * below changes exactly one thing, so a finding can only come from that
 * change. */
function safeDeployment(overrides = '') {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: api
          image: ghcr.io/acme/api:1.4.0
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
          lifecycle:
            preStop:
              sleep:
                seconds: 10
${overrides}---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api
`;
}

test('a correctly configured Deployment produces no findings at all', () => {
  const result = run(safeDeployment());
  assert.deepEqual(result.findings, []);
  assert.equal(result.verdict, 'clean');
  assert.deepEqual(result.deployments, ['Deployment/api']);
});

test('a missing readinessProbe is reported against the serving container', () => {
  const yaml = safeDeployment().replace(
    `          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
`,
    '',
  );
  const result = run(yaml);
  assert.ok(ids(result).includes('no-readiness-probe'));
  const f = result.findings.find((x) => x.id === 'no-readiness-probe');
  assert.equal(f.severity, RISK);
  assert.equal(f.container, 'api');
  assert.equal(f.resource, 'Deployment/api');
  assert.match(f.fix, /readinessProbe/);
});

test('a missing preStop hook is reported', () => {
  const yaml = safeDeployment().replace(
    `          lifecycle:
            preStop:
              sleep:
                seconds: 10
`,
    '',
  );
  assert.ok(ids(run(yaml)).includes('no-prestop-hook'));
});

test('Recreate is reported as guaranteed downtime', () => {
  const yaml = safeDeployment().replace(
    `  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
`,
    `  strategy:
    type: Recreate
`,
  );
  const result = run(yaml);
  assert.ok(ids(result).includes('recreate-strategy'));
  assert.equal(result.verdict, 'drops-requests');
});

test('maxUnavailable at or above the replica count is a risk', () => {
  const yaml = safeDeployment().replace('      maxUnavailable: 0', '      maxUnavailable: 3');
  const f = run(yaml).findings.find((x) => x.id === 'max-unavailable-all-pods');
  assert.ok(f, 'expected max-unavailable-all-pods');
  assert.match(f.impact, /3 of 3 replica/);
});

test('maxUnavailable: 100% is resolved against the replica count', () => {
  const yaml = safeDeployment().replace('      maxUnavailable: 0', '      maxUnavailable: 100%');
  assert.ok(ids(run(yaml)).includes('max-unavailable-all-pods'));
});

test("Kubernetes' own 25% default at 3 replicas is not flagged", () => {
  // floor(0.25 * 3) = 0, so the default surges first and never empties the
  // service. Flagging this would make the tool cry wolf on most manifests.
  const yaml = safeDeployment().replace(
    `  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
`,
    '',
  );
  assert.ok(!ids(run(yaml)).includes('max-unavailable-all-pods'));
});

test('a grace period shorter than the preStop wait cuts off in-flight requests', () => {
  const yaml = safeDeployment()
    .replace('      terminationGracePeriodSeconds: 60', '      terminationGracePeriodSeconds: 10');
  const f = run(yaml).findings.find((x) => x.id === 'grace-period-too-short');
  assert.ok(f, 'expected grace-period-too-short');
  assert.match(f.impact, /preStop waits 10s/);
  assert.match(f.fix, /40/); // 10s preStop + 30s headroom
});

test('the default grace period is used when the manifest omits it, and named as the default', () => {
  const yaml = safeDeployment()
    .replace('      terminationGracePeriodSeconds: 60\n', '')
    .replace('                seconds: 10', '                seconds: 30');
  const f = run(yaml).findings.find((x) => x.id === 'grace-period-too-short');
  assert.ok(f, 'a 30s preStop against the 30s default leaves no drain time');
  assert.match(f.impact, /the Kubernetes default/);
});

test('a preStop sleep written as a shell command is read too', () => {
  const yaml = safeDeployment().replace(
    `          lifecycle:
            preStop:
              sleep:
                seconds: 10
`,
    `          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 90"]
`,
  );
  const f = run(yaml).findings.find((x) => x.id === 'grace-period-too-short');
  assert.ok(f, '90s preStop against a 60s grace period must be flagged');
});

test('a preStop hook whose duration cannot be read does not invent a verdict', () => {
  const yaml = safeDeployment().replace(
    `          lifecycle:
            preStop:
              sleep:
                seconds: 10
`,
    `          lifecycle:
            preStop:
              httpGet:
                path: /drain
                port: 8080
`,
  );
  const found = ids(run(yaml));
  assert.ok(!found.includes('no-prestop-hook'), 'the hook exists');
  assert.ok(!found.includes('grace-period-too-short'), 'its duration is unknown, so abstain');
});

test('identical liveness and readiness probes are a warning, not a risk', () => {
  const yaml = safeDeployment().replace('              path: /healthz', '              path: /readyz');
  const f = run(yaml).findings.find((x) => x.id === 'liveness-equals-readiness');
  assert.ok(f);
  assert.equal(f.severity, WARN);
  assert.equal(run(yaml).verdict, 'review');
});

test('a livenessProbe with no startup delay and no startupProbe is a warning', () => {
  const yaml = safeDeployment().replace('            initialDelaySeconds: 10\n', '');
  assert.ok(ids(run(yaml)).includes('liveness-probe-starts-immediately'));
});

test('a startupProbe suppresses the immediate-liveness warning', () => {
  const yaml = safeDeployment()
    .replace('            initialDelaySeconds: 10\n', '')
    .replace(
      `          lifecycle:`,
      `          startupProbe:
            httpGet:
              path: /readyz
              port: 8080
            failureThreshold: 30
          lifecycle:`,
    );
  assert.ok(!ids(run(yaml)).includes('liveness-probe-starts-immediately'));
});

test('a single replica is warned about', () => {
  const yaml = safeDeployment().replace('  replicas: 3', '  replicas: 1')
    .replace('  minAvailable: 2', '  minAvailable: 0');
  const found = ids(run(yaml));
  assert.ok(found.includes('single-replica'));
});

test('replicas defaults to 1 when the manifest omits it', () => {
  const yaml = safeDeployment().replace('  replicas: 3\n', '').replace('  minAvailable: 2', '  minAvailable: 0');
  assert.ok(ids(run(yaml)).includes('single-replica'));
});

test('a PodDisruptionBudget that can never be satisfied blocks a drain', () => {
  const yaml = safeDeployment().replace('  minAvailable: 2', '  minAvailable: 3');
  const f = run(yaml).findings.find((x) => x.id === 'pdb-blocks-drain');
  assert.ok(f);
  assert.equal(f.resource, 'PodDisruptionBudget/api');
  assert.match(f.fix, /minAvailable: 2/);
});

test('maxUnavailable: 0 on a PDB blocks a drain too', () => {
  const yaml = safeDeployment().replace('  minAvailable: 2', '  maxUnavailable: 0');
  assert.ok(ids(run(yaml)).includes('pdb-blocks-drain'));
});

test('a Deployment with no matching PDB is warned about, and the warning says it is scoped to what was checked', () => {
  const yaml = safeDeployment().replace(
    `spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api
`,
    `spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: something-else
`,
  );
  const f = run(yaml).findings.find((x) => x.id === 'no-pdb-found');
  assert.ok(f);
  assert.match(f.impact, /what was checked/);
  assert.match(f.fix, /does not apply/);
});

test('a sidecar without ports does not produce probe findings', () => {
  const yaml = safeDeployment(`        - name: log-shipper
          image: ghcr.io/acme/vector:0.39.0
`);
  const result = run(yaml);
  assert.deepEqual(result.findings, [], 'the port-less sidecar must be skipped, not reported');
});

test('when no container declares a port, every container is checked', () => {
  const podSpec = { containers: [{ name: 'a' }, { name: 'b' }] };
  assert.deepEqual(servingContainers(podSpec).map((c) => c.name), ['a', 'b']);
  const withPorts = { containers: [{ name: 'a', ports: [{ containerPort: 80 }] }, { name: 'b' }] };
  assert.deepEqual(servingContainers(withPorts).map((c) => c.name), ['a']);
});

test('kinds other than Deployment and PDB are listed as skipped, never silently dropped', () => {
  const result = run(`kind: Service
metadata:
  name: api
---
kind: StatefulSet
metadata:
  name: db
`);
  assert.deepEqual(result.skipped, ['Service/api', 'StatefulSet/db']);
  assert.equal(result.verdict, 'no-deployments');
  assert.match(summaryLine(result), /No Deployment found/);
});

test('a namespace is carried into the resource label', () => {
  const yaml = safeDeployment().replace('  name: api\nspec:\n  replicas: 3', '  name: api\n  namespace: prod\nspec:\n  replicas: 3');
  assert.ok(run(yaml).deployments.includes('Deployment/prod.api'));
});

test('an unparseable file is named as an error without hiding the other files', () => {
  const result = analyzeSources([
    { name: 'broken.yaml', text: 'a: &x 1\nb: *x\n' },
    { name: 'good.yaml', text: safeDeployment() },
  ]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'broken.yaml');
  assert.deepEqual(result.deployments, ['Deployment/api']);
  assert.deepEqual(result.findings, []);
});

test('replica-count resolution matches Kubernetes rounding', () => {
  assert.equal(resolveReplicaCount(2, 5), 2);
  assert.equal(resolveReplicaCount('25%', 3), 0, 'maxUnavailable rounds down');
  assert.equal(resolveReplicaCount('25%', 3, { roundUp: true }), 1, 'maxSurge rounds up');
  assert.equal(resolveReplicaCount('100%', 4), 4);
  assert.equal(resolveReplicaCount(undefined, 3), null);
  assert.equal(resolveReplicaCount('some-string', 3), null);
});

test('preStop sleep is read from both spellings and abstains otherwise', () => {
  assert.equal(preStopSleepSeconds({ sleep: { seconds: 5 } }), 5);
  assert.equal(preStopSleepSeconds({ exec: { command: ['/bin/sh', '-c', 'sleep 15'] } }), 15);
  assert.equal(preStopSleepSeconds({ exec: { command: ['sh', '-c', 'sleep 2s'] } }), 2);
  assert.equal(preStopSleepSeconds({ exec: { command: ['sh', '-c', 'sleep $DRAIN'] } }), null);
  assert.equal(preStopSleepSeconds({ httpGet: { path: '/drain' } }), null);
  assert.equal(preStopSleepSeconds(null), null);
});

test('PDB selection needs every label to match', () => {
  const deployment = { spec: { template: { metadata: { labels: { app: 'api', tier: 'web' } } } } };
  assert.ok(pdbSelects({ spec: { selector: { matchLabels: { app: 'api' } } } }, deployment));
  assert.ok(!pdbSelects({ spec: { selector: { matchLabels: { app: 'api', tier: 'batch' } } } }, deployment));
  assert.ok(!pdbSelects({ spec: { selector: { matchLabels: {} } } }, deployment), 'an empty selector is not a match');
  assert.ok(!pdbSelects({ spec: {} }, deployment));
});

test('every check id in CHECKS is reachable and every finding id is declared', () => {
  const declared = new Set(CHECKS.map((c) => c.id));
  const broken = safeDeployment()
    .replace(`          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
`, '')
    .replace(`          lifecycle:
            preStop:
              sleep:
                seconds: 10
`, '')
    .replace('  replicas: 3', '  replicas: 1')
    .replace('            initialDelaySeconds: 10\n', '')
    .replace('  minAvailable: 2', '  minAvailable: 3');
  for (const id of ids(run(broken))) {
    assert.ok(declared.has(id), `finding ${id} is not declared in CHECKS`);
  }
  assert.equal(new Set(CHECKS.map((c) => c.id)).size, CHECKS.length, 'CHECKS ids must be unique');
});

test('the summary line states the consequence, not a score', () => {
  const broken = safeDeployment().replace(`          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
`, '');
  assert.match(summaryLine(run(broken)), /can drop live requests/);
  assert.match(summaryLine(run(safeDeployment())), /No rollout-safety problems/);
});
