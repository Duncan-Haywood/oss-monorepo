import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "setkappa"
spec = importlib.util.spec_from_file_location("setkappa_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def rows(pairs):
    """Synthetic training rows: (C-rate, kappa*) with an error grid whose minimum sits at kappa* = 40."""
    return [dict(crate=c, k_star=k, egrid=[abs(x - 40.0) / 100 for x in run.GRID]) for c, k in pairs]


class SetKappa(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(run.pset("Chen2020@1.265625x"), "Chen2020")
        self.assertEqual(run.crate("Chen2020@1.265625x"), 1.265625)

    def test_med_and_err(self):
        ks = run.calibrate(rows([(1.0, 30.0), (1.0, 50.0), (1.0, 45.0)]))
        self.assertEqual(ks["med"], 45.0)
        self.assertEqual(ks["err"], 40.0)
        self.assertEqual(ks["phys"], run.KAPPA)
        self.assertEqual(ks["line"], 45.0)   # no target current: falls back to med

    def test_line_reads_the_target_current(self):
        tr = rows([(1.2, 60.0), (1.3, 50.0), (1.4, 40.0)])
        self.assertAlmostEqual(run.calibrate(tr, 1.25)["line"], 55.0, places=9)
        self.assertEqual(run.calibrate(tr, 3.0)["line"], 0.0)   # clamped at 0

    def test_fresh_kappas_use_the_plan_calibration(self):
        cal = {"OKane2022": dict(med=38.61, err=52.5, line_a=169.4, line_s=-95.3)}
        k = run.fresh_kappas(cal, "OKane2022@1.28125x")
        self.assertAlmostEqual(k["line"], 169.4 - 95.3 * 1.28125, places=9)
        self.assertEqual(k["med"], 38.61)

    def test_verdicts(self):
        def pool(phys, med, line):
            return dict(err=dict(phys=phys, med=med, err=med, line=line))
        C = {run.CONDITIONS[0]: pool(0.06, 0.05, 0.05), run.CONDITIONS[1]: pool(0.02, 0.01, 0.01),
             run.CONDITIONS[2]: pool(0.10, 0.05, 0.04), run.CONDITIONS[3]: pool(0.09, 0.06, 0.05)}
        self.assertEqual(set(run.verdicts(C).values()), {"supported"})
        C[run.CONDITIONS[2]] = pool(0.10, 0.12, 0.13)
        C[run.CONDITIONS[3]] = pool(0.09, 0.11, 0.12)
        v = run.verdicts(C)
        self.assertEqual((v["H172"], v["H173"], v["H175"], v["H176"]), ("refuted",) * 4)


if __name__ == "__main__":
    unittest.main()
