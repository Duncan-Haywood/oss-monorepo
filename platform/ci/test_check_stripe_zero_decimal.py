import unittest

import check_stripe_zero_decimal as c

FULL = ", ".join(f'"{x}"' for x in sorted(c.STRIPE_ZERO))


class ShortLists(unittest.TestCase):
    def test_flags_the_short_list_that_shipped(self):
        text = 'const stripe = 1;\nconst zero = ["jpy", "krw", "vnd", "clp"].includes(cur);'
        [(line, missing)] = list(c.short_lists(text))
        self.assertEqual(line, 2)
        self.assertIn("xpf", missing)

    def test_full_list_passes_in_any_case_and_shape(self):
        self.assertEqual(list(c.short_lists(f"new Set([{FULL}])")), [])
        self.assertEqual(list(c.short_lists(f"[{FULL.upper()}, 'ISK']")), [])

    def test_a_list_without_jpy_and_krw_is_not_a_zero_decimal_list(self):
        self.assertEqual(list(c.short_lists('["usd", "eur", "jpy"]')), [])

    def test_symbol_maps_and_iso_enumerations_are_not_lists(self):
        self.assertEqual(list(c.short_lists('{ "€": "EUR", "¥": "JPY", "₩": "KRW" }')), [])
        self.assertEqual(list(c.short_lists('["eur", "jpy", "krw", "usd"]')), [])

    def test_the_tree_is_clean(self):
        self.assertEqual(c.findings(), [])


if __name__ == "__main__":
    unittest.main()
