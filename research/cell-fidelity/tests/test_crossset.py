import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "crossset"
spec = importlib.util.spec_from_file_location("crossset_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


class CrossSet(unittest.TestCase):
    def test_fit_intercept_recovers_a_with_the_slope_held(self):
        a, s = 0.41, run.S_FROZEN
        tr = []
        for k in range(1, 9):
            l_law, n_li = 0.003 * k, 1.0 + 0.02 * k
            tr.append((l_law, l_law / math.exp(a + s * math.log(l_law / n_li)), n_li))
        self.assertAlmostEqual(run.fit_intercept(tr), a, places=12)
        # and the corrected loss then equals the truth
        for lw, lt, n in tr:
            self.assertAlmostEqual(run.CM.corrected(lw, n, run.fit_intercept(tr), s), lt, places=12)

    def test_fit_intercept_skips_bad_triples(self):
        self.assertIsNone(run.fit_intercept([(None, 0.1, 1.0), (0.1, 0.0, 1.0)]))

    def test_split_is_fixed_disjoint_and_complete(self):
        cal, held = run.split(64)
        self.assertEqual(len(cal), run.N_CAL)
        self.assertEqual(sorted(cal + held), list(range(64)))
        self.assertEqual(run.split(64), (cal, held))
        self.assertNotEqual(run.split(64, seed=1)[0], cal)

    def test_verdicts_on_a_toy_table(self):
        good = dict(rho_one=0.9, rho_sqrt=0.6, rho_two=0.8, lerr_one=0.03, lerr_frozen=0.1, gap_one=0.0)
        bad = dict(rho_one=0.5, rho_sqrt=0.6, rho_two=0.8, lerr_one=0.2, lerr_frozen=0.03, gap_one=0.03)
        v = run.verdicts({"a": good, "b": dict(good), "c": dict(good)})
        self.assertEqual([v[h] for h in ("H126", "H127", "H128", "H129", "H130")], ["supported"] * 5)
        v = run.verdicts({"a": bad, "b": dict(bad), "c": dict(good)})
        self.assertEqual([v[h] for h in ("H126", "H127", "H128", "H129", "H130")],
                         ["refuted", "refuted", "mixed", "refuted", "refuted"])
        v = run.verdicts({"a": bad, "b": dict(bad), "c": dict(bad)})
        self.assertEqual(v["H128"], "refuted")


if __name__ == "__main__":
    unittest.main()
