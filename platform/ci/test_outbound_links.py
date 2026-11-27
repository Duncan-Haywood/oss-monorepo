import unittest

import outbound_links as ol

SITE = "https://marisstella.app/shop/"
PAGES = {
    SITE: '<!doctype html><html><a href="about">a</a><a href="https://law.example/s?a=1&amp;b=2">s</a>'
          '<a href="https://gone.example/x">g</a><a href="https://marisstella.app/other/">o</a>'
          '<a href="styles.css">c</a></html>',
    SITE + "about": '<html><a href="https://law.example/s?a=1&amp;amp;b=2">d</a>'
                    '<a href="https://slow.example/">t</a><a href="/shop/#top">x</a></html>',
}
STATUS = {"https://law.example/s?a=1&b=2": 200, "https://gone.example/x": 404,
          "https://slow.example/": 403, "https://law.example/s?a=1&amp;b=2": 404}


def fake(url, body=True):
    if url in PAGES:
        return 200, PAGES[url]
    return STATUS.get(url, 404), ""


class Test(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(ol.classify(200), "ok")
        self.assertEqual(ol.classify(301), "ok")
        self.assertEqual(ol.classify(404), "broken")
        self.assertEqual(ol.classify("dns"), "broken")
        self.assertEqual(ol.classify(403), "unverifiable")
        self.assertEqual(ol.classify("TimeoutError"), "unverifiable")

    def test_crawl_stays_under_prefix_and_collects_citations(self):
        pages, cited, doubled = ol.crawl([SITE], fetch=fake)
        self.assertEqual(pages, {SITE, SITE + "about"})  # not styles.css, not /other/
        self.assertIn("https://law.example/s?a=1&b=2", cited)
        self.assertEqual(cited["https://gone.example/x"], {SITE})
        self.assertNotIn("https://marisstella.app/other/", cited)
        self.assertEqual(list(doubled), ["https://law.example/s?a=1&amp;amp;b=2"])

    def test_check_buckets(self):
        _, cited, _ = ol.crawl([SITE], fetch=fake)
        res = ol.check(cited, fetch=fake, workers=2)
        self.assertEqual(ol.classify(res["https://gone.example/x"]), "broken")
        self.assertEqual(ol.classify(res["https://slow.example/"]), "unverifiable")


if __name__ == "__main__":
    unittest.main()
