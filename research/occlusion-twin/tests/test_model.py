import math
import random
import unittest

from occlusion_twin.model import (p_clear, union_length, p_all_clear, p_pair_clear, p_blind_exact, p_blind_indep, beams, var_clear_count,
                                  var_clear_count_indep, sample_blocked, beams_needed)

RHO, MU = 0.5, math.log(2) / 1.0   # p = exp(-2 rho mu) = 1/2


class T(unittest.TestCase):
    def test_single_beam(self):
        self.assertAlmostEqual(p_clear(RHO, MU), 0.5)
        self.assertAlmostEqual(p_blind_exact([0.0], RHO, MU), 0.5)

    def test_union_length(self):
        self.assertAlmostEqual(union_length([0.0], 0.5), 1.0)
        self.assertAlmostEqual(union_length([0.0, 0.3], 0.5), 1.3)
        self.assertAlmostEqual(union_length([0.0, 5.0], 0.5), 2.0)
        self.assertAlmostEqual(union_length([5.0, 0.0, 0.3], 0.5), 2.3)

    def test_pair_equals_independent_iff_far(self):
        p = p_clear(RHO, MU)
        self.assertAlmostEqual(p_pair_clear(1.0, RHO, MU), p * p)
        self.assertAlmostEqual(p_pair_clear(3.0, RHO, MU), p * p)
        self.assertGreater(p_pair_clear(0.4, RHO, MU), p * p)
        self.assertAlmostEqual(p_pair_clear(0.0, RHO, MU), p)

    def test_blind_pair_closed_form(self):
        p = p_clear(RHO, MU)
        s = 0.4
        self.assertAlmostEqual(p_blind_exact([0.0, s], RHO, MU), 1 - 2 * p + math.exp(-MU * (2 * RHO + s)))

    def test_far_beams_match_independent_twin(self):
        for n in (1, 3, 6):
            self.assertAlmostEqual(p_blind_exact(beams(n, 1.0), RHO, MU), p_blind_indep(n, RHO, MU), places=12)

    def test_close_beams_blind_more_often(self):
        for n in (2, 4, 8):
            self.assertGreater(p_blind_exact(beams(n, 0.2), RHO, MU), p_blind_indep(n, RHO, MU))

    def test_coincident_beams_are_one_beam(self):
        self.assertAlmostEqual(p_blind_exact([0.0] * 5, RHO, MU), 0.5, places=12)

    def test_blind_monotone_in_spacing(self):
        v = [p_blind_exact(beams(5, s), RHO, MU) for s in (0.0, 0.1, 0.3, 0.6, 1.0, 2.0)]
        self.assertTrue(all(a >= b - 1e-15 for a, b in zip(v, v[1:])))

    def test_expected_clear_count_matches_twin(self):
        # means agree by construction; only the variance differs
        n, s = 6, 0.2
        self.assertGreater(var_clear_count(beams(n, s), RHO, MU), var_clear_count_indep(n, RHO, MU))
        self.assertAlmostEqual(var_clear_count(beams(n, 1.0), RHO, MU), var_clear_count_indep(n, RHO, MU))

    def test_ensemble_matches_exact(self):
        rng = random.Random(1)
        ys = beams(4, 0.25)
        N = 60000
        blind = sum(all(sample_blocked(ys, RHO, MU, rng)) for _ in range(N)) / N
        ex = p_blind_exact(ys, RHO, MU)
        self.assertLess(abs(blind - ex), 4 * math.sqrt(ex * (1 - ex) / N))

    def test_beams_needed(self):
        self.assertLess(beams_needed(0.1, 1.0, RHO, MU, exact=False), beams_needed(0.1, 0.1, RHO, MU, exact=True))
        self.assertIsNone(beams_needed(1e-2, 0.1, RHO, MU, exact=True))
        self.assertEqual(beams_needed(1e-2, 1.0, RHO, MU, exact=True), beams_needed(1e-2, 1.0, RHO, MU, exact=False))


if __name__ == "__main__":
    unittest.main()
