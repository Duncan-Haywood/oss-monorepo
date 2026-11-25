"""Milestone 7zzg: pitch-coefficient sensitivity of the Wigley III Fn 0.2 added-resistance peak
(`experiments/run_pitch_sensitivity.py`)."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

import run_pitch_sensitivity as ps  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_pitch_sensitivity.txt")


def small_hull():
    h = st.ModifiedWigleyStrip(ps.L, ps.B, ps.D, n_stations=16, kyy=ps.KYY, n_panels=8, alpha=0.0)
    h.set_viscous(ps.Z3, ps.Z5)
    return h


class PitchSensitivityTests(unittest.TestCase):
    def test_zero_adjust_is_identity(self):
        """pitch_adjust (0, 0) leaves every output of `response` unchanged."""
        h = small_hull()
        w, u = ps.head_omega(1.0), 0.2 * (st.G * ps.L) ** 0.5
        self.assertEqual(h.response(w, u), h.response(w, u, pitch_adjust=(0.0, 0.0)))

    def test_pitch_damping_has_no_speed_term(self):
        """P1, as read from the code: the strip's B55 at fixed encounter frequency does not change with speed
        (the -U da/dx terms integrate out of h22's imaginary part); A55 grows with U (its U^2/we^2 A33 term)."""
        h = small_hull()
        we = 2.2 / (ps.L / st.G) ** 0.5
        a0, b0 = ps.pitch_coefficients(h, we, 0.0)
        a4, b4 = ps.pitch_coefficients(h, we, 0.4 * (st.G * ps.L) ** 0.5)
        self.assertAlmostEqual(b4 / b0, 1.0, delta=0.01)
        self.assertGreater(a4, a0)

    def test_extra_pitch_damping_lowers_pitch(self):
        """A positive dB55 reduces the pitch amplitude near the pitch peak, and the GB added resistance with it."""
        h = small_hull()
        w, u = ps.head_omega(1.0), 0.2 * (st.G * ps.L) ** 0.5
        we = w + w * w / st.G * u
        _, b55 = ps.pitch_coefficients(h, we, u)
        z0, t0, r0, _ = h.response(w, u)
        z1, t1, r1, _ = h.response(w, u, pitch_adjust=(0.0, 0.5 * b55))
        self.assertLess(abs(t1), abs(t0))
        self.assertLess(r1, r0)

    def test_results_file(self):
        """The committed results reproduce 7zu's base peaks and record the headline sensitivities."""
        with open(RESULTS) as f:
            txt = f.read()
        self.assertIn("P0 identity True; base GB+F 17.382 (7zu 17.38), NF-PG 18.006 (7zu 18.01): True", txt)
        self.assertIn("GB+F 24.51 at 0.89 ratio 1.104; NF-PG 22.31 at 0.90 ratio 1.005", txt)
        self.assertIn("fn 0.3 B    x0.810", txt)
        self.assertIn("P4 best bracket cell with heave within 15%: A x1.6, B x0.4, ratio 4.788; "
                      "none at 0.95 or above: False", txt)


if __name__ == "__main__":
    unittest.main()
