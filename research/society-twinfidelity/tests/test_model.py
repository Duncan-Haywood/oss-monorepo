import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "society-plaza" / "src"))
from society_twinfidelity import DT, make_crowd, run  # noqa: E402


class Variants(unittest.TestCase):
    def test_defaults_reproduce_society_plaza(self):
        import society_plaza
        for kw in ({"rho": 0.2}, {"rho": 0.1, "policy": "adaptive"}):
            a = run(seed=1, seconds=30, **kw)
            b = society_plaza.run(seed=1, seconds=30, **kw)
            for k in ("tipped", "tipped_late", "lane", "intrude", "speed", "detour", "passes"):
                self.assertEqual(a[k], b[k], k)

    def test_heterogeneity_changes_speeds_and_push_weights(self):
        a = make_crowd(60, 0.0, "left", random.Random(0), v_spread=0.25, chi_sd=0.3)
        v = [x.v0 for x in a]
        self.assertGreater(max(v) - min(v), 0.4)
        self.assertGreater(len({round(x.chi, 3) for x in a}), 30)
        self.assertTrue(all(0.0 <= x.chi <= 1.5 for x in a))

    def test_stubborn_share_and_robots_never_stubborn(self):
        a = make_crowd(200, 0.2, "left", random.Random(0), stubborn=0.3)
        h = [x for x in a if not x.robot]
        self.assertAlmostEqual(sum(x.stubborn for x in h) / len(h), 0.3, delta=0.08)
        self.assertFalse(any(x.stubborn for x in a if x.robot))

    def test_stubborn_people_keep_their_side_when_robots_win_everyone_else(self):
        # all-stubborn crowd: memory never changes, so nobody ever prefers left
        r = run(rho=0.3, seed=2, seconds=60, stubborn=1.0)
        self.assertEqual(r["tipped"], 0.0)

    def test_delay_changes_the_run_and_stays_finite(self):
        a = run(rho=0.2, seed=3, seconds=30)
        b = run(rho=0.2, seed=3, seconds=30, delay=0.4)
        self.assertNotEqual(a["speed"], b["speed"])
        self.assertTrue(0 < b["speed"] < 1.7)

    def test_delay_zero_and_one_step_are_close(self):
        a = run(rho=0.2, seed=3, seconds=20, delay=0.0)
        b = run(rho=0.2, seed=3, seconds=20, delay=DT)
        self.assertAlmostEqual(a["speed"], b["speed"], delta=0.15)


if __name__ == "__main__":
    unittest.main()
