import json
import tempfile
import unittest
from pathlib import Path

import readme_titles as r


class Helpers(unittest.TestCase):
    def test_page_title_unescapes_and_collapses(self):
        self.assertEqual(r.page_title("<head><title>A &amp;\n  B</title>"), "A & B")
        self.assertIsNone(r.page_title("<title> </title>"))
        self.assertIsNone(r.page_title("<p>no title</p>"))

    def test_bare_slug_title(self):
        self.assertTrue(r.bare_slug_title("# foo-bar\n\nText.\n", "foo-bar"))
        self.assertTrue(r.bare_slug_title("# `foo-bar`\n", "foo-bar"))
        self.assertFalse(r.bare_slug_title("# Foo Bar — a tool\n", "foo-bar"))
        self.assertFalse(r.bare_slug_title("No heading\n", "foo-bar"))

    def test_retitle_only_first_h1(self):
        out = r.retitle("intro\n# foo\n\n# foo again\n", "Foo Tool")
        self.assertEqual(out, "intro\n# Foo Tool\n\n# foo again\n")


class Main(unittest.TestCase):
    def tree(self, d):
        root = Path(d)
        v = root / "ventures"
        (v / "foo").mkdir(parents=True)
        (v / "foo" / "README.md").write_text("# foo\n\nBody.\n")
        (v / "foo" / "index.html").write_text("<title>Foo Calculator | Price a Job</title>")
        (v / "kept").mkdir()
        (v / "kept" / "README.md").write_text("# Kept Title\n")
        (v / "kept" / "index.html").write_text("<title>Other</title>")
        (v / "nopage").mkdir()
        (v / "nopage" / "README.md").write_text("# nopage\n")
        (root / "research" / "_homepage").mkdir(parents=True)
        (root / "research" / "bar").mkdir()
        (root / "research" / "bar" / "README.md").write_text("# bar\n\nBody.\n")
        (root / "research" / "_homepage" / "projects.json").write_text(json.dumps(
            {"themes": [{"projects": [{"slug": "bar", "title": "Does <em>x</em> beat y?"}]}]}))
        return root

    def test_report_then_write(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.tree(d)
            self.assertEqual(r.main(["--root", str(root)]), 1)
            self.assertEqual(r.main(["--root", str(root), "--write"]), 0)
            self.assertEqual((root / "ventures/foo/README.md").read_text(),
                             "# Foo Calculator | Price a Job\n\nBody.\n")
            self.assertEqual((root / "research/bar/README.md").read_text(),
                             "# Does x beat y?\n\nBody.\n")
            self.assertEqual((root / "ventures/kept/README.md").read_text(), "# Kept Title\n")
            self.assertEqual((root / "ventures/nopage/README.md").read_text(), "# nopage\n")
            self.assertEqual(r.main(["--root", str(root)]), 0)


if __name__ == "__main__":
    unittest.main()
