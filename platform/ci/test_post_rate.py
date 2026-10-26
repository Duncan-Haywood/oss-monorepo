import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from post_rate import collect, main, report, tags_of

POST = '---\ntitle: "T"\ndate: 2026-10-24\ndescription: "d"\ntags: [a, "b"]\n---\nbody\n'


class T(unittest.TestCase):
    def test_tags(self):
        self.assertEqual(tags_of(POST), ["a", "b"])
        self.assertEqual(tags_of("no front matter"), [])

    def test_collect_and_report(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs/posts").mkdir(parents=True)
            (root / "docs/agent-posts").mkdir()
            (root / "docs/posts/2026-10-24-x.md").write_text(POST)
            (root / "docs/posts/2026-10-24-y.md").write_text(POST)
            (root / "docs/agent-posts/2026-10-25-z.md").write_text(POST)
            (root / "docs/posts/README.md").write_text("skip")
            days, tags = collect(root)
            self.assertEqual(dict(days), {"2026-10-24": 2, "2026-10-25": 1})
            self.assertEqual(tags["a"], 3)
            out = report(days, tags)
            self.assertIn("total 3 posts over 2 days", out)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(main(["--root", d]), 0)
            self.assertIn("2026-10-24", buf.getvalue())

    def test_empty(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "docs/posts").mkdir(parents=True)
            (Path(d) / "docs/agent-posts").mkdir()
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(["--root", d]), 1)


if __name__ == "__main__":
    unittest.main()
