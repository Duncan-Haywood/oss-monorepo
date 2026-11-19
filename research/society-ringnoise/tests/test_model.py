import sys
import unittest
from math import comb
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_ringnoise import resampled  # noqa: E402


class Resampled(unittest.TestCase):
    def test_no_robots_stays_on_r(self):
        self.assertLess(resampled(rho=0.0, sweeps=50), 0.05)

    def test_many_robots_tip_everyone(self):
        self.assertGreater(resampled(rho=0.5, sweeps=50), 0.95)

    def test_deterministic_for_seed(self):
        self.assertEqual(resampled(rho=0.12, sweeps=30, seed=3), resampled(rho=0.12, sweeps=30, seed=3))

    def test_more_robots_tip_at_least_as_much_on_average(self):
        lo = sum(resampled(rho=0.04, sweeps=60, seed=s) for s in range(4))
        hi = sum(resampled(rho=0.3, sweeps=60, seed=s) for s in range(4))
        self.assertGreater(hi, lo)


    def test_first_sweep_matches_exact_binomial(self):
        """One sweep from all-R, evenly spread robots: the mean share on L equals the exact expectation
        sum_i P(Binomial(M, q_i) > M/2), q_i = (robot neighbours + eps/2 per human neighbour) / 2k.
        Pins eps, the neighbourhood and the majority rule (added by quality audit 2026-11-19)."""
        n, k, m, eps, rho = 200, 2, 9, 0.02, 0.10
        nr = round(rho * n)
        robots = {int(b * n / nr) for b in range(nr)}
        tot = 0.0
        for i in range(n):
            if i in robots:
                continue
            nbr = [(i + d) % n for d in range(-k, k + 1) if d]
            q = sum(1.0 if j in robots else eps / 2 for j in nbr) / (2 * k)
            tot += sum(comb(m, s) * q**s * (1 - q) ** (m - s) for s in range(m // 2 + 1, m + 1))
        exact = tot / (n - nr)
        seeds = 1500
        mc = sum(resampled(n=n, rho=rho, block=1, k=k, m=m, eps=eps, sweeps=1, seed=s) for s in range(seeds)) / seeds
        se = (exact * (1 - exact) / (seeds * (n - nr))) ** 0.5
        self.assertLess(abs(mc - exact), 4 * se)


if __name__ == "__main__":
    unittest.main()
