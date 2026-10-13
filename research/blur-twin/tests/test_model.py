import random
import unittest

from blur_twin.model import (profile, profile_sim, peak, pixels, box_output, q, qinv, detect_prob,
                             speed_limit_peak, speed_limit_box, mc_detect,
                             box_output_len_d, speed_limit_box_len_d)


class T(unittest.TestCase):
    def test_profile_matches_simulation(self):
        for w, d in ((6, 3), (6, 6), (6, 20), (2, 40)):
            for x in (-1, 0.5, 2, 5.9, 7, 13, 30, 45):
                self.assertAlmostEqual(profile(x, w, d), profile_sim(x, w, d), delta=2.0 / 2000 + 1e-9)

    def test_peak_and_energy(self):
        w = 6.0
        for d in (0.0, 3.0, 6.0, 15.0, 60.0):
            xs = [i * 0.01 - 5 for i in range(int((w + d + 10) / 0.01))]
            ps = [profile(x, w, d) for x in xs]
            self.assertAlmostEqual(max(ps), peak(w, d), delta=0.01)
            self.assertAlmostEqual(sum(ps) * 0.01, w, delta=0.05)     # blur conserves energy C w

    def test_full_length_box_output(self):
        # a box covering the whole smear (length >= w + d + 1 px) collects all of C w: output C w / sqrt(L)
        w = 6
        for d in (0, 10, 30):
            v = pixels(float(w), float(d), hi=w + d + 8)
            L = w + d + 1
            self.assertAlmostEqual(box_output(v, L), w / L ** 0.5, delta=0.02)

    def test_cumulative_matches_quadrature(self):
        from blur_twin.model import cumulative
        for w, d in ((6, 3), (6, 6), (2, 40)):
            for x in (-1.0, 1.0, 4.0, 10.0, 50.0):
                a, n = -2.0, 4000
                ref = sum(profile(a + (j + 0.5) * (x - a) / n, w, d) for j in range(n)) * (x - a) / n if x > a else 0.0
                self.assertAlmostEqual(cumulative(x, w, d), ref, delta=0.01)

    def test_box_of_length_d_closed_form_and_optimality(self):
        w = 6
        for d in (6, 9, 12, 24, 48):
            v = pixels(float(w), float(d), hi=w + d + 8)
            self.assertAlmostEqual(box_output(v, d), box_output_len_d(w, d), places=9)
            if d >= 2 * w:                      # for w <= d < 2w the best integer length is d + 2
                best = max(box_output(v, L) for L in range(1, w + d + 6))
                self.assertAlmostEqual(best, box_output(v, d), places=9)

    def test_box_limit_bisection(self):
        w, c = 6.0, 10.0
        d = speed_limit_box_len_d(w, c, 1.0, 1e-3, 0.9)
        self.assertAlmostEqual(detect_prob(box_output_len_d(w, d, c), 1.0, 1e-3), 0.9, places=6)
        self.assertIsNone(speed_limit_box_len_d(w, 0.5, 1.0, 1e-3, 0.9))

    def test_qinv(self):
        self.assertAlmostEqual(q(qinv(1e-3)), 1e-3, places=10)
        self.assertAlmostEqual(qinv(0.5), 0.0, places=8)

    def test_limits_hit_target_pd(self):
        for c in (8.0, 12.0):
            w, s, a = 6.0, 1.0, 1e-3
            dp = speed_limit_peak(w, c, s, a, 0.9)
            self.assertAlmostEqual(detect_prob(peak(w, dp, c), s, a), 0.9, places=6)
            db = speed_limit_box(w, c, s, a, 0.9)
            self.assertAlmostEqual(detect_prob(w * c / (w + db) ** 0.5, s, a), 0.9, places=6)

    def test_mc_matches_analytic(self):
        p = detect_prob(3.0, 1.0, 1e-2)
        self.assertAlmostEqual(mc_detect(3.0, 1.0, 1e-2, 20000, random.Random(1)), p, delta=0.012)


if __name__ == "__main__":
    unittest.main()
