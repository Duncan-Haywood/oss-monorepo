import pathlib, sys, unittest
root = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(root / "src"))
from robofab_cell_monitor import CellConfig, JobType, simulate, bound, replicate, attempt_stats

J = JobType("J", 30)


class MonitorTests(unittest.TestCase):
    def test_no_failures_reduces_to_plain_bound(self):
        c = CellConfig((J,), printers=3, wip=5)
        b, who, caps = bound(c)
        self.assertAlmostEqual(caps["printers"], 3 / (30 + 4))
        self.assertEqual(who, "printers")

    def test_blind_attempt_stats_closed_form(self):
        s, e = attempt_stats(60.0, 0.3, None, 0.0)
        self.assertAlmostEqual(s, 2.718281828 ** -0.3, places=6)
        self.assertEqual(e, 60.0)

    def test_instant_camera_stops_at_failure(self):
        # delay 0, mean time to failure 200 min: printing minutes per attempt = (1 - e^{-T/200}) * 200
        s, e = attempt_stats(60.0, 0.3, 0.0, 0.0)
        self.assertAlmostEqual(e, (1 - 2.718281828 ** -0.3) * 200, places=2)

    def test_huge_delay_equals_blind(self):
        s, e = attempt_stats(60.0, 0.3, 1e6, 0.0)
        self.assertAlmostEqual(e, 60.0, places=6)

    def test_deterministic_printer_limited_sim_near_bound(self):
        c = CellConfig((J,), printers=1, wip=2, horizon=100 * 60, warmup=4 * 60)
        r = simulate(c, 0)
        self.assertAlmostEqual(r["good_per_hour"], 60 * bound(c)[0], delta=0.1)
        self.assertEqual(r["wasted_share"], 0.0)

    def test_camera_wastes_less_printer_time_than_blind(self):
        base = dict(types=(J,), printers=3, wip=5, cv=0.3, fail_rate=0.6)
        blind = replicate(CellConfig(**base), range(10))
        cam = replicate(CellConfig(**base, monitor_delay=5.0), range(10))
        self.assertLess(cam["wasted_share"][0], blind["wasted_share"][0])

    def test_failures_reduce_throughput(self):
        base = dict(types=(J,), printers=3, wip=5)
        a = replicate(CellConfig(**base), range(8))["good_per_hour"][0]
        b = replicate(CellConfig(**base, fail_rate=0.6), range(8))["good_per_hour"][0]
        self.assertLess(b, a)

    def test_seed_reproducible(self):
        c = CellConfig((J,), printers=2, wip=4, cv=0.3, fail_rate=0.3, monitor_delay=10.0)
        self.assertEqual(simulate(c, 3), simulate(c, 3))


if __name__ == "__main__":
    unittest.main()
