import json
import os
import sys
import unittest

H = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(H, "..", "src"))
from accel_horowitzcheck import audit, horowitz as hz  # noqa: E402


class Table(unittest.TestCase):
    def test_exponents(self):
        self.assertAlmostEqual(hz.loglog_exponent(hz.MULT_INT_PJ), 1.98, places=2)
        self.assertAlmostEqual(hz.loglog_exponent(hz.ADD_INT_PJ), 0.87, places=2)

    def test_interp_hits_table_points(self):
        for size, pj in hz.CACHE_64B_PJ.items():
            self.assertAlmostEqual(hz.interp(hz.CACHE_64B_PJ, size), pj)

    def test_floor_never_below_8kb(self):
        self.assertGreaterEqual(hz.sram_pj_per_bit(100, "floor"), 10 / 64)
        self.assertLess(hz.sram_pj_per_bit(100, "paper"), 10 / 64)


class Audit(unittest.TestCase):
    def test_every_constant_with_a_counterpart_is_within_5_percent(self):
        rows = [r for r in audit.audit() if r["ratio"] is not None]
        self.assertGreater(len(rows), 30)
        for r in rows:
            self.assertAlmostEqual(r["ratio"], 1.0, delta=0.05, msg=str(r))

    def test_finds_accel_kws(self):
        self.assertTrue(any(r["project"] == "accel-kws" and r["name"] == "E_SRAM_PJ_PER_BIT" for r in audit.audit()))


class Results(unittest.TestCase):
    def setUp(self):
        self.r = json.load(open(os.path.join(H, "..", "experiments", "results.json")))

    def test_as_built_reproduces_published_energies(self):
        self.assertLess(self.r["as_built_reproduces_max_abs_nj"], 1e-9)

    def test_ranking_survives(self):
        self.assertGreater(self.r["modes"]["paper"]["spearman_vs_as_built"], 0.95)


if __name__ == "__main__":
    unittest.main()
