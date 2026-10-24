"""Tests for rule_language.py: sorting absolute wording into liability and default piles."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import rule_language


class ClassifyTest(unittest.TestCase):
    def test_liability_and_default_piles(self):
        text = "Never fabricate a result.\nAlways run the tests first.\nPrefer small PRs.\n"
        piles = rule_language.classify(text)
        self.assertEqual([n for n, _ in piles["liability"]], [1])
        self.assertEqual([n for n, _ in piles["default"]], [2])

    def test_code_blocks_are_skipped(self):
        text = "```\nnever mind this\n```\nYou must read this.\n"
        piles = rule_language.classify(text)
        self.assertEqual(piles["default"], [(4, "You must read this.")])

    def test_survey_reads_paths_and_globs(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "a.md").write_text("Do not commit secrets.\n")
            (root / "sub").mkdir()
            (root / "sub" / "b.md").write_text("Always merge yourself.\nNever loop tests.\n")
            system = root / "system.json"
            system.write_text(json.dumps({"docs": [{"path": "a.md"}, {"glob": "sub/*.md"},
                                                   {"path": "missing.md"}]}))
            rows = rule_language.survey(rule_language.guidance_files(system, root), root)
        self.assertEqual(rows, [{"file": "sub/b.md", "liability": 0, "default": 2},
                                {"file": "a.md", "liability": 1, "default": 0}])


if __name__ == "__main__":
    unittest.main()
