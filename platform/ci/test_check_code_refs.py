import subprocess
import tempfile
import unittest
from pathlib import Path

import check_code_refs as c


class Candidate(unittest.TestCase):
    def test_plain_path(self):
        self.assertEqual(c.candidate("platform/ci/x.py"), "platform/ci/x.py")

    def test_suffixes_stripped(self):
        self.assertEqual(c.candidate("a/b.md:12"), "a/b.md")
        self.assertEqual(c.candidate("a/b.md#sec"), "a/b.md")
        self.assertEqual(c.candidate("a/b.py --flag"), "a/b.py")

    def test_not_paths(self):
        for t in ("ventures/<slug>/x", "a/*.py", "https://x/y", "/abs/p", "foo", "a/b|c",
                  "prompts/runs/YYYY-MM.md"):
            self.assertIsNone(c.candidate(t), t)


class Missing(unittest.TestCase):
    def test_finds_only_missing_rooted_paths(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform").mkdir()
            (root / "platform/real.py").write_text("")
            doc = root / "doc.md"
            doc.write_text(
                "`platform/real.py` `platform/gone.py` `owner/repo`\n"
                "```\n`platform/fenced.py`\n```\n`platform/gone2.py:3`\n")
            subprocess.run(["git", "-C", d, "init", "-q"], check=True)
            subprocess.run(["git", "-C", d, "add", "-A"], check=True)
            got = list(c.missing_refs(doc, root, {"platform"}))
            self.assertEqual(got, [(1, "platform/gone.py"), (5, "platform/gone2.py")])


if __name__ == "__main__":
    unittest.main()
