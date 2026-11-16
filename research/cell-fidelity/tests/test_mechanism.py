import importlib.util
import math
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "mechanism"
spec = importlib.util.spec_from_file_location("mechanism_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


class Mechanism(unittest.TestCase):
    def test_kappa_is_alpha_f_over_rt(self):
        self.assertAlmostEqual(run.KAPPA, 25.3, delta=0.05)

    def test_increments_invert_a_cumulative_series(self):
        self.assertEqual(run.increments([1.0, 3.0, 6.0]), [1.0, 2.0, 3.0])

    def test_rate_index_is_the_exponential_times_time_at_constant_terms(self):
        t = [0.0, 10.0, 20.0]
        got = run.rate_index(t, [-0.02] * 3, [0.003] * 3, [1000.0] * 3)
        self.assertAlmostEqual(got, 20.0 * 1000.0 * math.exp(-run.KAPPA * (-0.017)), places=6)

    def test_a_10_mV_rise_in_any_term_slows_plating_by_the_same_factor(self):
        lo = dict(u_end=0.09, eint_end=-0.11, sei_end=0.002, ce_end=800.0, t_ch=1000.0)
        for k in ("u_end", "eint_end", "sei_end"):
            hi = dict(lo, **{k: lo[k] + 0.01})
            d = run.decompose(lo, hi)
            self.assertAlmostEqual(sum(d.values()), -0.253, delta=0.002)

    def test_decompose_reads_concentration_and_time_as_log_ratios(self):
        lo = dict(u_end=0.09, eint_end=-0.11, sei_end=0.002, ce_end=800.0, t_ch=1000.0)
        d = run.decompose(lo, dict(lo, ce_end=400.0, t_ch=500.0))
        self.assertAlmostEqual(d["ce"], math.log(0.5))
        self.assertAlmostEqual(d["time"], math.log(0.5))

    def test_design_picks_are_fixed_and_distinct(self):
        p = run.picks(64, 12)
        self.assertEqual(p, run.picks(64, 12))
        self.assertEqual(len(set(p)), 12)


if __name__ == "__main__":
    unittest.main()
