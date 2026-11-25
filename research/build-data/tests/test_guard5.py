"""Session 109: guard5 (seed-spread guards on the Y-6 chooser's short lean). Synthetic cells only."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import guard5 as g  # noqa: E402


def make(h, Y, test, k6, seeds):
    cell = dict(held=h, year=Y, test=dict(zip(g.G5, test)), k6=dict(zip(g.G5, k6)))
    R = {f"{h} {Y} {v}": {"test_loss": {"0.9": t}, "tgt_k": {"6": {"loss": {"0.9": k},
                                                                    "loss_per_seed": {"0.9": [k + d for d in s]}}}}
         for v, t, k, s in zip(g.G5, test, k6, seeds)}
    return cell, R


class Guard5(unittest.TestCase):
    def test_spread_moves_to_longest_within_margin(self):
        k6 = {"cpin_es3_nc1": 10.0, "cpin_es3_nc2": 10.5, "cpin_es3_nc3": 10.9, "cpin_es3_nc4": 12.0,
              "cpin_es3_nc5": 13.0}
        seeds = {v: [-0.5, 0.0, 0.5] for v in g.G5}  # spread 1.0
        self.assertEqual(g.pick_min(k6, g.G5), "cpin_es3_nc1")
        self.assertEqual(g.pick_guard(k6, seeds, g.spread), "cpin_es3_nc3")
        self.assertEqual(g.pick_guard(k6, seeds, g.se), "cpin_es3_nc1")  # se = 0.5/sqrt(3) ~ 0.29
        self.assertEqual(g.pick_k(k6, seeds, 0), "cpin_es3_nc1")
        self.assertEqual(g.pick_k(k6, seeds, 3), "cpin_es3_nc5")

    def test_regime(self):
        k6 = {"cpin_es3_nc1": 5.0, "cpin_es3_nc2": 8.0, "cpin_es3_nc3": 6.0, "cpin_es3_nc4": 7.0, "cpin_es3_nc5": 9.0}
        tight = {v: [-0.1, 0.0, 0.1] for v in g.G5}
        wide = {v: [-2.0, 0.0, 2.0] for v in g.G5}
        self.assertEqual(g.pick_regime(k6, tight), "cpin_es3_nc1")
        self.assertEqual(g.pick_regime(k6, wide), "cpin_es3_nc3")

    def test_summary_and_d0(self):
        cells, sources = [], {}
        for h in ("austin", "sf", "seattle"):
            for Y in range(2017, 2023):
                if h == "austin":  # short builds: nc1 best on test and on k6 by a wide margin
                    c, R = make(h, Y, (60, 62, 66, 75, 85), (3, 9, 10, 11, 12), [[-0.2, 0, 0.2]] * 5)
                else:  # long builds: nc3 best on test; k6 ranks by length but within one seed spread
                    c, R = make(h, Y, (88, 85, 80, 81, 82), (4.0, 4.3, 4.6, 6.0, 7.0), [[-0.4, 0, 0.4]] * 5)
                cells.append(c)
                sources.update(R)
        s = g.summary(cells, [("syn", sources)])
        P = s["predictions"]
        self.assertEqual(s["n"], 18)
        self.assertTrue(P["D0"])
        self.assertAlmostEqual(s["pooled"]["chooser5"], 8.0 * 12 / 18)
        self.assertAlmostEqual(s["pooled"]["spread"], 0.0)  # austin keeps nc1, sf/seattle move to nc3
        self.assertTrue(P["D1"] and P["D2"] and P["D3"] and P["D4"] and P["D5"])
        self.assertEqual(s["changed_spread"], 12)

    def test_d0_fails_on_mismatch(self):
        c, R = make("sf", 2017, (88, 85, 80, 81, 82), (4.0, 4.3, 4.6, 6.0, 7.0), [[-0.4, 0, 0.4]] * 5)
        R["sf 2017 cpin_es3_nc3"]["tgt_k"]["6"]["loss"]["0.9"] = 4.7
        s = g.summary([c], [("syn", R)])
        self.assertEqual(s["missing"], ["sf 2017 cpin_es3_nc3"])
        self.assertFalse(s["predictions"]["D0"])


if __name__ == "__main__":
    unittest.main()
