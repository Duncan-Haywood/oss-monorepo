import unittest
import numpy as np
from free_f32bounce import model as m


def start(n=12, seed=1):
    p, d = m.initial_states(n, seed, burn=5)
    return p.astype(np.float32).astype(np.float64), d.astype(np.float32).astype(np.float64)


class T(unittest.TestCase):
    def test_stays_inside_table_and_outside_circle(self):
        p, d = start()
        r = m.run(p, d, 300, np.float64)
        self.assertTrue(((r["pos"] > -1e-9) & (r["pos"] < 1 + 1e-9)).all())
        dist = np.hypot(r["pos"][..., 0] - m.C, r["pos"][..., 1] - m.C)
        self.assertTrue((dist > m.R - 1e-9).all())

    def test_speed_preserved_in_float64(self):
        p, d = start()
        r = m.run(p, d, 300, np.float64)
        self.assertTrue(np.allclose((r["d"] ** 2).sum(axis=1), 1.0, atol=1e-9))

    def test_float32_rounds(self):
        p, d = start()
        a = m.run(p, d, 3, np.float32)["pos"]
        b = m.run(p, d, 3, np.float64)["pos"]
        e = np.abs(a - b).max()
        self.assertGreater(e, 0)
        self.assertLess(e, 1e-5)

    def test_head_on_wall_reflects(self):
        r = m.run(np.array([[0.1, 0.9]]), np.array([[-1.0, 0.0]]), 2, np.float64)
        self.assertEqual(list(r["surf"][:, 0]), [0, 1])
        self.assertAlmostEqual(r["path"][0, 0], 0.1)

    def test_circle_hit_and_bounce_back(self):
        r = m.run(np.array([[0.05, 0.5]]), np.array([[1.0, 0.0]]), 1, np.float64)
        self.assertEqual(r["surf"][0, 0], 4)
        self.assertAlmostEqual(r["pos"][0, 0, 0], 0.25)
        self.assertAlmostEqual(r["d"][0, 0], -1.0)

    def test_mean_free_path_matches_cauchy(self):
        p, d = start(400, 5)
        r = m.run(p, d, 400, np.float64)
        self.assertAlmostEqual(r["path"].mean(), m.mean_free_path_exact(), delta=0.01)

    def test_exact_formula(self):
        self.assertAlmostEqual(m.mean_free_path_exact(0.0), np.pi / 4.0)

    def test_perturbation_size(self):
        q = m.perturbed(np.zeros((7, 2)), 1e-6, 0)
        self.assertTrue(np.allclose(np.linalg.norm(q, axis=1), 1e-6))

    def test_departure_helpers(self):
        a = np.zeros((5, 2, 2)); b = a.copy(); b[3:, 0, 0] = 1.0
        n = m.departure_index(a, b, 0.5)
        self.assertEqual(n[0], 4.0)
        self.assertTrue(np.isnan(n[1]))
        sa = np.zeros((5, 2), dtype=np.int8); sb = sa.copy(); sb[1:, 1] = 2
        s = m.surface_departure(sa, sb)
        self.assertTrue(np.isnan(s[0]) and s[1] == 2.0)

    def test_larger_perturbation_leaves_sooner(self):
        p, d = start(30, 3)
        ref = m.run(p, d, 60, np.float64)
        big = m.departure_index(ref["pos"], m.run(m.perturbed(p, 1e-4, 1), d, 60, np.float64)["pos"], 0.1)
        small = m.departure_index(ref["pos"], m.run(m.perturbed(p, 1e-10, 1), d, 60, np.float64)["pos"], 0.1)
        self.assertLess(np.nanmedian(big), np.nanmedian(small))


if __name__ == "__main__":
    unittest.main()
