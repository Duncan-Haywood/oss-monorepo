"""Tests for redteam.py: mutation sites, campaigns, the blue-team rerun, the tally."""

from __future__ import annotations

import json
import subprocess
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path

import redteam

CALC = """\
// A comment: a < b && c === d never mutates.
export function net(gross, fees) {
  return gross - fees;
}
export const isLarge = (n) => n > 100;
export const label = "a < b";
"""

# Covers `net` only, so the `>` in `isLarge` on line 5 escapes.
CALC_TEST = """\
import { test } from "node:test";
import assert from "node:assert/strict";
import { net, isLarge } from "./calc.mjs";
test("net", () => { assert.equal(net(10, 3), 7); });
"""

HIGH_TEST = """
test("boundary", () => { assert.equal(isLarge(101), true); assert.equal(isLarge(100), false); });
"""


class SitesTest(unittest.TestCase):
    def test_comments_and_strings_are_left_alone(self):
        found = redteam.sites(CALC, "js")
        self.assertEqual({(s.line, s.operator) for s in found},
                         {(3, "minus-to-plus"), (5, "gt-to-ge"), (5, "const-plus-one")})

    def test_apply_changes_one_line_and_refuses_a_moved_line(self):
        site = next(s for s in redteam.sites(CALC, "js") if s.line == 3)
        self.assertIn("gross + fees", redteam.apply(CALC, site).split("\n")[2])
        with self.assertRaises(ValueError):
            redteam.apply(CALC.replace("gross - fees", "gross-fees"), site)

    def test_docstrings_and_block_comments_are_left_alone(self):
        py = '"""Doc.\n\nx == y and 3\n"""\ndef f():\n    """a == b."""\n    return a == b\n'
        self.assertEqual([(s.line, s.operator) for s in redteam.sites(py, "py")], [(7, "eq-flip")])
        js = "/**\n * a < b\n */\nconst x = a < b;\n"
        self.assertEqual([(s.line, s.operator) for s in redteam.sites(js, "js")], [(4, "lt-to-le")])

    def test_python_operators(self):
        found = redteam.sites("x = a == b and max(c, 2)\n# y = a == b\n", "py")
        self.assertEqual({s.operator for s in found},
                         {"eq-flip", "and-to-or", "max-to-min", "const-plus-one"})


class SuiteForTest(unittest.TestCase):
    def test_pytest_style_suite_is_not_run_by_unittest_without_pytest(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / "m.py").write_text("x = 1\n")
            (repo / "test_m.py").write_text("def test_x():\n    assert True\n")
            with mock.patch.object(redteam, "_has_pytest", return_value=False):
                self.assertIsNone(redteam.suite_for(repo / "m.py", repo))
            with mock.patch.object(redteam, "_has_pytest", return_value=True):
                self.assertIsNotNone(redteam.suite_for(repo / "m.py", repo))
            (repo / "test_m.py").write_text("import unittest\nclass T(unittest.TestCase):\n    pass\n")
            with mock.patch.object(redteam, "_has_pytest", return_value=False):
                self.assertIsNotNone(redteam.suite_for(repo / "m.py", repo))



def _running(pid: int) -> bool:
    """Alive and not a zombie (a killed orphan waits for its new parent to reap it)."""
    import os
    stat = Path(f"/proc/{pid}/stat")
    if stat.parent.parent.joinpath("self").exists():
        try:
            return stat.read_text().rsplit(")", 1)[1].split()[0] != "Z"
        except (FileNotFoundError, ProcessLookupError):
            return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


class CampaignTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name)
        self.venture = self.repo / "ventures" / "demo"
        self.venture.mkdir(parents=True)
        (self.venture / "calc.mjs").write_text(CALC)
        (self.venture / "calc.test.mjs").write_text(CALC_TEST)
        for cmd in (["init", "-q"], ["add", "."],
                    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]):
            subprocess.run(["git", *cmd], cwd=self.repo, check=True)
        self.target = self.venture / "calc.mjs"

    def test_targets_and_suites(self):
        self.assertEqual(redteam.list_targets(self.repo), [self.target])
        self.assertIsNone(redteam.suite_for(self.venture / "calc.test.mjs", self.repo))

    def test_directory_suite_that_imports_the_file_guards_it(self):
        # platform/billing/server.mjs has no server.test.mjs; billing.test.mjs
        # imports it, and before 2026-11-25 no campaign could target it.
        pkg = self.repo / "platform" / "billing"
        pkg.mkdir(parents=True)
        (pkg / "server.mjs").write_text("export const x = 1;\n")
        (pkg / "unused.mjs").write_text("export const y = 2;\n")
        (pkg / "billing.test.mjs").write_text('import { x } from "./server.mjs";\n')
        cmd, cwd = redteam.suite_for(pkg / "server.mjs", self.repo)
        self.assertEqual(cmd, ["node", "--test", "platform/billing/billing.test.mjs"])
        self.assertEqual(cwd, self.repo)
        self.assertIsNone(redteam.suite_for(pkg / "unused.mjs", self.repo))
        # A sibling suite still wins over the directory one.
        (pkg / "server.test.mjs").write_text('import { x } from "./server.mjs";\n')
        cmd, _ = redteam.suite_for(pkg / "server.mjs", self.repo)
        self.assertEqual(cmd, ["node", "--test", "platform/billing/server.test.mjs"])

    def test_usage_counter_suite_includes_the_ci_contract(self):
        # A usage.mjs mutant that CI's usage_contract.mjs rejects is caught;
        # the venture suite alone used to read it as escaped (2026-11-15).
        (self.venture / "usage.mjs").write_text("export const x = 1;\n")
        cmd, _ = redteam.suite_for(self.venture / "usage.mjs", self.repo)
        self.assertEqual(cmd[0], "node")  # no contract in this repo: suite only
        ci = self.repo / "platform" / "ci"
        ci.mkdir(parents=True)
        (ci / "usage_contract.mjs").write_text("process.exit(1);\n")
        cmd, _ = redteam.suite_for(self.venture / "usage.mjs", self.repo)
        self.assertEqual(cmd[:2], ["sh", "-c"])
        self.assertIn("usage_contract.mjs", cmd[2])
        self.assertFalse(redteam.run_suite(cmd, self.repo)[0])  # contract red: caught
        cmd, _ = redteam.suite_for(self.target, self.repo)
        self.assertEqual(cmd[0], "node")  # other files: unchanged

    def test_targets_probe_times_each_suite_once(self):
        from unittest import mock
        import contextlib, io
        paths = [redteam.REPO / "a.py", redteam.REPO / "b.py"]
        times = iter([(True, 1.5)])
        out = io.StringIO()
        with mock.patch.object(redteam, "list_targets", return_value=paths), \
                mock.patch.object(redteam, "suite_for", return_value=(["x"], Path("."))), \
                mock.patch.object(redteam, "run_suite", side_effect=lambda *a: next(times)), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            redteam.main(["targets", "--probe", "9"])
        self.assertEqual(sorted(out.getvalue().split("\n")[:2]),
                         ["a.py\t1.5s", "b.py\t1.5s"])

    def test_random_draw_skips_a_slow_suite(self):
        import contextlib, io
        pool = [Path("/r/slow.py"), Path("/r/fast.py")]
        secs = {"slow.py": 99.0, "fast.py": 1.0}
        with mock.patch.object(redteam, "REPO", Path("/r")), \
                mock.patch.object(redteam, "suite_for", side_effect=lambda p: ([p.name], Path("."))), \
                mock.patch.object(redteam, "run_suite", side_effect=lambda c, w, t: (True, secs[c[0]])), \
                contextlib.redirect_stderr(io.StringIO()):
            for seed in range(8):
                self.assertEqual(redteam.draw_fast_target(pool, seed, 20).name, "fast.py")
            self.assertIn(redteam.draw_fast_target(pool, 0, 0).name, {"slow.py", "fast.py"})

    def test_targets_under_a_directory(self):
        self.assertEqual(redteam.list_targets(self.repo, under="ventures/"), [self.target])
        self.assertEqual(redteam.list_targets(self.repo, under="platform"), [])

    def test_targets_under_a_single_file(self):
        # doc_friction 2026-11-25: --under <file> printed "(0 guarded files)"
        self.assertEqual(redteam.list_targets(self.repo, under="ventures/demo/calc.mjs"),
                         [self.target])
        self.assertEqual(redteam.list_targets(self.repo, under="ventures/demo/calc"), [])

    def test_campaign_catches_escapes_restores_then_rerun_proves_the_guard(self):
        camp = redteam.campaign(self.target, 10, seed=1, repo=self.repo)
        self.assertEqual(self.target.read_text(), CALC)
        caught = {(m["line"], m["operator"]): m["caught"] for m in camp["mutants"]}
        self.assertEqual(caught, {(3, "minus-to-plus"): True, (5, "gt-to-ge"): False,
                                  (5, "const-plus-one"): False})
        self.assertAlmostEqual(
            redteam.tally([{"redteam": {"campaigns": [camp]}}])["catch_rate"], 0.333)

        record = self.repo / "run.json"
        record.write_text(json.dumps({"redteam": None}))
        redteam.add_to_record(record, camp)
        with (self.venture / "calc.test.mjs").open("a") as fh:
            fh.write(HIGH_TEST)
        rec = redteam.rerun(record, repo=self.repo)
        escaped = [m for m in rec["redteam"]["campaigns"][0]["mutants"] if not m["caught"]]
        self.assertEqual([m["caught_after_fix"] for m in escaped], [True, True])
        self.assertEqual(redteam.tally([rec])["catch_rate_after_fix"], 1.0)
        self.assertEqual(self.target.read_text(), CALC)

    def test_rerun_on_a_red_suite_proves_nothing(self):
        # A suite red without the mutant (a still-failing new test, an unrelated
        # break) fails for every mutant too, so it used to mark every gap
        # caught_after_fix: true (red team 2026-11-10).
        camp = redteam.campaign(self.target, 10, seed=1, repo=self.repo)
        record = self.repo / "run.json"
        record.write_text(json.dumps({"redteam": None}))
        redteam.add_to_record(record, camp)
        with (self.venture / "calc.test.mjs").open("a") as fh:
            fh.write("test('always red', () => { throw new Error('x'); });\n")
        rec = redteam.rerun(record, repo=self.repo)
        escaped = [m for m in rec["redteam"]["campaigns"][0]["mutants"] if not m["caught"]]
        self.assertEqual([m["caught_after_fix"] for m in escaped], [None, None])
        self.assertTrue(all("red without the mutant" in m["note"] for m in escaped))
        self.assertEqual(self.target.read_text(), CALC)

    def test_rerun_follows_a_reindented_line(self):
        # doc_friction 2026-11-25/26: a fix that wrapped the mutated line in a
        # block re-indented it, and rerun said "line changed; triage by hand".
        camp = redteam.campaign(self.target, 10, seed=1, repo=self.repo)
        record = self.repo / "run.json"
        record.write_text(json.dumps({"redteam": None}))
        redteam.add_to_record(record, camp)
        with (self.venture / "calc.test.mjs").open("a") as fh:
            fh.write(HIGH_TEST)
        line = "export const isLarge = (n) => n > 100;"

        def escaped_after(source):
            self.target.write_text(source)
            rec = redteam.rerun(record, repo=self.repo)
            self.assertEqual(self.target.read_text(), source)
            return [m for m in rec["redteam"]["campaigns"][0]["mutants"] if not m["caught"]]

        # Same text, new indentation, one line further down: found and run there.
        escaped = escaped_after(CALC.replace(line, "// moved\n    " + line))
        self.assertEqual([m["caught_after_fix"] for m in escaped], [True, True])
        self.assertTrue(all(m["note"] == "[rerun: re-indented line found at 6]" for m in escaped))
        # Rewritten text: still left for hand triage.
        escaped = escaped_after(CALC.replace(line, "  " + line.replace("n > 100", "n>100")))
        self.assertEqual([m["caught_after_fix"] for m in escaped], [None, None])
        self.assertTrue(all(m["note"] == "[rerun: line changed; triage by hand]" for m in escaped))
        # Two re-indented copies: ambiguous, so not guessed.
        escaped = escaped_after(CALC.replace(line, "  " + line + "\nconst copy = `\n    " + line + "\n`;"))
        self.assertEqual([m["caught_after_fix"] for m in escaped], [None, None])
        self.assertTrue(all("2 lines match it ignoring indentation" in m["note"] for m in escaped), [m["note"] for m in escaped])

    def test_rerun_tags_do_not_pile_up(self):
        # doc_friction 2026-11-26: two reruns on a red suite doubled every escaped
        # mutant's note; a rerun that then runs the mutant drops the stale tag.
        camp = redteam.campaign(self.target, 10, seed=1, repo=self.repo)
        for m in camp["mutants"]:
            m["note"] = "blue team: boundary"
        record = self.repo / "run.json"
        record.write_text(json.dumps({"redteam": None}))
        redteam.add_to_record(record, camp)
        test_file = self.venture / "calc.test.mjs"
        green = test_file.read_text()
        test_file.write_text(green + "test('always red', () => { throw new Error('x'); });\n")
        redteam.rerun(record, repo=self.repo)
        rec = redteam.rerun(record, repo=self.repo)
        escaped = [m for m in rec["redteam"]["campaigns"][0]["mutants"] if not m["caught"]]
        self.assertEqual([m["note"].count("[rerun:") for m in escaped], [1, 1])
        self.assertTrue(all(m["note"].startswith("blue team: boundary [rerun:") for m in escaped))
        test_file.write_text(green + HIGH_TEST)
        rec = redteam.rerun(record, repo=self.repo)
        escaped = [m for m in rec["redteam"]["campaigns"][0]["mutants"] if not m["caught"]]
        self.assertEqual([m["note"] for m in escaped], ["blue team: boundary"] * 2)
        self.assertEqual([m["caught_after_fix"] for m in escaped], [True, True])

    def test_timeout_kills_the_suites_children_too(self):
        # A looping mutant's per-file child outlived `node --test` when only the
        # parent was killed (red team 2026-11-14): the whole group must go.
        import os, signal
        pidfile = self.repo / "child.pid"
        cmd = ["sh", "-c", f"sh -c 'echo $$ > {pidfile}; while :; do sleep 1; done' & wait"]
        passed, _ = redteam.run_suite(cmd, self.repo, timeout=2)
        self.assertFalse(passed)
        child = int(pidfile.read_text())
        time.sleep(0.5)
        self.assertFalse(_running(child))

    def test_red_baseline_and_dirty_file_are_refused(self):
        self.target.write_text(CALC + "\n")
        with self.assertRaisesRegex(SystemExit, "uncommitted"):
            redteam.campaign(self.target, 2, seed=1, repo=self.repo)
        self.target.write_text(CALC)
        (self.venture / "calc.test.mjs").write_text(CALC_TEST.replace("7);", "8);"))
        with self.assertRaisesRegex(SystemExit, "baseline is red"):
            redteam.campaign(self.target, 2, seed=1, repo=self.repo)

    def test_slow_baseline_is_a_timeout_not_a_defect(self):
        with self.assertRaisesRegex(SystemExit, "baseline timed out"):
            with mock.patch.object(redteam, "run_suite", return_value=(False, 5.0)):
                redteam.campaign(self.target, 2, seed=1, repo=self.repo, timeout=5)


