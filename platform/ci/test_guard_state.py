"""Tests for guard_state.py — the report of which guards did not run.

The behaviour worth guarding here is not the happy path either. This tool
exists because a skip inside a passing suite reads as a pass, so the only way
it can fail usefully is by *quietly* reproducing that: dropping a reason it
does not recognise, filing a missing tool as "does not apply here", or exiting
0 while a guard that could have run did not.

Each of those is a way this repository has already been wrong about something
else — 17 nginx serving guards counted inside `533 passed, 25 skipped`, a
browser suite skipped for a missing `npm install` for the whole life of the
catalogue, a `run_workflow_locally.py` step that could not find its interpreter
rendered as an ordinary `FAILED`.
"""

import unittest
from unittest import mock

import guard_state


class ClassifyTest(unittest.TestCase):
    def test_a_missing_tool_is_fixable_and_names_its_install_command(self):
        bucket, missing, command = guard_state._classify(
            "nginx is not installed, so the front door cannot be served here"
        )
        self.assertEqual(bucket, "fixable")
        self.assertEqual(missing, "nginx")
        self.assertIn("nginx-light", command)

    def test_ssh_keygen_is_fixable(self):
        bucket, missing, command = guard_state._classify(
            "ssh-keygen unavailable; cannot generate real key material"
        )
        self.assertEqual(bucket, "fixable")
        self.assertEqual(missing, "ssh-keygen")
        self.assertIn("openssh-client", command)

    def test_a_host_statement_is_environmental_not_fixable(self):
        bucket, missing, command = guard_state._classify(
            "only meaningful on a GitHub-hosted runner"
        )
        self.assertEqual(bucket, "environmental")
        self.assertIsNone(missing)
        self.assertIsNone(command)

    def test_classification_is_case_insensitive(self):
        # pytest prints the reason exactly as the guard wrote it, and the
        # guards in this tree are not consistent about case.
        self.assertEqual(
            guard_state._classify("NGINX IS NOT INSTALLED")[0], "fixable"
        )

    def test_an_unknown_reason_is_never_silently_dropped(self):
        # The whole failure mode this tool exists to break is a skip that
        # nothing reports. A reason the table does not recognise must surface
        # as its own bucket rather than falling through to "environmental",
        # which would file a missing tool as "does not apply here".
        bucket, missing, command = guard_state._classify(
            "the frobnicator daemon was not reachable"
        )
        self.assertEqual(bucket, "unclassified")
        self.assertIsNone(missing)
        self.assertIsNone(command)


class SkipLineTest(unittest.TestCase):
    def test_parses_the_line_pytest_actually_prints(self):
        m = guard_state.SKIP_LINE.match(
            "SKIPPED [1] gitops/tests/test_front_door_serving.py:827: "
            "nginx is not installed, so the front door cannot be served here"
        )
        self.assertIsNotNone(m)
        count, file_, lineno, reason = m.groups()
        self.assertEqual(count, "1")
        self.assertEqual(file_, "gitops/tests/test_front_door_serving.py")
        self.assertEqual(lineno, "827")
        self.assertTrue(reason.startswith("nginx is not installed"))

    def test_a_multi_assertion_skip_keeps_its_count(self):
        # `SKIPPED [6]` means six assertions did not run, not one. Collapsing
        # that to a guard count would under-report the hole by the exact
        # factor that makes it worth reporting.
        m = guard_state.SKIP_LINE.match(
            "SKIPPED [6] gitops/tests/test_load_ssh_key.py:51: ssh-keygen unavailable"
        )
        self.assertEqual(m.group(1), "6")

    def test_a_passing_line_is_not_mistaken_for_a_skip(self):
        self.assertIsNone(guard_state.SKIP_LINE.match("19 passed, 1 skipped in 0.52s"))


