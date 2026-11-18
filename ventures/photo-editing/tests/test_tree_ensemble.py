"""shootflow.tree_ensemble: boosted trees evaluated with numpy alone."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None


def _dump():
    """Two hand-written trees: f0 <= 0.5 ? (f1 <= 2 ? 1 : 2) : 3, and f1 <= 0 (NaN left) ? 10 : 20."""

    leaf = lambda v: {"leaf_value": v}  # noqa: E731
    t1 = {"split_feature": 0, "threshold": 0.5, "decision_type": "<=", "missing_type": "None",
          "default_left": True,
          "left_child": {"split_feature": 1, "threshold": 2.0, "decision_type": "<=", "missing_type": "None",
                         "default_left": True, "left_child": leaf(1.0), "right_child": leaf(2.0)},
          "right_child": leaf(3.0)}
    t2 = {"split_feature": 1, "threshold": 0.0, "decision_type": "<=", "missing_type": "NaN",
          "default_left": True, "left_child": leaf(10.0), "right_child": leaf(20.0)}
    return {"num_class": 1, "max_feature_idx": 1, "tree_info": [{"tree_structure": t1}, {"tree_structure": t2}]}


@unittest.skipIf(np is None, "numpy not installed")
class TreeEnsembleTests(unittest.TestCase):
    def test_hand_written_trees(self):
        from shootflow import tree_ensemble as te

        m = te.from_lightgbm_dump(_dump())
        self.assertEqual(m.depth, 2)
        X = np.array([[0.0, 1.0], [0.0, 3.0], [1.0, -1.0], [np.nan, np.nan], [0.5, 0.0]])
        # NaN in f0 under missing_type None reads as 0 (left); NaN in f1 at tree 2 goes default_left, and
        # at tree 1's inner split (missing None) reads as 0 <= 2, left.
        self.assertEqual(te.predict(m, X).tolist(), [21.0, 22.0, 13.0, 11.0, 11.0])
        with tempfile.TemporaryDirectory() as d:
            te.save(m, Path(d) / "m.npz")
            self.assertEqual(te.predict(te.load(Path(d) / "m.npz"), X, chunk=2).tolist(), [21.0, 22.0, 13.0, 11.0, 11.0])

    def test_rejects_categorical(self):
        from shootflow import tree_ensemble as te

        d = _dump()
        d["tree_info"][0]["tree_structure"]["decision_type"] = "=="
        with self.assertRaises(ValueError):
            te.from_lightgbm_dump(d)

    @unittest.skipUnless(importlib.util.find_spec("lightgbm"), "lightgbm not installed")
    def test_matches_lightgbm(self):
        import lightgbm as lgb

        from shootflow import tree_ensemble as te

        rng = np.random.default_rng(0)
        X = rng.normal(size=(4000, 6)).astype(np.float32)
        y = np.sin(X[:, 0]) + X[:, 1] * X[:, 2] + 0.1 * rng.normal(size=4000)
        params = {"objective": "regression", "num_leaves": 31, "learning_rate": 0.1, "min_data_in_leaf": 20,
                  "verbose": -1, "seed": 0, "num_threads": 1}
        b = lgb.train(params, lgb.Dataset(X, y), num_boost_round=40)
        m = te.from_lightgbm_dump(b.dump_model())
        Xt = rng.normal(size=(2000, 6)).astype(np.float32)
        self.assertLess(float(np.max(np.abs(te.predict(m, Xt) - b.predict(Xt)))), 1e-9)


if __name__ == "__main__":
    unittest.main()
