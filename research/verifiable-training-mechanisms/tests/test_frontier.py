"""Checks on the committed milestone-4 results (experiments/frontier/results.json)."""
import json
import math
import os
import unittest

R = os.path.join(os.path.dirname(__file__), "..", "experiments", "frontier", "results.json")


@unittest.skipUnless(os.path.exists(R), "results.json missing")
class FrontierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = json.load(open(R))

    def test_audit_only_infeasible_once_a_tolerance_hides_a_cheaper_action(self):
        for row in self.r["frontier"]:
            self.assertEqual(math.isinf(row["audit"]), row["tau"] != "0")

    def test_joint_never_costs_more_than_either_check(self):
        for c in self.r["h2"]:
            self.assertLessEqual(c["joint"], min(c["audit"], c["score"]) + 1e-6)

    def test_priced_target_costs_its_effort_plus_one_audited_step(self):
        for c in self.r["frontier_target"]:
            if c["tau_prime"] <= 0.1:
                self.assertAlmostEqual(c["joint"], c["effort"], delta=1.5 / self.r["T"])


if __name__ == "__main__":
    unittest.main()
