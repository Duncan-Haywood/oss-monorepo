"""Milestone 7zw: viscous damping on the relative vertical velocity (`strip.WigleyStrip.relative_damping`)."""
import cmath
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_relative_damping.txt")
TINY = st.NU_T[::6]


def hull(cls=st.ModifiedWigleyStrip):
    keys = sorted(set(cls(3.0, 0.3, 0.1875, n_stations=10, table=object()).ratio), key=repr)
    return cls(3.0, 0.3, 0.1875, rho=1000.0, n_stations=10,
               table=st.SectionTable(keys, n_panels=8, nu_t=TINY, processes=1))


class RelativeDampingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = hull()
        cls.u = 0.2 * math.sqrt(st.G * 3.0)

    def resp(self, lam, z3, z5, rel):
        h = self.h
        h.set_viscous(z3, z5)
        h.relative_damping = rel
        try:
            return h.response(math.sqrt(2.0 * math.pi * st.G / (lam * 3.0)), self.u)
        finally:
            h.relative_damping = False

    def test_default_is_absolute(self):
        self.assertFalse(st.WigleyStrip(4.0, 0.4, 0.2, table=object()).relative_damping)
        self.assertFalse(self.h.relative_damping)

    def test_zero_damping_forms_coincide(self):
        for lam in (0.8, 1.2, 4.0):
            a, b = self.resp(lam, 0.0, 0.0, False), self.resp(lam, 0.0, 0.0, True)
            for x, y in zip(a, b):
                self.assertEqual(x, y)

    def test_long_wave_relative_velocity_vanishes(self):
        """In long waves the hull follows the wave, so the heave relative velocity is far below the absolute one."""
        h, lam = self.h, 16.0
        z, th, _, we = self.resp(lam, 0.0375, 0.0, True)
        w = math.sqrt(2.0 * math.pi * st.G / (lam * 3.0))
        k = w * w / st.G
        c = [h.rho * st.G * 2.0 * hb for hb in h.hb]
        smith = math.exp(-k * h.dm)
        vz = [1j * w * smith * cmath.exp(1j * k * x) - (1j * we * z + 1j * we * x * th - self.u * th) for x in h.x]
        v3 = sum(ci * v for ci, v in zip(c, vz)) / sum(c)
        self.assertLess(abs(v3), 0.05 * abs(we * z))

    def test_relative_damping_damps_less_at_resonance(self):
        """Near the heave resonance the wave's own velocity offsets part of the force: heave is larger."""
        a = self.resp(1.1, 0.0375, 0.0, False)
        b = self.resp(1.1, 0.0375, 0.0, True)
        c0 = self.resp(1.1, 0.0, 0.0, False)
        self.assertLess(abs(a[0]), abs(b[0]))
        self.assertLess(abs(b[0]), abs(c0[0]) + 1e-12)


@unittest.skipUnless(os.path.exists(RESULTS), "results_relative_damping.txt not generated")
class ResultsTests(unittest.TestCase):
    def test_reproduces_7zu_and_reports_every_expectation(self):
        text = open(RESULTS).read()
        self.assertIn("W0 absolute rows against 7zu", text)
        self.assertRegex(text, r"W0 .* -> held")
        for w in ("W1", "W2", "W3", "W4", "W5"):
            self.assertTrue(re.search(w + r" .*-> (held|refuted)", text), w)
        self.assertIn("(elapsed", text)


if __name__ == "__main__":
    unittest.main()
