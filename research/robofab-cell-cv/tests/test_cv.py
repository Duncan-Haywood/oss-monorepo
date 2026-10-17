import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_cv.mva import mva, cell_demands, balanced_bounds
from robofab_cell_cv.sim import simulate, replicate

T = [dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1),
     dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.2)]


class TestCV(unittest.TestCase):
    def test_stats_leave_rate_unchanged(self):
        a = simulate(T, 4, 1, 6, mode="hold", dist="ln", seed=1)
        b, stall = simulate(T, 4, 1, 6, mode="hold", dist="ln", seed=1, stats=True)
        self.assertEqual(a, b)
        self.assertTrue(0 <= stall < 1)

    def test_no_stall_without_hold_mode(self):
        _, stall = simulate(T, 4, 1, 6, mode="pf", dist="ln", seed=1, stats=True)
        self.assertEqual(stall, 0.0)

    def test_one_printer_one_job_never_stalls(self):
        _, stall = simulate(T, 1, 1, 1, mode="hold", dist="det", seed=0, stats=True)
        self.assertAlmostEqual(stall, 0.0, places=9)

    def test_stall_grows_with_wip(self):
        lo = replicate(T, 8, 1, 4, mode="hold", dist="ln", seeds=range(4), stats=True)[1][0]
        hi = replicate(T, 8, 1, 20, mode="hold", dist="ln", seeds=range(4), stats=True)[1][0]
        self.assertGreater(hi, lo)

    def test_tiny_cv_close_to_deterministic(self):
        a = replicate(T, 4, 1, 6, mode="hold", dist="ln", cv=1e-6, seeds=range(10))[0]
        b = replicate(T, 4, 1, 6, mode="hold", dist="det", seeds=range(10))[0]
        self.assertLess(abs(a - b) / b, 0.05)

    def test_mva_below_bound(self):
        D, m = cell_demands(T, 8, 1)
        self.assertLessEqual(mva(D, m, 10)[0], balanced_bounds(D, m, 10) + 1e-12)


if __name__ == "__main__":
    unittest.main()
