import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_blocking.mva import mva, cell_demands, blocking_mva, split_blocking_mva

T = [dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1),
     dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.2)]


class TestBlocking(unittest.TestCase):
    def test_stall_is_nonnegative(self):
        for N in (2, 8, 24):
            self.assertGreaterEqual(blocking_mva(T, 8, 1, N)[1], 0.0)
            self.assertGreaterEqual(split_blocking_mva(T, 8, 1, N)[1], 0.0)

    def test_blocking_never_above_held_mva(self):
        Dh, m = cell_demands(T, 8, 1, hold_printer=True)
        for N in (2, 8, 24):
            self.assertLessEqual(blocking_mva(T, 8, 1, N)[0], mva(Dh, m, N)[0] + 1e-9)

    def test_split_never_above_plain_mva(self):
        D, m = cell_demands(T, 8, 1)
        for N in (2, 8, 24):
            self.assertLessEqual(split_blocking_mva(T, 8, 1, N)[0], mva(D, m, N)[0] + 1e-9)

    def test_split_capped_by_held_capacity(self):
        Dh, _ = cell_demands(T, 4, 1, hold_printer=True)
        self.assertLessEqual(split_blocking_mva(T, 4, 1, 40)[0], 4 / Dh[1] + 1e-9)

    def test_single_job_split_close_to_plain(self):
        D, m = cell_demands(T, 4, 1)
        self.assertAlmostEqual(split_blocking_mva(T, 4, 1, 1)[0], mva(D, m, 1)[0], delta=0.002)


if __name__ == "__main__":
    unittest.main()
