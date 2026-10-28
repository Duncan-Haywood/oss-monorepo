import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

import check_md_links as c


class LinksIn(unittest.TestCase):
    def targets(self, text):
        return [t for _, t in c.links_in(text)]

    def test_plain_image_and_titled(self):
        self.assertEqual(sorted(self.targets('[a](x.md) ![i](p.png) [b](y.md "t")')), ["p.png", "x.md", "y.md"])

    def test_code_ignored(self):
        self.assertEqual(self.targets("`[a](x.md)` and ``[`b`](y.md)``"), [])
        self.assertEqual(self.targets("```\n[a](x.md)\n```\n[b](z.md)"), ["z.md"])

    def test_badge_link_checks_outer_target(self):
        # [![alt](img)](href): the href used to be skipped and img counted twice
        self.assertEqual(sorted(self.targets("[![b](p.png)](dead.md)")), ["dead.md", "p.png"])

    def test_parenthesised_target(self):
        self.assertEqual(self.targets("[a](foo_(1).md)"), ["foo_(1).md"])


class DeadLinks(unittest.TestCase):
    def test_dead_vs_live(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sub").mkdir()
            (root / "real.md").write_text("# h\n")
            doc = root / "sub" / "a.md"
            doc.write_text(
                "[ok](../real.md#h) [bad](nope.md) [web](https://x.y) [site](/page)\n"
            )
            self.assertEqual([t for _, t in c.dead_links(doc, root)], ["nope.md"])

    def test_line_numbers_and_query_strings(self):
        self.assertEqual(list(c.links_in("[a](x.md)\n\n[b](y.md)")), [(1, "x.md"), (3, "y.md")])
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "real.md").write_text("x")
            doc = root / "a.md"
            doc.write_text("[q](real.md?raw=1) [n](nope.md)\n")
            self.assertEqual(list(c.dead_links(doc, root)), [(1, "nope.md")])


class Anchors(unittest.TestCase):
    def test_slugs_follow_github(self):
        text = "# Usage counting\n## d. `Foo` [bar](x.md)?\n## Same\n## Same\n```\n# not a heading\n```\n"
        self.assertEqual(
            c.heading_slugs(text),
            {"usage-counting", "d-foo-bar", "same", "same-1"},
        )

    def test_dead_anchor_same_and_other_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "real.md").write_text("## Real Part\n")
            (root / "pic.png").write_text("x")
            doc = root / "a.md"
            doc.write_text(
                "# Top\n[ok](#top) [dead](#gone) [ok2](real.md#real-part) "
                "[dead2](real.md#nope) [img](pic.png#x)\n"
            )
            self.assertEqual([t for _, t in c.dead_links(doc, root)], ["#gone", "real.md#nope"])

    def test_line_anchor_on_other_markdown_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "real.md").write_text("## Real Part\n")
            doc = root / "a.md"
            doc.write_text("[ok](real.md#L10) [ok2](real.md#L10-L20) [dead](#L5) [dead2](real.md#L)\n")
            self.assertEqual([t for _, t in c.dead_links(doc, root)], ["#L5", "real.md#L"])


class Main(unittest.TestCase):
    def run_main(self, root, *paths):
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            rc = c.main(["--root", str(root), *paths])
        return rc, err.getvalue()

    def test_exit_code_and_count(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            doc = root / "a.md"
            doc.write_text("[a](x.md) [b](y.md)\n")
            self.assertEqual(self.run_main(root, str(doc)), (1, "2 dead link(s)\n"))
            doc.write_text("fine\n")
            self.assertEqual(self.run_main(root, str(doc)), (0, ""))

    def test_tracked_markdown_skips_archive(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            subprocess.run(["git", "-C", d, "init", "-q"], check=True)
            (root / "docs/history").mkdir(parents=True)
            (root / "a.md").write_text("x")
            (root / "docs/history/old.md").write_text("x")
            subprocess.run(["git", "-C", d, "add", "."], check=True)
            self.assertEqual(c.tracked_markdown(root), [root / "a.md"])
            # outside a git repo the listing must fail loudly, not look clean
            with tempfile.TemporaryDirectory() as e:
                with self.assertRaises(subprocess.CalledProcessError):
                    c.tracked_markdown(Path(e))


class Help(unittest.TestCase):
    def test_help_leads_with_summary_line(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), self.assertRaises(SystemExit):
            c.main(["--help"])
        self.assertIn("Report relative links in tracked Markdown files that point at nothing.", " ".join(buf.getvalue().split()))


if __name__ == "__main__":
    unittest.main()
