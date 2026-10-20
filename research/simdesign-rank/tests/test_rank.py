import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_rank.rank import kendall_tau, topk_overlap, sample_designs, merit, MODELS


class T(unittest.TestCase):
    def test_tau_extremes(self):
        self.assertEqual(kendall_tau([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertEqual(kendall_tau([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)

    def test_tau_one_swap(self):
        # 6 pairs, one discordant: (5 - 1) / 6
        self.assertAlmostEqual(kendall_tau([1, 2, 3, 4], [1, 3, 2, 4]), 4 / 6)

    def test_topk(self):
        self.assertEqual(topk_overlap([5, 4, 3, 2, 1], [5, 4, 1, 2, 3], 2), 1.0)
        self.assertEqual(topk_overlap([5, 4, 3, 2, 1], [1, 2, 3, 4, 5], 2), 0.0)

    def test_sampling_reproducible_and_in_range(self):
        a, b = sample_designs(20, 1), sample_designs(20, 1)
        self.assertTrue((a == b).all())
        self.assertTrue((a[:, 0] >= 20).all() and (a[:, 0] <= 160).all())
        self.assertFalse((a == sample_designs(20, 2)).all())

    def test_euler_merit_closed_form_slender(self):
        # slender beam: 2D FE merit within 2% of Euler-Bernoulli
        L, h, b = 200.0, 10.0, 20.0
        self.assertAlmostEqual(merit(MODELS["fe2d"], L, h, b) / merit(MODELS["euler"], L, h, b), 1.0, delta=0.02)
