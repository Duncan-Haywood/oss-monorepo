import contextlib
import io
import tempfile
import unittest
from pathlib import Path
import check_json_valid as c


class Classify(unittest.TestCase):
    def test_json(self):
        self.assertEqual(c.classify('{"a": [1, 2]}'), "json")

    def test_jsonl(self):
        self.assertEqual(c.classify('["a", 1]\n["b", 2]\n'), "jsonl")

    def test_trailing_comma(self):
        self.assertTrue(c.classify('{"a": 1,}').startswith("error"))

    def test_bad_line_in_jsonl(self):
        self.assertTrue(c.classify('[1]\n[2,\n').startswith("error"))


class Repo(unittest.TestCase):
    def test_repo_root_and_tracked(self):
        self.assertTrue((c.REPO_ROOT / "platform" / "ci" / "check_json_valid.py").is_file())
        files = c.tracked()
        self.assertTrue(files and all(isinstance(x, str) for x in files))
        self.assertIn("prompts/routing.json", files)

    def _run(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, text in files.items():
                (Path(d) / name).write_text(text, encoding="utf-8")
            old = (c.REPO_ROOT, c.tracked)
            c.REPO_ROOT, c.tracked = Path(d), lambda: list(files) + ["missing.json"]
            out = io.StringIO()
            try:
                with contextlib.redirect_stdout(out):
                    rc = c.main()
            finally:
                c.REPO_ROOT, c.tracked = old
        return rc, out.getvalue()

    def test_main_clean_and_jsonl_note(self):
        rc, out = self._run({"a.json": "{}", "b.json": "[1]\n[2]\n"})
        self.assertEqual(rc, 0)
        self.assertIn("note: b.json is JSON Lines", out)
        self.assertNotIn("a.json", out)
        self.assertNotIn("FAIL", out)

    def test_main_fails_on_bad_file(self):
        rc, out = self._run({"a.json": "{}", "bad.json": '{"a": 1,}'})
        self.assertEqual(rc, 1)
        self.assertIn("FAIL bad.json: error:", out)
        self.assertNotIn("FAIL a.json", out)


if __name__ == "__main__":
    unittest.main()
