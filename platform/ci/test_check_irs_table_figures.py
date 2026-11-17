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

    def test_formats_and_cents(self):
        self.assertTrue({201750, 201775, 24150}.issubset(c.numbers("$201,750 201_775 2415000")))

    def test_far_number_is_a_different_rule_not_a_typo(self):
        # 200,000 (the additional Medicare threshold) is not a near miss of 201,750.
        self.assertEqual(c.check_text(HOH_OK.replace("201750", "200000")), [])


if __name__ == "__main__":
    unittest.main()
