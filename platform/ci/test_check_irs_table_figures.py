import unittest

import check_irs_table_figures as c

HOH_OK = "hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35]]"
SINGLE_OK = "single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35]]"


class CheckText(unittest.TestCase):
    def test_correct_tables_pass(self):
        self.assertEqual(c.check_text(SINGLE_OK + "\n" + HOH_OK), [])

    def test_row_copied_across_tables_is_flagged(self):
        bad = HOH_OK.replace("201750", "201775")
        found = c.check_text(SINGLE_OK + "\n" + bad)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["irs"], 201750)
        self.assertEqual(found[0]["from_other_table"], [201775])

    def test_single_table_alone_is_not_a_broken_hoh_table(self):
        self.assertEqual(c.check_text(SINGLE_OK), [])

    def test_typo_in_single_table_is_flagged(self):
        found = c.check_text(SINGLE_OK.replace("256225", "256252"))
        self.assertTrue(any(f["irs"] == 256225 and f["file_has"] == [256252] for f in found))

    def test_fast_number_pattern_matches_num(self):
        """NUM_FAST finds NUM's matches: same numbers, same order, on edge cases and random strings."""
        import random

        def slow(t):
            return [m.group(1) for m in c.NUM.finditer(t)]

        def fast(t):
            return [m.group().lstrip("$") for m in c.NUM_FAST.finditer(t)]

        cases = ["$201,750", "a$201,750", ".201750", "$$201750", "1234567890", "12,345,678 and 12_345",
                 "x 1234, 5678.", "201,75", "$1,000x", "(98900)", "1234", "$1234", "\u0663\u0664\u0665\u0666"]
        for t in cases:
            self.assertEqual(fast(t), slow(t), t)
        rng = random.Random(20261120)
        alphabet = "0123456789$,_.a -\n"
        for _ in range(20000):
            t = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 30)))
            self.assertEqual(fast(t), slow(t), repr(t))

    def test_formats_and_cents(self):
        self.assertTrue({201750, 201775, 24150}.issubset(c.numbers("$201,750 201_775 2415000")))

    def test_far_number_is_a_different_rule_not_a_typo(self):
        # 200,000 (the additional Medicare threshold) is not a near miss of 201,750.
        self.assertEqual(c.check_text(HOH_OK.replace("201750", "200000")), [])


if __name__ == "__main__":
    unittest.main()
