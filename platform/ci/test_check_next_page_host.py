"""Tests for check_next_page_host.py (cd platform/ci && python3 -m unittest test_check_next_page_host)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_next_page_host as c  # noqa: E402


class ScanTest(unittest.TestCase):
    def test_flags_the_replace_idiom(self):
        for line in ('next = url ? url.replace(this.base, "") : null;',
                     "const p = next.replace(baseUrl, '');",
                     "path = u.replace( API_BASE , \"\" )"):
            self.assertEqual(c.scan_text(line), [1], line)

    def test_ignores_comments_and_prefix_checks(self):
        text = "\n".join([
            ' * 2026-11-27: `url.replace(base, "")` left a foreign URL whole',
            '// url.replace(this.base, "")',
            "if (!url.startsWith(`${base}/`)) throw new Error('x');",
            "return url.slice(base.length);",
            's.replace(/\\s+/g, "")',
        ])
        self.assertEqual(c.scan_text(text), [])

    def test_tree_is_clean(self):
        self.assertEqual(c.main(), 0)


if __name__ == "__main__":
    unittest.main()
