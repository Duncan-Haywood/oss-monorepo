import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

from marine_hull import waves as wv  # noqa: E402
import figure_wave_added_resistance as fw  # noqa: E402
import run_wave_added_resistance as rw  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_wave_added_resistance.txt")


class WaveAddedResistanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()

    def test_bessel_against_abramowitz_stegun_tables(self):
        for f, x, ref in ((wv.bessel_i1, 1.0, 0.5651591040), (wv.bessel_i1, 5.0, 24.33564214),
                          (wv.bessel_k1, 1.0, 0.6019072302), (wv.bessel_k1, 5.0, 0.004044613445)):
            self.assertAlmostEqual(f(x) / ref, 1.0, delta=1e-6)

    def test_reflection_ratio_limits(self):
        # short waves reflect fully, very long waves not at all; large argument must not overflow
        self.assertAlmostEqual(wv.reflection_ratio(50.0), 1.0, places=9)
        self.assertLess(wv.reflection_ratio(0.01), 1e-6)

    def test_spectrum_integrates_to_hs_squared_over_16(self):
        for t01 in (4.0, 8.0, 12.0):
            m0 = wv.trap([wv.ittc_spectrum(w, 2.0, t01) for w in wv.OMEGAS], wv.OMEGAS)
            self.assertAlmostEqual(m0 / 0.25, 1.0, delta=0.005)

    def test_added_resistance_scales_with_hs_squared(self):
        a = wv.spectral_parts(1.0, 6.0, 4.0, 0.4, 0.274, 4 / 9, hs=1.0)
        b = wv.spectral_parts(1.0, 6.0, 4.0, 0.4, 0.274, 4 / 9, hs=2.0)
        for x, y in zip(a, b):
            self.assertAlmostEqual(y / x, 4.0, places=9)

    def test_motion_peak_follows_g4(self):
        # at omega_bar = 1 the shape factor is 1, so r_aw = a1 Fr^1.5 exp(-3.5 Fr)
        u, length, beam, cb = 1.0, 4.0, 0.4, 4 / 9
        fr = wv.froude(u, length)
        omega = 1.17 * fr ** -0.143 / ((length / wv.G) ** 0.5 * 0.25 ** (1 / 3))
        expect = 60.3 * cb ** 1.34 * fr ** 1.5 * 2.718281828459045 ** (-3.5 * fr)
        self.assertAlmostEqual(wv.raw_motion(omega, u, length, beam, cb), expect, places=9)

    def test_results_headline(self):
        self.assertIn("share 0.25: monohull 802.9 km (-2.52%)", self.text)
        self.assertIn("share 1: monohull 746.5 km (-9.37%)", self.text)
        self.assertNotIn("leads central foil to 200 W: False", self.text)
        self.assertEqual(self.text.count("at or below 200 W: 0"), 12)
        self.assertIn("pooled share of hours with Hs <= 0.3 m: 2.4%", self.text)

    def test_wave_loss_shrinks_as_hotel_load_grows(self):
        rows = fw.parse_curves(self.text)[0.25]
        ratios = [w / c for _, c, w in rows]
        self.assertLess(ratios[0], ratios[-1])
        self.assertTrue(all(r < 1.0 for r in ratios))

    def test_t01_conversion(self):
        self.assertAlmostEqual(rw.t01_of(("x", 1.0, 10.0, 6.0), "apd"), 6.5)
        self.assertAlmostEqual(rw.t01_of(("x", 1.0, 10.0, 6.0), "dpd"), 7.7)


if __name__ == "__main__":
    unittest.main()
