"""Tests for milestone 80's arbiter replays (numpy and scikit-learn; skipped without)."""
import importlib.util, os, unittest

try:
    import numpy as np
    HERE = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        "da", os.path.join(HERE, "..", "experiments", "dispute_arbiter", "run.py"))
    da = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(da)
    from vtm.margin import grad, init, lr_at
    HAVE = True
except ImportError:
    HAVE = False


@unittest.skipUnless(HAVE, "numpy or scikit-learn missing")
class DisputeArbiterTests(unittest.TestCase):
    def setUp(self):
        xtr, ytr = da.DATA[0], da.DATA[1]
        self.w = init(np.random.default_rng(3))
        self.x, self.y = xtr[:64], ytr[:64]

    def test_float64_gradient_matches_float32(self):
        g32, g64 = grad(self.w, self.x, self.y), da.grad64(self.w, self.x, self.y)
        self.assertEqual(g64.dtype, np.float64)
        self.assertLess(np.linalg.norm(g64 - g32), 1e-5 * np.linalg.norm(g64))

    def test_full_precision_replays_agree_far_closer_than_fp16(self):
        lr, rng = lr_at(0, da.T, da.LR0), np.random.default_rng(0)
        ref = self.w - lr * grad(self.w, self.x, self.y)
        step = np.linalg.norm(ref - self.w)
        d = {m: np.linalg.norm(da.replay_step(m, self.w, self.x, self.y, lr, rng) - ref) / step for m in da.MODES}
        for m in ("reorder", "shard4", "f64"):
            self.assertLess(d[m], 1e-4, m)
        self.assertGreater(d["fp16"], 100 * max(d["reorder"], d["shard4"], d["f64"]))

    def test_a_one_percent_shrink_is_far_outside_full_precision_drift(self):
        lr, rng = lr_at(0, da.T, da.LR0), np.random.default_rng(0)
        g = grad(self.w, self.x, self.y)
        honest, cheat = self.w - lr * g, self.w - 0.99 * lr * g
        arb = da.replay_step("reorder", self.w, self.x, self.y, lr, rng)
        self.assertGreater(np.linalg.norm(cheat - arb), 1000 * np.linalg.norm(honest - arb))


if __name__ == "__main__":
    unittest.main()
