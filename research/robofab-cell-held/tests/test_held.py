import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_held.mva import mva, cell_demands, balanced_bounds
from robofab_cell_held.sim import simulate

T = [dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1),
     dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.2)]


class TestHeld(unittest.TestCase):
    def test_hold_adds_load_unload_to_printer_demand_only(self):
        D, _ = cell_demands(T, 4, 1)
        Dh, _ = cell_demands(T, 4, 1, hold_printer=True)
        self.assertEqual(D[0], Dh[0]); self.assertEqual(D[2], Dh[2])
        self.assertGreater(Dh[1], D[1])

    def test_held_prediction_never_above_plain(self):
        for N in (2, 6, 20):
            D, m = cell_demands(T, 8, 1); Dh, _ = cell_demands(T, 8, 1, hold_printer=True)
            self.assertLessEqual(mva(Dh, m, N)[0], mva(D, m, N)[0] + 1e-12)

    def test_held_bound_below_plain_bound(self):
        D, m = cell_demands(T, 8, 1); Dh, _ = cell_demands(T, 8, 1, hold_printer=True)
        self.assertLessEqual(balanced_bounds(Dh, m, 20), balanced_bounds(D, m, 20))

    def test_single_job_mva_is_one_over_total_demand(self):
        D, m = cell_demands(T, 4, 1)
        self.assertAlmostEqual(mva(D, m, 1)[0], 1 / sum(D), places=12)

    def test_sim_below_held_capacity_at_saturation(self):
        Dh, _ = cell_demands(T, 4, 1, hold_printer=True)
        r = simulate(T, 4, 1, 8, mode="hold", dist="ln", cv=0.3, seed=0)
        self.assertLess(r, 4 / Dh[1] * 1.1)


if __name__ == "__main__":
    unittest.main()
