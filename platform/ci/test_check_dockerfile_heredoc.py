#!/usr/bin/env python3
"""Tests for check_dockerfile_heredoc.py."""
import tempfile
import unittest
from pathlib import Path

import check_dockerfile_heredoc as check


def tree(files):
    tmp = tempfile.TemporaryDirectory()
    for rel, text in files.items():
        path = Path(tmp.name) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp


PY_JOINER = '# Dockerfile scanner\nif line.rstrip().endswith("\\\\"):\n    pass\n'
JS_JOINER = "// Dockerfile lines\nconst continues = /\\\\\\s*$/.test(line);\n"


class Offenders(unittest.TestCase):
    def test_scanners_that_never_mention_heredocs_are_flagged(self):
        with tree({"ventures/a/check.py": PY_JOINER, "ventures/b/engine.mjs": JS_JOINER}) as root:
            self.assertEqual(check.offenders(Path(root)), ["ventures/a/check.py", "ventures/b/engine.mjs"])

    def test_scanner_that_handles_heredocs_passes(self):
        with tree({
            "ventures/a/check.py": PY_JOINER + "def heredoc_terminators(line): pass\n",
            "ventures/b/engine.mjs": JS_JOINER + "// A HEREDOC body is read as lines on purpose\n",
        }) as root:
            self.assertEqual(check.offenders(Path(root)), [])

    def test_tests_and_non_dockerfile_files_are_skipped(self):
        with tree({
            "ventures/a/test_check.py": PY_JOINER,
            "ventures/a/csv.mjs": "const continues = /\\\\\\s*$/.test(line);\n",
            "ventures/a/node_modules/x/index.js": JS_JOINER,
        }) as root:
            self.assertEqual(check.offenders(Path(root)), [])

    def test_empty_root_is_not_a_pass(self):
        with tree({"README.md": "x"}) as root:
            self.assertEqual(check.main(["--root", root]), 2)

    def test_repository_is_clean(self):
        self.assertEqual(check.offenders(check.ROOT), [])


if __name__ == "__main__":
    unittest.main()
