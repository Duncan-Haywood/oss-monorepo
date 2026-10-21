import math
import random
import unittest

import qualfeatures as f


class Tests(unittest.TestCase):
    def test_auc_perfect_chance_and_ties(self):
        self.assertEqual(f.auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1.0)
        self.assertEqual(f.auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0.0)
        self.assertEqual(f.auc([1, 1, 1, 1], [0, 1, 0, 1]), 0.5)
        self.assertTrue(math.isnan(f.auc([1, 2], [1, 1])))

    def test_code_vector_flags_words(self):
        v = dict(zip(f.CODES, f.code_vector("I hate this, why?")))
        self.assertEqual(v["anger_insult"], 1.0)
        self.assertEqual(v["question"], 1.0)
        self.assertEqual(v["gratitude"], 0.0)
        self.assertEqual(len(f.code_vector("x")), len(f.CODES) + 1)

    def test_embed_is_unit_norm_and_deterministic(self):
        a = f.embed_vector("some text here")
        self.assertAlmostEqual(sum(x * x for x in a), 1.0)
        self.assertEqual(a, f.embed_vector("some text here"))

    def test_logistic_learns_a_separable_word(self):
        rng = random.Random(1)
        texts = [("hate this" if i % 2 else "love this") + " " + rng.choice(["a", "b", "c"]) for i in range(200)]
        ys = [i % 2 for i in range(200)]
        vocab = f.build_vocab(texts, min_df=1)
        feat = f.Featurizer("bow", vocab, texts)
        xs = [feat(t) for t in texts]
        w, l2 = f.fit_tuned(xs[:100], ys[:100])
        self.assertGreater(f.auc([f.predict(w, x) for x in xs[100:]], ys[100:]), 0.99)
        self.assertIn(l2, f.L2_GRID)

    def test_featurizer_kinds_have_expected_width(self):
        texts = ["good day", "bad day", "not good"]
        vocab = f.build_vocab(texts, min_df=1)
        n_codes = len(f.CODES) + 1
        self.assertEqual(len(f.Featurizer("codes", vocab, texts)("good day")), 1 + n_codes)
        self.assertEqual(len(f.Featurizer("embed", vocab, texts)("good day")), 1 + 64)
        self.assertLessEqual(len(f.Featurizer("bow+codes", vocab, texts)("good day")), 1 + len(vocab) + n_codes)


if __name__ == "__main__":
    unittest.main()
