import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_llmtown import NORMS, StubAgent, simulate  # noqa: E402


def avg(key, sub=None, seeds=range(10), **kw):
    rs = [simulate(seed=s, **kw) for s in seeds]
    return sum((r[key][sub] if sub else r[key]) for r in rs) / len(rs)


class Stub(unittest.TestCase):
    def test_deterministic_for_a_seed(self):
        self.assertEqual(simulate(seed=3), simulate(seed=3))

    def test_no_pressure_means_norm_kept_and_nobody_goes(self):
        r = simulate(pressure=0.0, hurried=0.0, seed=1)
        self.assertEqual(r["kept"]["always_yield"], 1.0)
        self.assertEqual(r["go_rate"], 0.0)

    def test_keep_rate_matches_closed_form(self):
        # E[0.8 * pressure * u] = 0.4 * pressure for u ~ U(0,1)
        for p in (0.5, 1.0):
            self.assertAlmostEqual(avg("kept", "always_yield", pressure=p, hurried=0.0), 1 - 0.4 * p, delta=0.03)

    def test_hurried_share_sets_first_come_share(self):
        self.assertAlmostEqual(avg("stated", "first_come", hurried=0.5, pressure=0.0), 0.5, places=6)

    def test_stated_shares_sum_to_one(self):
        r = simulate(pressure=1.0, hurried=0.5, seed=2)
        self.assertAlmostEqual(sum(r["stated"].values()), 1.0)

    def test_pressure_costs_people(self):
        self.assertGreater(avg("person_cost", pressure=1.0), avg("person_cost", pressure=0.0))

    def test_bad_norm_rejected(self):
        class Bad(StubAgent):
            def state_norm(self, obs):
                return "whatever"
        with self.assertRaises(ValueError):
            simulate(agent_cls=Bad, days=1)

    def test_llm_agent_needs_key(self):
        from society_llmtown import LLMAgent
        old = os.environ.pop("ANTHROPIC_API_KEY", None)
        try:
            with self.assertRaises(KeyError):
                LLMAgent(None, "courteous")
        finally:
            if old is not None:
                os.environ["ANTHROPIC_API_KEY"] = old


if __name__ == "__main__":
    unittest.main()