class FreshTest(unittest.TestCase):
    def test_mutated_before_reads_campaign_targets_and_skips_bad_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp)
            (runs / "a.json").write_text(json.dumps({"redteam": {"campaigns": [
                {"target": "ventures/x/a.mjs"}, {"target": 3}, "junk"]}}))
            (runs / "b.json").write_text(json.dumps({"redteam": None, "track": "redteam"}))
            (runs / "c.json").write_text(json.dumps({"redteam": {"campaigns": None}}))
            (runs / "d.json").write_text("{not json")
            (runs / "e.json").write_text(json.dumps([1, 2]))
            self.assertEqual(redteam.mutated_before(runs), {"ventures/x/a.mjs"})

    def test_drop_mutated_keeps_only_unseen_files(self):
        repo = Path("/r")
        files = [repo / "ventures/x/a.mjs", repo / "ventures/x/b.mjs"]
        self.assertEqual(redteam.drop_mutated(files, {"ventures/x/a.mjs"}, repo),
                         [repo / "ventures/x/b.mjs"])


class RecordPathTest(unittest.TestCase):
    def test_missing_record_fails_before_the_campaign_runs(self):
        with mock.patch.object(redteam, "campaign") as camp:
            with self.assertRaises(SystemExit) as cm:
                redteam.main(["campaign", "--target", "x.py", "--record", "/nonexistent/run.json"])
        self.assertIn("no such run record", str(cm.exception))
        camp.assert_not_called()


