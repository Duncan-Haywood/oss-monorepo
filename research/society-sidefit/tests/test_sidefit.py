import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "src"))
from society_sidefit import critical_share, fit_sl, low_fixed_point, observed_l_share, simulate  # noqa: E402


class Fit(unittest.TestCase):
    def test_matches_society_blocs_threshold(self):
        # society-blocs results.txt: M=9, eps=0.02, sl=0.05 -> 0.176; no bloc -> 0.2165
        self.assertAlmostEqual(critical_share(0.0, 0.0, 9, 0.02), 0.2165, places=3)
        self.assertAlmostEqual(critical_share(0.05, 0.0, 9, 0.02), 0.176, places=3)

    def test_no_bloc_shows_half_eps_when_converged(self):
        # all adaptive people at R: only errors put L on the road, eps/2 of choices
        self.assertAlmostEqual(observed_l_share(0.0, 0.0, 9, 0.02), 0.01, places=3)

    def test_fit_round_trips(self):
        for m in (5, 9, 17):
            for eps in (0.02, 0.1):
                sl = fit_sl(0.17, 0.0, m, eps)
                self.assertAlmostEqual(observed_l_share(sl, 0.0, m, eps), 0.17, places=6)
                self.assertLess(low_fixed_point(0.0, sl, 0.0, m, eps), 0.5)

    def test_fit_impossible_cases(self):
        self.assertIsNone(fit_sl(0.05, 0.0, 9, 0.2))   # errors alone already give 0.10 > 0.05
        self.assertIsNone(fit_sl(0.90, 0.0, 9, 0.02))  # no status-quo crowd shows 0.9 L

    def test_fit_sl_falls_with_noise(self):
        sls = [fit_sl(0.17, 0.0, 9, e) for e in (0.02, 0.1, 0.2)]
        self.assertTrue(all(b < a for a, b in zip(sls, sls[1:])))

    def test_simulation_agrees_with_mean_field_l_share(self):
        sl = fit_sl(0.17, 0.0, 9, 0.02)
        got = sum(simulate(200, 0.0, sl, 0.0, 9, 0.02, 300, s)["human_l_share"] for s in range(4)) / 4
        self.assertAlmostEqual(got, 0.17, delta=0.02)

    def test_data_file_reads_back_the_paper_text(self):
        p = json.loads((HERE / "data" / "moussaid2009_fig4.json").read_text())["panels"]
        for d in p.values():
            unit = 2 * (d["frame_bottom_px"] - d["dotted_px"])
            left = (d["frame_bottom_px"] - d["left_top_px"]) / unit
            right = (d["frame_bottom_px"] - d["right_top_px"]) / unit
            self.assertLess(left, right)  # a right-hand preference, as the paper says
        c2, c3 = p["condition_2_static_obstacle"], p["condition_3_two_walkers_head_on"]

        def share(d):
            u = 2 * (d["frame_bottom_px"] - d["dotted_px"])
            l, r = (d["frame_bottom_px"] - d["left_top_px"]) / u, (d["frame_bottom_px"] - d["right_top_px"]) / u
            return l / (l + r)
        self.assertLess(share(c3), share(c2))  # amplified when both walkers move


if __name__ == "__main__":
    unittest.main()
