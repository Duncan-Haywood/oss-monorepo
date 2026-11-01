"""Tests for redteam.py: mutation sites, campaigns, the blue-team rerun, the tally."""

from __future__ import annotations

import json
import subprocess
import tempfile
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

    def test_target_with_slow_suite_stops_unless_probe_is_zero(self):
        import contextlib, io
        with mock.patch.object(redteam, "suite_for", return_value=(["x"], Path("."))), \
                mock.patch.object(redteam, "run_suite", return_value=(False, 20.0)), \
                contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as cm:
                redteam.main(["campaign", "--target", "a.py", "--probe", "20"])
            self.assertIn("takes over 20s", str(cm.exception))

    def test_targets_under_a_directory(self):
        self.assertEqual(redteam.list_targets(self.repo, under="ventures/"), [self.target])
        self.assertEqual(redteam.list_targets(self.repo, under="platform"), [])

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


class TallyTest(unittest.TestCase):
    def test_never_measured_is_not_zero(self):
        t = redteam.tally([{"track": "ventures"}])
        self.assertEqual((t["redteam_runs"], t["catch_rate"]), (0, None))


if __name__ == "__main__":
    unittest.main()