class TallyTest(unittest.TestCase):
    def test_never_measured_is_not_zero(self):
        t = redteam.tally([{"track": "ventures"}])
        self.assertEqual((t["redteam_runs"], t["catch_rate"]), (0, None))


class OpenDefects(unittest.TestCase):
    def test_lists_only_unpatched_real_defects_oldest_first(self):
        recs = [
            ("b.json", {"redteam": {"campaigns": [], "real_defects": [
                {"file": "x.mjs", "issue": "fixed", "patched": True},
                {"file": "y.mjs", "issue": "still wrong", "patched": False}]}}),
            ("a.json", {"redteam": {"campaigns": [], "real_defects": [
                {"file": "z.py", "issue": "later fixed", "patched": True, "patched_in": "pr"},
                {"file": "w.py", "issue": "open too"}]}}),
            ("c.json", {"track": "ventures"}),
        ]
        found = redteam.open_defects(recs)
        self.assertEqual([(d["record"], d["index"], d["file"]) for d in found],
                         [("a.json", 1, "w.py"), ("b.json", 1, "y.mjs")])

    def test_blocked_entries_listed_apart(self):
        recs = [("a.json", {"redteam": {"campaigns": [], "real_defects": [
            {"file": "x.mjs", "issue": "needs data", "blocked": "a help-center eval set"},
            {"file": "y.mjs", "issue": "workable", "blocked": "  "},
            {"file": "z.mjs", "issue": "done", "patched": True, "blocked": "old"}]}})]
        self.assertEqual([d["file"] for d in redteam.open_defects(recs)], ["y.mjs"])
        parked = redteam.open_defects(recs, blocked=True)
        self.assertEqual([(d["file"], d["blocked"]) for d in parked],
                         [("x.mjs", "a help-center eval set")])


if __name__ == "__main__":
    unittest.main()
