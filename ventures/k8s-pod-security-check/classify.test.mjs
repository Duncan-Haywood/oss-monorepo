import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanText, scanFiles, hasRisk, summaryLine, SEVERITY, RISK_CLASSIFICATIONS,
  PRIVILEGED, HOST_NAMESPACE, HOSTPATH_SENSITIVE, DANGEROUS_CAPABILITY, LITERAL_SECRET_ENV,
  PRIVILEGE_ESCALATION, RUNS_AS_ROOT, HOSTPATH_VOLUME, IMAGE_LATEST, HOST_PORT,
  NO_SECURITY_CONTEXT, CAPABILITIES_NOT_DROPPED, WRITABLE_ROOT_FS, AUTOMOUNT_TOKEN, SECCOMP_MISSING,
} from "./classify.mjs";

const FX = `# privileged: true  <- commented out, must be ignored
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      hostNetwork: true
      hostPID: true
      hostIPC: false
      volumes:
        - name: sock
          hostPath:
            path: /var/run/docker.sock
        - name: etc
          hostPath:
            path: /etc/
        - name: scratch
          hostPath:
            path: /mnt/data
        - name: cache
          emptyDir: {}
      containers:
        - name: app
          image: nginx
          ports:
            - containerPort: 80
              hostPort: 8080
            - containerPort: 443
          env:
            - name: DB_PASSWORD
              value: hunter2
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: s
                  key: t
            - name: MODE
              value: prod
            - name: SECRET_FILE
              value: /run/secrets/x
          securityContext:
            privileged: true
            allowPrivilegeEscalation: true
            runAsUser: 0
            capabilities:
              add: [SYS_ADMIN, NET_BIND_SERVICE, CAP_NET_ADMIN]
        - name: sidecar
          image: registry.local:5000/side:latest
        - name: tool
          image: ghcr.io/acme/tool:1.2.3
          securityContext:
            runAsNonRoot: false
            capabilities:
              add:
                - ALL
              drop:
                - NET_RAW
            seccompProfile:
              type: Unconfined
      initContainers:
        - name: init
          image: busybox@sha256:abc
---
apiVersion: v1
kind: Pod
metadata:
  name: bare
spec:
  containers:
    - name: c
      image: redis:7
      securityContext:
        allowPrivilegeEscalation: false
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: job
            image: alpine
            securityContext:
              privileged: true
---
apiVersion: v1
kind: Service
metadata:
  name: ignored
spec:
  containers:
    - name: x
      image: y
`;

const HARD = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: api
spec:
  template:
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        seccompProfile:
          type: RuntimeDefault
      volumes:
        - name: tmp
          emptyDir: {}
      containers:
        - name: api
          image: ghcr.io/acme/api:2.4.1
          ports:
            - containerPort: 8080
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db
                  key: password
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
`;

const lines = (findings, type, container) =>
  findings.filter((f) => f.type === type && (container === undefined || f.container === container)).map((f) => f.line);

test("high-severity findings land on the right lines", () => {
  const f = scanText(FX, "d.yaml");
  assert.deepEqual(lines(f, HOST_NAMESPACE), [9, 10]);
  assert.deepEqual(lines(f, HOSTPATH_SENSITIVE), [15, 18]);
  assert.deepEqual(lines(f, PRIVILEGED), [44, 91]);
  assert.deepEqual(lines(f, DANGEROUS_CAPABILITY), [48, 48, 57]);
  assert.deepEqual(lines(f, LITERAL_SECRET_ENV), [33]);
  assert.ok(!f.some((x) => x.line === 1), "a commented-out line is ignored");
});

test("hostPath: other paths are medium, emptyDir is not flagged", () => {
  const f = scanText(FX, "d.yaml");
  assert.deepEqual(lines(f, HOSTPATH_VOLUME), [21]);
  assert.ok(!f.some((x) => x.line === 23));
});

test("medium findings", () => {
  const f = scanText(FX, "d.yaml");
  assert.deepEqual(lines(f, HOST_PORT), [29]);
  assert.deepEqual(lines(f, IMAGE_LATEST), [26, 50, 89]);
  assert.deepEqual(lines(f, PRIVILEGE_ESCALATION), [45, 53, 90]);
  assert.deepEqual(lines(f, RUNS_AS_ROOT, "app"), [46]);
  assert.deepEqual(lines(f, RUNS_AS_ROOT, "tool"), [54]);
  assert.deepEqual(lines(f, NO_SECURITY_CONTEXT), [49, 63]);
});

test("digest-pinned and tagged images are not flagged; registry ports are not tags", () => {
  const f = scanText(FX, "d.yaml");
  assert.ok(!lines(f, IMAGE_LATEST).includes(62), "busybox@sha256 is pinned");
  assert.ok(lines(f, IMAGE_LATEST).includes(50), "registry.local:5000/side:latest is latest");
  assert.equal(scanText("kind: Pod\nspec:\n  containers:\n    - name: a\n      image: localhost:5000/app\n", "p.yaml")
    .filter((x) => x.type === IMAGE_LATEST).length, 1);
});

test("low findings", () => {
  const f = scanText(FX, "d.yaml");
  assert.deepEqual(lines(f, AUTOMOUNT_TOKEN), [24, 71, 87]);
  assert.deepEqual(lines(f, WRITABLE_ROOT_FS), [43, 53, 74, 90]);
  assert.deepEqual(lines(f, CAPABILITIES_NOT_DROPPED), [47, 55, 74, 90]);
  assert.deepEqual(lines(f, SECCOMP_MISSING), [43, 61, 74, 90]);
});

test("multi-document YAML: each document is scanned and named", () => {
  const f = scanText(FX, "d.yaml");
  assert.deepEqual([...new Set(f.map((x) => x.resource))], ["Deployment/web", "Pod/bare", "CronJob/nightly"]);
  assert.ok(!f.some((x) => x.resource.startsWith("Service")), "a Service is not a workload");
});

test("CronJob pod spec is found under spec.jobTemplate.spec.template.spec", () => {
  const f = scanText(FX, "d.yaml").filter((x) => x.resource === "CronJob/nightly");
  assert.ok(f.some((x) => x.type === PRIVILEGED && x.container === "job"));
});

test("a container with no securityContext gets one finding, not four unset ones", () => {
  const f = scanText(FX, "d.yaml").filter((x) => x.container === "sidecar");
  assert.deepEqual(f.map((x) => x.type).sort(), [IMAGE_LATEST, NO_SECURITY_CONTEXT].sort());
});

test("pod-level securityContext satisfies runAsNonRoot and seccomp", () => {
  const t = `apiVersion: v1
