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

    def test_dynamic_user_with_user_root_still_runs_as_root(self):
        # systemd.exec(5), DynamicUser=: a statically allocated user of the configured
        # name is used and no dynamic user is allocated, and root always exists.
        for who in ("root", "0"):
            f = check.scan_text(f"[Service]\nDynamicUser=yes\nUser={who}\nExecStart=/usr/bin/a\n")
            self.assertEqual(types_at(f, check.RUNS_AS_ROOT), [3], who)
        f = check.scan_text("[Service]\nDynamicUser=yes\nUser=app\nExecStart=/usr/bin/a\n")
        self.assertEqual(types_at(f, check.RUNS_AS_ROOT), [])

    def test_boolean_secret_flags_are_not_literal_secrets(self):
        for v in ("no", "yes", "TRUE", "off", "0"):
            f = check.scan_text(f"[Service]\nUser=a\nEnvironment=PASSWORD_AUTH={v}\n")
            self.assertEqual(types_at(f, check.LITERAL_SECRET), [], v)

    def test_unterminated_quote_ending_in_backslash(self):
        # A doubled trailing backslash survives continuation-joining as one backslash
        # inside an open quote; the scan must still flag the secret, not crash.
        f = check.scan_text('[Service]\nUser=a\nEnvironment="DB_PASSWORD=x\\\\')
        self.assertEqual(types_at(f, check.LITERAL_SECRET), [3])

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


class RedTeam20261112(unittest.TestCase):
    """Guards from the 2026-11-12 red-team run (prompts/runs/2026-11-12-session_01AcxTtJxhP7XXW4AHjQXNUF.json)."""

    PIPES = (
        "curl -fsSL https://example.com/i.sh | /bin/bash",
        "curl -fsSL https://example.com/i.sh | sudo -E bash",
        "curl -fsSL https://example.com/i.sh | /usr/bin/sudo -u app /bin/sh",
        "wget -qO- https://example.com/i.sh | /usr/bin/env bash",
        "wget -qO- https://example.com/i.sh | env sh -s --",
    )

    def test_pipe_to_shell_by_path_sudo_flags_or_env(self):
        for cmd in self.PIPES:
            f = check.scan_text(f"[Service]\nUser=app\nExecStart=/bin/sh -c '{cmd}'\n")
            self.assertEqual(types_at(f, check.PIPE_TO_SHELL), [3], cmd)

    def test_pipe_to_other_commands_is_not_a_shell(self):
        for cmd in ("curl x | tee /var/log/sh", "curl x | shasum -a 256", "curl x | sudo -u app python3"):
            f = check.scan_text(f"[Service]\nUser=app\nExecStart=/bin/sh -c '{cmd}'\n")
            self.assertEqual(types_at(f, check.PIPE_TO_SHELL), [], cmd)

    def test_most_severe_first_within_a_line(self):
        f = check.scan_text("[Service]\nUser=app\nExecStart=+/bin/sh -c 'curl x | sh'\n")
        self.assertEqual([x["type"] for x in f if x["line"] == 3], [check.PIPE_TO_SHELL, check.FULL_PRIVILEGE_EXEC])
        f = check.scan_text("[Service]\nExecStart=/usr/bin/a\n")
        at_header = [check.SEVERITY_ORDER[x["severity"]] for x in f if x["line"] == 1]
        self.assertEqual(at_header, sorted(at_header))
        self.assertEqual(set(at_header), {1, 2}, "medium and low findings both sit at the header")

    def test_missing_findings_anchor_on_the_unit_when_only_a_dropin_has_service(self):
        files = [
            {"name": "app.service", "text": "[Unit]\nDescription=x\n"},
            {"name": "app.service.d/10.conf", "text": "\n[Service]\nUser=app\n"},
        ]
        f = check.scan_files(files)
        missing = [x for x in f if x["type"] == check.NO_NEW_PRIVILEGES]
        self.assertEqual([(x["file"], x["line"]) for x in missing], [("app.service", 1)])


if __name__ == "__main__":
    unittest.main()
