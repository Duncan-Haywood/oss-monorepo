import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_sky130rung import rank as R  # noqa: E402
from eda_sky130rung import flow as F  # noqa: E402


class Rank(unittest.TestCase):
    def test_ranks_ties(self):
        self.assertEqual(R.ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4])

    def test_spearman_known(self):
        self.assertAlmostEqual(R.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(R.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        # textbook example (Wikipedia, Spearman): IQ vs hours of TV, rho = -0.175757...
        iq = [86, 97, 99, 100, 101, 103, 106, 110, 112, 113]
        tv = [2, 20, 28, 27, 50, 29, 7, 17, 6, 12]
        self.assertAlmostEqual(R.spearman(iq, tv), -0.17575757, places=6)

    def test_kendall_known(self):
        iq = [86, 97, 99, 100, 101, 103, 106, 110, 112, 113]
        tv = [2, 20, 28, 27, 50, 29, 7, 17, 6, 12]
        self.assertAlmostEqual(R.kendall(iq, tv), -0.1111111, places=6)  # Wikipedia, Kendall tau example
        self.assertAlmostEqual(R.kendall([1, 2, 3], [3, 2, 1]), -1.0)

    def test_pareto(self):
        pts = [(1, 5), (2, 2), (5, 1), (3, 3), (2, 2)]
        self.assertEqual(R.pareto_idx(pts), [0, 1, 2, 4])

    def test_topk(self):
        self.assertEqual(R.top_k_overlap([1, 2, 3, 4], [1, 2, 4, 3], 2), 1.0)
        self.assertEqual(R.top_k_overlap([1, 2, 3, 4], [4, 3, 2, 1], 2), 0.0)


class Parse(unittest.TestCase):
    def test_parse(self):
        out = ("   Number of cells:                 10\n   Chip area for module '\\accel': 123.45\n"
               "ABC: WireLoad = \"none\"  Gates = 5 ... Area = 1.0 ( 0.0 %) Delay =  321.50 ps\n"
               "        4 sky130_fd_sc_hd__dfxtp_1\n")
        r = F.parse(out)
        self.assertEqual((r["area_um2"], r["delay_ps"], r["cells"], r["ff"]), (123.45, 321.5, 10, 4))


if __name__ == "__main__":
    unittest.main()
