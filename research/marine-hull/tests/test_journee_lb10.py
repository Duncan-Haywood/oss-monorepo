"""Milestone 7zk: Journee's (1992) Wigley I and III forms (alpha), and the pinned L/B 10 results."""
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_journee_lb10.txt")


def empty_table():
    return st.SectionTable([], processes=1)


class AlphaFormTests(unittest.TestCase):
    def test_default_alpha_keeps_kashiwagi_keys_and_sections(self):
        h = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, table=empty_table())
        self.assertTrue(all(len(r) == 3 for r in h.ratio))
        self.assertEqual(st.modified_wigley_section(0.3, 1.2, 1.0, 8), st.modified_wigley_section(0.3, 1.2, 1.0, 8, 1.0))

    def test_block_coefficients_of_wigley_i_and_iii(self):
        # Journee (1992): CB 0.561 (I) and 0.462 (III); closed form for alpha 0: (2/3)(8/15 + 0.2 * 8/105 * ... )
        i = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, table=empty_table())
        iii = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, table=empty_table(), alpha=0.0)
        self.assertAlmostEqual(i.vol / (3.0 * 0.3 * 0.1875), 0.561, places=3)
        self.assertAlmostEqual(iii.vol / (3.0 * 0.3 * 0.1875), 0.462, delta=0.0015)
        self.assertTrue(all(len(r) == 4 and r[3] == 0.0 for r in iii.ratio))

    def test_alpha_zero_section_is_parabolic_in_depth(self):
        pts = st.modified_wigley_section(0.4, 1.0, 1.0, 8, alpha=0.0)
        scale = (1 - 0.16) * (1 + 0.2 * 0.16)
        for y, z in pts:
            self.assertAlmostEqual(y, scale * (1 - z * z), places=12)


class PinnedResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()

    def test_fn02_peak_ratios_below_the_tank(self):
        m = re.search(r"J1 Fn 0.2 peak ratio I ([\d.]+), III ([\d.]+)", self.text)
        self.assertAlmostEqual(float(m.group(1)), 0.700, places=3)
        self.assertAlmostEqual(float(m.group(2)), 0.783, places=3)

    def test_heave_point_and_verdicts(self):
        self.assertIn("7zg motion fit 1.724 (-31.6%)", self.text)
        for j, v in (("J1", "False"), ("J2", "False"), ("J3", "True"), ("J4", "False"), ("J5", "True"), ("J6", "True")):
            line = next(ln for ln in self.text.splitlines() if ln.startswith(j + " "))
            self.assertTrue(line.endswith(v), line)


if __name__ == "__main__":
    unittest.main()