class ExitCodeTest(unittest.TestCase):
    """`--require-runnable` is the half that cannot be forgotten to be read."""

    def _run(self, skips, argv, fatal=None):
        with mock.patch.object(
            guard_state, "_run_suite", return_value=(skips, fatal)
        ), mock.patch.object(guard_state.sys, "argv", ["guard_state.py"] + argv):
            return guard_state.main()

    @staticmethod
    def _skip(bucket, reason="x", command="apt-get install -y nginx-light"):
        return {
            "suite": "gitops/tests",
            "file": "gitops/tests/test_front_door_serving.py",
            "line": 827,
            "count": 1,
            "reason": reason,
            "bucket": bucket,
            "missing": "nginx" if bucket == "fixable" else None,
            "command": command if bucket == "fixable" else None,
        }

    def test_bare_invocation_exits_zero_even_with_a_fixable_skip(self):
        # Bare invocation answers "what is the state of the tree?". Folding the
        # gate into it would make a green run mean two things -- the same line
        # pages_state.py holds about --require-current.
        self.assertEqual(self._run([self._skip("fixable")], ["--suite", "gitops/tests"]), 0)

    def test_require_runnable_fails_while_a_fixable_skip_stands(self):
        self.assertEqual(
            self._run(
                [self._skip("fixable")],
                ["--suite", "gitops/tests", "--require-runnable"],
            ),
            1,
        )

    def test_require_runnable_passes_when_only_environmental_skips_remain(self):
        # A guard that wants a GitHub-hosted runner is not something a session
        # can act on, so gating on it would train a reader to ignore the gate.
        self.assertEqual(
            self._run(
                [self._skip("environmental")],
                ["--suite", "gitops/tests", "--require-runnable"],
            ),
            0,
        )

    def test_require_runnable_fails_when_the_suite_could_not_run_at_all(self):
        # "pytest itself is missing" is the strongest form of nothing-ran, and
        # it produces no skip lines to count -- so a gate keyed only on skips
        # would report the tree green precisely when nothing was checked.
        self.assertEqual(
            self._run(
                [], ["--suite", "gitops/tests", "--require-runnable"],
                fatal="gitops/tests: pytest itself is missing",
            ),
            1,
        )

    def test_json_mode_gates_the_same_way(self):
        self.assertEqual(
            self._run(
                [self._skip("fixable")],
                ["--suite", "gitops/tests", "--require-runnable", "--json"],
            ),
            1,
        )


class RunSuiteTest(unittest.TestCase):
    """`_run_suite` is the only place pytest output becomes skips."""

    def test_a_suite_absent_from_the_checkout_is_fatal_not_green(self):
        skips, fatal = guard_state._run_suite("no/such/suite_dir")
        self.assertEqual(skips, [])
        self.assertIn("not present in this checkout", fatal)

    def _proc(self, stdout="", stderr=""):
        return mock.Mock(stdout=stdout, stderr=stderr)

    def test_skips_are_read_from_stdout_and_stderr_together(self):
        out = "SKIPPED [2] a/test_x.py:7: nginx is not installed\n"
        err = "SKIPPED [1] a/test_y.py:9: requires root\n"
        with mock.patch.object(
            guard_state.subprocess, "run", return_value=self._proc(out, err)
        ):
            skips, fatal = guard_state._run_suite("platform/ci")
        self.assertIsNone(fatal)
        self.assertEqual(
            [(s["file"], s["line"], s["count"], s["bucket"]) for s in skips],
            [("a/test_x.py", 7, 2, "fixable"), ("a/test_y.py", 9, 1, "environmental")],
        )

    def test_a_missing_pytest_is_fatal(self):
        with mock.patch.object(
            guard_state.subprocess,
            "run",
            return_value=self._proc(stderr="No module named pytest"),
        ):
            skips, fatal = guard_state._run_suite("platform/ci")
        self.assertEqual(skips, [])
        self.assertIn("pytest itself is missing", fatal)


