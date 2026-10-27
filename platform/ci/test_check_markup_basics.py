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

    def test_third_party_requests(self):
        out = c.problems(OK.format('<link rel="stylesheet" href="https://fonts.googleapis.com/x">'
                                   '<script src="//cdn.example/x.js"></script>'
                                   '<link rel="canonical" href="https://a.example/">'
                                   '<script src="app.js"></script>'))
        self.assertEqual(out, ['third-party link request', 'third-party script request'])

    def test_fragment_needs_no_head(self):
        self.assertEqual(c.problems('<p>hi</p>'), [])


if __name__ == "__main__":
    unittest.main()
