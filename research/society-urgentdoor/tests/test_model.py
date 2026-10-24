import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "society-doorway" / "src"))
from society_doorway import costs  # noqa: E402
from society_urgentdoor import crowd_cost, deviation_gains, robot_cost, simulate, solve, stable  # noqa: E402


class Model(unittest.TestCase):
    def test_reduces_to_doorway_without_urgency_or_reading(self):
        # wu = 1 and gU = gN: both groups identical, so the costs are society-doorway's
        c = costs(0.3, 0.4, k=3.0)
        s = solve(0.3, 0.4, 0.4, u=0.2, wu=1.0, k=3.0)
        self.assertAlmostEqual(s["cU"], c["cost_h"], places=6)
        self.assertAlmostEqual(s["cN"], c["cost_h"], places=6)
        self.assertAlmostEqual(robot_cost(0.3, 0.4, 0.4, u=0.2, wu=1.0, k=3.0), c["cost_r"], places=6)
        self.assertAlmostEqual(crowd_cost(0.3, 0.4, 0.4, u=0.2, wu=1.0, k=3.0), c["cost_all"], places=6)

    def test_no_urgent_people_means_gU_is_irrelevant(self):
        a = solve(0.3, 0.0, 0.5, u=0.0, wu=3.0)
        b = solve(0.3, 1.0, 0.5, u=0.0, wu=3.0)
        self.assertAlmostEqual(a["cN"], b["cN"], places=9)

    def test_yielding_to_urgent_lowers_their_cost(self):
        a = solve(0.3, 0.0, 0.0)["cU"]
        b = solve(0.3, 0.0, 1.0)["cU"]
        self.assertLess(b, a)

    def test_reader_is_stable_at_k3(self):
        gu, gn = deviation_gains(0.3, 0.0, 1.0, u=0.2, wu=3.0, k=3.0)
        self.assertLess(gu, 0)
        self.assertGreater(gn, 0)
        self.assertTrue(stable(0.3, 0.0, 1.0, u=0.2, wu=3.0, k=3.0))

    def test_go_all_unstable(self):
        self.assertFalse(stable(0.3, 1.0, 1.0, u=0.2, wu=3.0, k=3.0))

    def test_simulation_matches_mean_field(self):
        mf = solve(0.3, 0.0, 1.0, 0.2, 3.0, 3.0)
        sim = simulate(0.3, 0.0, 1.0, 0.2, 3.0, seed=1)
        self.assertAlmostEqual(sim["U"], mf["cU"], delta=0.06)
        self.assertAlmostEqual(sim["N"], mf["cN"], delta=0.04)


if __name__ == "__main__":
    unittest.main()
