import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check

FX = r"""# privileged: true  <- commented out, must be ignored
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
"""

HARD = r"""apiVersion: apps/v1
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
"""


def lines_of(findings, type_, container=None):
    return [f["line"] for f in findings if f["type"] == type_ and (container is None or f["container"] == container)]


class Rules(unittest.TestCase):
    def setUp(self):
        self.f = check.scan_text(FX, "d.yaml")

    def test_high_risk_lines(self):
        self.assertEqual(lines_of(self.f, check.HOST_NAMESPACE), [9, 10])
        self.assertEqual(lines_of(self.f, check.HOSTPATH_SENSITIVE), [15, 18])
        self.assertEqual(lines_of(self.f, check.PRIVILEGED), [44, 91])
        self.assertEqual(lines_of(self.f, check.DANGEROUS_CAPABILITY), [48, 48, 57])
        self.assertEqual(lines_of(self.f, check.LITERAL_SECRET_ENV), [33])

    def test_comment_ignored(self):
        self.assertNotIn(1, [x["line"] for x in self.f])

    def test_hostpath_medium_and_emptydir(self):
        self.assertEqual(lines_of(self.f, check.HOSTPATH_VOLUME), [21])
        self.assertNotIn(23, [x["line"] for x in self.f])

    def test_medium(self):
        self.assertEqual(lines_of(self.f, check.HOST_PORT), [29])
        self.assertEqual(lines_of(self.f, check.IMAGE_LATEST), [26, 50, 89])
        self.assertEqual(lines_of(self.f, check.PRIVILEGE_ESCALATION), [45, 53, 90])
        self.assertEqual(lines_of(self.f, check.RUNS_AS_ROOT, "app"), [46])
        self.assertEqual(lines_of(self.f, check.RUNS_AS_ROOT, "tool"), [54])
        self.assertEqual(lines_of(self.f, check.NO_SECURITY_CONTEXT), [49, 63])

    def test_digest_pinned_not_flagged(self):
        self.assertNotIn(62, lines_of(self.f, check.IMAGE_LATEST))

    def test_registry_port_is_not_a_tag(self):
        t = "kind: Pod\nspec:\n  containers:\n    - name: a\n      image: localhost:5000/app\n"
        self.assertEqual(len(lines_of(check.scan_text(t, "p.yaml"), check.IMAGE_LATEST)), 1)

    def test_low(self):
        self.assertEqual(lines_of(self.f, check.AUTOMOUNT_TOKEN), [24, 71, 87])
        self.assertEqual(lines_of(self.f, check.WRITABLE_ROOT_FS), [43, 53, 74, 90])
        self.assertEqual(lines_of(self.f, check.CAPABILITIES_NOT_DROPPED), [47, 55, 74, 90])
        self.assertEqual(lines_of(self.f, check.SECCOMP_MISSING), [43, 61, 74, 90])

    def test_multi_document_resources(self):
        seen = []
        for x in self.f:
            if x["resource"] not in seen:
                seen.append(x["resource"])
        self.assertEqual(seen, ["Deployment/web", "Pod/bare", "CronJob/nightly"])

    def test_cronjob_pod_spec(self):
        self.assertTrue(any(x["type"] == check.PRIVILEGED and x["container"] == "job" and x["resource"] == "CronJob/nightly" for x in self.f))

    def test_no_security_context_is_one_finding(self):
        kinds = sorted(x["type"] for x in self.f if x["container"] == "sidecar")
        self.assertEqual(kinds, sorted([check.IMAGE_LATEST, check.NO_SECURITY_CONTEXT]))

    def test_secret_never_echoed_and_non_literals_skipped(self):
        for x in self.f:
            self.assertNotIn("hunter2", x["detail"] + x["remediation"])
        self.assertNotIn(35, lines_of(self.f, check.LITERAL_SECRET_ENV))
        self.assertNotIn(42, lines_of(self.f, check.LITERAL_SECRET_ENV))

    def test_hardened_manifest_has_no_findings(self):
        f = check.scan_text(HARD, "hard.yaml")
        self.assertEqual([x for x in f if x["severity"] == "high"], [])
        self.assertEqual(f, [])
        self.assertFalse(check.has_risk(f))

    def test_empty_and_non_workload(self):
        self.assertEqual(check.scan_text("", "x.yaml"), [])
        self.assertEqual(check.scan_text("apiVersion: v1\nkind: ConfigMap\ndata:\n  a: b\n", "x.yaml"), [])

    def test_every_finding_has_the_eight_fields(self):
        for f in self.f:
            self.assertEqual(set(f), {"file", "line", "type", "severity", "resource", "container", "detail", "remediation"})
            self.assertIn(f["type"], check.RISK_CLASSIFICATIONS)
            self.assertEqual(f["severity"], check.SEVERITY[f["type"]])
            self.assertTrue(f["remediation"])


class Cli(unittest.TestCase):
    def _repo(self, files):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        for name, text in files.items():
            p = Path(d.name) / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        return d.name

    def test_fail_on_risk_exit_code(self):
        root = self._repo({"deploy.yaml": FX})
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(check.main([root]), 0)
            self.assertEqual(check.main([root, "--fail-on-risk"]), 2)

    def test_hardened_passes_fail_on_risk(self):
        root = self._repo({"ok.yml": HARD})
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(check.main([root, "--fail-on-risk"]), 0)
        self.assertIn("no findings", out.getvalue())
        self.assertIn("not a compliance claim", out.getvalue())

    def test_skips_vendor_dirs_and_helm_templates(self):
        root = self._repo({
            "node_modules/x/a.yaml": FX,
            "deploy/b.yaml": FX,
            "chart/t.yaml": FX + "\n{{ .Values.x }}\n",
        })
        with contextlib.redirect_stderr(io.StringIO()) as err:
            files = {f["file"] for f in check.scan_path([root])}
        self.assertEqual(files, {"deploy/b.yaml"})
        self.assertIn("Helm", err.getvalue())

    def test_json_output_uses_relative_paths(self):
        root = self._repo({"deploy/a.yaml": FX})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root, "--format", "json"])
        self.assertEqual({f["file"] for f in json.loads(buf.getvalue())}, {"deploy/a.yaml"})

    def test_text_output_shows_location_resource_risk_and_fix(self):
        root = self._repo({"a.yaml": FX})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root])
        out = buf.getvalue()
        self.assertIn("a.yaml:44  k8s-privileged  [high]  Deployment/web  container: app", out)
        self.assertIn("risk:", out)
        self.assertIn("fix:", out)
        self.assertIn("not a YAML parser", out)


if __name__ == "__main__":
    unittest.main()
