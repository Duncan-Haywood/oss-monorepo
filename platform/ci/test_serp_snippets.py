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

    def test_limits_are_inclusive(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures/a").mkdir(parents=True)
            (root / "ventures/a/x.html").write_text(page("T" * 60, "D" * 160))
            r = s.audit(root)
            self.assertEqual((r["long_titles"], r["long_descriptions"]), (0, 0))
            self.assertEqual(r["worst_ventures"], [])

    def test_default_title_limit_is_60(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures/a").mkdir(parents=True)
            (root / "ventures/a/x.html").write_text(page("T" * 61, "short"))
            self.assertEqual(s.audit(root)["long_titles"], 1)

    def test_worst_ventures_ties_sorted_by_name(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for v in ("a-b", "a", "c"):
                (root / "ventures" / v).mkdir(parents=True)
                (root / "ventures" / v / "x.html").write_text(page("T" * 70, "short"))
            self.assertEqual(s.audit(root)["worst_ventures"], [("a", 1), ("a-b", 1), ("c", 1)])

    def test_default_description_limit_is_160(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures/a").mkdir(parents=True)
            (root / "ventures/a/x.html").write_text(page("short", "D" * 161))
            self.assertEqual(s.audit(root)["long_descriptions"], 1)

    def test_worst_ventures_most_over_first(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for v, desc in (("a", "short"), ("z", "D" * 200)):
                (root / "ventures" / v).mkdir(parents=True)
                (root / "ventures" / v / "x.html").write_text(page("T" * 70, desc))
            self.assertEqual(s.audit(root)["worst_ventures"], [("z", 2), ("a", 1)])

    def test_cli_defaults_match_audit_defaults(self):
        import contextlib, io, json
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for i in range(12):
                (root / "ventures" / f"v{i:02d}").mkdir(parents=True)
                (root / "ventures" / f"v{i:02d}" / "x.html").write_text(page("T" * 61, "D" * 161))
            (root / "ventures/ok").mkdir()
            (root / "ventures/ok/x.html").write_text(page("T" * 60, "D" * 160))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                s.main(["--root", d])
            out = buf.getvalue()
            self.assertIn("title > 60: 12", out)
            self.assertIn("description > 160: 12", out)
            self.assertEqual(sum(1 for ln in out.splitlines() if ln.startswith("     ")), 10)
            self.assertNotIn("v10", out)

    def test_empty_tree_does_not_divide_by_zero(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(s.main(["--root", d]), 0)


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
