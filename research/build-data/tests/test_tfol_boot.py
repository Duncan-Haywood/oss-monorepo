"""Session 100: tfol_boot's pick, bootstrap and row check on synthetic rows."""
import json, os, sys, tempfile, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import boosted, tfol_boot  # noqa: E402


def _write(d, h, Y, preds_k6, preds_te, y6, open6, yte):
    R = {}
    for v, (pk, pt) in zip(tfol_boot.CANDS, zip(preds_k6, preds_te)):
        np.savez_compressed(os.path.join(d, f"{h}_{Y}_{v}.npz"), test_y=yte, test_pred=pt, k6_y=y6, k6_open=open6,
                            k6_w=np.ones((~open6).sum()), k6_pred=pk)
        k6 = float(np.mean([boosted.pin(y6[~open6], p[~open6], 0.9).mean() for p in pk]))
        te = float(np.mean([boosted.pin(yte, p, 0.9).mean() for p in pt]))
        R[f"{h} {Y} {v}"] = dict(test_loss={"0.9": te}, test_loss_per_seed={"0.9": [te] * len(pt)},
                                 tgt_k={"6": dict(loss={"0.9": k6}, loss_per_seed={"0.9": [k6] * len(pk)})})
    return R


class TestTfolBoot(unittest.TestCase):
    def test_pick_oracle_and_stable_bootstrap(self):
        rng = np.random.default_rng(0)
        y6, yte = rng.exponential(100, 500), rng.exponential(100, 400)
        open6 = np.zeros(500, bool); open6[:50] = True
        q = lambda y: np.full((2, len(y)), np.quantile(y, 0.9))  # noqa: E731
        # nc3 predicts the true q0.9; the others are far off, so nc3 must be picked, be the oracle, and be stable
        k6 = [np.full((2, 500), np.quantile(y6[~open6], 0.9))] + [np.full((2, 500), 2000.0)] * 3
        te = [q(yte)] + [np.full((2, 400), 2000.0)] * 3
        with tempfile.TemporaryDirectory() as d:
            R = _write(d, "sf", 2019, k6, te, y6, open6, yte)
            c = tfol_boot.cell(R, d, "sf", 2019)
        self.assertEqual(c["pick"], "cpin_es3_nc3")
        self.assertEqual(c["oracle"], "cpin_es3_nc3")
        self.assertEqual(c["regret"], 0)
        self.assertEqual(c["boot_k6_same_side"], 1.0)
        self.assertLess(c["rows_check_max_abs"], 1e-6)
        self.assertEqual(c["n_k6_done"], 450)
        self.assertGreater(c["boot_k6_nc5_minus_nc3_ci"][0], 0)

    def test_boot_pick_shares_sum_to_one(self):
        rng = np.random.default_rng(1)
        L = {v: rng.normal(10, 1, 300) for v in tfol_boot.CANDS}
        share, ci = tfol_boot.boot_pick(L, n_boot=200)
        self.assertAlmostEqual(sum(share.values()), 1.0)
        self.assertLess(ci[0], ci[1])


if __name__ == "__main__":
    unittest.main()
