import math, unittest
from osrobot_lipsweep import model as m


def peak_max(v=0.2, **over):
    base = dict(K_LIP=m.K_LIP, KP=m.KP, KD=m.KD, LEAD=m.LEAD, X_DEPTH=m.X_DEPTH)
    try:
        for k, x in over.items(): setattr(m, k, x)
        return m.summarise(m.Design("camera", v), 0.03, range(60))["peak_max"]
    finally:
        for k, x in base.items(): setattr(m, k, x)


class T(unittest.TestCase):
    def test_constants_restored(self):
        before = (m.K_LIP, m.KP, m.LEAD)
        peak_max(K_LIP=100)
        self.assertEqual(before, (m.K_LIP, m.KP, m.LEAD))

    def test_softer_lips_lower_peak(self):
        self.assertLess(peak_max(K_LIP=100), peak_max(K_LIP=6400))

    def test_shorter_lead_lower_peak(self):
        self.assertLess(peak_max(LEAD=0.01), peak_max(LEAD=0.05))

    def test_peak_never_far_above_stall_push_with_base_lips(self):
        self.assertLessEqual(peak_max(), m.KP * m.LEAD * 0.2 + 0.5)

    def test_worst_peak_matches_series_spring_equilibrium(self):
        # Independent closed form (impedance control against a spring wall, Siciliano et al. 2009 ch. 9):
        # F = min(KP*LEAD*v, KP*K_LIP*X_DEPTH/(KP+K_LIP)) for lips no stiffer than the loop.
        # Added after quality audit 2026-11-12, where four core-physics mutations survived the ordinal tests.
        for k in (100, 200, 400, 800):
            expected = min(m.KP * m.LEAD * 0.2, m.KP * k * m.X_DEPTH / (m.KP + k))
            self.assertAlmostEqual(peak_max(K_LIP=k), expected, delta=0.05, msg=f"K_LIP={k}")

    def test_lead_plateau_is_the_depth_clamp(self):
        # The README's 4.01 N plateau for long leads comes from the X_DEPTH clamp: without it the stall push returns.
        self.assertAlmostEqual(peak_max(LEAD=0.1), 4.0, delta=0.05)
        self.assertAlmostEqual(peak_max(LEAD=0.1, X_DEPTH=1.0), m.KP * 0.1 * 0.2, delta=0.1)

    def test_deterministic(self):
        d = m.Design("camera", 0.2)
        self.assertEqual(m.run_trial(d, 0.03, 3), m.run_trial(d, 0.03, 3))


if __name__ == "__main__":
    unittest.main()
