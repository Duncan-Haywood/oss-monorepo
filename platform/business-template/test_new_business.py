"""Tests for the business template generator.

    python3 -m unittest discover -s platform/business-template
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import new_business  # noqa: E402


def run(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], cwd=cwd, capture_output=True, text=True)


class GenerateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def make(self, kind: str, **kw) -> Path:
        return new_business.build("Tidy Gutters", "Gutter cleaning in Leeds with instant quotes.",
                                  kind, Path(self.tmp.name) / kind, today="2026-10-20", **kw)

    def test_every_preset_generates_a_repo_that_passes_its_own_checks(self):
        for kind in new_business.presets():
            with self.subTest(kind=kind):
                out = self.make(kind)
                check = run(out, "ops/check.py")
                self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
                tests = run(out, "-m", "unittest", "discover", "-s", "ops")
                self.assertEqual(tests.returncode, 0, tests.stdout + tests.stderr)

    def test_new_repo_routes_to_intake_first(self):
        out = self.make("saas")
        routed = run(out, "ops/route.py")
        self.assertEqual(routed.returncode, 0, routed.stderr)
        self.assertIn("function: intake", routed.stdout)

    def test_placeholders_filled(self):
        out = self.make("local-service", answers={"area": "Leeds and Bradford"})
        business = (out / "BUSINESS.md").read_text()
        self.assertIn("# Tidy Gutters", business)
        self.assertIn("**Answer:** Leeds and Bradford", business)
        self.assertIn("**Answer:** _open_", business)
        self.assertIn("tidy-gutters", (out / "SETUP.md").read_text())
        self.assertIn("**insurance**", (out / "OWNER.md").read_text())
        # GitHub Actions expressions are not template placeholders.
        self.assertIn("${{ secrets.ANTHROPIC_API_KEY }}", (out / ".github/workflows/claude-run.yml").read_text())

    def test_leaving_intake_with_open_questions_fails_the_check(self):
        out = self.make("saas")
        path = out / "ops" / "routing.json"
        routing = json.loads(path.read_text())
        routing["stage"] = "build"
        path.write_text(json.dumps(routing))
        check = run(out, "ops/check.py")
        self.assertEqual(check.returncode, 1)
        self.assertIn("past intake", check.stdout)

    def test_a_full_run_cycle(self):
        out = self.make("services")
        rec = run(out, "ops/record.py", "--function", "intake", "--outcome", "shipped",
                  "--summary", "market note", "--now", "2026-10-20T10:00:00+00:00")
        self.assertEqual(rec.returncode, 0, rec.stderr)
        self.assertTrue((out / "ops/runs/20261020T100000Z-intake.json").exists())
        self.assertEqual(run(out, "ops/check.py").returncode, 0)

    def test_refuses_a_non_empty_directory_and_unknown_type(self):
        out = self.make("saas")
        with self.assertRaises(FileExistsError):
            new_business.build("X", "Y", "saas", out)
        with self.assertRaises(ValueError):
            new_business.build("X", "Y", "nope", Path(self.tmp.name) / "z")

    def test_cli_rejects_unknown_answer_id(self):
        res = run(HERE, "new_business.py", "--name", "A", "--idea", "B", "--type", "saas",
                  "--answer", "bogus=1", "--out", str(Path(self.tmp.name) / "cli"))
        self.assertEqual(res.returncode, 2)
        self.assertIn("unknown question id", res.stderr)

    def test_interactive_blank_name_defaults_and_picks_chosen_type(self):
        from unittest import mock
        catalogue = new_business.presets()
        keys = list(catalogue)
        self.assertGreater(len(keys), 1)
        replies = ["", "An idea", "2"] + [""] * len(catalogue[keys[1]]["questions"])
        with mock.patch("builtins.input", side_effect=replies), mock.patch("builtins.print"):
            name, idea, kind, answers = new_business.interactive(catalogue)
        self.assertEqual((name, idea, kind, answers), ("New Business", "An idea", keys[1], {}))

    def test_interactive_bad_choice_falls_back_to_first_type(self):
        from unittest import mock
        catalogue = new_business.presets()
        keys = list(catalogue)
        for bad in ("abc", "0", str(len(keys) + 1)):
            replies = ["N", "idea", bad] + [""] * len(catalogue[keys[0]]["questions"])
            with mock.patch("builtins.input", side_effect=replies), mock.patch("builtins.print"):
                self.assertEqual(new_business.interactive(catalogue)[2], keys[0], bad)

    def test_cli_requires_out(self):
        with self.assertRaises(SystemExit) as cm:
            new_business.main(["--name", "X", "--idea", "y"])
        self.assertEqual(cm.exception.code, 2)

    def test_presets_are_complete(self):
        functions = {"product", "marketing", "sales", "finance", "legal", "support", "review"}
        for kind, preset in new_business.presets().items():
            with self.subTest(kind=kind):
                self.assertEqual(set(preset["weights"]), {"build", "launch", "grow"})
                for stage, weights in preset["weights"].items():
                    self.assertLessEqual(set(weights), functions)
                    self.assertAlmostEqual(sum(weights.values()), 1.0, msg=f"{kind}/{stage}")
                ids = [q["id"] for q in preset["questions"]] + [o["id"] for o in preset["owner_setup"]]
                self.assertEqual(len(ids), len(set(ids)), kind)


if __name__ == "__main__":
    unittest.main()
