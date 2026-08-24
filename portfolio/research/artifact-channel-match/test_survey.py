#!/usr/bin/env python3
"""Tests for survey.py. Offline, stdlib-only."""

import json
import tempfile
import unittest
from pathlib import Path

import survey


class TestClassify(unittest.TestCase):
    def test_exact_filenames(self):
        self.assertEqual(survey.classify("pyproject.toml"), "Python")
        self.assertEqual(survey.classify("package.json"), "JavaScript/TypeScript")
        self.assertEqual(survey.classify("composer.json"), "PHP")
        self.assertEqual(survey.classify("Gemfile"), "Ruby")
        self.assertEqual(survey.classify("Cargo.toml"), "Rust")
        self.assertEqual(survey.classify("mix.exs"), "Elixir")

    def test_suffix_patterns(self):
        self.assertEqual(survey.classify("mygem.gemspec"), "Ruby")
        self.assertEqual(survey.classify("App.csproj"), ".NET")

    def test_unrelated_file(self):
        self.assertIsNone(survey.classify("README.md"))

    def test_suffix_pattern_does_not_match_bare_pattern_text(self):
        # "*.gemspec" must not match a file literally named "gemspec"
        self.assertIsNone(survey.classify("gemspec"))


class TestIsPublishable(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, name, text):
        path = self.dir / name
        path.write_text(text, encoding="utf-8")
        return path

    def test_private_package_json_is_not_publishable(self):
        path = self._write("package.json", '{"name": "app", "private": true}')
        ok, reason = survey.is_publishable("JavaScript/TypeScript", path)
        self.assertFalse(ok)
        self.assertIn("private", reason)

    def test_named_public_package_json_is_publishable(self):
        path = self._write("package.json", '{"name": "lib", "version": "1.0.0"}')
        ok, _ = survey.is_publishable("JavaScript/TypeScript", path)
        self.assertTrue(ok)

    def test_package_json_without_name_is_not_publishable(self):
        path = self._write("package.json", '{"version": "1.0.0"}')
        ok, reason = survey.is_publishable("JavaScript/TypeScript", path)
        self.assertFalse(ok)
        self.assertIn("no name", reason)

    def test_private_false_is_publishable(self):
        path = self._write("package.json", '{"name": "lib", "private": false}')
        ok, _ = survey.is_publishable("JavaScript/TypeScript", path)
        self.assertTrue(ok)

    def test_unparseable_package_json(self):
        path = self._write("package.json", "{not json")
        ok, reason = survey.is_publishable("JavaScript/TypeScript", path)
        self.assertIsNone(ok)
        self.assertEqual(reason, "unparseable")

    def test_pyproject_with_project_name_is_publishable(self):
        path = self._write(
            "pyproject.toml",
            '[project]\nname = "thing"\nversion = "0.1.0"\n',
        )
        ok, _ = survey.is_publishable("Python", path)
        self.assertTrue(ok)

    def test_pyproject_with_only_tooling_config_is_not_publishable(self):
        path = self._write(
            "pyproject.toml",
            '[tool.ruff]\nline-length = 100\n\n[tool.pytest.ini_options]\nname = "x"\n',
        )
        ok, reason = survey.is_publishable("Python", path)
        self.assertFalse(ok)
        self.assertIn("[project]", reason)

    def test_name_under_a_later_table_does_not_count(self):
        # A `name` key belonging to [tool.poetry] must not be read as [project].
        path = self._write(
            "pyproject.toml",
            '[project]\nversion = "1"\n\n[tool.poetry]\nname = "nope"\n',
        )
        ok, _ = survey.is_publishable("Python", path)
        self.assertFalse(ok)

    def test_setup_py_is_publishable(self):
        path = self._write("setup.py", "from setuptools import setup\nsetup()\n")
        ok, _ = survey.is_publishable("Python", path)
        self.assertTrue(ok)

    def test_unchecked_ecosystem_returns_unknown(self):
        path = self._write("Cargo.toml", '[package]\nname = "x"\n')
        ok, reason = survey.is_publishable("Rust", path)
        self.assertIsNone(ok)
        self.assertIn("not machine-checked", reason)


