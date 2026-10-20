import math
import os
import unittest

import numpy as np

from eda_surrogate import gen, models, synth

DATA = os.path.join(os.path.dirname(__file__), "..", "experiments", "dataset.jsonl")


class T(unittest.TestCase):
    def test_design_space_sizes(self):
        sp = gen.spaces()
        self.assertEqual({k: len(v) for k, v in sp.items()}, {"mac": 36, "fir": 36, "alu": 36, "sorter": 25})

    def test_cycles_are_analytic(self):
        self.assertEqual(gen.mac(3, 4)[1], math.ceil(gen.WORK / 3))
        self.assertEqual(gen.fir(8, 2, 4)[1], 4)
        self.assertEqual(gen.alu(8, 4)[1], 1)

    def test_features_count_a_multiplier(self):
        v = "module top(input [7:0] a, input [7:0] b, output [15:0] y); assign y = a * b; endmodule\n"
        f, _ = synth.features(v)
        self.assertEqual(f["n_mul"], 1)
        self.assertEqual(f["mul_area"], 64)
        self.assertEqual(f["in_bits"], 16)
        self.assertEqual(f["out_bits"], 16)

    def test_synth_counts_a_known_gate(self):
        v = "module top(input a, input b, output y); assign y = a & b; endmodule\n"
        cells, ff, _ = synth.synth(v)
        self.assertEqual((cells, ff), (1, 0))

    def test_every_generator_parses_and_synthesises(self):
        for fam, designs in gen.spaces().items():
            _, v, _ = designs[0]
            self.assertGreater(synth.synth(v)[0], 0, fam)

    def test_rank_stats(self):
        self.assertAlmostEqual(models.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(models.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertTrue(math.isnan(models.spearman([1, 1, 1], [1, 2, 3])))
        self.assertEqual(list(models.ranks([5, 1, 1, 3])), [3.0, 0.5, 0.5, 2.0])

    def test_models_recover_a_linear_law(self):
        rs = np.random.RandomState(0)
        X = rs.randint(1, 50, size=(60, 3)).astype(float)
        y = 2 * X[:, 0] + 3 * X[:, 1] + 1.0 * X[:, 2] + 5
        p = models.Model("linear").fit(X, y).predict(X)
        self.assertLess(models.ape(p, y).max(), 0.1)
        self.assertEqual(len(set(models.Model("mean").fit(X, y).predict(X))), 1)

    def test_oof_never_trains_on_the_test_fold(self):
        # a model that memorises its training set would be exact in-sample; out-of-fold it must not be
        rs = np.random.RandomState(1)
        X = rs.rand(40, 4) * 100
        y = rs.rand(40) * 1000 + 10  # pure noise: no model can predict it out of fold
        p = models.oof_predictions(X, y, "gbr")
        self.assertGreater(np.median(models.ape(p, y)), 0.3)

    def test_lofo_holds_out_whole_families(self):
        X = np.arange(12, dtype=float).reshape(-1, 1)
        y = np.array([10.0] * 6 + [1000.0] * 6)
        fam = ["a"] * 6 + ["b"] * 6
        p = models.lofo_predictions(X, y, fam, "mean")
        self.assertTrue(np.allclose(p[:6], 1000.0) and np.allclose(p[6:], 10.0))

    def test_evals_to_good(self):
        obj = np.array([5.0, 3.0, 1.0, 9.0])
        self.assertEqual(models.evals_to_good([2, 0, 1, 3], obj), 1)
        self.assertEqual(models.evals_to_good([3, 0, 1, 2], obj), 4)
        self.assertEqual(models.random_evals_to_good(obj, trials=2000).mean().round(1), 2.5)

    def test_committed_dataset_matches_the_generators(self):
        rows = models.load(DATA)
        self.assertEqual(len(rows), 133)
        want = {(fam, tuple(sorted(p.items()))) for fam, ds in gen.spaces().items() for p, _, _ in ds}
        have = {(r["family"], tuple(sorted(r["params"].items()))) for r in rows}
        self.assertEqual(want, have)
        for r in rows:
            self.assertGreater(r["cells"], r["ff"])

    def test_committed_dataset_regenerates_for_one_design_per_family(self):
        by = {(r["family"], tuple(sorted(r["params"].items()))): r for r in models.load(DATA)}
        for fam, ds in gen.spaces().items():
            p, v, _ = ds[0]
            r = by[(fam, tuple(sorted(p.items())))]
            self.assertEqual(synth.synth(v)[0], r["cells"], fam)
            self.assertEqual(synth.features(v)[0], r["features"], fam)


if __name__ == "__main__":
    unittest.main()
