import unittest

import check_markup_basics as c

OK = '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="x"></head><body>{}</body></html>'


class MarkupBasics(unittest.TestCase):

    def test_clean_page(self):
        self.assertEqual(c.problems(OK.format('<img src="a.png" alt="">')), [])

    def test_missing_alt_and_rel(self):
        out = c.problems(OK.format('<img src="a"><a target="_blank" href="x">y</a>'))
        self.assertEqual(len(out), 2)

    def test_tags_in_scripts_and_json_are_ignored(self):
        html = OK.format('<script>x="<img>"</script><script type="application/ld+json">{"a":"<img>"}</script>')
        self.assertEqual(c.problems(html), [])

    def test_missing_head_bits(self):
        self.assertEqual(c.problems('<html><body></body></html>'),
                         ['no <html lang>', 'no charset', 'no viewport meta'])

    def test_positive_tabindex_and_http(self):
        out = c.problems(OK.format('<a tabindex="2" href="http://example.com">z</a>'))
        self.assertEqual(out, ['http:// href', 'positive tabindex'])

    def test_tabindex_zero_negative_and_signed(self):
        self.assertEqual(c.problems(OK.format('<p tabindex="0">a</p><p tabindex="-1">b</p>')), [])
        for v in ("+2", " 3 ", "2px"):
            self.assertEqual(c.problems(OK.format('<p tabindex="%s">a</p>' % v)), ["positive tabindex"], v)

    def test_main_exit_code_and_count(self):
        import contextlib, io, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "ok.html").write_text(OK.format("<p>x</p>"))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(c.main(["--root", d]), 0)
            self.assertIn("0 problem(s)", buf.getvalue())
            (Path(d) / "bad.html").write_text(OK.format('<img src="a"><p tabindex="2">x</p>'))
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(c.main(["--root", d]), 1)
            self.assertIn("2 problem(s)", buf.getvalue())

    def test_fragment_needs_no_head(self):
        self.assertEqual(c.problems('<p>hi</p>'), [])


if __name__ == "__main__":
    unittest.main()
