import math, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_rodmodes import modes as m
from selfrep_rodbeam import beam as rb


class T(unittest.TestCase):
    def test_static_deflection_link(self):
        # with a negligible rod mass, f = (1/2pi) sqrt(g / static sag) for load M g
        M = 100.0
        d, L = .02, .42
        sag = rb.deflection("steel", d, L, M * 9.80665)
        self.assertAlmostEqual(m.frequency("steel", d, L, M), math.sqrt(9.80665 / sag) / (2 * math.pi), delta=0.01 * m.frequency("steel", d, L, M))

    def test_massless_carriage_is_beam_mode(self):
        # exact first mode of a simply supported beam: (pi/2) sqrt(EI/(rho A L^4)); Rayleigh within 2%
        d, L = .008, .42
        E, rho = m.MATERIALS["steel"][:2]
        exact = (math.pi / 2) * math.sqrt(E * rb.inertia(d) / (rho * math.pi * d * d / 4 * L ** 4))
        self.assertLess(abs(m.rod_only_frequency("steel", d, L) / exact - 1), 0.02)

    def test_min_diameter_tight(self):
        for mat in m.MATERIALS:
            d = m.min_diameter(mat, 60.0, .42)
            self.assertGreaterEqual(m.frequency(mat, d, .42), 60.0 - 1e-6)
            self.assertLess(m.frequency(mat, d * .99, .42), 60.0)

    def test_heavy_carriage_recovers_stiffness_ratio(self):
        # M >> rod mass: f ~ sqrt(k), so the diameter ratio tends to the fourth root of the modulus ratio
        M = 1e4
        ds, dw = m.min_diameter("steel", 20.0, .42, M), m.min_diameter("hardwood", 20.0, .42, M)
        self.assertAlmostEqual(dw / ds, (200 / 10) ** .25, delta=0.01)

    def test_light_carriage_penalty_is_milder(self):
        # rod-dominated: diameter ratio tends to sqrt(E_s/rho_s / (E_w/rho_w)) < the stiffness-only ratio
        ds, dw = m.min_diameter("steel", 400.0, .42, 0.0), m.min_diameter("hardwood", 400.0, .42, 0.0)
        self.assertAlmostEqual(dw / ds, math.sqrt((200e9 / 7850) / (10e9 / 700)), delta=0.01)
        self.assertLess(dw / ds, (200 / 10) ** .25)


if __name__ == "__main__":
    unittest.main()
