import unittest

import shorten_descriptions as sd
import serp_snippets as s

OG = "Catch what breaks an import, with the line number, before you upload. Nothing leaves your device."


def page(desc, og=OG):
    return (f'<title>T</title><meta name="description" content="{desc}">'
            f'<meta property="og:description" content="{og}">')


class Shorten(unittest.TestCase):
    def test_long_desc_takes_og(self):
        out = sd.shorten(page("x " * 200))
        self.assertEqual(s.snippet_of(out)[1], OG)
        self.assertIn(f'og:description" content="{OG}"', out)

    def test_short_desc_untouched(self):
        self.assertIsNone(sd.shorten(page("fine")))

    def test_long_og_or_missing_og_untouched(self):
        self.assertIsNone(sd.shorten(page("x " * 200, "y " * 150)))
        self.assertIsNone(sd.shorten('<title>T</title><meta name="description" content="' + "x " * 200 + '">'))

    def test_apostrophe_and_quotes_stay_valid(self):
        og = "Apple&#39;s &quot;rules&quot; checked against your feed, with the line number, before you publish it."
        out = sd.shorten(page("x " * 200, og))
        self.assertFalse(s.broken_meta(out))
        self.assertEqual(s.snippet_of(out)[1], sd.og_of(page("a", og)))


if __name__ == "__main__":
    unittest.main()
