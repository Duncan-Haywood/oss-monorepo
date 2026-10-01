import unittest
from multi_verifier import flow_modes, Params, equilibrium, solver_adv, verifier_adv, detect_prob, hedge_run
from multi_verifier.game import redundancy, redundancy_limit


class T(unittest.TestCase):
    def test_indifference_residuals(self):
        for scheme in ("split", "bounty"):
            for m in (1, 2, 3, 5, 8):
                P = Params(scheme=scheme)
                x, y, q = equilibrium(P, m)
                ys = [y] * m
                self.assertAlmostEqual(solver_adv(P, ys), 0, places=12)
                for i in range(m):
                    self.assertAlmostEqual(verifier_adv(P, x, ys, i), 0, places=12)
                self.assertAlmostEqual(detect_prob(ys), q, places=12)

    def test_m1_matches_verification_game(self):
        P = Params()
        x, y, q = equilibrium(P, 1)
        self.assertAlmostEqual(x, P.k / (P.lam * P.S + P.h))
        self.assertAlmostEqual(y, P.s / (P.s + P.S))

    def test_split_cheating_increases_with_m(self):
        P = Params()
        xs = [equilibrium(P, m)[0] for m in range(1, 30)]
        self.assertTrue(all(b > a for a, b in zip(xs, xs[1:])))

    def test_redundancy_monotone_to_limit(self):
        P = Params()
        r = [redundancy(P, m) for m in range(1, 200)]
        self.assertTrue(all(b > a for a, b in zip(r, r[1:])))
        self.assertLess(r[-1], redundancy_limit(P))
        self.assertAlmostEqual(r[0], 1.0)

    def test_detection_independent_of_m(self):
        P = Params()
        self.assertAlmostEqual(equilibrium(P, 2)[2], equilibrium(P, 7)[2])

    def test_underincentivised_returns_none(self):
        self.assertIsNone(equilibrium(Params(k=50.0), 3))

    def test_hedge_stays_near_equilibrium_start(self):
        P = Params()
        x, y, q = equilibrium(P, 3)
        out = hedge_run(P, 3, 200, 0.01, x, [y] * 3)
        self.assertLess(max(abs(o[0] - x) for o in out), 1e-9)

    def test_symmetric_equilibrium_unstable_for_m_ge_2(self):
        for scheme in ("split", "bounty"):
            for m in (2, 3, 6):
                a, tr, det = flow_modes(Params(scheme=scheme), m)
                self.assertGreater(a, 0)   # effort-shifting mode grows: volunteer's dilemma
                self.assertLess(tr, 0)     # common-mode is damped
                self.assertGreater(det, 0)

    def test_single_verifier_is_conservative(self):
        a, tr, det = flow_modes(Params(), 1)
        self.assertAlmostEqual(tr, 0, places=6)
        self.assertGreater(det, 0)

    def test_hedge_concentrates_audit_burden(self):
        P = Params()
        x, y, q = equilibrium(P, 3)
        out = hedge_run(P, 3, 40000, 0.02, x + 0.1, [y * 1.5, y * 0.5, y * 1.5], record_every=1000)
        ys = sorted(out[-1][1])
        self.assertLess(ys[0], 1e-6)       # at least one verifier stopped auditing entirely
        self.assertAlmostEqual(detect_prob(out[-1][1]), q, places=2)


if __name__ == "__main__":
    unittest.main()
