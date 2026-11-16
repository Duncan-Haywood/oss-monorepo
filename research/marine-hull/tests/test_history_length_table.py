import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

import history_length_table as ht  # noqa: E402


class HistoryLengthTableTests(unittest.TestCase):
    def test_reference_matches_logged_no_correction(self):
        self.assertEqual(ht.at90(), (139, 25))

    def test_rows_reproduce_logged_means(self):
        _, rows, krows = ht.build()
        got = {(h, r): (a[0], b[0]) for h, _, r, _, a, b in rows}
        self.assertEqual(got[("1 year", "HR")], (147.0, 50.2))  # 6zzj J2
        self.assertEqual(got[("1 year", "DG")], (106.0, 109.2))  # 6zzp G3, G4
        self.assertEqual(got[("2 years", "HX")], (152.1, 56.0))  # 6zzk K7
        self.assertEqual([k[2][0] for k in krows], [121.8, 140.8, 149.3, 152.2, 158.0])  # 6zzi S1

    def test_worst_cases_and_draw_counts(self):
        _, rows, krows = ht.build()
        lc1 = [r for r in rows if r[0] == "1 year" and r[2] == "LC"][0]
        self.assertEqual((lc1[1], lc1[4][1], lc1[5][1]), (5, 97, 1))
        self.assertEqual([k[1] for k in krows], [5, 10, 10, 5, 1])

    def test_verdict(self):
        self.assertEqual(ht.verdict((150.0, 139, 160), 139), "never below")
        self.assertEqual(ht.verdict((140.0, 120, 160), 139), "above on mean")
        self.assertEqual(ht.verdict((130.0, 120, 160), 139), "below on mean")

    def test_render_names_the_both_pool_rules(self):
        text = ht.render()
        self.assertIn("Never below on both pools: 3 years/LHF, 3 years/HR, 3 years/HX, 4 years/LC", text)
        self.assertNotIn("LC k=4", text)  # 6zzr's own LC row replaces 6zzi's
        fewest = [ln for ln in text.splitlines() if ln.startswith("Fewest seasons")][0]
        self.assertIn("LC 4 years", fewest)
        self.assertIn("HR 3 years", fewest)
        self.assertIn("LAP 4 years", fewest)
        self.assertIn("DG none of those run", fewest)

    def test_many_year_rows_reproduce_6zzr(self):
        _, rows, _ = ht.build()
        got = {(h, r): (a, b) for h, _, r, _, a, b in rows}
        self.assertEqual(got[("3 years", "HR")], ((155.5, 150, 161), (56.7, 31, 86)))  # 6zzr R1, R3
        self.assertEqual(got[("4 years", "HR")][0][1], 153)  # 6zzr R2
        self.assertEqual(got[("3 years", "LC")][0], (149.3, 123, 160))  # 6zzi check
        self.assertEqual(got[("5 years", "LC")], ((158.0, 158, 158), (105.0, 105, 105)))


if __name__ == "__main__":
    unittest.main()
