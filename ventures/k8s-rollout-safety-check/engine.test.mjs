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
  selectorMatches,
  namespaceOf,
  flattenLists,
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

// Rewritten after the PR #4551 review. These two originally asserted that a
// container without a `containerPort` was skipped -- which was the bug, not
// the feature: `containerPort` is informational, a Service can target a port
// no container declares, and an app that omits it beside a metrics sidecar
// that declares one was skipped entirely. The tool now checks every container
// unless a Service says which one serves, so a sidecar produces an extra
// finding and the application never goes unchecked. A redundant finding is a
// cost; a missed one on the container that actually answers is a wrong
// verdict.
test('a sidecar is checked too, rather than letting the app go unchecked', () => {
  const yaml = safeDeployment(`        - name: log-shipper
          image: ghcr.io/acme/vector:0.39.0
`);
  const reported = run(yaml).findings.filter((f) => f.container === 'log-shipper').map((f) => f.id);
  assert.ok(reported.includes('no-readiness-probe'));
  assert.ok(reported.includes('no-prestop-hook'));
  // The correctly-configured app container still produces nothing.
  assert.deepEqual(run(yaml).findings.filter((f) => f.container === 'api'), []);
});

test('with no Service to read, every container is checked', () => {
  assert.deepEqual(servingContainers({ containers: [{ name: 'a' }, { name: 'b' }] }).map((c) => c.name), ['a', 'b']);
  const withPorts = { containers: [{ name: 'a', ports: [{ containerPort: 80 }] }, { name: 'b' }] };
  assert.deepEqual(
    servingContainers(withPorts).map((c) => c.name),
    ['a', 'b'],
    'a declared containerPort is not evidence that the other container does not serve',
  );
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
  // An *absent* selector selects nothing this tool can reason about; an
  // *empty* one matches every pod in the namespace, per policy/v1. The first
  // draft treated both as "no match", which produced a false `no-pdb-found`
  // against a budget that does in fact cover these pods.
  assert.ok(!pdbSelects({ spec: {} }, deployment), 'no selector at all');
  assert.ok(
    pdbSelects({ spec: { selector: {} } }, deployment),
    'an empty policy/v1 selector matches everything in the namespace',
  );
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

// ---------------------------------------------------------------------------
// Regressions from the automated review on PR #4551. Every one of these was a
// real defect that produced a WRONG verdict rather than a missing feature,
// which for a safety checker is the only severity that matters: a tool that
// says "clean" about a rollout that drops requests is worse than no tool.
// ---------------------------------------------------------------------------

test('a kind: List wrapper is unwrapped, because that is what kubectl emits', () => {
  // `kubectl get deploy,pdb -o yaml` -- the command index.html tells the
  // visitor to run -- returns ONE `kind: List`. Filtering the top level only
  // reported "No Deployment found" and let --fail-on-risk exit 0 on a
  // Deployment that takes every pod down at once.
  const result = run(`apiVersion: v1
kind: List
items:
  - apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: api
    spec:
      replicas: 2
      strategy:
        rollingUpdate:
          maxUnavailable: 2
      template:
        metadata:
          labels:
            app: api
        spec:
          containers:
            - name: api
              ports:
                - containerPort: 8080
`);
  assert.deepEqual(result.deployments, ['Deployment/api']);
  assert.equal(result.verdict, 'drops-requests');
  assert.ok(ids(result).includes('max-unavailable-all-pods'));
  assert.ok(ids(result).includes('no-readiness-probe'));
});

test('nested lists flatten, and a non-list kind ending in "List" is not mangled', () => {
  const nested = flattenLists([
    { kind: 'List', items: [{ kind: 'List', items: [{ kind: 'Deployment', metadata: { name: 'a' } }] }] },
  ]);
  assert.deepEqual(nested.map((d) => d.metadata.name), ['a']);
  // `kind` ending in List but with no `items` array is a real resource.
  assert.deepEqual(flattenLists([{ kind: 'DeploymentList' }]).length, 1);
});

test('a PodDisruptionBudget in another namespace does not select these pods', () => {
  // PDBs are namespaced. Matching on labels alone let a PDB from one namespace
  // suppress `no-pdb-found` on an identically-labelled Deployment in another.
  const deployment = { kind: 'Deployment', metadata: { namespace: 'prod' }, spec: { template: { metadata: { labels: { app: 'api' } } } } };
  const samePlace = { kind: 'PodDisruptionBudget', metadata: { namespace: 'prod' }, spec: { selector: { matchLabels: { app: 'api' } } } };
  const elsewhere = { kind: 'PodDisruptionBudget', metadata: { namespace: 'staging' }, spec: { selector: { matchLabels: { app: 'api' } } } };
  assert.ok(pdbSelects(samePlace, deployment));
  assert.ok(!pdbSelects(elsewhere, deployment));
  // An absent namespace means `default` on both sides, not "any".
  const bare = { kind: 'Deployment', spec: { template: { metadata: { labels: { app: 'api' } } } } };
  assert.equal(namespaceOf(bare), 'default');
  assert.ok(pdbSelects({ kind: 'PodDisruptionBudget', metadata: { namespace: 'default' }, spec: { selector: { matchLabels: { app: 'api' } } } }, bare));
  assert.ok(!pdbSelects(elsewhere, bare));
});

test('a selector using matchExpressions is evaluated, not ignored', () => {
  const labels = { app: 'api', tier: 'web' };
  assert.ok(selectorMatches({ matchExpressions: [{ key: 'app', operator: 'In', values: ['api', 'worker'] }] }, labels));
  assert.ok(!selectorMatches({ matchExpressions: [{ key: 'app', operator: 'In', values: ['worker'] }] }, labels));
  assert.ok(selectorMatches({ matchExpressions: [{ key: 'app', operator: 'Exists' }] }, labels));
  assert.ok(!selectorMatches({ matchExpressions: [{ key: 'nope', operator: 'Exists' }] }, labels));
  assert.ok(selectorMatches({ matchExpressions: [{ key: 'nope', operator: 'DoesNotExist' }] }, labels));
  assert.ok(!selectorMatches({ matchExpressions: [{ key: 'app', operator: 'NotIn', values: ['api'] }] }, labels));
  // matchLabels and matchExpressions are ANDed.
  assert.ok(!selectorMatches({ matchLabels: { tier: 'batch' }, matchExpressions: [{ key: 'app', operator: 'Exists' }] }, labels));
  // An empty selector matches everything in the namespace, per policy/v1.
  assert.ok(selectorMatches({}, labels));
  // An operator this reader does not know must never silently match -- that
  // would invent a budget the cluster does not have.
  assert.ok(!selectorMatches({ matchExpressions: [{ key: 'app', operator: 'Sideways', values: [] }] }, labels));
});

test('PodDisruptionBudget percentages round UP, unlike a Deployment maxUnavailable', () => {
  // Kubernetes rounds a PDB percentage up for both fields. Using the
  // Deployment round-down rule read `minAvailable: 67%` of 3 as 2 and missed a
  // budget that genuinely blocks every eviction.
  const yaml = safeDeployment().replace('  minAvailable: 2', '  minAvailable: 67%');
  const f = run(yaml).findings.find((x) => x.id === 'pdb-blocks-drain');
  assert.ok(f, 'ceil(0.67 * 3) = 3 of 3 replicas blocks a drain');
  // And the other direction: 1% of 3 is 1, not 0, so it is NOT a blocked drain.
  const ok = safeDeployment().replace('  minAvailable: 2', '  maxUnavailable: 1%');
  assert.ok(!ids(run(ok)).includes('pdb-blocks-drain'), 'ceil(0.01 * 3) = 1, which permits an eviction');
});

test('a budget shared by two Deployments is resolved against their combined scale', () => {
  // Two 2-replica Deployments under `minAvailable: 3` permit one eviction out
  // of four. Resolving against one Deployment's 2 replicas twice reported two
  // blocked drains that do not exist.
  const two = (name) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: shared
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: c
          readinessProbe:
            httpGet:
              path: /readyz
              port: 80
          lifecycle:
            preStop:
              sleep:
                seconds: 5
---
`;
  const result = run(`${two('a')}${two('b')}apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: shared
spec:
  minAvailable: 3
  selector:
    matchLabels:
      app: shared
`);
  assert.ok(!ids(result).includes('pdb-blocks-drain'), '3 of 4 selected pods permits one eviction');
  // At minAvailable 4 of the same 4 pods, it genuinely blocks.
  const blocked = run(`${two('a')}${two('b')}apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: shared
spec:
  minAvailable: 4
  selector:
    matchLabels:
      app: shared
`);
  const f = blocked.findings.find((x) => x.id === 'pdb-blocks-drain');
  assert.ok(f);
  assert.match(f.impact, /across every workload it selects/);
});

test('every container is checked when no Service says which one serves', () => {
  // containerPort is informational and a Service may target a port no
  // container declares. Inferring the recipient from it meant that an app
  // omitting containerPort beside a metrics sidecar that declares one had the
  // APP skipped -- the exact container whose missing probe drops requests.
  const podSpec = {
    containers: [
      { name: 'app' },
      { name: 'metrics', ports: [{ containerPort: 9090 }] },
    ],
  };
  assert.deepEqual(servingContainers(podSpec).map((c) => c.name), ['app', 'metrics']);
});

test('a Service in the input narrows the check to the container it targets', () => {
  const deployment = {
    kind: 'Deployment',
    metadata: { name: 'api' },
    spec: { template: { metadata: { labels: { app: 'api' } } } },
  };
  const service = {
    kind: 'Service',
    metadata: { name: 'api' },
    spec: { selector: { app: 'api' }, ports: [{ port: 80, targetPort: 8080 }] },
  };
  const podSpec = {
    containers: [
      { name: 'app', ports: [{ containerPort: 8080 }] },
      { name: 'metrics', ports: [{ containerPort: 9090 }] },
    ],
  };
  assert.deepEqual(
    servingContainers(podSpec, { service, deployment }).map((c) => c.name),
    ['app'],
    'only the container the Service targets',
  );
  // A named targetPort resolves too.
  const named = { ...service, spec: { ...service.spec, ports: [{ port: 80, targetPort: 'http' }] } };
  const namedPods = { containers: [{ name: 'app', ports: [{ name: 'http', containerPort: 8080 }] }, { name: 'metrics', ports: [{ containerPort: 9090 }] }] };
  assert.deepEqual(servingContainers(namedPods, { service: named, deployment }).map((c) => c.name), ['app']);
  // A targetPort no container declares is legal and means the manifest does
  // not say -- abstain into checking everything rather than checking nothing.
  const unmatched = { ...service, spec: { ...service.spec, ports: [{ port: 80, targetPort: 7777 }] } };
  assert.deepEqual(servingContainers(podSpec, { service: unmatched, deployment }).map((c) => c.name), ['app', 'metrics']);
});

test('a sidecar-only Service does not hide the app container from the checks', () => {
  const result = run(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  strategy:
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: app
        - name: metrics
          ports:
            - containerPort: 9090
`);
  const missing = result.findings.filter((f) => f.id === 'no-readiness-probe').map((f) => f.container);
  assert.ok(missing.includes('app'), 'the port-less application container must still be checked');
});

test('probes that differ only by header or scheme are not called duplicates', () => {
  // A readiness probe sending `X-Probe: ready` and a liveness probe sending
  // `X-Probe: live` hit the same path and can exercise entirely different
  // code. Comparing only path and port called them identical and reported a
  // deliberate design as a defect.
  const withHeaders = (value) => `            httpGet:
              path: /probe
              port: 8080
              httpHeaders:
                - name: X-Probe
                  value: ${value}
`;
  const yaml = safeDeployment()
    .replace(`          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
`, `          readinessProbe:
${withHeaders('ready')}`)
    .replace(`          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
`, `          livenessProbe:
${withHeaders('live')}            initialDelaySeconds: 10
`);
  assert.ok(!ids(run(yaml)).includes('liveness-equals-readiness'), 'different headers are different probes');

  // Genuinely identical handlers are still reported.
  const same = safeDeployment()
    .replace(`          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
`, `          readinessProbe:
${withHeaders('x')}`)
    .replace(`          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
`, `          livenessProbe:
${withHeaders('x')}            initialDelaySeconds: 10
`);
  assert.ok(ids(run(same)).includes('liveness-equals-readiness'));
});

test('the no-pdb finding does not claim a budget constrains this rollout', () => {
  // A PodDisruptionBudget governs eviction, not a Deployment's own rolling
  // update -- the controller deletes those pods directly. Saying otherwise
  // would send a reader off to add a budget expecting it to stop rollout
  // downtime, and it contradicted this venture's own guide page.
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
      app: elsewhere
`,
  );
  const f = run(yaml).findings.find((x) => x.id === 'no-pdb-found');
  assert.ok(f);
  assert.match(f.impact, /does NOT constrain/);
  assert.match(f.impact, /maxUnavailable and maxSurge alone/);
  assert.match(f.impact, /node drain/);
});

test('probe defaults are normalized, so spelling does not decide the verdict', () => {
  // Comparing handlers in full fixed a false positive and introduced a false
  // negative: an omitted `scheme` and an explicit `scheme: HTTP` are the same
  // request to Kubernetes, but serialized differently, so a genuine duplicate
  // pair went unreported. Both directions are pinned here.
  const probes = (readiness, liveness) => safeDeployment()
    .replace(`          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
`, `          readinessProbe:
${readiness}`)
    .replace(`          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
`, `          livenessProbe:
${liveness}            initialDelaySeconds: 10
`);

  const plain = `            httpGet:
              path: /probe
              port: 8080
`;
  const explicitHttp = `            httpGet:
              path: /probe
              port: 8080
              scheme: HTTP
`;
  const https = `            httpGet:
              path: /probe
              port: 8080
              scheme: HTTPS
`;
  const noPath = `            httpGet:
              port: 8080
`;
  const rootPath = `            httpGet:
              path: /
              port: 8080
`;

  assert.ok(
    ids(run(probes(plain, explicitHttp))).includes('liveness-equals-readiness'),
    'an omitted scheme and an explicit HTTP are the same handler',
  );
  assert.ok(
    ids(run(probes(noPath, rootPath))).includes('liveness-equals-readiness'),
    'an omitted path defaults to /',
  );
  assert.ok(
    !ids(run(probes(plain, https))).includes('liveness-equals-readiness'),
    'HTTPS is a real difference and must survive normalization',
  );

  // Header order is spelling; the kubelet sends the same set either way.
  const headers = (first, second) => `            httpGet:
              path: /probe
              port: 8080
              httpHeaders:
                - name: ${first}
                  value: v
                - name: ${second}
                  value: v
`;
  assert.ok(
    ids(run(probes(headers('A', 'B'), headers('B', 'A')))).includes('liveness-equals-readiness'),
    'the same headers in a different order are the same probe',
  );
});
