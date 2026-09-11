import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, renderText, main } from './check.mjs';
import { analyzeSources } from './engine.mjs';

const RISKY = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
`;

const SAFE = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  strategy:
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      terminationGracePeriodSeconds: 45
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /readyz
              port: 80
          lifecycle:
            preStop:
              sleep:
                seconds: 10
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web
`;

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { log: (s) => out.push(String(s)), error: (s) => err.push(String(s)) } };
}

async function fixtureDir(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'k8s-rollout-'));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  return dir;
}

test('arguments parse, including both --format spellings', () => {
  assert.deepEqual(parseArgs([]), { paths: ['.'], format: 'text', failOnRisk: false, help: false, listChecks: false });
  assert.equal(parseArgs(['--format', 'json']).format, 'json');
  assert.equal(parseArgs(['--format=json']).format, 'json');
  assert.equal(parseArgs(['--fail-on-risk']).failOnRisk, true);
  assert.deepEqual(parseArgs(['a.yaml', 'b.yaml']).paths, ['a.yaml', 'b.yaml']);
  assert.throws(() => parseArgs(['--format', 'xml']), /expects "text" or "json"/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
});

test('a bad option exits 1 and says why, rather than scanning anyway', async () => {
  const { err, io } = capture();
  assert.equal(await main(['--nope'], io), 1);
  assert.match(err.join('\n'), /unknown option/);
});

test('an unreadable path exits 1 and names the path', async () => {
  const { err, io } = capture();
  assert.equal(await main([path.join(tmpdir(), 'definitely-not-here-9182')], io), 1);
  assert.match(err.join('\n'), /cannot read/);
});

test('--help and --list-checks exit 0 and print something useful', async () => {
  const help = capture();
  assert.equal(await main(['--help'], help.io), 0);
  assert.match(help.out.join('\n'), /Makes no network calls/);

  const checks = capture();
  assert.equal(await main(['--list-checks'], checks.io), 0);
  const printed = checks.out.join('\n');
  assert.match(printed, /no-readiness-probe/);
  assert.match(printed, /no-prestop-hook/);
});

test('a risky manifest is reported, and --fail-on-risk exits 2', async () => {
  const dir = await fixtureDir({ 'deploy.yaml': RISKY });
  const plain = capture();
  assert.equal(await main([dir], plain.io), 0, 'without the flag a finding is reported, not enforced');
  assert.match(plain.out.join('\n'), /drop live requests/);

  const gated = capture();
  assert.equal(await main([dir, '--fail-on-risk'], gated.io), 2);
});

test('a correctly configured manifest exits 0 even with --fail-on-risk', async () => {
  const dir = await fixtureDir({ 'deploy.yaml': SAFE });
  const { out, io } = capture();
  assert.equal(await main([dir, '--fail-on-risk'], io), 0);
  const printed = out.join('\n');
  assert.match(printed, /No rollout-safety problems/);
  assert.match(printed, /not a\nguarantee|not a guarantee/, 'a clean run must not read as a guarantee');
});

test('--format json emits parseable output carrying the findings and the file count', async () => {
  const dir = await fixtureDir({ 'deploy.yaml': RISKY });
  const { out, io } = capture();
  assert.equal(await main([dir, '--format', 'json'], io), 0);
  const parsed = JSON.parse(out.join('\n'));
  assert.equal(parsed.filesChecked, 1);
  assert.equal(parsed.verdict, 'drops-requests');
  assert.ok(parsed.findings.some((f) => f.id === 'no-readiness-probe'));
  assert.ok(parsed.counts.risk > 0);
});

test('directory scanning skips node_modules and dot-directories', async () => {
  const dir = await fixtureDir({
    'ok/deploy.yaml': SAFE,
    'node_modules/pkg/bad.yaml': RISKY,
    '.hidden/bad.yaml': RISKY,
    'notes.txt': RISKY,
  });
  const { out, io } = capture();
  assert.equal(await main([dir, '--format', 'json'], io), 0);
  const parsed = JSON.parse(out.join('\n'));
  assert.equal(parsed.filesChecked, 1, 'only ok/deploy.yaml should be read');
  assert.equal(parsed.verdict, 'clean');
});

test('a directory with no YAML says so instead of claiming a clean result', async () => {
  const dir = await fixtureDir({ 'readme.md': '# nothing here' });
  const { out, io } = capture();
  assert.equal(await main([dir], io), 0);
  assert.match(out.join('\n'), /No \.yaml or \.yml files found/);
});

test('a single file path is accepted directly', async () => {
  const dir = await fixtureDir({ 'deploy.yaml': RISKY });
  const { out, io } = capture();
  assert.equal(await main([path.join(dir, 'deploy.yaml'), '--format', 'json'], io), 0);
  assert.equal(JSON.parse(out.join('\n')).filesChecked, 1);
});

test('an unparseable file is named without suppressing the rest of the run', async () => {
  const dir = await fixtureDir({ 'broken.yaml': 'a: &x 1\nb: *x\n', 'deploy.yaml': RISKY });
  const { out, io } = capture();
  assert.equal(await main([dir], io), 0);
  const printed = out.join('\n');
  assert.match(printed, /broken\.yaml: could not be read as YAML/);
  assert.match(printed, /drop live requests/, 'the good file must still be reported');
});

test('the text report states where and what to do, not just that something is wrong', () => {
  const result = analyzeSources([{ name: 'deploy.yaml', text: RISKY }]);
  const text = renderText(result);
  assert.match(text, /where: Deployment\/web container web/);
  assert.match(text, /why:/);
  assert.match(text, /fix:/);
  assert.match(text, /readinessProbe/);
});

test('long prose in the report is wrapped rather than emitted as one CI-log line', () => {
  const result = analyzeSources([{ name: 'deploy.yaml', text: RISKY }]);
  for (const line of renderText(result).split('\n')) {
    assert.ok(line.length <= 100, `line too long for a CI log: ${line}`);
  }
});
