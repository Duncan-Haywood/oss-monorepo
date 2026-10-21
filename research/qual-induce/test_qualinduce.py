import unittest

import numpy as np

import qualinduce as qi

DOCS = (["the cat sat on the mat with a fish"] * 20 + ["stock market prices fell as traders sold shares"] * 20
        + ["rain and wind storm weather forecast tonight"] * 20)


class Tests(unittest.TestCase):
    def test_primary_label_majority_and_ties(self):
        v = np.zeros((3, len(qi.EMOTIONS)))
        v[0, 2] = 1.0           # clear majority
        v[1, 4] = v[1, 5] = 0.6  # tie at the top
        v[2, 7] = 0.4           # no majority
        self.assertEqual(list(qi.primary_label(v)), [2, -1, -1])

    def test_human_matrix_majority(self):
        v = np.zeros((1, len(qi.EMOTIONS)))
        v[0, 0], v[0, 1] = 0.67, 0.5
        self.assertEqual(list(qi.human_matrix(v)[0, :2]), [1, 0])

    def test_nmf_recovers_planted_topics(self):
        cb = qi.Codebook("nmf", 3).fit(DOCS)
        a = cb.assign(DOCS)
        truth = np.repeat([0, 1, 2], 20)
        self.assertGreater(qi.normalized_mutual_info_score(truth, a), 0.95)

    def test_kmeans_recovers_planted_topics(self):
        cb = qi.Codebook("kmeans", 3).fit(DOCS)
        self.assertGreater(qi.normalized_mutual_info_score(np.repeat([0, 1, 2], 20), cb.assign(DOCS)), 0.95)

    def test_random_assignment_is_near_chance(self):
        rng = np.random.RandomState(0)
        truth = rng.randint(0, 5, 2000)
        asg = truth.copy()
        self.assertAlmostEqual(qi.nmi_vs_label(asg, truth), 1.0)
        self.assertLess(qi.nmi_vs_label(qi.random_assignment(asg, rng), truth), 0.02)

    def test_coverage_perfect_and_null(self):
        rng = np.random.RandomState(1)
        n = len(qi.EMOTIONS)
        H = (rng.rand(400, n) < 0.3).astype(int)
        S = H[:, :4].astype(float) + 0.01 * rng.rand(400, 4)   # four codes that are the first four emotions
        cov = qi.coverage(S, H, S, H)
        self.assertGreater(cov[qi.EMOTIONS[0]], 0.99)
        self.assertLess(cov[qi.EMOTIONS[10]], 0.65)

    def test_redundancy_and_effective_codes(self):
        x = np.random.RandomState(2).rand(500, 1)
        self.assertGreater(qi.redundancy(np.hstack([x, x * 2 + 1]))[0], 0.99)
        self.assertEqual(qi.effective_codes(np.array([0, 0, 1, 1])), 2.0)
        self.assertAlmostEqual(qi.effective_codes(np.array([0] * 99 + [1])), 1.06, delta=0.05)


if __name__ == "__main__":
    unittest.main()
