import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_learncue import go_gain, learn, outcome, partner_go, respond  # noqa: E402
sys.path.insert(0, str(ROOT.parent / "society-cheapcue" / "src"))
from society_cheapcue import yield_all  # noqa: E402


class Model(unittest.TestCase):
    def test_go_gain_sign_matches_costs(self):
        # k=3, w=d=1: going beats yielding only when the partner goes with prob < 1/3... check the ends
        self.assertAlmostEqual(go_gain(0.0), 1.0)      # partner waits: yielding costs d=1, going 0
        self.assertAlmostEqual(go_gain(1.0), -2.0)     # partner goes: yielding costs w=1, going k=3
        self.assertAlmostEqual(go_gain(0.5), 0.0 + 0.5 * 1 + 0.5 * 1 - 1.5)

    def test_no_cue_use_means_yield_all_state(self):
        # nobody can gain from a cue the fleet ignores: with gS = gQ the people stop signalling
        s = outcome(0.3, 0.0, 0.0, 9.0, 9.0)
        y = yield_all(0.3)
        self.assertAlmostEqual(s["crowd"], y["crowd"], places=3)

    def test_partner_looks_have_weights_summing_to_one(self):
        _, _, wS, wQ = partner_go(0.3, 0.0, 1.0, 0.15, 0.6)
        self.assertAlmostEqual(wS + wQ, 1.0, places=6)

    def test_response_in_unit_interval(self):
        gS, gQ = respond(0.3, 0.0, 1.0, 0.15, 0.6)
        self.assertTrue(0.0 <= gS <= 1.0 and 0.0 <= gQ <= 1.0)

    def test_learned_fixed_point_is_self_consistent(self):
        gS, gQ, ok = learn(0.3, 0.15, 0.6, br=8.0)
        self.assertTrue(ok)
        nS, nQ = respond(0.3, gS, gQ, 0.15, 0.6, br=8.0)
        self.assertAlmostEqual(nS, gS, places=4)
        self.assertAlmostEqual(nQ, gQ, places=4)

    def test_start_does_not_matter(self):
        a = learn(0.3, 0.15, 0.6, br=8.0, start=(0.0, 1.0))
        b = learn(0.3, 0.15, 0.6, br=8.0, start=(1.0, 1.0))
        self.assertAlmostEqual(a[0], b[0], places=3)
        self.assertAlmostEqual(a[1], b[1], places=3)


if __name__ == "__main__":
    unittest.main()
