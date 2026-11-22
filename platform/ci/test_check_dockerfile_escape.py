#!/usr/bin/env python3
"""Tests for check_dockerfile_escape.py."""
import tempfile
import unittest
from pathlib import Path

import check_dockerfile_escape as check


def tree(files):
    tmp = tempfile.TemporaryDirectory()
    for rel, text in files.items():
        path = Path(tmp.name) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp


PY_JOINER = '# Dockerfile scanner\nif line.rstrip().endswith("\\\\"):\n    pass\n'
JS_JOINER = "// Dockerfile lines\nconst continues = /\\\\\\s*$/.test(line);\n"
JS_ENDSWITH = "// Dockerfile\nif (trimmed.endsWith('\\\\')) {}\n"


class Offenders(unittest.TestCase):
    def test_joiners_without_escape_are_flagged(self):
        with tree({
            "ventures/a/check.py": PY_JOINER,
            "ventures/b/engine.mjs": JS_JOINER,
            "ventures/c/classify.mjs": JS_ENDSWITH,
        }) as root:
            self.assertEqual(check.offenders(Path(root)), [
                "ventures/a/check.py", "ventures/b/engine.mjs", "ventures/c/classify.mjs",
            ])

    def test_joiner_that_reads_the_directive_passes(self):
        with tree({
            "ventures/a/check.py": PY_JOINER + 'if key == "escape": pass\n',
            "ventures/b/engine.mjs": JS_JOINER + "// honours # escape=`\n",
        }) as root:
            self.assertEqual(check.offenders(Path(root)), [])

    def test_tests_non_dockerfile_files_and_node_modules_are_skipped(self):
        with tree({
            "ventures/a/test_check.py": PY_JOINER,
            "ventures/a/engine.test.mjs": JS_JOINER,
            "ventures/a/csv.mjs": "const continues = /\\\\\\s*$/.test(line);\n",
            "ventures/a/node_modules/x/index.js": JS_JOINER,
        }) as root:
            self.assertEqual(check.offenders(Path(root)), [])

    def test_repository_is_clean(self):
        self.assertEqual(check.offenders(check.ROOT), [])


if __name__ == "__main__":
    unittest.main()
