import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_safe_integer_cents as c  # noqa: E402


class FindingsTest(unittest.TestCase):
    def test_flags_cents_checked_with_isinteger(self):
        src = "if (!Number.isInteger(line.amountCents)) throw x;\nconst ok = Number.isInteger(cents);\n"
        self.assertEqual(c.findings_in(src), [(1, "line.amountCents"), (2, "cents")])

    def test_safe_integer_and_non_money_pass(self):
        src = "Number.isSafeInteger(p.monthlyCents);\nNumber.isInteger(rateBps);\nNumber.isInteger(qty)\n"
        self.assertEqual(c.findings_in(src), [])

    def test_tests_are_skipped(self):
        self.assertTrue(c.is_test("ventures/a/test/x.ts"))
        self.assertTrue(c.is_test("ventures/a/src/x.test.mjs"))
        self.assertFalse(c.is_test("ventures/a/src/money.ts"))

    def test_tree_is_clean(self):
        self.assertEqual(c.main(), 0)


if __name__ == "__main__":
    unittest.main()