class TestDiscover(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_skips_excluded_directories(self):
        (self.root / "node_modules" / "dep").mkdir(parents=True)
        (self.root / "node_modules" / "dep" / "package.json").write_text(
            '{"name": "dep"}', encoding="utf-8"
        )
        (self.root / "package.json").write_text(
            '{"name": "mine", "private": true}', encoding="utf-8"
        )
        found = survey.discover(self.root)
        self.assertEqual([m["path"] for m in found], ["package.json"])

    def test_records_ecosystem_and_publishability(self):
        (self.root / "pyproject.toml").write_text(
            '[project]\nname = "pkg"\n', encoding="utf-8"
        )
        found = survey.discover(self.root)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["ecosystem"], "Python")
        self.assertTrue(found[0]["publishable"])


class TestJoinAndSummarise(unittest.TestCase):
    def setUp(self):
        self.verdicts = {
            "https://upload.pypi.org/legacy/": {
                "verdict": "BLOCKED_EGRESS_FILTER", "http_code": None,
            },
            "https://rubygems.org/api/v1/gems": {
                "verdict": "REACHED", "http_code": 401,
            },
            "https://registry.npmjs.org/-/npm/v1/user": {
                "verdict": "REACHED", "http_code": 401,
            },
        }

    def _row(self, rows, ecosystem):
        return next(r for r in rows if r["ecosystem"] == ecosystem)

    def test_blocked_ecosystem_with_artifacts(self):
        manifests = [{"path": "p/pyproject.toml", "ecosystem": "Python",
                      "publishable": True, "reason": ""}]
        rows = survey.join(manifests, self.verdicts)
        python = self._row(rows, "Python")
        self.assertFalse(python["publish_path_open"])
        self.assertEqual(python["publishable_packages"], 1)

        summary = survey.summarise(rows)
        self.assertEqual(summary["shippable_today"], [])
        self.assertIn("Python", summary["built_but_publish_blocked"])

    def test_open_channel_with_no_artifacts(self):
        rows = survey.join([], self.verdicts)
        ruby = self._row(rows, "Ruby")
        self.assertTrue(ruby["publish_path_open"])
        self.assertEqual(ruby["publishable_packages"], 0)
        self.assertTrue(ruby["on_ask0_menu"])

        summary = survey.summarise(rows)
        self.assertIn("Ruby", summary["publish_open_but_nothing_built"])
        self.assertEqual(summary["ask0_channels_with_a_publishable_artifact"], [])

    def test_applications_do_not_count_as_publishable(self):
        manifests = [{"path": "app/package.json",
                      "ecosystem": "JavaScript/TypeScript",
                      "publishable": False, "reason": "private"}]
        rows = survey.join(manifests, self.verdicts)
        js = self._row(rows, "JavaScript/TypeScript")
        self.assertTrue(js["publish_path_open"])
        self.assertEqual(js["publishable_packages"], 0)
        self.assertEqual(js["applications_only"], 1)

        summary = survey.summarise(rows)
        self.assertEqual(summary["shippable_today"], [])
        self.assertIn("JavaScript/TypeScript",
                      summary["publish_open_but_nothing_built"])

    def test_shippable_requires_both_halves(self):
        manifests = [{"path": "lib/package.json",
                      "ecosystem": "JavaScript/TypeScript",
                      "publishable": True, "reason": ""}]
        rows = survey.join(manifests, self.verdicts)
        summary = survey.summarise(rows)
        self.assertEqual(summary["shippable_today"], ["JavaScript/TypeScript"])

    def test_ecosystem_without_registry_is_not_counted_open_or_blocked(self):
        rows = survey.join([], self.verdicts)
        swift = self._row(rows, "Swift")
        self.assertIsNone(swift["publish_path_open"])
        self.assertIsNone(swift["channel"])


class TestRecomputeRoundTrip(unittest.TestCase):
    def test_saved_result_re_derives_the_same_summary(self):
        saved = Path(__file__).resolve().parent / "results-2026-08-24.json"
        if not saved.exists():
            self.skipTest("no saved result committed")
        payload = json.loads(saved.read_text(encoding="utf-8"))
        self.assertEqual(survey.summarise(payload["rows"]), payload["summary"])

    def test_committed_result_still_shows_nothing_shippable(self):
        saved = Path(__file__).resolve().parent / "results-2026-08-24.json"
        if not saved.exists():
            self.skipTest("no saved result committed")
        payload = json.loads(saved.read_text(encoding="utf-8"))
        self.assertEqual(payload["summary"]["shippable_today"], [])
        self.assertEqual(
            payload["summary"]["ask0_channels_with_a_publishable_artifact"], []
        )


if __name__ == "__main__":
    unittest.main()
