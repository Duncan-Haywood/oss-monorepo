import unittest

import check_decimal_comma as c

# The shape seven ventures shipped before 2026-11-18.
BUGGY = '''
const numText = (s) => String(s).trim().replace(/[$€£,%\\s]/g, "");
const delim = ["\\t", ";", ","].map((dl) => [dl, 1]).sort()[0][0];
'''


class DecimalComma(unittest.TestCase):
    def test_flags_a_semicolon_parser_that_strips_commas(self):
        self.assertIsNotNone(c.problem(BUGGY))

    def test_a_fixed_parser_passes(self):
        self.assertIsNone(c.problem(BUGGY + "\nconst x = parsed.decimalComma;\n"))

    def test_comma_only_parser_passes(self):
        self.assertIsNone(c.problem(BUGGY.replace('";", ', "")))

    def test_negated_or_currency_free_classes_pass(self):
        # bank-csv-to-qbo-converter and eu-vat-oss-calculator detect the decimal mark themselves.
        self.assertIsNone(c.problem('[",", ";"]; s.replace(/[^\\d.,]/g, ""); s.replace(/[.,]/g, "");'))

    def test_the_tree_is_clean(self):
        self.assertEqual(c.main(), 0)


if __name__ == "__main__":
    unittest.main()
