import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_fescsweep.ctmc import throughput
from robofab_cell_fescsweep.fesc import subsystem_rate, fesc_rate


def err(N, P, tp, ti, k=4):
    e = throughput(N, P, k, tp, 2, 2, ti)[0]
    return (fesc_rate(N, P, k, tp, 2, 2, ti)[0] - e) / e


class TestSweep(unittest.TestCase):
    def test_instant_inspection_is_exact(self):
        self.assertLess(abs(err(6, 3, 20, 0.05)), 1e-4)

    def test_very_slow_inspection_is_nearly_exact(self):
        self.assertLess(abs(err(6, 3, 20, 200)), 2e-3)

    def test_error_is_largest_near_the_knee(self):
        tstar = 1 / subsystem_rate(6, 3, 4, 20, 2, 2)[0]
        near = abs(err(6, 3, 20, 0.9 * tstar))
        self.assertGreater(near, 5 * abs(err(6, 3, 20, 0.05 * tstar)))
        self.assertGreater(near, 5 * abs(err(6, 3, 20, 20 * tstar)))

    def test_decomposition_underestimates_at_the_knee(self):
        tstar = 1 / subsystem_rate(6, 3, 4, 20, 2, 2)[0]
        self.assertLess(err(6, 3, 20, tstar), -0.01)


if __name__ == "__main__":
    unittest.main()
