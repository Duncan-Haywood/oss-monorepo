import pathlib
import sys
import unittest

here = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(here / "src"))
sys.path.insert(0, str(here.parent / "selfrep-extinction" / "src"))
sys.path.insert(0, str(here.parent / "selfrep-extinction-kits" / "src"))
from selfrep_reconcile.chain import birth_min, birth_serial, mean_extinction
from selfrep_extinction.chain import mean_extinction_times
from selfrep_extinction_kits.chain import solve


class Reconcile(unittest.TestCase):
    def test_min_law_matches_sibling_solver(self):
        w, v, budget, l = 50.0, 170.3, 4.0, 200.0
        ours = mean_extinction(birth_min, w, budget / v, l)
        theirs = mean_extinction_times(w, v, budget, l)
        for n in (1, 3, 10):
            self.assertAlmostEqual(ours[n], theirs[n], delta=1e-6 * theirs[n])

    def test_no_births_gives_life(self):
        self.assertAlmostEqual(mean_extinction(birth_serial, 50.0, 1e-12, 123.0, nmax=5)[1], 123.0, delta=0.5)

    def test_serial_never_above_min(self):
        for n in range(1, 30):
            self.assertLessEqual(birth_serial(n, 50.0, 0.0235), birth_min(n, 50.0, 0.0235) + 1e-12)

    def test_kits_chain_shorter_than_min_chain(self):
        w, v, l = 50.0, 170.3, 200.0
        kits = solve(4.0 / v, w, l, nmax=20, kmax=8)["mean_time"]
        self.assertLess(kits, mean_extinction(birth_min, w, 4.0 / v, l)[1])


if __name__ == "__main__":
    unittest.main()
