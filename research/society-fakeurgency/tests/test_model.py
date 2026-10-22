import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "society-doorway" / "src"))
sys.path.insert(0, str(ROOT.parent / "society-urgentdoor" / "src"))
from society_fakeurgency import door, equilibrium, simulate, summary  # noqa: E402
from society_urgentdoor import robot_cost, solve  # noqa: E402


class Model(unittest.TestCase):
    def test_perfect_signal_matches_urgentdoor(self):
        # urgent always signal, normal never, no error: the reader of society-urgentdoor
        D = door(0.3, 0.0, 1.0, 1.0, 0.0)
        ref = solve(0.3, 0.0, 1.0, 0.2, 3.0, 3.0)
        self.assertAlmostEqual(D["U"]["c1"], ref["cU"], places=6)
        self.assertAlmostEqual(D["N"]["c0"], ref["cN"], places=6)

    def test_no_signalling_is_yield_all(self):
        s = summary(0.3, 0.0, 0.0, 5.0)  # signal far too dear, robots always yield
        ref = solve(0.3, 0.0, 0.0, 0.2, 3.0, 3.0)
        self.assertAlmostEqual(s["cU"], ref["cU"], places=3)
        self.assertAlmostEqual(s["cN"], ref["cN"], places=3)
        self.assertAlmostEqual(s["cR"], robot_cost(0.3, 0.0, 0.0, 0.2, 3.0, 3.0), places=3)

    def test_costlier_signal_means_less_faking(self):
        f = [equilibrium(0.3, 0.0, 1.0, c)["sN"] for c in (0.0, 0.2, 0.4, 0.8)]
        self.assertTrue(all(a > b for a, b in zip(f, f[1:])))

    def test_free_signal_is_used_by_all(self):
        # c = 0 and a yielding reward for signalling: nearly everyone signals, so it says almost nothing
        s = summary(0.3, 0.0, 1.0, 0.0)
        self.assertGreater(s["sU"], 0.99)
        self.assertGreater(s["sN"], 0.9)
        self.assertLess(s["precision"], 0.25)

    def test_misreading_hurts_urgent_people(self):
        a, b = summary(0.3, 0.0, 1.0, 0.3, 0.0), summary(0.3, 0.0, 1.0, 0.3, 0.3)
        self.assertGreater(b["cU"], a["cU"])

    def test_signalling_reader_never_beats_yield_all_for_crowd(self):
        for c in (0.0, 0.2, 0.4, 0.8):
            self.assertGreater(summary(0.3, 0.0, 1.0, c)["crowd"], summary(0.3, 0.0, 0.0, c)["crowd"])

    def test_simulation_matches_mean_field(self):
        s = summary(0.3, 0.0, 1.0, 0.3, 0.1)
        D = s["D"]
        sim = simulate(0.3, 0.0, 1.0, s["sU"], s["sN"], e=0.1, seed=1)
        mfU = s["sU"] * D["U"]["c1"] + (1 - s["sU"]) * D["U"]["c0"]
        mfN = s["sN"] * D["N"]["c1"] + (1 - s["sN"]) * D["N"]["c0"]
        self.assertAlmostEqual(sim["U"], mfU, delta=0.06)
        self.assertAlmostEqual(sim["N"], mfN, delta=0.04)


if __name__ == "__main__":
    unittest.main()
