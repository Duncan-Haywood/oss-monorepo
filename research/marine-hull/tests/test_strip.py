import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_strip_added_resistance.txt")


def pv_quadrature(dy, zz, nu, kmax=60.0, n=200000):
    """PV int_0^inf e^{k zz} cos(k dy) / (k - nu) dk by pole subtraction and the midpoint rule."""
    f = lambda k: math.exp(k * zz) * math.cos(k * dy)
    h = kmax / n
    s = sum((f((i + 0.5) * h) - f(nu)) / ((i + 0.5) * h - nu) * h for i in range(n))
    return s + f(nu) * math.log((kmax - nu) / nu)


class StripTests(unittest.TestCase):
    def test_e1_reference_values(self):
        # A&S 5.1: E1(1) = 0.2193839344; E1(i) = -Ci(1) + i (Si(1) - pi/2)
        self.assertAlmostEqual(st.e1(1.0).real, 0.2193839344, places=9)
        z = st.e1(1j)
        self.assertAlmostEqual(z.real, -0.3374039229, places=9)
        self.assertAlmostEqual(z.imag, 0.9460830704 - math.pi / 2, places=9)
        # continued-fraction branch against the asymptotic series z e^z E1(z) ~ 1 - 1/z + 2/z^2
        for z in (complex(40.0, 10.0), complex(-5.0, 45.0)):
            self.assertLess(abs(z * cmath_exp(z) * st.e1(z) - (1 - 1 / z + 2 / z ** 2)), 1e-4)

    def test_pv_integral_closed_form(self):
        for dy, zz, nu in ((0.3, -0.5, 1.0), (2.0, -0.2, 1.5)):
            w = nu * complex(zz, dy)
            closed = (cmath_exp(w) * st.e1(w)).real - math.pi * math.exp(nu * zz) * math.sin(nu * dy)
            self.assertAlmostEqual(closed, pv_quadrature(dy, zz, nu), places=4)

    def test_green_free_surface_and_radiation(self):
        nu, b, c = 1.3, 0.4, -0.6
        h = 1e-6
        for y in (0.1, 1.0, 3.0):
            gz = (st.green(y, -h, b, c, nu) - st.green(y, -3 * h, b, c, nu)) / (2 * h)
            g0 = st.green(y, -2 * h, b, c, nu)
            self.assertLess(abs(gz - nu * g0) / abs(g0), 1e-4)
        y, z = 60.0, -0.3
        ref = 2j * math.pi * math.exp(nu * (z + c)) * complex(math.cos(nu * (y - b)), -math.sin(nu * (y - b)))
        self.assertLess(abs(st.wave_part(y, z, b, c, nu) / ref - 1.0), 0.01)

    def test_gradient_matches_finite_difference(self):
        nu, b, c, y, z, h = 0.9, 0.3, -0.5, 0.7, -0.2, 1e-6
        gy, gz = st.grad_green(y, z, b, c, nu)
        fy = (st.green(y + h, z, b, c, nu) - st.green(y - h, z, b, c, nu)) / (2 * h)
        fz = (st.green(y, z + h, b, c, nu) - st.green(y, z - h, b, c, nu)) / (2 * h)
        self.assertLess(abs(gy - fy), 1e-5)
        self.assertLess(abs(gz - fz), 1e-5)

    def test_section_energy_balance(self):
        # damping from the pressure on the hull equals the energy flux of the radiated waves
        nodes = st.wigley_section(0.73, 1.0, 16)
        for nu in (0.3, 1.0, 3.0):
            phi, amp = st.section_heave(nodes, nu)
            self.assertGreater(-phi.real, 0.0)
            self.assertLess(abs(phi.imag / abs(amp) ** 2 - 1.0), 0.02)

    def test_long_waves_and_zero_speed(self):
        hull = st.WigleyStrip(4.0, 0.4, 0.274, n_stations=12, n_panels=10, table=None)
        k = 2 * math.pi / 80.0
        z, th, r, _ = hull.response(math.sqrt(k * st.G), 1.0)
        self.assertAlmostEqual(abs(z), 1.0, delta=0.02)
        self.assertAlmostEqual(abs(th) / k, 1.0, delta=0.05)
        self.assertLess(r / (st.RHO * st.G * 0.4 ** 2 / 4.0), 1e-3)
        # added resistance is positive near the resonance
        k = 2 * math.pi / 4.0
        self.assertGreater(hull.response(math.sqrt(k * st.G), 1.0)[2], 0.0)

    def test_results_file(self):
        with open(RESULTS) as f:
            text = f.read()
        self.assertIn("## D. foil-favourable", text)
        m = re.search(r"share 0\.25: calm ([\d.]+) km .* strip ([\d.]+) km \(([-+\d.]+)%\)", text)
        self.assertIsNotNone(m)
        self.assertLess(float(m.group(2)), float(m.group(1)))
        for line in text.splitlines():
            if line.startswith("share 0.25, H_lim"):
                self.assertIn("monohull leads to 200 W: True", line)


def cmath_exp(z):
    import cmath
    return cmath.exp(z)


if __name__ == "__main__":
    unittest.main()
