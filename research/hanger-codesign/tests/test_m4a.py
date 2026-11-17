"""Milestone 4a: inputs from Petrak et al. (2021) and the scoring against measured drape."""
import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "experiments"
EXP = ROOT / "m4a_measured_drape"
# 3d's run.py does `import run` for milestone 3a's module; other tests leave their own `run` in
# sys.modules, so pin 3a's while loading (as test_m3e does), then restore
_saved = sys.modules.get("run")
_s3 = importlib.util.spec_from_file_location("run", ROOT / "m3_fem_tier" / "run.py")
_m3 = importlib.util.module_from_spec(_s3)
sys.modules["run"] = _m3
_s3.loader.exec_module(_m3)
try:
    _s = importlib.util.spec_from_file_location("m4a_run", EXP / "run.py")
    m4a = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(m4a)
finally:
    if _saved is not None:
        sys.modules["run"] = _saved
    else:
        sys.modules.pop("run", None)
fabrics = m4a.fabrics


class TestM4a(unittest.TestCase):
    def test_kes_and_fast_shear_agree(self):
        # an independent check on the unit reading: two instruments, one quantity
        for c in fabrics.CODES:
            ratio = fabrics.g_kes(c) / fabrics.g_fast(c)
            self.assertGreater(ratio, 0.95, c)
            self.assertLess(ratio, 1.70, c)
        self.assertAlmostEqual(fabrics.g_kes("F1"), 0.41 * 180 / math.pi, places=12)

    def test_secant_stiffness(self):
        # F3: 11.9 % and 11.7 % at 100 gf/cm
        ea = math.sqrt((98.0665 / 0.119) * (98.0665 / 0.117))
        self.assertAlmostEqual(fabrics.ea_secant("F3"), ea, places=9)

    def test_ladder_ends_on_target_in_at_most_doubling_steps(self):
        for ea in (831.0, 1827.0, 4785.0, 120.0):
            L = m4a.ladder(ea)
            self.assertAlmostEqual(L[-1], ea, places=9)
            for p, q in zip(L, L[1:]):
                self.assertLessEqual(q / p, 2.0 + 1e-12)

    def test_specimen_mass_is_the_tabled_weight(self):
        sp = m4a.FabricDisc("F9", 150.0, 0.0075)
        kg_m2 = sp.mass.sum() / sp.area.sum()
        self.assertAlmostEqual(kg_m2, fabrics.weight("F9") / 1000, places=12)
        self.assertAlmostEqual(sp.Gs, 67.0)

    def test_scores_reproduce_the_papers_optitex_column(self):
        meas = [fabrics.kd(c) for c in fabrics.CODES]
        s = m4a.scores(m4a.OPTITEX["KES 0.6"], meas)
        self.assertAlmostEqual(s["rmse"], 0.0670, places=3)
        # Table 5's printed r for the FAST columns is reproduced from Table 6 within 0.01; its KES
        # columns (0.910, 0.912, 0.900, 0.899) are not (0.94, 0.92, 0.93, 0.94 recomputed), a
        # discrepancy inside the source, recorded in results.txt and LOG.md
        for k, r in (("FAST 0.2", 0.868), ("FAST 0.4", 0.861), ("FAST 0.6", 0.897), ("FAST 0.8", 0.915)):
            self.assertAlmostEqual(m4a.scores(m4a.OPTITEX[k], meas)["r"], r, delta=0.011)

    def test_results_match_a_fresh_report_of_the_cache_free_fields(self):
        p = EXP / "results.json"
        if not p.exists():
            self.skipTest("no results yet")
        res = json.loads(p.read_text())
        meas = [res["measured"][c] for c in fabrics.CODES]
        s = m4a.scores([res["lowest"][c] for c in fabrics.CODES], meas)
        for k in ("r", "rho", "bias", "rmse"):
            self.assertAlmostEqual(s[k], res["scores"]["main"][k], places=12)


if __name__ == "__main__":
    unittest.main()
