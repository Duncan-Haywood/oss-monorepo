import math, random, unittest
from audit_staffing import *


class T(unittest.TestCase):
    def test_erlang_known_values(self):
        self.assertAlmostEqual(erlang_b(2, 1.0), 0.2, 12)                 # B(2,1) = (1/2)/(1+1+1/2)
        self.assertAlmostEqual(erlang_c(1, 0.5), 0.5, 12)                 # M/M/1: P(wait)=rho
        self.assertAlmostEqual(mean_wait(1, 0.5), 1.0, 12)                # rho/(1-rho) * s
        # direct formula for c=3, R=2
        R, c = 2.0, 3
        num = R ** c / math.factorial(c) * c / (c - R)
        den = sum(R ** k / math.factorial(k) for k in range(c)) + num
        self.assertAlmostEqual(erlang_c(c, R), num / den, 12)

    def test_simulation_matches_erlang_c(self):
        rng = random.Random(3)
        c, R = 10, 8.0
        m, p, w = simulate(c, R, lambda r: r.expovariate(1.0), 60000, rng)
        self.assertAlmostEqual(p, erlang_c(c, R), delta=0.02)
        self.assertAlmostEqual(m, mean_wait(c, R), delta=0.03)
        tail = sum(1 for x in w if x > 0.5) / len(w)
        self.assertAlmostEqual(tail, wait_tail(c, R, 0.5), delta=0.02)

    def test_min_servers_monotone_and_minimal(self):
        for R in (3.0, 20.0, 150.0):
            c = min_servers(R, 0.2)
            self.assertLessEqual(erlang_c(c, R), 0.2)
            self.assertGreater(erlang_c(c - 1, R), 0.2)

    def test_square_root_staffing(self):
        # exact minimal c is within 1.5 servers of R + beta sqrt R once R >= 100, relative error shrinks
        prev = None
        for R in (100.0, 400.0, 1600.0):
            c = min_servers(R, 0.2)
            self.assertLess(abs(c - hw_servers(R, 0.2)), 1.5)
            self.assertAlmostEqual(hw_wait_prob(hw_beta(0.2)), 0.2, 9)
        # safety staffing (c-R)/R falls like 1/sqrt(R): 4x the load halves it
        r1 = (min_servers(400.0, 0.2) - 400) / 400
        r2 = (min_servers(1600.0, 0.2) - 1600) / 1600
        self.assertAlmostEqual(r1 / r2, 2.0, delta=0.2)

    def test_deterrence_audit_rate(self):
        G, S = 1.0, 9.0
        a = audit_prob(G, S)
        self.assertAlmostEqual((1 - a) * G, a * S, 12)                    # cheating is exactly break-even
        self.assertAlmostEqual(offered_load(100, G, S, 2.0), 20.0, 12)

    def test_stake_optimum_near_first_order_formula(self):
        args = dict(lam=100.0, G=1.0, s=1.0, w=1.0, r=0.01, d0=1.0, p_wait=0.2)
        v, S, c, R = best_stake(**args)
        self.assertAlmostEqual(S, stake_star(1.0, 1.0, 1.0, 0.01, 1.0), delta=0.15 * S)
        # and the optimum beats both extremes
        for S2 in (0.5, 40.0):
            self.assertLess(v, cost(S2, 100.0, 1.0, 1.0, 1.0, 0.01, 1.0, 0.2)[0])

    def test_allen_cunneen_deterministic_service(self):
        # M/D/c: cs2=0, wait about half of M/M/c
        rng = random.Random(5)
        c, R = 10, 8.0
        m, _, _ = simulate(c, R, lambda r: 1.0, 60000, rng)
        self.assertAlmostEqual(m, allen_cunneen(c, R, 1.0, 0.0), delta=0.03)

    def test_flaky_servers(self):
        self.assertAlmostEqual(flaky_wait_prob(10, 1.0, 8.0), erlang_c(10, 8.0), 12)
        u = 0.9
        c = flaky_servers(20.0, u, 0.2)
        self.assertGreater(c, min_servers(20.0, 0.2) / u - 1)             # more than naive rescaling of the c needed at u=1?
        self.assertLessEqual(flaky_wait_prob(c, u, 20.0), 0.2)
        self.assertGreater(flaky_wait_prob(c - 1, u, 20.0), 0.2)


if __name__ == "__main__":
    unittest.main()
