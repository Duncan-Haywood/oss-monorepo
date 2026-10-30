import tempfile
import unittest
from pathlib import Path

from check_built_site import main, scan


class BuiltSite(unittest.TestCase):
    def site(self, files):
        d = Path(tempfile.mkdtemp())
        for name, body in files.items():
            (d / name).parent.mkdir(parents=True, exist_ok=True)
            (d / name).write_text(body, encoding="utf8")
        return d

    def test_flags_placeholder_canonical_with_line(self):
        d = self.site({"a/index.html": '<head>\n<link rel="canonical" href="https://example.invalid/a/">'})
        self.assertEqual(scan(d), [("a/index.html", 2, "https://example.invalid/a/")])

    def test_clean_site_and_localhost_pass(self):
        d = self.site({"a/index.html": "run at http://localhost:8080/ and https://duncan-haywood.github.io/x/"})
        self.assertEqual(scan(d), [])
        self.assertEqual(main([str(d)]), 0)

    def test_scripts_are_not_scanned(self):
        d = self.site({"a/stories.mjs": "export const HUB = 'https://example.invalid/';"})
        self.assertEqual(scan(d), [])

    def test_exit_codes(self):
        d = self.site({"sitemap.xml": "<loc>https://example.invalid/</loc>"})
        self.assertEqual(main([str(d)]), 1)
        self.assertEqual(main([str(d / "missing")]), 2)


if __name__ == "__main__":
    unittest.main()
