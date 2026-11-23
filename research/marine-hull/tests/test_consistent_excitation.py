"""Milestone 7zza: `NearField.excitation` (exciting force by sectional pressure integration) and
`WigleyStrip.response(excitation=...)`, and the pinned results."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import panel as pn  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_consistent_excitation.txt")


def omega(lam, l):
    return math.sqrt(2.0 * math.pi * st.G / (lam * l))


_H = []


def hull():
    if not _H:
        h = st.WigleyStrip(3.0, 0.3, 0.1875, n_stations=10, n_panels=8)
        keys = sorted(set(h.ratio), key=repr)
        _H.append((h, nf.NearField(h, field=nf.FieldTable(keys, n_panels=8, nu_t=st.NU_T[::6], processes=1))))
    return _H[0]


class ExcitationTests(unittest.TestCase):
    def test_rv_with_strip_froude_krylov_is_the_relative_motion_force(self):
        h, n = hull()
        w = omega(1.0, 3.0)
        s = pn.strip_zero_speed(h, w)
        f3, f5 = n.excitation(w, "rv", "strip")
        # the strip table interpolates the section coefficients in log nu T; the direct solve does not
        self.assertLess(abs(f3 - s["F3"]) / abs(s["F3"]), 0.01)
        self.assertLess(abs(f5 - s["F5"]) / abs(s["F5"]), 0.01)

    def test_exact_froude_krylov_of_a_long_wave_is_the_hydrostatic_force(self):
        h, n = hull()
        w = omega(40.0, 3.0)
        k = w * w / st.G
        f3, _ = n.excitation(w, "rv", "exact")
        c33, _ = h.restoring()
        self.assertLess(abs(abs(f3) / c33 - 1.0), 0.02 + 2 * k * h.dm)

    def test_response_excitation_override(self):
        h, _ = hull()
        w = omega(1.2, 3.0)
        s = pn.strip_zero_speed(h, w)
        z0, t0, _, _ = h.response(w, 0.0)
        z1, t1, _, _ = h.response(w, 0.0, excitation=(s["F3"], s["F5"]))
        self.assertAlmostEqual(abs(z1 - z0), 0.0, places=10)
        self.assertAlmostEqual(abs(t1 - t0), 0.0, places=10)
        z2, t2, _, _ = h.response(w, 0.0, excitation=(2 * s["F3"], 2 * s["F5"]))
        self.assertAlmostEqual(abs(z2 - 2 * z0), 0.0, places=10)

    def test_unknown_options_raise(self):
        h, n = hull()
        with self.assertRaises(ValueError):
            n.excitation(omega(1.0, 3.0), "nope")
        with self.assertRaises(ValueError):
            n.excitation(omega(1.0, 3.0), "rv", "nope")


class PinnedResultsTests(unittest.TestCase):
    def test_all_expectation_lines_present(self):
        with open(RESULTS) as f:
            text = f.read()
        for tag in ("E0", "E1", "E2", "E3", "E4", "E5", "E6"):
            self.assertRegex(text, rf"\n{tag} .* -> (held|refuted)")


if __name__ == "__main__":
    unittest.main()
