"""Tests for experiments/runner7m (milestone 7m): the triage runner's scoring, decision, policy and report algebra."""
import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
D = HERE / "experiments" / "runner7m"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


T = _mod("runner7m_triage", D / "triage.py")
R = _mod("runner7m_run", D / "run.py")


class Scoring(unittest.TestCase):
    def test_centroid_uniform_and_point(self):
        xs, L = [0.5, 1.5, 2.5, 3.5], 4.0
        self.assertAlmostEqual(T.centroid([1, 1, 1, 1], xs, L), 0.5)
        self.assertAlmostEqual(T.centroid([0, 0, 0, 2], xs, L), 3.5 / 4)
        self.assertTrue(math.isnan(T.centroid([0, 0, 0, 0], xs, L)))

    def test_observables(self):
        xs, L = [0.5, 1.5], 2.0
        lost = [0, 1, 0, 0, 0, 3, 0, 0, 0, 7]
        o = T.observables([1, 0], [0, 1], xs, L, lost)
        self.assertAlmostEqual(o["O1"], 0.25)
        self.assertAlmostEqual(o["O2"], 0.5)
        self.assertAlmostEqual(o["O3"], math.log(4 / 2))

    def test_score_and_decision(self):
        rule = {"obs": "O2", "c0": 1.1, "c1": -2.0, "theta": 0.05}
        self.assertAlmostEqual(T.drift_score(rule, {"O2": 0.0}), 0.1)
        self.assertTrue(T.decide(0.1, 0.05))
        self.assertTrue(T.decide(0.05, 0.05))      # >= theta extends, as 7f's rule
        self.assertFalse(T.decide(0.049, 0.05))
        self.assertTrue(T.decide(float("nan"), 0.05))

    def test_rule_for(self):
        p = {"sets": {"Chen2020": {"x": 1}}}
        self.assertEqual(T.rule_for(p, "Chen2020@1.5x"), {"x": 1})


class Policy(unittest.TestCase):
    def setUp(self):
        self.p = json.loads((D / "policy.json").read_text())

    def test_policy_reproduces_7h_scores(self):
        # the frozen line, applied to 7h's committed observables, gives 7h's committed m_hat on every design
        rows = json.loads((HERE / "experiments" / "fresh7h" / "rows.json").read_text())
        for o in rows:
            rule = self.p["replay7h"]["sets"][o["set"]]
            self.assertEqual(rule["obs"], o["cells"]["000"]["pick"])
            self.assertAlmostEqual(T.drift_score(rule, o), abs(o["cells"]["000"]["mC"] - 1), places=12)

    def test_replay_never_saw_7h(self):
        for s in self.p["replay7h"]["sets"].values():
            self.assertNotIn("7h", s["pools"])
            self.assertEqual(s["K1"], 50)
        for s in self.p["deploy"]["sets"].values():
            self.assertIn("7h", s["pools"])


class Report(unittest.TestCase):
    def test_predicted_ratio(self):
        self.assertAlmostEqual(R.predicted_ratio(5.0, 1.0), 1.0)
        self.assertAlmostEqual(R.predicted_ratio(5.0, 0.0), 15 / 55)
        self.assertAlmostEqual(R.predicted_ratio(0.0, 0.5), 30 / 50)

    def test_order_alternates(self):
        self.assertEqual(R.order(0), ["T", "A"])
        self.assertEqual(R.order(1), ["A", "T"])

    def test_jobs_cover_7h(self):
        J = R.jobs()
        self.assertEqual(len(J), 64)
        self.assertEqual(len({(c, j) for _, c, j, _ in J}), 64)


if __name__ == "__main__":
    unittest.main()
