import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_doorway import costs, equilibrium, go_prob, human_go, simulate  # noqa: E402


class Model(unittest.TestCase):
    def test_person_goes_when_partners_yield_and_yields_when_they_go(self):
        self.assertGreater(go_prob(0.0, 8.0), 0.99)
        self.assertLess(go_prob(1.0, 8.0), 0.01)

    def test_indifference_point(self):
        # k q = w q + d (1-q)  ->  q = d / (d + k - w) = 1/3
        self.assertAlmostEqual(go_prob(1 / 3, 8.0), 0.5)

    def test_equilibrium_is_a_fixed_point(self):
        for r, g in ((0.0, 0.0), (0.3, 0.0), (0.3, 1.0), (0.6, 0.5)):
            q, p = equilibrium(r, g)
            self.assertAlmostEqual(q, (1 - r) * human_go(q, 9, 8.0) + r * g, places=9)

    def test_always_yielding_robots_make_people_go(self):
        ps = [equilibrium(r, 0.0)[1] for r in (0.0, 0.2, 0.5, 0.8)]
        self.assertTrue(all(a < b for a, b in zip(ps, ps[1:])))

    def test_always_going_robots_make_people_yield(self):
        ps = [equilibrium(r, 1.0)[1] for r in (0.0, 0.2, 0.5, 0.8)]
        self.assertTrue(all(a > b for a, b in zip(ps, ps[1:])))

    def test_all_people_lose_nothing_to_a_lone_robot(self):
        a, b = costs(0.0, 0.0), costs(0.005, 0.0)
        self.assertAlmostEqual(a["cost_h"], b["cost_h"], places=1)

    def test_simulation_matches_mean_field(self):
        for r, g in ((0.0, 0.0), (0.3, 0.0), (0.3, 1.0)):
            mf = costs(r, g)
            sims = [simulate(r, g, seed=s) for s in range(4)]
            ph = sum(s["p_h"] for s in sims) / 4
            self.assertLess(abs(ph - mf["p_h"]), 0.05, (r, g, ph, mf["p_h"]))


if __name__ == "__main__":
    unittest.main()
