import csv
import os
import unittest

from marine_hull.hull import cf_ittc57, wave_resistance_fraction

PATH = os.path.join(os.path.dirname(__file__), "..", "experiments", "data", "catamaran_bare_hull_tank.csv")
RHO = 998.7


def rows():
    return list(csv.DictReader(l for l in open(PATH) if not l.startswith("#")))


class CatamaranTankTests(unittest.TestCase):
    def test_reference_area_is_constant(self):
        s = [float(r["rt_N"]) / (0.5 * RHO * float(r["v_m_s"]) ** 2 * float(r["ct_exp_x1e3"]) * 1e-3) for r in rows()]
        self.assertLess((max(s) - min(s)) / min(s), 0.01)

    def test_froude_number_gives_one_length(self):
        ls = [(float(r["v_m_s"]) / float(r["fn"])) ** 2 / 9.80665 for r in rows()]
        self.assertAlmostEqual(max(ls), min(ls), delta=0.01)

    def test_placeholder_is_low_at_the_hump(self):
        r = rows()[1]
        v, ct = float(r["v_m_s"]), float(r["ct_exp_x1e3"]) * 1e-3
        model = 1.25 * cf_ittc57(v * 2.812 / 1.0899e-6) * (1 + wave_resistance_fraction(float(r["fn"])))
        self.assertLess(model / ct - 1, -0.3)


if __name__ == "__main__":
    unittest.main()
