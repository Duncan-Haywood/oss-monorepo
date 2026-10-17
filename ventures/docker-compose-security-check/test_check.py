import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check

FX = r"""# privileged: true  <- commented out, must be ignored
services:
  web:
    image: nginx
    privileged: true
    network_mode: "host"
    pid: host
    ipc: host
    user: "0:0"
    cap_add: [ALL, NET_ADMIN]
    security_opt:
      - seccomp:unconfined
      - apparmor=unconfined
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc:/host-etc
      - /:/host
      - ./data:/data
      - appdata:/var/lib/app
      - type: bind
        source: /var/run/docker.sock
        target: /sock
    environment:
      - DB_PASSWORD=hunter2
      - API_TOKEN=${API_TOKEN}
      - MODE=prod
      - SECRET_FILE=/run/secrets/x
    restart: always
    healthcheck:
      test: ["CMD", "true"]
  db:
    image: postgres:latest
    ports:
      - "5432:5432"
      - "127.0.0.1:6379:6379"
      - 0.0.0.0:3306:3306
      - "[::1]:27017:27017"
      - "8080:80"
      - "9200"
    environment:
      POSTGRES_PASSWORD: example
      POSTGRES_USER: app
      ALLOW_EMPTY_PASSWORD: yes
    deploy:
      restart_policy:
        condition: on-failure
  cache:
    image: ghcr.io/acme/cache:1.4.2
    user: app
    ports: ["6379:6379"]
    restart: unless-stopped
    healthcheck:
      disable: true
  pinned:
    image: redis@sha256:abc
    restart: always
    healthcheck:
      test: ["CMD", "true"]
volumes:
  appdata:
"""


def lines_of(findings, type_):
    return [f["line"] for f in findings if f["type"] == type_]


class Rules(unittest.TestCase):
    def setUp(self):
        self.f = check.scan_text(FX, "docker-compose.yml")

    def test_high_risk_lines(self):
        self.assertEqual(lines_of(self.f, check.PRIVILEGED), [5])
        self.assertEqual(lines_of(self.f, check.HOST_NETWORK), [6])
        self.assertEqual(lines_of(self.f, check.HOST_NAMESPACE), [7, 8])
        self.assertEqual(lines_of(self.f, check.DANGEROUS_CAPABILITY), [10])
        self.assertEqual(lines_of(self.f, check.SECURITY_OPT_UNCONFINED), [12, 13])
        self.assertEqual(lines_of(self.f, check.DOCKER_SOCKET), [15, 21])
        self.assertEqual(lines_of(self.f, check.SENSITIVE_HOST_MOUNT), [16, 17])
        self.assertEqual(lines_of(self.f, check.LITERAL_SECRET), [24, 41])

    def test_comment_ignored(self):
        self.assertNotIn(1, [x["line"] for x in self.f])

    def test_database_ports(self):
        self.assertEqual(lines_of(self.f, check.EXPOSED_DATABASE_PORT), [34, 36, 39, 50])

    def test_medium_and_low(self):
        self.assertEqual(lines_of(self.f, check.RUNS_AS_ROOT), [9])
        self.assertEqual(lines_of(self.f, check.IMAGE_LATEST), [4, 32])
        self.assertEqual(lines_of(self.f, check.NO_HEALTHCHECK), [31])
        self.assertEqual(lines_of(self.f, check.NO_RESTART), [])

    def test_bare_service_gets_both_low_findings(self):
        f = check.scan_text("services:\n  app:\n    image: x:1\n", "c.yml")
        self.assertEqual([(x["line"], x["type"]) for x in f], [(2, check.NO_RESTART), (2, check.NO_HEALTHCHECK)])
        self.assertFalse(check.has_risk(f))

    def test_digest_pinned_image_is_not_flagged(self):
        self.assertNotIn(52, lines_of(self.f, check.IMAGE_LATEST))

    def test_secret_never_echoed(self):
        for x in self.f:
            self.assertNotIn("hunter2", x["detail"] + x["remediation"])

    def test_interpolated_file_and_boolean_values_are_not_secrets(self):
        t = "services:\n  a:\n    image: x:1\n    environment:\n      - TOKEN=${T}\n      - DB_PASSWORD_FILE=/run/secrets/p\n      - ALLOW_EMPTY_PASSWORD=yes\n      - PASSWORD\n"
        self.assertEqual(lines_of(check.scan_text(t, "c.yml"), check.LITERAL_SECRET), [])

    def test_empty_and_no_services(self):
        self.assertEqual(check.scan_text("", "c.yml"), [])
        self.assertEqual(check.scan_text("version: '3'\nvolumes:\n  a:\n", "c.yml"), [])

    def test_every_finding_has_the_six_fields(self):
        for f in self.f:
            self.assertEqual(set(f), {"file", "line", "type", "severity", "detail", "remediation"})
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
        root = self._repo({"docker-compose.yml": FX})
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(check.main([root]), 0)
            self.assertEqual(check.main([root, "--fail-on-risk"]), 2)

    def test_low_only_does_not_fail(self):
        root = self._repo({"compose.yaml": "services:\n  a:\n    image: x:1\n"})
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(check.main([root, "--fail-on-risk"]), 0)

    def test_clean_file_says_no_findings(self):
        clean = "services:\n  a:\n    image: x:1\n    restart: always\n    healthcheck:\n      test: [CMD, true]\n"
        root = self._repo({"docker-compose.yml": clean})
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(check.main([root, "--fail-on-risk"]), 0)
        self.assertIn("no findings", out.getvalue())
        self.assertIn("not proof", out.getvalue())

    def test_only_compose_named_files_are_discovered(self):
        root = self._repo({"node_modules/x/docker-compose.yml": FX, "notes.yml": FX, "deploy/docker-compose.prod.yml": FX})
        names = [rel for rel, _ in check.discover_files([root])]
        self.assertEqual(names, ["deploy/docker-compose.prod.yml"])

    def test_explicit_file_is_scanned_whatever_its_name(self):
        root = self._repo({"stack.yml": FX})
        self.assertTrue(check.scan_path([str(Path(root) / "stack.yml")]))

    def test_json_output_uses_relative_paths(self):
        root = self._repo({"deploy/docker-compose.yml": FX})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root, "--format", "json"])
        self.assertEqual({f["file"] for f in json.loads(buf.getvalue())}, {"deploy/docker-compose.yml"})

    def test_text_output_shows_location_risk_and_fix(self):
        root = self._repo({"docker-compose.yml": FX})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root])
        out = buf.getvalue()
        self.assertIn("docker-compose.yml:5  compose-privileged  [high]", out)
        self.assertIn("risk:", out)
        self.assertIn("fix:", out)


if __name__ == "__main__":
    unittest.main()
