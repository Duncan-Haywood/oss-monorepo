"""Milestone 3g: the energy-band interval over pooled Cusick states (stdlib only)."""
import importlib.util
import json
import unittest
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
_s = importlib.util.spec_from_file_location("m3g_run", EXP / "m3g_band" / "run.py")
m3g = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3g)


def st(e, dc, folds, seed=0, conv=True):
    return dict(energy=e, dc=dc, folds=folds, seed=seed, conv=conv)


class TestM3g(unittest.TestCase):
    def test_distinct_merges_twins_and_drops_capped(self):
        rows = [st(-1.0, 0.5, 7), st(-1.0 * (1 - 1e-12), 0.5, 7, seed=1), st(-0.9, 0.6, 8),
                st(-2.0, 0.1, 9, conv=False)]
        d = m3g.distinct(rows)
        self.assertEqual([r["folds"] for r in d], [7, 8])

    def test_band_and_summary(self):
        states = [st(-1e-3, 0.58, 7), st(-1e-3 + 5e-6, 0.60, 8), st(-1e-3 + 2e-5, 0.63, 9)]
        s = m3g.summary(m3g.band(states, 1e-5))
        self.assertEqual(s["n"], 2)
        self.assertAlmostEqual(s["width"], 0.02)
        self.assertAlmostEqual(s["mid"], 0.59)
        self.assertEqual(s["folds"], [7, 8])

    def test_drop_is_energy_over_overhang_weight(self):
        # 1 J over the jersey's overhang weight (12.55 mg/cm^2 = 0.1255 kg/m^2 on pi (0.15^2 - 0.09^2) m^2)
        w = 0.1255 * 9.81 * 3.141592653589793 * (0.15 ** 2 - 0.09 ** 2)
        self.assertAlmostEqual(m3g.drop_mm("A", 1e-5), 1000 * 1e-5 / w, places=9)

    def test_results_match_a_fresh_report(self):
        res = json.loads((EXP / "m3g_band" / "results.json").read_text())
        P = m3g.pool(json.loads((EXP / "m3e_pooled" / "results.json").read_text()),
                     json.loads((EXP / "m3f_transfer" / "results.json").read_text()))
        for (f, a), states in P.items():
            s = m3g.summary(m3g.band(states, m3g.DE))
            saved = res["bands"][f"{f} {m3g.mm(a)} {m3g.DE:g}"]
            self.assertEqual(s["n"], saved["n"])
            self.assertAlmostEqual(s["mid"], saved["mid"], places=12)
        # the pooled lowest of each cell is 3e/3f's pooled pick
        f3 = json.loads((EXP / "m3f_transfer" / "results.json").read_text())
        for a in m3g.LATS:
            self.assertAlmostEqual(P[("A", a)][0]["energy"], f3["pooled"][m3g.mm(a)]["energy"], places=15)


if __name__ == "__main__":
    unittest.main()
