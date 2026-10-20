import tempfile
import unittest
from pathlib import Path

import serp_snippets as s


def page(title, desc):
    t = f"<title>{title}</title>" if title is not None else ""
    d = f'<meta name="description" content="{desc}">' if desc is not None else ""
    return f"<html><head>{t}{d}</head></html>"


class SnippetOf(unittest.TestCase):
    def test_extracts_and_unescapes(self):
        self.assertEqual(s.snippet_of(page("A &amp; B", "x  y")), ("A & B", "x y"))

    def test_attribute_order_and_single_quotes(self):
        h = "<title>T</title><meta content='D' name='description'>"
        self.assertEqual(s.snippet_of(h), ("T", "D"))

    def test_raw_angle_bracket_in_value(self):
        h = '<title>T</title><meta name="description" content="check <lastmod> tags">'
        self.assertEqual(s.snippet_of(h), ("T", "check <lastmod> tags"))

    def test_other_meta_ignored(self):
        h = '<title>T</title><meta name="viewport" content="x"><meta name="description" content="D">'
        self.assertEqual(s.snippet_of(h), ("T", "D"))

    def test_absent_or_empty(self):
        self.assertEqual(s.snippet_of(page(None, "")), (None, None))


class Audit(unittest.TestCase):
    def test_counts_and_missing(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures/a").mkdir(parents=True)
            (root / "ventures/a/index.html").write_text(page("T" * 70, "D" * 200))
            (root / "ventures/a/ok.html").write_text(page("short", "short"))
            (root / "ventures/a/bad.html").write_text(page("only title", None))
            r = s.audit(root)
            self.assertEqual(r["pages"], 3)
            self.assertEqual((r["long_titles"], r["long_descriptions"]), (1, 1))
            self.assertEqual(r["worst_ventures"], [("a", 2)])
            self.assertEqual(r["missing"], ["ventures/a/bad.html"])
            self.assertEqual(s.main(["--root", d]), 1)


if __name__ == "__main__":
    unittest.main()


class BrokenMeta(unittest.TestCase):
    def test_unescaped_quote_flagged(self):
        h = '<meta name="description" content="says "8-10%" and stop">'
        self.assertTrue(s.broken_meta(h))

    def test_escaped_and_normal_ok(self):
        self.assertFalse(s.broken_meta(page("T", "says &quot;8-10%&quot; ok")))
        self.assertFalse(s.broken_meta('<meta name="a" content="x" />'))
        self.assertFalse(s.broken_meta('<meta content="x"\n name="d">'))

    def test_audit_lists_it(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures/a").mkdir(parents=True)
            (root / "ventures/a/x.html").write_text(
                '<title>T</title><meta name="description" content="a "b" c">')
            self.assertEqual(s.audit(root)["broken_meta"], ["ventures/a/x.html"])
