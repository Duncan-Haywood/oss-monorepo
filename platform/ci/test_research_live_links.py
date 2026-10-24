import json
import tempfile
import unittest
from pathlib import Path

import research_live_links as r

URL = r.url_for("foo")


class InsertLink(unittest.TestCase):
    def test_after_first_paragraph(self):
        out = r.insert_link("# T\n\nPara one\nstill one.\n\nPara two.\n", "foo")
        self.assertEqual(out, f"# T\n\nPara one\nstill one.\n\n**Live page:** {URL}\n\nPara two.\n")

    def test_stale_base_rewritten_in_place(self):
        old = "# t\n\nBody.\n\n**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/x/\n\nMore.\n"
        out = r.insert_link(old, "x")
        self.assertEqual(out, old.replace("monorepo-projects", "oss-monorepo"))
        self.assertEqual(out.count("Live page"), 1)

    def test_idempotent(self):
        once = r.insert_link("# T\n\nPara.\n\nMore.\n", "foo")
        self.assertEqual(r.insert_link(once, "foo"), once)

    def test_title_only(self):
        out = r.insert_link("# T\n", "foo")
        self.assertIn(URL, out)
        self.assertTrue(out.startswith("# T\n"))

    def test_fence_first_paragraph_kept_whole(self):
        out = r.insert_link("# T\n\n```\na\n\nb\n```\n\nafter\n", "foo")
        self.assertLess(out.index("b\n```"), out.index(URL))

    def test_no_title(self):
        out = r.insert_link("Just text.\n\nMore.\n", "foo")
        self.assertTrue(out.startswith("Just text.\n\n**Live page:**"))


class Main(unittest.TestCase):
    def test_report_then_write(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "research" / "_homepage").mkdir(parents=True)
            (root / "research" / "foo").mkdir()
            (root / "research" / "foo" / "README.md").write_text("# T\n\nPara.\n")
            (root / "research" / "_homepage" / "projects.json").write_text(
                json.dumps({"themes": [{"projects": [{"slug": "foo"}]}]})
            )
            self.assertEqual(r.main(["--root", d]), 1)
            self.assertEqual(r.main(["--root", d, "--write"]), 0)
            self.assertEqual(r.main(["--root", d]), 0)


class Topics(unittest.TestCase):
    DATA = {"themes": [{"id": "chip", "name": "Chip &amp; loops", "projects": [{"slug": "a"}]},
                       {"id": "x", "projects": []}]}

    def test_block_links_each_named_topic(self):
        block = r.topics_block(self.DATA)
        self.assertIn(f"- [Chip & loops]({r.BASE}topics/chip/)", block)
        self.assertNotIn("topics/x/", block)
        self.assertTrue(block.startswith(r.TOPICS_START) and block.endswith(r.TOPICS_END))

    def test_inserted_before_first_list_item_then_replaced_in_place(self):
        text = "# R\n\nIntro.\n\n- [`research/a`](a) — one.\n"
        once = r.with_topics(text, r.topics_block(self.DATA))
        self.assertLess(once.index(r.TOPICS_END), once.index("- [`research/a`]"))
        self.assertIn("## All projects", once)
        self.assertEqual(r.with_topics(once, r.topics_block(self.DATA)), once)
        changed = r.with_topics(once, "<!-- topics:start -->NEW<!-- topics:end -->")
        self.assertIn("NEW", changed)
        self.assertNotIn("Chip & loops", changed)


if __name__ == "__main__":
    unittest.main()


class Projects(unittest.TestCase):
    DATA = {"themes": [{"projects": [
        {"slug": "zeta", "lede": "last."}, {"slug": "old", "lede": ""}, {"slug": "alpha", "lede": "first."}]}]}

    def test_block_lists_ledes_sorted_by_slug(self):
        block = r.projects_block(self.DATA)
        self.assertLess(block.index("research/alpha"), block.index("research/zeta"))
        self.assertNotIn("research/old", block)

    def test_appended_then_replaced_in_place(self):
        once = r.with_projects("# T\n\n- x\n", r.projects_block(self.DATA))
        self.assertTrue(once.startswith("# T\n\n- x\n<!-- projects:start -->"))
        data = {"themes": [{"projects": [{"slug": "beta", "lede": "b."}]}]}
        twice = r.with_projects(once, r.projects_block(data))
        self.assertIn("research/beta", twice)
        self.assertNotIn("research/alpha", twice)
        self.assertEqual(twice.count("projects:start"), 1)
