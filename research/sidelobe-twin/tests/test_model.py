import math
import random
import unittest

from sidelobe_twin.model import (ENBW, resp, sinc, db, undb, peak_sidelobe, width_3db, marcum_sf, thresh_power, amp, ghost_pfa,
                                 ghost_free_snr_db, ghost_zone_radius, pd_twin, pd_real)


def window_ft(window, x, n=20000):
    """Direct numerical Fourier transform of the window on t in [-1/2, 1/2], normalised to 1 at x = 0."""
    def w(t):
        if window == "rect":
            return 1.0
        a = 0.5 if window == "hann" else 0.54
        return a + (1 - a) * math.cos(2 * math.pi * t)
    tot = sum(w(-0.5 + (i + 0.5) / n) * math.cos(2 * math.pi * x * (-0.5 + (i + 0.5) / n)) for i in range(n)) / n
    z = sum(w(-0.5 + (i + 0.5) / n) for i in range(n)) / n
    return tot / z


def rician_sf_numeric(nu, t2, n=200000):
    """Integrate the Rician power density 2D: P(|nu+n|^2 > t2), n ~ CN(0,1), by radial integration in polar form."""
    # |y|^2 = p; density of p is exp(-(p+nu^2)) I0(2 nu sqrt(p)); integrate numerically with I0 from series
    def i0(z):
        s, term, k = 1.0, 1.0, 0
        while term > 1e-17 * s:
            k += 1
            term *= (z / 2) ** 2 / (k * k)
            s += term
        return s
    hi = t2 + nu * nu + 60
    h = (hi - t2) / n
    tot = 0.0
    for i in range(n):
        p = t2 + (i + 0.5) * h
        z = 2 * nu * math.sqrt(p)
        tot += math.exp(-(p + nu * nu)) * i0(z) * h
    return tot


class T(unittest.TestCase):
    def test_response_matches_window_transform(self):
        for w in ("rect", "hann", "hamming"):
            for x in (0.0, 0.4, 1.0, 1.7, 3.3):
                self.assertAlmostEqual(resp(w, x), window_ft(w, x), places=5)

    def test_known_peak_sidelobes(self):
        self.assertAlmostEqual(db(peak_sidelobe("rect")[0] ** 2), -13.26, places=2)
        self.assertAlmostEqual(db(peak_sidelobe("hann")[0] ** 2), -31.47, places=2)
        self.assertAlmostEqual(db(peak_sidelobe("hamming")[0] ** 2), -42.68, places=2)

    def test_rect_width(self):
        self.assertAlmostEqual(width_3db("rect"), 0.8859, places=3)

    def test_enbw(self):
        self.assertAlmostEqual(ENBW["hann"], 1.5)
        self.assertAlmostEqual(ENBW["hamming"], 1.3628, places=3)

    def test_marcum_limits(self):
        self.assertAlmostEqual(marcum_sf(0.0, 5.0), math.exp(-5.0), places=14)
        self.assertAlmostEqual(marcum_sf(1e-9, 5.0), math.exp(-5.0), places=8)
        self.assertGreater(marcum_sf(30.0, 14.0), 1 - 1e-12)

    def test_marcum_vs_integration(self):
        for nu, t2 in ((1.0, 4.0), (3.0, 13.8), (2.0, 8.0)):
            self.assertAlmostEqual(marcum_sf(nu, t2), rician_sf_numeric(nu, t2, 40000), places=5)

    def test_marcum_vs_simulation(self):
        rng = random.Random(5)
        nu, t2, n = 3.0, 13.8, 200000
        c = sum(abs(complex(nu + rng.gauss(0, math.sqrt(.5)), rng.gauss(0, math.sqrt(.5)))) ** 2 > t2 for _ in range(n))
        self.assertAlmostEqual(marcum_sf(nu, t2), c / n, delta=4 * math.sqrt(0.18 * 0.82 / n))

    def test_marcum_monotone(self):
        v = [marcum_sf(nu / 4, 13.8) for nu in range(0, 60)]
        self.assertTrue(all(b >= a - 1e-12 for a, b in zip(v, v[1:])))

    def test_twin_baseline_is_design_pfa(self):
        self.assertAlmostEqual(marcum_sf(0, thresh_power(1e-6)), 1e-6, places=12)

    def test_ghost_far_beyond_twin_for_rect(self):
        x = peak_sidelobe("rect")[1]
        self.assertGreater(ghost_pfa("rect", 30, x), 0.99)
        self.assertLess(ghost_pfa("rect", -20, x), 1.1e-6)

    def test_ghost_free_snr_is_inverse(self):
        for w in ("rect", "hann", "hamming"):
            x = peak_sidelobe(w)[1]
            s = ghost_free_snr_db(w, x, 1e-4)
            self.assertAlmostEqual(ghost_pfa(w, s, x), 1e-4, delta=2e-8)
            self.assertGreater(ghost_pfa(w, s + 0.1, x), 1e-4)

    def test_ghost_free_ordering(self):
        v = [ghost_free_snr_db(w, peak_sidelobe(w)[1], 1e-4) for w in ("rect", "hann", "hamming")]
        self.assertLess(v[0], v[1])
        self.assertLess(v[1], v[2])

    def test_ghost_free_gain_is_psl_plus_enbw(self):
        base = ghost_free_snr_db("rect", peak_sidelobe("rect")[1], 1e-4)
        for w in ("hann", "hamming"):
            gain = ghost_free_snr_db(w, peak_sidelobe(w)[1], 1e-4) - base
            self.assertAlmostEqual(gain, -db(peak_sidelobe(w)[0] ** 2) + db(peak_sidelobe("rect")[0] ** 2) + db(ENBW[w]), places=6)
            self.assertAlmostEqual(gain, 19.97 if w == "hann" else 30.76, places=2)

    def test_zone_radius_scales_sqrt_snr(self):
        r1 = ghost_zone_radius("rect", 30, 1e-4)
        r2 = ghost_zone_radius("rect", 50, 1e-4)
        self.assertAlmostEqual(r2 / r1, 10.0, delta=0.6)

    def test_zone_radius_beyond_ghost(self):
        r = ghost_zone_radius("rect", 40, 1e-4)
        self.assertLessEqual(ghost_pfa("rect", 40, r + 0.5), 1e-4)
        self.assertGreater(ghost_pfa("rect", 40, r - 0.5), 1e-4)

    def test_pd_real_reduces_to_twin_without_leakage(self):
        # at a null of the response the strong target leaks nothing; the weak target is seen exactly as the twin says
        self.assertAlmostEqual(pd_real("rect", 40, 13, 3.0), pd_twin("rect", 13), places=9)

    def test_pd_real_vs_simulation(self):
        rng = random.Random(9)
        w, sdb, wdb, x, n = "rect", 25.0, 10.0, 4.5, 150000
        sa, wa = amp(w, sdb) * resp(w, x), amp(w, wdb)
        t2 = thresh_power(1e-3)
        c = 0
        for _ in range(n):
            ph = rng.uniform(0, 2 * math.pi)
            y = complex(sa + wa * math.cos(ph) + rng.gauss(0, math.sqrt(.5)), wa * math.sin(ph) + rng.gauss(0, math.sqrt(.5)))
            c += abs(y) ** 2 > t2
        self.assertAlmostEqual(pd_real(w, sdb, wdb, x, 1e-3), c / n, delta=4 * math.sqrt(0.25 / n))


if __name__ == "__main__":
    unittest.main()
