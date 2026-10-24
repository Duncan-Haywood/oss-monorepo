"""The unified library must reproduce the closed forms of four earlier projects.

Each test compares (i) the library, computed from payoffs, with (ii) the closed form and, where the
earlier project is on disk, (iii) that project's own code. Run: PYTHONPATH=src python3 -m unittest discover -s tests -v"""
import itertools
import os
import sys
import unittest

from vtm.games import Inspection, inspection_closed_form, inspection_equilibrium, solve_2x2
from vtm.audit import cheats, full_cost, numeric_threshold, threshold
from vtm.collusion import Bribery, collusion_proof_stake, floor_closed, floor_numeric
from vtm.scoring import brier_value, implement_cost

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, "..", ".."))


def legacy(project, package):
    """Import an earlier project's package from its src/, or skip when it is absent."""
    path = os.path.join(RESEARCH, project, "src")
    if not os.path.isdir(path):
        raise unittest.SkipTest(f"{project} not on disk")
    sys.path.insert(0, path)
    try:
        return __import__(package + ".model" if project != "verification-game" else package + ".inspection",
                          fromlist=["x"])
    finally:
        sys.path.remove(path)


class Solver(unittest.TestCase):
    def test_matching_pennies(self):
        eq = solve_2x2([[1, -1], [-1, 1]], [[-1, 1], [1, -1]])
        self.assertEqual(eq, [(0.5, 0.5)])

    def test_coordination_has_three(self):
        eq = solve_2x2([[2, 0], [0, 1]], [[2, 0], [0, 1]])
        self.assertEqual(len(eq), 3)
        mixed = [e for e in eq if 0 < e[0] < 1]
        self.assertAlmostEqual(mixed[0][0], 1 / 3)
        self.assertAlmostEqual(mixed[0][1], 1 / 3)


class Inspect(unittest.TestCase):
    GRID = list(itertools.product([0.5, 1, 3], [2, 5, 10], [0.2, 1, 2], [0.25, 0.5], [0, 0.5]))

    def test_matrix_equilibrium_equals_closed_form(self):
        n = 0
        for s, S, k, lam, h in self.GRID:
            g = Inspection(s, S, k, lam, h)
            if k >= lam * S + h:
                continue
            x, y = inspection_equilibrium(g)
            xc, yc = inspection_closed_form(g)
            self.assertAlmostEqual(x, xc, places=12)
            self.assertAlmostEqual(y, yc, places=12)
            n += 1
        self.assertGreater(n, 50)

    def test_dominant_cheating_when_checking_never_pays(self):
        g = Inspection(1, 2, 5, 0.5, 0)
        self.assertEqual(inspection_equilibrium(g), (1.0, 0.0))

    def test_matches_verification_game(self):
        vg = legacy("verification-game", "verification_game")
        for s, S, k, lam, h in self.GRID:
            old = vg.equilibrium(vg.Params(s=s, S=S, k=k, lam=lam, h=h))
            new = inspection_closed_form(Inspection(s, S, k, lam, h))
            self.assertEqual(old, new)


class Audit(unittest.TestCase):
    def test_numeric_threshold_is_closed_form(self):
        for g, S in itertools.product([0.1, 1, 7], [0.5, 3, 40]):
            self.assertAlmostEqual(numeric_threshold(g, S), threshold(g, S), places=12)

    def test_just_below_cheats_at_or_above_does_not(self):
        t = threshold(2.0, 3.0)
        self.assertTrue(cheats(t - 1e-9, 2.0, 3.0))
        self.assertFalse(cheats(t, 2.0, 3.0))

    def test_matches_audit_allocation(self):
        aa = legacy("audit-allocation", "audit_allocation")
        gs = [0.4, 1.0, 2.5, 6.0]
        self.assertAlmostEqual(aa.full_cost(gs, 3.0), full_cost(gs, 3.0), places=12)
        for g in gs:
            self.assertAlmostEqual(aa.threshold(g, 3.0), numeric_threshold(g, 3.0), places=12)


class Bribe(unittest.TestCase):
    CASES = [Bribery(), Bribery(h=0.3, m=3), Bribery(phi=0.1, J=2.0, k=0.6, m=2),
             Bribery(S=10, lam=0.25, k=1.0, h=0.2, phi=0.05, J=5.0)]

    def test_numeric_floor_equals_closed_form(self):
        for g in self.CASES:
            for x in (0.2, 0.5, 1.0):
                closed = max(0.0, floor_closed(g, x))     # a negative floor means no bribe is needed
                self.assertAlmostEqual(floor_numeric(g, x), closed, places=6)

    def test_collusion_proof_stake_falls_as_one_over_m(self):
        base = Bribery(s=2.0, lam=0.5, k=0.0, h=0.0)
        s1 = collusion_proof_stake(base)
        for m in (2, 4, 8):
            self.assertAlmostEqual(collusion_proof_stake(Bribery(s=2.0, lam=0.5, k=0.0, h=0.0, m=m)), s1 / m)

    def test_matches_verifier_bribery(self):
        vb = legacy("verifier-bribery", "verifier_bribery")
        for g in self.CASES:
            old = vb.Params(s=g.s, S=g.S, lam=g.lam, k=g.k, h=g.h, m=g.m, phi=g.phi, J=g.J)
            self.assertAlmostEqual(vb.collusion_threshold_stake(old), collusion_proof_stake(g), places=12)
            for x in (0.3, 1.0):
                self.assertAlmostEqual(vb.bribe_floor(old, x), floor_closed(g, x), places=12)


class Score(unittest.TestCase):
    def test_brier_value_closed_form(self):
        a, b = 2.0, 3.0
        var = a * b / ((a + b) ** 2 * (a + b + 1))
        for n in (1, 5, 20):
            self.assertAlmostEqual(brier_value(n, a, b), var * n / (a + b + n), places=12)

    def test_rent_law(self):
        for a, b in [(1, 1), (2, 8), (0.2, 5)]:
            for n in (5, 30):
                alpha, rent = implement_cost(n, a, b, 0.001)
                self.assertAlmostEqual(rent / (0.001 * n), (n - 1) / (a + b), places=6)

    def test_matches_effort_elicitation(self):
        ee = legacy("effort-elicitation", "effort_elicitation")
        V = ee.value_curve("brier", 2, 3, 12)
        for n in range(13):
            self.assertAlmostEqual(V[n], brier_value(n, 2, 3), places=12)
        d = ee.design("brier", 2, 3, 8, 0.01)
        alpha, rent = implement_cost(8, 2, 3, 0.01)
        self.assertAlmostEqual(d["alpha"], alpha, places=9)
        self.assertAlmostEqual(d["rent"], rent, places=9)


if __name__ == "__main__":
    unittest.main()
