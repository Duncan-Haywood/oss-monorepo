import tempfile
import unittest
from pathlib import Path

import check_llms_txt_links as c


class DeadLinks(unittest.TestCase):
    def test_build_time_generated_page_is_not_dead(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform" / "pages").mkdir(parents=True)
            (root / "platform/pages/generated-pages.mjs").write_text("export const GENERATED_PAGES = {\n  'foo': 'make.mjs',\n};\n")
            v = root / "ventures" / "foo"
            v.mkdir(parents=True)
            (v / "make.mjs").write_text("const files = { 'by-size.html': 1 };")
            (v / "llms.txt").write_text(
                "- [gen](https://example.invalid/foo/by-size.html)\n- [bad](https://example.invalid/foo/other.html)\n"
            )
            self.assertEqual([u for _, u, _ in c.dead_links(root)], ["https://example.invalid/foo/other.html"])

    def test_finds_only_dead_links(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            v = root / "ventures" / "foo"
            v.mkdir(parents=True)
            (v / "guide.html").write_text("x")
            (v / "README.md").write_text("x")
            (v / "llms.txt").write_text(
                "- [ok](https://duncan-haywood.github.io/oss-monorepo/foo/guide.html)\n"
                "- [ok2](https://example.invalid/foo/)\n"
                "- [ok3](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/foo/README.md#x)\n"
                "- [bad](https://duncan-haywood.github.io/oss-monorepo/foo/gone.html)\n"
                "- [bad2](https://duncan-haywood.github.io/oss-monorepo/nope/)\n"
                "- [bad3](https://github.com/o/oss-monorepo/tree/main/ventures/foo/missing)\n"
                "- [other](https://creativecommons.org/licenses/by-sa/4.0/)\n"
            )
            bad = c.dead_links(root)
            self.assertEqual(
                sorted(u.rsplit("/", 2)[-2] + "/" + u.rsplit("/", 1)[-1] for _, u, _ in bad),
                ["foo/gone.html", "foo/missing", "nope/"],
            )

    def test_page_under_site_folder_counts(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            v = root / "ventures" / "foo"
            (v / "site").mkdir(parents=True)
            (v / "site" / "guide.html").write_text("x")
            (v / "llms.txt").write_text(
                "- [ok](https://duncan-haywood.github.io/oss-monorepo/foo/guide.html)\n")
            self.assertEqual(c.dead_links(root), [])


if __name__ == "__main__":
    unittest.main()
