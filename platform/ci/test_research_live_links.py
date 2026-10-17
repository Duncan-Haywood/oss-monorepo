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


if __name__ == "__main__":
    unittest.main()
