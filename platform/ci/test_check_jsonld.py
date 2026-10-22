import unittest

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


if __name__ == "__main__":
    unittest.main()
