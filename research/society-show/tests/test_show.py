import json
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(HERE / "experiments"))
from society_show import (NAMES, avoiders, cast_for, mean, narrate, outcome, run_town,  # noqa: E402
                          steady_trust, turning_points)

KW = dict(n=48, rounds=400, start=60, length=50, e_bad=0.8, theta=0.3)


class Dynamics(unittest.TestCase):
    def test_matches_society_trust_when_present(self):
        other = HERE.parent / "society-trust" / "src"
        if not other.exists():
            self.skipTest("society-trust not alongside")
        sys.path.insert(0, str(other))
        from society_trust import simulate
        ep = run_town(n=30, rounds=120, start=20, length=30, e_bad=0.5, beta=2.0, tau=0.5, theta=0.2, seed=3)
        ref = simulate(n=30, rounds=120, start=20, length=30, e0=0.05, e_bad=0.5, beta=2.0, tau=0.5, theta=0.2, seed=3)
        self.assertEqual([mean(r) for r in ep["trust"]], ref)

    def test_deterministic_per_seed(self):
        self.assertEqual(run_town(seed=2, **KW)["trust"], run_town(seed=2, **KW)["trust"])
        self.assertNotEqual(run_town(seed=2, **KW)["trust"], run_town(seed=3, **KW)["trust"])

    def test_trust_stays_in_unit_interval(self):
        ep = run_town(seed=1, beta=4.0, **KW)
        self.assertTrue(all(0 <= x <= 1 for row in ep["trust"] for x in row))


class Story(unittest.TestCase):
    def test_cast_is_unique_and_invented(self):
        cast = cast_for(48, 0)
        self.assertEqual(len(set(cast)), 48)
        self.assertTrue(set(cast) <= set(NAMES))
        self.assertEqual(cast, cast_for(48, 0))

    def test_turning_points_are_ordered_and_match_the_record(self):
        for beta, tau in ((1.0, 1.0), (4.0, 1.0), (4.0, 0.3)):
            ep = run_town(seed=0, beta=beta, tau=tau, **KW)
            pts = turning_points(ep)
            self.assertEqual([p[0] for p in pts], sorted(p[0] for p in pts))
            for r, kind, f in pts:
                if kind == "first_avoider":
                    self.assertGreater(avoiders(ep["trust"][r], ep["theta"]), 0)
                    self.assertEqual(avoiders(ep["trust"][r - 1], ep["theta"]), 0)
                if kind == "half_avoiding":
                    self.assertGreaterEqual(2 * avoiders(ep["trust"][r], ep["theta"]), ep["n"])

    def test_the_three_main_endings(self):
        self.assertEqual(outcome(run_town(seed=0, beta=1.0, **KW)), "recovered")
        self.assertEqual(outcome(run_town(seed=0, beta=4.0, **KW)), "locked out")
        self.assertEqual(outcome(run_town(seed=0, beta=4.0, tau=0.3, **KW)), "recovered")

    def test_same_settings_can_end_differently(self):
        a, b = (outcome(run_town(seed=s, beta=2.0, **KW)) for s in (0, 1))
        self.assertNotEqual(a, b)

    def test_ending_agrees_with_last_turning_point(self):
        for beta in (1.0, 4.0):
            ep = run_town(seed=0, beta=beta, **KW)
            last = turning_points(ep)[-1][1]
            self.assertEqual(last, "recovered" if outcome(ep) == "recovered" else "locked_out")

    def test_narration_numbers_come_from_the_record(self):
        ep = run_town(seed=0, beta=4.0, **KW)
        cast = cast_for(ep["n"], 0)
        story = narrate(ep, cast, turning_points(ep))
        text = " ".join(s for _, s in story)
        final_av = avoiders(ep["trust"][-1], ep["theta"])
        self.assertIn(f"{final_av} of {ep['n']} still avoiding", text)
        self.assertIn("Round 60", text)


class Page(unittest.TestCase):
    def test_page_is_labelled_fiction_and_reproducible(self):
        import build_show
        html1 = (HERE / "experiments" / "robot_town_show.html").read_text()
        build_show.build()
        html2 = (HERE / "experiments" / "robot_town_show.html").read_text()
        self.assertEqual(html1, html2)
        self.assertIn("simulation and a work of fiction", html2)
        self.assertIn("not footage", html2)
        data = json.loads(re.search(r'<script id="d"[^>]*>(.*?)</script>', html2, re.S).group(1))
        self.assertEqual(len(data), 5)
        self.assertTrue(all(len(e["trust"]) == 400 for e in data))


if __name__ == "__main__":
    unittest.main()
