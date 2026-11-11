import io
import json
import os
import contextlib
import tempfile
import unittest

import check

FX = """[Unit]
Description=Example app

[Service]
# Environment=OLD_TOKEN=commented-out
Environment="DB_PASSWORD=hunter2" MODE=prod
Environment=API_TOKEN_FILE=/run/secrets/t
ExecStartPre=+/usr/bin/install -d /var/lib/app
ExecStartPre=/bin/sh -c 'curl -fsSL https://example.com/setup.sh | bash'
ExecStart=/tmp/app/server \\
    --port 80
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_SYS_ADMIN
UMask=0000
ProtectSystem=full
"""


def types_at(findings, kind):
    return [f["line"] for f in findings if f["type"] == kind]


class Present(unittest.TestCase):
    def setUp(self):
        self.f = check.scan_text(FX, "app.service")

    def test_lines(self):
        self.assertEqual(types_at(self.f, check.LITERAL_SECRET), [6])
        self.assertEqual(types_at(self.f, check.FULL_PRIVILEGE_EXEC), [8])
        self.assertEqual(types_at(self.f, check.PIPE_TO_SHELL), [9])
        self.assertEqual(types_at(self.f, check.EXEC_FROM_WRITABLE_DIR), [10])
        self.assertEqual(types_at(self.f, check.DANGEROUS_CAPABILITY), [12])
        self.assertEqual(types_at(self.f, check.PERMISSIVE_UMASK), [13])
        self.assertEqual(types_at(self.f, check.PROTECT_SYSTEM_PARTIAL), [14])

    def test_missing_anchor_at_service_header(self):
        for kind in (check.RUNS_AS_ROOT, check.NO_NEW_PRIVILEGES, check.PROTECT_HOME_MISSING,
                     check.PRIVATE_TMP_MISSING, check.NO_SYSCALL_FILTER):
            self.assertEqual(types_at(self.f, kind), [4], kind)

    def test_secret_never_printed(self):
        for x in self.f:
            self.assertNotIn("hunter2", x["detail"] + x["remediation"])

    def test_fields(self):
        for x in self.f:
            self.assertEqual(sorted(x), ["detail", "file", "line", "remediation", "severity", "type", "unit"])
            self.assertEqual(x["severity"], check.SEVERITY[x["type"]])


class Merging(unittest.TestCase):
    def test_dropin_fills_and_resets(self):
        files = [
            {"name": "etc/app.service", "text": "[Service]\nExecStart=/usr/bin/app\nEnvironment=API_KEY=abc\n"},
            {"name": "etc/app.service.d/20-b.conf", "text": "[Service]\nProtectHome=yes\n"},
            {"name": "etc/app.service.d/10-a.conf", "text": "[Service]\nEnvironment=\nProtectHome=no\nNoNewPrivileges=yes\n"},
        ]
        f = check.scan_files(files)
        kinds = {x["type"] for x in f}
        self.assertNotIn(check.LITERAL_SECRET, kinds, "Environment= in a drop-in resets the list")
        self.assertNotIn(check.PROTECT_HOME_MISSING, kinds, "20-b sorts after 10-a and wins")
        self.assertNotIn(check.NO_NEW_PRIVILEGES, kinds)
        self.assertEqual({x["unit"] for x in f}, {"app.service"})

    def test_lone_dropin_reports_only_what_it_sets(self):
        f = check.scan_files([{"name": "x.service.d/o.conf", "text": "[Service]\nUMask=0002\n"}])
        self.assertEqual([x["type"] for x in f], [])
        f = check.scan_files([{"name": "x.service.d/o.conf", "text": "[Service]\nUMask=0000\n"}])
        self.assertEqual([x["type"] for x in f], [check.PERMISSIVE_UMASK])

    def test_dynamic_user_implies(self):
        f = check.scan_text("[Service]\nDynamicUser=yes\nExecStart=/usr/bin/a\n")
        kinds = {x["type"] for x in f}
        for k in (check.RUNS_AS_ROOT, check.NO_NEW_PRIVILEGES, check.PROTECT_SYSTEM_MISSING,
                  check.PROTECT_HOME_MISSING, check.PRIVATE_TMP_MISSING):
            self.assertNotIn(k, kinds)
        self.assertFalse(check.has_risk(f))

    def test_hardened_unit_is_clean(self):
        t = ("[Service]\nUser=app\nExecStart=/home/app/bin/a\nNoNewPrivileges=true\nProtectSystem=strict\n"
             "ProtectHome=read-only\nPrivateTmp=yes\nPrivateDevices=yes\nProtectKernelTunables=yes\n"
             "ProtectKernelModules=yes\nProtectKernelLogs=yes\nProtectControlGroups=yes\n"
             "SystemCallFilter=@system-service\nRestrictAddressFamilies=AF_UNIX\nCapabilityBoundingSet=~CAP_SYS_ADMIN\n")
        self.assertEqual(check.scan_text(t), [])

    def test_no_service_section_is_skipped(self):
        self.assertEqual(check.scan_text("[Unit]\nDescription=x\n"), [])
        self.assertEqual(check.scan_text(""), [])

    def test_user_root_and_user_units(self):
        f = check.scan_text("[Service]\nUser=root\nExecStart=/home/x/run\n")
        self.assertEqual(types_at(f, check.RUNS_AS_ROOT), [2])
        self.assertEqual(types_at(f, check.EXEC_FROM_WRITABLE_DIR), [3])
        f = check.scan_text("[Service]\nExecStart=/home/x/run\n", user_units=True)
        self.assertEqual(types_at(f, check.RUNS_AS_ROOT) + types_at(f, check.EXEC_FROM_WRITABLE_DIR), [])

    def test_read_write_root_and_bounding_set(self):
        f = check.scan_text("[Service]\nReadWritePaths=-/var/lib/a /\nCapabilityBoundingSet=CAP_SYS_PTRACE\n")
        self.assertEqual(types_at(f, check.READ_WRITE_ROOT), [2])
        self.assertEqual(types_at(f, check.DANGEROUS_CAPABILITY), [3])


