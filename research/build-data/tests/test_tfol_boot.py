"""Session 101: tfol_boot's pick, bootstrap and row check on synthetic rows."""
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

    def test_early_summary_grid_outside_pick(self):
        """Session 102: nc4 and nc6 are scored on the test year but never become the pick or the oracle."""
        rng = np.random.default_rng(2)
        y6, yte = rng.exponential(100, 300), rng.exponential(100, 200)
        open6 = np.zeros(300, bool)
        k6 = [np.full((2, 300), np.quantile(y6, 0.9))] + [np.full((2, 300), 2000.0)] * 3
        te = [np.full((2, 200), 2000.0), np.full((2, 200), np.quantile(yte, 0.9))] + [np.full((2, 200), 2000.0)] * 2
        with tempfile.TemporaryDirectory() as d:
            R = {}
            for h in ("sf", "seattle"):
                for Y in tfol_boot.EARLY_YEARS:
                    R.update(_write(d, h, Y, k6, te, y6, open6, yte))
                    for v, x in zip(tfol_boot.GRID, (1.0, 3000.0)):  # nc4 beats every candidate on the test year
                        p = np.full((2, 200), x)
                        R[f"{h} {Y} {v}"] = dict(test_loss={"0.9": float(boosted.pin(yte, p[0], 0.9).mean())})
            path = os.path.join(d, "r.json")
            json.dump(R, open(path, "w"))
            s = tfol_boot.early_summary(path, d)
        c = s["cells"][0]
        self.assertEqual(c["oracle"], "cpin_es3_nc5")
        self.assertEqual(c["pick"], "cpin_es3_nc3")
        self.assertTrue(s["predictions"]["E3"])
        self.assertFalse(s["predictions"]["E5"])  # nc6 is far from nc5
        self.assertEqual(s["grid_argmin"]["sf 2017"], "cpin_es3_nc5")  # nc4 at 1 day is worse than q0.9 here
        self.assertEqual(len(s["cells"]), 4)

    def test_pooled_counts_regret_over_prior_cells(self):
        """Session 102: pooled adds the prior file's cells and scores the k6 pick's regret on each."""
        C = tfol_boot.CANDS
        cells = [dict(held="sf", year=2017, test_q90={C[0]: 10.0, C[1]: 12.0, C[2]: 13.0, C[3]: 14.0},
                      k6={C[0]: 1.0, C[1]: 2.0, C[2]: 3.0, C[3]: 4.0})]
        prior = {f"seattle 2019 {v}": dict(test_loss={"0.9": t}, tgt_k={"6": dict(loss={"0.9": k})})
                 for v, t, k in zip(C, (20.0, 18.0, 19.0, 21.0), (1.0, 2.0, 3.0, 4.0))}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "p.json")
            json.dump(prior, open(path, "w"))
            P = tfol_boot.pooled(cells, path)
        self.assertEqual(P["n"], 2)
        self.assertEqual(P["k6_hits"], 1)
        self.assertAlmostEqual(P["k6_regret"], 1.0)  # 0 in sf 2017, 2 in seattle 2019
        self.assertAlmostEqual(P["fixed_regret"][C[1]], 1.0)  # 2 in sf 2017, 0 in seattle 2019
        self.assertEqual(P["oracle_3y"], 1)


if __name__ == "__main__":
    unittest.main()