class ReportTest(unittest.TestCase):
    """The report must file each skip under its own bucket and exit honestly."""

    def _main(self, skips, argv):
        import contextlib
        import io

        buf = io.StringIO()
        with mock.patch.object(
            guard_state, "_run_suite", return_value=(skips, None)
        ), mock.patch.object(
            guard_state.sys, "argv", ["guard_state.py", "--suite", "s"] + argv
        ), contextlib.redirect_stdout(buf):
            code = guard_state.main()
        return code, buf.getvalue()

    @staticmethod
    def _skip(bucket, line):
        return {
            "suite": "s", "file": "f.py", "line": line, "count": 1,
            "reason": "r", "bucket": bucket, "missing": None, "command": None,
        }

    def test_json_files_each_skip_under_its_own_bucket(self):
        import json

        skips = [self._skip("fixable", 1), self._skip("unclassified", 2),
                 self._skip("environmental", 3)]
        code, out = self._main(skips, ["--json"])
        data = json.loads(out)
        self.assertEqual([s["line"] for s in data["fixable"]], [1])
        self.assertEqual([s["line"] for s in data["unclassified"]], [2])
        self.assertEqual([s["line"] for s in data["environmental"]], [3])
        self.assertIn('\n  "suites"', out)  # two-space indent
        self.assertEqual(code, 0)  # bare invocation never gates

    def test_unrecognised_and_environmental_skips_do_not_gate(self):
        for argv in ([], ["--require-runnable"]):
            code, out = self._main(
                [self._skip("unclassified", 2), self._skip("environmental", 3)], argv
            )
            self.assertEqual(code, 0)
            self.assertIn("UNCLASSIFIED — 1", out)
            self.assertIn("ENVIRONMENTAL — 1", out)

    def test_fixable_report_counts_skips_per_file(self):
        a = dict(self._skip("fixable", 1), file="a.py", count=3,
                 missing="nginx", command="apt-get install nginx-light")
        b = dict(self._skip("fixable", 2), file="b.py", count=1,
                 missing="nginx", command="apt-get install nginx-light")
        _, out = self._main([a, b], [])
        self.assertIn("a.py  (3 skipped)", out)
        self.assertIn("b.py  (1 skipped)", out)

    def test_no_skips_at_all_exits_zero(self):
        code, out = self._main([], ["--require-runnable"])
        self.assertEqual(code, 0)
        self.assertIn("No skips at all", out)


class SuiteListTest(unittest.TestCase):
    def test_the_checklist_suites_are_named_literally(self):
        # Named rather than globbed, for the reason CLAUDE.md gives about its
        # own checklist: a glob would absorb a new directory silently, and
        # checklist_coverage.py exists because a new test directory should be
        # noticed rather than auto-adopted.
        self.assertIn("portfolio/ledger", guard_state.SUITES)
        # Retired with the cluster on 2026-10-30.
        self.assertNotIn("gitops/tests", guard_state.SUITES)

    def test_every_fixable_entry_carries_a_command(self):
        for needle, (missing, command) in guard_state.FIXABLE.items():
            with self.subTest(needle=needle):
                self.assertTrue(missing, f"{needle} names nothing missing")
                self.assertTrue(command, f"{needle} names no fix")

    def test_every_apt_fix_refreshes_the_index_first(self):
        """An `apt-get install` without `apt-get update` 404s in a web session.

        Measured 2026-09-10: the image's package index is pinned to versions the
        mirror has already superseded, so a bare install asks for a `.deb` that
        is gone (`nginx-light_1.24.0-2ubuntu7.6_all.deb  404  Not Found`) and
        exits non-zero. A session that ran the printed command exactly still had
        the skip, and the honest next step from there is to call the tree green
        with those guards unrun -- which is what `--require-runnable` exists to
        stop. So the fix line has to be one that actually works: this pins the
        `update &&` half, because the half that is missing is invisible in a
        diff and only shows up on a machine whose index happens to be stale.
        """
        for needle, (_missing, command) in guard_state.FIXABLE.items():
            if "apt-get install" not in command:
                continue
            with self.subTest(needle=needle):
                self.assertIn(
                    "apt-get update",
                    command,
                    f"{needle}: an apt fix must refresh the index first or it 404s on a stale one",
                )
                self.assertLess(
                    command.index("apt-get update"),
                    command.index("apt-get install"),
                    f"{needle}: the refresh has to come before the install",
                )


if __name__ == "__main__":
    unittest.main()
