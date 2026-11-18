"""Pin the paper's quoted numbers and the code paths the 2026-11-17 audit's surviving mutants hit
(portfolio/quality/audits/2026-11-17-tilt-twin.json)."""
import math
import re
import unittest
from pathlib import Path

from tilt_twin.model import Q, p_true, is_relvar, optimal_theta, estimate

ROOT = Path(__file__).resolve().parents[1]
PAPER = (ROOT / "paper" / "whitepaper.md").read_text()
N_STEPS = 10


def b_for(p, n=N_STEPS):
    lo, hi = 0.0, 40.0
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if Q(mid) > p else (lo, mid)
    return math.sqrt(n) * (lo + hi) / 2


class Claims(unittest.TestCase):
    def test_paper_theta_star_matches_code(self):
        b = b_for(1e-6)
        m = re.search(r"slightly above `b/n` \((\d\.\d+) vs (\d\.\d+) at p=1e-6\)", PAPER)
        self.assertIsNotNone(m, "paper result 2 no longer quotes theta* vs b/n")
        self.assertAlmostEqual(float(m.group(1)), optimal_theta(b, N_STEPS), delta=0.0006)
        self.assertAlmostEqual(float(m.group(2)), b / N_STEPS, delta=0.0006)

    def test_theta_star_strictly_above_b_over_n(self):
        # optimiser must search past b/n; the exact optimum at p=1e-6 is 1.5354, b/n = 1.5032
        b = b_for(1e-6)
        self.assertGreater(optimal_theta(b, N_STEPS) - b / N_STEPS, 0.02)

    def test_mistuning_is_symmetric_and_paper_does_not_say_otherwise(self):
        # log(M2/p^2) ~ n(theta - b/n)^2 / 2: equal steps either side cost about the same
        b = b_for(1e-6); t = optimal_theta(b, N_STEPS); best = is_relvar(b, N_STEPS, t)
        lo, hi = is_relvar(b, N_STEPS, 0.5 * t) / best, is_relvar(b, N_STEPS, 1.5 * t) / best
        self.assertLess(abs(math.log(lo / hi)), 0.05)
        self.assertNotIn("Under-shooting degrades polynomially", PAPER)

    def test_interval_half_width_is_196_sample_sd_over_root_n(self):
        m, lo, hi = estimate([1.0, 2.0, 3.0])  # sample sd 1
        self.assertAlmostEqual(hi - m, 1.96 / math.sqrt(3), places=12)
        self.assertAlmostEqual(m - lo, 1.96 / math.sqrt(3), places=12)


if __name__ == "__main__":
    unittest.main()
