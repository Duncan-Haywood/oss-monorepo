import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_stall.mva import mva, cell_demands, stall_aware_rate
from robofab_cell_stall.sim import simulate

T = [dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1),
     dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.2)]


class TestStall(unittest.TestCase):
    def test_single_job_has_no_extra_wait(self):
        X, extra = stall_aware_rate(T, 4, 1, 1)
        self.assertAlmostEqual(extra, 0.0, places=9)
        Dh, m = cell_demands(T, 4, 1, hold_printer=True)
        self.assertAlmostEqual(X, mva(Dh, m, 1)[0], places=9)

    def test_extra_wait_nonnegative_and_grows_with_wip(self):
        e = [stall_aware_rate(T, 8, 1, n)[1] for n in (2, 8, 16, 32)]
        self.assertTrue(all(x >= 0 for x in e))
        self.assertLess(e[0], e[-1])

    def test_never_above_held_mva(self):
        Dh, m = cell_demands(T, 8, 1, hold_printer=True)
        for n in (2, 8, 20):
            self.assertLessEqual(stall_aware_rate(T, 8, 1, n)[0], mva(Dh, m, n)[0] + 1e-12)

    def test_share_zero_recovers_held_mva(self):
        Dh, m = cell_demands(T, 8, 1, hold_printer=True)
        self.assertAlmostEqual(stall_aware_rate(T, 8, 1, 10, share=0.0)[0], mva(Dh, m, 10)[0], places=12)

    def test_sim_runs_hold_mode(self):
        self.assertGreater(simulate(T, 4, 1, 8, mode="hold", dist="ln", cv=0.3, seed=0), 0)


if __name__ == "__main__":
    unittest.main()