kind: Pod
metadata:
  name: p
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: c
      image: x:1
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
`;
  assert.deepEqual(scanText(t, "p.yaml"), []);
});

test("secret values are never echoed, and valueFrom / _FILE / boolean values are not literals", () => {
  for (const x of scanText(FX, "d.yaml")) assert.ok(!(x.detail + x.remediation).includes("hunter2"));
  const f = scanText(FX, "d.yaml");
  assert.ok(!lines(f, LITERAL_SECRET_ENV).includes(35), "valueFrom secretKeyRef is the fix, not a finding");
  assert.ok(!lines(f, LITERAL_SECRET_ENV).includes(42), "SECRET_FILE is a path");
});

test("the hardened manifest has zero high findings (and in fact none)", () => {
  const f = scanText(HARD, "hard.yaml");
  assert.deepEqual(f.filter((x) => x.severity === "high"), []);
  assert.deepEqual(f, []);
  assert.equal(hasRisk(f), false);
  assert.equal(summaryLine(f), "No findings.");
});

test("input with no workloads, or empty, yields nothing", () => {
  assert.deepEqual(scanText("", "x.yaml"), []);
  assert.deepEqual(scanText("apiVersion: v1\nkind: ConfigMap\ndata:\n  a: b\n", "x.yaml"), []);
});

test("every finding has the eight fields, a known type, its severity and a fix", () => {
  for (const x of scanText(FX, "d.yaml")) {
    assert.deepEqual(Object.keys(x).sort(), ["container", "detail", "file", "line", "remediation", "resource", "severity", "type"]);
    assert.ok(RISK_CLASSIFICATIONS.has(x.type));
    assert.equal(x.severity, SEVERITY[x.type]);
    assert.ok(x.remediation.length > 10);
    assert.ok(x.container.length > 0 && x.resource.includes("/"));
  }
});

test("scanFiles, hasRisk, summaryLine", () => {
  const findings = scanFiles([{ name: "a.yaml", text: FX }]);
  assert.equal(findings[0].file, "a.yaml");
  assert.ok(hasRisk(findings));
  assert.match(summaryLine(findings), /^\d+ findings across \d+ patterns\.$/);
});

test("parity: classify.mjs and check.py agree on the fixture, field for field", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "k8s-parity-"));
  try {
    mkdirSync(path.join(dir, "deploy"), { recursive: true });
    writeFileSync(path.join(dir, "deploy", "insecure.yaml"), FX);
    writeFileSync(path.join(dir, "deploy", "hardened.yaml"), HARD);
    const py = JSON.parse(
      execFileSync("python3", [new URL("./check.py", import.meta.url).pathname, dir, "--format", "json"], { encoding: "utf8" }),
    );
    assert.ok(py.length >= 30);
    const js = [...scanText(FX, "deploy/insecure.yaml")];
    assert.deepEqual(js, py);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
