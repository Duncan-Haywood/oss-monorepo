import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_commons import cost_rate, simulate, theory  # noqa: E402

KW = dict(horizon=40000.0, warmup=2000.0)


def avg(f, lam_h, lam_r, seeds=range(6), **kw):
    rs = [simulate(lam_h, lam_r, f, seed=s, **KW, **kw) for s in seeds]
    return {k: sum(r[k] for r in rs) / len(rs) for k in ("wait_h", "wait_r", "wait_rs", "wait_rd")}


class Theory(unittest.TestCase):
    def test_fifo_is_class_blind_and_priority_orders_the_waits(self):
        th = theory(0.3, 0.4)
        self.assertAlmostEqual(th["fifo_h"], th["fifo_r"])
        self.assertLess(th["prio_h"], th["fifo_h"])
        self.assertGreater(th["prio_r"], th["fifo_r"])

    def test_md1_value(self):
        # single class M/D/1 at load 0.5, unit service: Wq = rho / (2 (1 - rho)) = 0.5
        self.assertAlmostEqual(theory(0.5, 0.0)["fifo_h"], 0.5)

    def test_unstable_load_rejected(self):
        with self.assertRaises(ValueError):
            theory(0.6, 0.5)

    def test_conservation_law(self):
        # Kleinrock: sum of load-weighted waits is the same for any work-conserving rule.
        a, b = 0.3, 0.4
        th = theory(a, b)
        self.assertAlmostEqual(a * th["fifo_h"] + b * th["fifo_r"], a * th["prio_h"] + b * th["prio_r"])


class Simulation(unittest.TestCase):
    def test_fifo_matches_theory(self):
        th = theory(0.3, 0.4)
        r = avg(0.0, 0.3, 0.4)
        self.assertAlmostEqual(r["wait_h"], th["fifo_h"], delta=0.06 * th["fifo_h"])
        self.assertAlmostEqual(r["wait_r"], th["fifo_r"], delta=0.06 * th["fifo_r"])

    def test_priority_matches_theory(self):
        th = theory(0.3, 0.5)
        r = avg(1.0, 0.3, 0.5)
        self.assertAlmostEqual(r["wait_h"], th["prio_h"], delta=0.06 * th["prio_h"])
        self.assertAlmostEqual(r["wait_r"], th["prio_r"], delta=0.06 * th["prio_r"])

    def test_deference_moves_wait_from_people_to_robots(self):
        fifo, prio = avg(0.0, 0.4, 0.5), avg(1.0, 0.4, 0.5)
        self.assertLess(prio["wait_h"], fifo["wait_h"])
        self.assertGreater(prio["wait_r"], fifo["wait_r"])

    def test_lone_defector_waits_less_than_deferential_robots(self):
        r = avg(0.5, 0.4, 0.5)
        self.assertLess(r["wait_rs"], r["wait_rd"])

    def test_deterministic(self):
        self.assertEqual(simulate(0.3, 0.4, 0.5, seed=3, horizon=3000, warmup=100),
                         simulate(0.3, 0.4, 0.5, seed=3, horizon=3000, warmup=100))

    def test_patience_bounds_waits_and_loses_throughput_when_overloaded(self):
        r = simulate(0.5, 0.7, 0.0, seed=1, horizon=8000.0, warmup=500.0, patience_h=15.0, patience_r=15.0)
        self.assertLess(r["served_h"], r["n_h"])
        self.assertLessEqual(r["wait_h"], 15.0)
        self.assertLessEqual(r["busy"], 1.0 + 1e-9)

    def test_cost_rate(self):
        res = {"wait_h": 2.0, "wait_r": 3.0}
        self.assertAlmostEqual(cost_rate(res, 0.5, 0.25, 2.0, 4.0), 0.5 * 2 * 2 + 0.25 * 4 * 3)


if __name__ == "__main__":
    unittest.main()
