"""Session 103: tfol_boot's staleness-grid rows and scores (G1 to G4) on hand-built results."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import tfol_boot  # noqa: E402


def _r(test, k6, n=100, n_open=10):
    return dict(test_loss={"0.9": test}, test_loss_per_seed={"0.9": [test - 0.1, test, test + 0.1]},
                tgt_k={"6": dict(n=n, n_open=n_open, loss={"0.9": k6}, loss_per_seed={"0.9": [k6] * 3})})


def _files(nc3, nc4, nc5, k3=1.0, k4=2.0, k5=3.0):
    new, oos, early = {}, {}, {}
    for h in ("sf", "seattle"):
        for Y in (2019, 2020, 2021, 2022):
            oos[f"{h} {Y} cpin_es3_nc3"], oos[f"{h} {Y} cpin_es3_nc5"] = _r(nc3, k3), _r(nc5, k5)
            new[f"{h} {Y} cpin_es3_nc4"] = _r(nc4, k4)
        for Y in (2017, 2018):
            early.update({f"{h} {Y} cpin_es3_nc3": _r(nc3, k3), f"{h} {Y} cpin_es3_nc4": _r(nc4, k4),
                          f"{h} {Y} cpin_es3_nc5": _r(nc5, k5)})
    return new, oos, early


class TestGrid(unittest.TestCase):
    def test_nc4_best_and_chooser_picks_nc3(self):
        rows = tfol_boot.grid_rows(*_files(81.0, 80.0, 82.0))
        self.assertEqual(len(rows), 12)
        s = tfol_boot.grid_score(rows)
        self.assertEqual(s["oracle_counts"]["cpin_es3_nc4"], 12)
        self.assertEqual(s["chooser_picks"]["cpin_es3_nc3"], 12)
        self.assertAlmostEqual(s["chooser_regret"], 1.0)
        self.assertEqual(s["predictions"], dict(G1=True, G2=True, G3=True, G4=False))
        self.assertEqual(rows[0]["k6_size"], rows[0]["k6_size_ref"])
        self.assertAlmostEqual(rows[0]["nc4_minus_nc5_per_seed"][1], -2.0)
        self.assertEqual(s["max_regret_post_hoc"]["cpin_es3_nc5"], 2.0)
        self.assertEqual(s["worst_counts_post_hoc"]["cpin_es3_nc5"], 12)

    def test_chooser_beats_fixed_when_k6_tracks_test(self):
        rows = tfol_boot.grid_rows(*_files(80.0, 81.0, 83.0))
        s = tfol_boot.grid_score(rows)
        self.assertEqual(s["chooser_regret"], 0.0)
        self.assertEqual(s["predictions"], dict(G1=False, G2=False, G3=True, G4=True))

    def test_missing_member_skips_cell(self):
        new, oos, early = _files(81.0, 80.0, 82.0)
        del new["sf 2019 cpin_es3_nc4"]
        rows = tfol_boot.grid_rows(new, oos, early)
        self.assertEqual(len(rows), 11)
        self.assertFalse(any(tfol_boot.grid_score(rows)["predictions"].values()))


if __name__ == "__main__":
    unittest.main()
