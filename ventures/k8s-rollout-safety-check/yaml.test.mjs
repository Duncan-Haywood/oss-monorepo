import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocuments, decodeScalar, splitKey, stripComment, YamlError } from './yaml.mjs';

test('reads a minimal Deployment into the shape the engine expects', () => {
  const [doc] = parseDocuments(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: ghcr.io/acme/api:1.4.0
          ports:
            - containerPort: 8080
`);
  assert.equal(doc.kind, 'Deployment');
  assert.equal(doc.metadata.name, 'api');
  assert.equal(doc.spec.replicas, 3);
  assert.equal(doc.spec.template.spec.terminationGracePeriodSeconds, 30);
  assert.equal(doc.spec.template.spec.containers.length, 1);
  assert.equal(doc.spec.template.spec.containers[0].name, 'api');
  assert.equal(doc.spec.template.spec.containers[0].ports[0].containerPort, 8080);
  assert.deepEqual(doc.spec.selector.matchLabels, { app: 'api' });
});

test('splits multiple documents and drops empty ones', () => {
  const docs = parseDocuments(`---
kind: Deployment
---

---
kind: Service
...
`);
  assert.deepEqual(docs.map((d) => d.kind), ['Deployment', 'Service']);
});

test('an indented --- is content, not a document separator', () => {
  const docs = parseDocuments('kind: ConfigMap\ndata:\n  body: "---"\n');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].data.body, '---');
});

test('a sequence may sit at the same indent as the key that owns it', () => {
  const [doc] = parseDocuments(`spec:
  containers:
  - name: a
  - name: b
`);
  assert.deepEqual(doc.spec.containers, [{ name: 'a' }, { name: 'b' }]);
});

test('a list item with a non-standard dash gap still nests correctly', () => {
  const [doc] = parseDocuments(`items:
  -   name: wide
      value: 2
  - name: narrow
`);
  assert.deepEqual(doc.items, [{ name: 'wide', value: 2 }, { name: 'narrow' }]);
});

test('flow mappings and sequences parse', () => {
  const [doc] = parseDocuments(`a: [1, 2, "three"]
b: {x: 1, y: two}
c: []
`);
  assert.deepEqual(doc.a, [1, 2, 'three']);
  assert.deepEqual(doc.b, { x: 1, y: 'two' });
  assert.deepEqual(doc.c, []);
});

test('block scalars keep their line structure and their # characters', () => {
  const [doc] = parseDocuments(`lifecycle:
  preStop:
    exec:
      command:
        - /bin/sh
        - -c
        - |
          # drain, then stop
          sleep 15
`);
  const cmd = doc.lifecycle.preStop.exec.command;
  assert.equal(cmd[2], '# drain, then stop\nsleep 15\n');
});

test('a folded block scalar joins its lines, and - chomps the trailing newline', () => {
  const [doc] = parseDocuments(`note: >-
  one
  two
`);
  assert.equal(doc.note, 'one two');
});

test('comments are stripped outside quotes and kept inside them', () => {
  assert.equal(stripComment('a: b # tail'), 'a: b ');
  assert.equal(stripComment('a: "b # not a comment"'), 'a: "b # not a comment"');
  assert.equal(stripComment("a: 'b # nor this'"), "a: 'b # nor this'");
  assert.equal(stripComment('url: http://x/#frag'), 'url: http://x/#frag');
});

test('scalars decode to the right JS types', () => {
  assert.equal(decodeScalar('3'), 3);
  assert.equal(decodeScalar('-2.5'), -2.5);
  assert.equal(decodeScalar('true'), true);
  assert.equal(decodeScalar('null'), null);
  assert.equal(decodeScalar('~'), null);
  assert.equal(decodeScalar('25%'), '25%');
  assert.equal(decodeScalar('v1'), 'v1');
  assert.equal(decodeScalar('1.2.3'), '1.2.3');
  assert.equal(decodeScalar('"quoted: yes"'), 'quoted: yes');
  assert.equal(decodeScalar("'it''s'"), "it's");
});

test('a colon inside a value is not read as a key separator', () => {
  assert.deepEqual(splitKey('image: ghcr.io/acme/api:1.4.0'), {
    key: 'image',
    rest: 'ghcr.io/acme/api:1.4.0',
  });
  assert.equal(splitKey('just a scalar'), null);
});

test('unsupported YAML features fail loudly rather than parsing wrong', () => {
  assert.throws(() => parseDocuments('a: &anchor 1\nb: 2\n'), YamlError);
  assert.throws(() => parseDocuments('b: *anchor\n'), YamlError);
  assert.throws(() => parseDocuments('list:\n  - *alias\n'), YamlError);
  assert.throws(() => parseDocuments('a:\n  <<: other\n'), YamlError);
  assert.throws(() => parseDocuments('a:\n\tb: 1\n'), YamlError);
});

// Every string below is lifted from this repository's own gitops/prod
// manifests, which an earlier line-wide anchor guard rejected outright. `*`
// and `&` are YAML indicators only in node position; inside a quoted scalar
// or a block scalar they are just characters, and refusing them made the
// tool unable to read most real-world manifests.
test('a * or & that is not in node position is ordinary text', () => {
  const [cron] = parseDocuments('schedule: "0 1 * * *"\n');
  assert.equal(cron.schedule, '0 1 * * *');

  const [csp] = parseDocuments('header: "frame-ancestors *;"\n');
  assert.equal(csp.header, 'frame-ancestors *;');

  const [script] = parseDocuments(`command:
  - -c
  - |
    mkdir -p /cache/.stage \\
      && cp -a /build/site/. /cache/.stage/
    case "$x" in
      *[!0-9]*) ;;
    esac
`);
  assert.match(script.command[1], /&& cp -a/);
  assert.match(script.command[1], /\*\[!0-9\]\*/);
});

test('an error in a later document names the line in the original file', () => {
  try {
    parseDocuments('kind: A\n---\nkind: B\n---\nbad: *alias\n');
    assert.fail('expected a YamlError');
  } catch (err) {
    assert.ok(err instanceof YamlError);
    assert.match(err.message, /line 5/);
  }
});

test('a percentage rollout setting survives as a string', () => {
  const [doc] = parseDocuments(`strategy:
  rollingUpdate:
    maxUnavailable: 25%
    maxSurge: 1
`);
  assert.equal(doc.strategy.rollingUpdate.maxUnavailable, '25%');
  assert.equal(doc.strategy.rollingUpdate.maxSurge, 1);
});
