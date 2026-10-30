import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_jsonld
from check_jsonld import check


def page(body):
    return f'<head>\n<script type="application/ld+json">{body}</script>\n</head>'


class JsonLd(unittest.TestCase):
    def test_clean(self):
        self.assertEqual(check(page('{"@context":"https://schema.org","@type":"FAQPage"}')), [])

    def test_invalid_json(self):
        self.assertIn("invalid JSON", check(page('{"@type": "X", }'))[0])

    def test_missing_type(self):
        self.assertIn("no @type", check(page('{"name":"x"}'))[0])

    def test_graph_ok(self):
        self.assertEqual(check(page('{"@graph":[{"@type":"Thing"}]}')), [])

    def test_aggregate_rating_flagged(self):
        out = check(page('{"@type":"SoftwareApplication","aggregateRating":'
                         '{"@type":"AggregateRating","ratingValue":"5"}}'))
        self.assertTrue(any("AggregateRating" in m for m in out))
        self.assertTrue(any("aggregateRating" in m for m in out))

    def test_review_in_list_type(self):
        self.assertTrue(check(page('{"@type":["Product","Review"]}')))

    def test_sample_inside_js_string_ignored(self):
        s = "<script>x='<script type=\"application/ld+json\">{bad}</script>'</script>"
        self.assertEqual(check(s), [])

    def run_main(self, *pages):
        with tempfile.TemporaryDirectory() as d:
            for i, body in enumerate(pages):
                Path(d, f"p{i}.html").write_text(body, encoding="utf-8")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = check_jsonld.main(["--root", d])
        return code, buf.getvalue()

    def test_main_clean_exit_zero(self):
        code, out = self.run_main(page('{"@type":"Thing"}'), "<p>no ld</p>")
        self.assertEqual(code, 0)
        self.assertIn("1 pages with JSON-LD, 0 problems", out)

    def test_main_counts_each_problem_and_exits_one(self):
        code, out = self.run_main(page('{"@type":"Review","review":{}}'))
        self.assertEqual(code, 1)
        self.assertIn("1 pages with JSON-LD, 2 problems", out)

    def test_default_root_is_ventures(self):
        self.assertEqual(check_jsonld.ROOT / "ventures", Path(__file__).resolve().parents[2] / "ventures")
        self.assertTrue((check_jsonld.ROOT / "ventures").is_dir())

    def test_help_description_is_first_docstring_line(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), self.assertRaises(SystemExit):
            check_jsonld.main(["--help"])
        self.assertIn("Fail if a page's JSON-LD is malformed", buf.getvalue())
        self.assertNotIn("Search engines drop", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
