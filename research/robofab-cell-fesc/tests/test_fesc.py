import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_fesc.ctmc import throughput
from robofab_cell_fesc.fesc import subsystem_rate, fesc_rate
from robofab_cell_fesc.mva import mva


class TestFesc(unittest.TestCase):
    def test_single_job_subsystem_rate(self):
        h, _ = subsystem_rate(1, 2, 3, 20, 2, 2)
        self.assertAlmostEqual(h, 1 / 24, places=9)

    def test_subsystem_rate_saturates_at_arm_capacity(self):
        h, _ = subsystem_rate(12, 4, 1, 1, 2, 2)           # tiny print time: the arm (4 min/part) limits
        self.assertAlmostEqual(h, 0.25, delta=0.01)

    def test_one_job_matches_exact_chain(self):
        r, _ = fesc_rate(1, 2, 3, 20, 2, 2, 3, q=0.25)
        self.assertAlmostEqual(r, throughput(1, 2, 3, 20, 2, 2, 3, 0.25)[0], places=9)

    def test_close_but_not_exact_for_one_printer(self):
        # Load, print and unload in series is not product form, so the decomposition is only close.
        for N in (2, 3, 5):
            exact = throughput(N, 1, 1, 20, 2, 2, 3)[0]
            err = abs(fesc_rate(N, 1, 1, 20, 2, 2, 3)[0] - exact) / exact
            self.assertLess(err, 0.02)

    def test_beats_plain_mva_where_printers_queue(self):
        N, P = 8, 4
        exact = throughput(N, P, 1, 20, 2, 2, 3)[0]
        plain = mva([4.0, 20.0, 3.0], [1, P, 1], N)[0]
        self.assertLess(abs(fesc_rate(N, P, 1, 20, 2, 2, 3)[0] - exact), abs(plain - exact))


if __name__ == "__main__":
    unittest.main()
