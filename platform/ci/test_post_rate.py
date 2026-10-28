import contextlib
import collections
import io
import tempfile
import unittest
from pathlib import Path

import post_rate
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

    def test_default_limits(self):
        days = {f"2026-10-{n:02d}": 1 for n in range(1, 21)}
        tags = {f"t{n}": 20 - n for n in range(12)}
        out = report(__import__("collections").Counter(days), __import__("collections").Counter(tags))
        self.assertEqual(out.count("#"), 14)
        self.assertEqual(out.split("top tags: ")[1].count("("), 8)

    def test_cli_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "docs/posts").mkdir(parents=True)
            (root / "docs/agent-posts").mkdir()
            for n in range(1, 21):
                (root / f"docs/posts/2026-10-{n:02d}-x.md").write_text(
                    POST.replace("tags: [a, \"b\"]", "tags: [" + ", ".join(f"t{n}x{k}" for k in range(1)) + f", u{n}]"))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(main(["--root", d]), 0)
            out = buf.getvalue()
            self.assertEqual(out.count("#"), 14)
            self.assertEqual(out.split("top tags: ")[1].count("("), 8)

    def test_days_zero_shows_no_rows(self):
        out = post_rate.report(collections.Counter({"2026-10-01": 2}), collections.Counter(), last=0)
        self.assertEqual(out.count("#"), 0)
        self.assertIn("total 2 posts", out)

    def test_crlf_front_matter_tags(self):
        self.assertEqual(post_rate.tags_of("---\r\ntags: [a, b]\r\n---\r\nbody"), ["a", "b"])

    def test_default_root_is_repo_root(self):
        self.assertTrue((post_rate.ROOT / "CLAUDE.md").is_file())

    def test_empty(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "docs/posts").mkdir(parents=True)
            (Path(d) / "docs/agent-posts").mkdir()
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(["--root", d]), 1)


if __name__ == "__main__":
    unittest.main()