class Container(unittest.TestCase):
    def test_docker_run_skips_sandbox_checks(self):
        t = "[Service]\nExecStartPre=-/usr/bin/docker rm -f x\nExecStart=/usr/bin/docker run --rm \\\n  --name x img\n"
        f = check.scan_text(t)
        self.assertEqual([(x["type"], x["line"]) for x in f], [(check.CONTAINER_LAUNCHER, 3)])

    def test_present_risks_still_reported(self):
        t = "[Service]\nEnvironment=DB_PASSWORD=x\nExecStart=podman run img\n"
        kinds = [x["type"] for x in check.scan_text(t)]
        self.assertEqual(sorted(kinds), [check.CONTAINER_LAUNCHER, check.LITERAL_SECRET])

    def test_docker_ps_is_not_a_launcher(self):
        kinds = {x["type"] for x in check.scan_text("[Service]\nExecStart=/usr/bin/docker-gc run\n")}
        self.assertNotIn(check.CONTAINER_LAUNCHER, kinds)


class Cli(unittest.TestCase):
    def test_walk_dropin_and_exit(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "a.service.d"))
            os.makedirs(os.path.join(d, "node_modules"))
            with open(os.path.join(d, "a.service"), "w") as fh:
                fh.write("[Service]\nExecStart=/usr/bin/a\n")
            with open(os.path.join(d, "a.service.d", "x.conf"), "w") as fh:
                fh.write("[Service]\nDynamicUser=yes\n")
            with open(os.path.join(d, "node_modules", "b.service"), "w") as fh:
                fh.write("[Service]\nUser=root\n")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = check.main([d, "--format", "json", "--fail-on-risk"])
            data = json.loads(buf.getvalue())
            self.assertEqual(rc, 0)
            self.assertTrue(all(x["severity"] == "low" for x in data))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = check.main([os.path.join(d, "a.service"), "--fail-on-risk", "--drop-in"])
            self.assertEqual(rc, 2)
            self.assertIn("[Service]\n#DynamicUser=yes", buf.getvalue())
            self.assertIn("NoNewPrivileges=yes", buf.getvalue())

    def test_drop_in_lists_only_missing_kernel_keys(self):
        f = check.scan_text("[Service]\nUser=a\nProtectKernelModules=yes\n", "k.service")
        text = check.drop_in_for("k.service", f)
        self.assertIn("ProtectKernelTunables=yes", text)
        self.assertNotIn("ProtectKernelModules=yes", text)
        self.assertNotIn("DynamicUser", text)


if __name__ == "__main__":
    unittest.main()
