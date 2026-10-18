import math, pathlib, sys, unittest
root = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(root / "src"))
import numpy as np
from robofab_cell_detector import CellConfig, JobType, simulate, bound, replicate, attempt_stats, roc

J = JobType("J", 30)


def mc_attempt(T, rate, det, n=200000, seed=1):
    """Brute-force one attempt: look every p minutes, score N(0,1) or N(d,1), alarm above z."""
    d, z, p = det
    rng = np.random.default_rng(seed)
    tf = rng.exponential(60 / rate, n)
    succ = tm = fa = 0
    for i in range(n):
        end, bad, alarm_false = T, tf[i] < T, False
        for k in range(1, int(T // p) + 1):
            failed = tf[i] <= k * p
            if rng.normal(d if failed else 0.0, 1) > z:
                end, alarm_false = k * p, not failed
                bad = True
                break
        succ += not bad; tm += end; fa += alarm_false
    return succ / n, tm / n, fa / n


class DetectorTests(unittest.TestCase):
    def test_roc_values(self):
        f, h = roc(2.0, 1.0)
        self.assertAlmostEqual(f, 0.158655, places=5)
        self.assertAlmostEqual(h, 0.841345, places=5)

    def test_blind_is_closed_form(self):
        s, e, pf = attempt_stats(60.0, 0.3, None)
        self.assertAlmostEqual(s, math.exp(-0.3), places=9)
        self.assertEqual((e, pf), (60.0, 0.0))

    def test_silent_detector_equals_blind(self):
        # threshold far above any score: never alarms
        s, e, pf = attempt_stats(60.0, 0.3, (2.0, 40.0, 2.0))
        self.assertAlmostEqual(s, math.exp(-0.3), places=9)
        self.assertAlmostEqual(e, 60.0, places=9)
        self.assertAlmostEqual(pf, 0.0, places=9)

    def test_exact_attempt_stats_match_brute_force(self):
        det = (2.0, 1.5, 5.0)
        s, e, pf = attempt_stats(60.0, 0.6, det)
        ms, me, mf = mc_attempt(60.0, 0.6, det)
        self.assertAlmostEqual(s, ms, delta=0.004)
        self.assertAlmostEqual(e, me, delta=0.15)
        self.assertAlmostEqual(pf, mf, delta=0.004)

    def test_no_failures_only_false_alarms_cost(self):
        s, e, pf = attempt_stats(30.0, 0.0, (3.0, 2.0, 3.0))
        f, _ = roc(3.0, 2.0)
        self.assertAlmostEqual(s, (1 - f) ** 10, places=9)
        self.assertAlmostEqual(pf, 1 - s, places=9)

    def test_deterministic_printer_limited_sim_near_bound(self):
        c = CellConfig((J,), printers=1, wip=2, horizon=100 * 60, warmup=4 * 60)
        self.assertAlmostEqual(simulate(c, 0)["good_per_hour"], 60 * bound(c)[0], delta=0.1)

    def test_sim_attempts_match_exact_success(self):
        det = (2.0, 1.5, 5.0)
        c = CellConfig((J,), printers=3, wip=5, cv=0.0, fail_rate=0.6, detector=det, horizon=400 * 60)
        r = replicate(c, range(6))
        s, _, _ = attempt_stats(30.0, 0.6, det)
        self.assertAlmostEqual(r["mean_attempts"][0], 1 / s, delta=0.06)

    def test_good_detector_beats_blind_and_bad_one_loses(self):
        base = dict(types=(J,), printers=3, wip=5, cv=0.3, fail_rate=0.6)
        blind = replicate(CellConfig(**base), range(10))["good_per_hour"][0]
        good = replicate(CellConfig(**base, detector=(4.0, 2.5, 2.0)), range(10))["good_per_hour"][0]
        jumpy = replicate(CellConfig(**base, detector=(1.0, 0.0, 2.0)), range(10))["good_per_hour"][0]
        self.assertGreater(good, blind)
        self.assertLess(jumpy, blind)

    def test_seed_reproducible(self):
        c = CellConfig((J,), printers=2, wip=4, cv=0.3, fail_rate=0.3, detector=(2.0, 2.0, 5.0))
        self.assertEqual(simulate(c, 3), simulate(c, 3))


if __name__ == "__main__":
    unittest.main()
