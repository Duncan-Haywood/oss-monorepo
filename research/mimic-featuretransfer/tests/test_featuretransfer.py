import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import featuretransfer as ft


def toy():
    its = []
    for f in ("a", "b"):
        for i in range(40):
            its.append({"family": f, "y": 0, "text": f"we saw the dog run home number {i} quickly lol"})
            its.append({"family": f, "y": 1, "text": f"Certainly! Here is a thoughtful overview of topic {i}."})
    return its


class T(unittest.TestCase):
    def test_every_feature_set_runs_and_separates_toy(self):
        its = toy(); tr = [i for i in its if i["family"] == "a"]; te = [i for i in its if i["family"] == "b"]
        for name in ("char", "word", "func", "format", "char+word"):
            s = ft.score(name, tr, te)
            self.assertGreater(ft.auc([i["y"] for i in te], s), 0.95, name)

    def test_vectoriser_sees_only_training_text(self):
        tr = [{"text": "alpha beta gamma delta", "y": 0}] * 5 + [{"text": "alpha beta", "y": 1}] * 5
        te = [{"text": "zzzz qqqq", "y": 0}]
        Xtr, Xte = ft.featurize("word", tr, te)
        self.assertEqual(Xte.shape[1], Xtr.shape[1])
        self.assertEqual(Xte.nnz, 0)  # unseen words contribute nothing

    def test_length_set_is_one_column(self):
        Xtr, _ = ft.featurize("length", toy(), toy()[:2]); self.assertEqual(Xtr.shape[1], 1)

    def test_bootstrap_interval_contains_point_estimate(self):
        rng = np.random.RandomState(0); y = rng.randint(0, 2, 200); s = y + rng.normal(0, 1, 200)
        lo, hi = ft.boot_ci(y, s, n=200); self.assertLess(lo, ft.auc(y, s)); self.assertGreater(hi, ft.auc(y, s))

    def test_suite_has_all_families(self):
        if not os.path.exists(ft.SUITE): self.skipTest("suite missing")
        self.assertEqual({i["family"] for i in ft.load()}, set(ft.FAMILIES))


if __name__ == "__main__":
    unittest.main()
