import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pgsstack import G, exact_impulses, make_stack, run, step  # noqa: E402


class T(unittest.TestCase):
    def test_exact_impulses_are_weight_above(self):
        ex = exact_impulses(4, 0.1)
        self.assertAlmostEqual(ex[0], 4 * G * 0.1)
        self.assertAlmostEqual(ex[3], 1 * G * 0.1)

    def test_one_box_rests_with_weight_impulse(self):
        s = make_stack(1)
        step(s, 1 / 60, 1)
        self.assertAlmostEqual(s["lam"][1], G / 60, places=12)
        self.assertAlmostEqual(s["v"][1], 0.0, places=12)

    def test_converged_solver_matches_static_impulses(self):
        r = run(3, 2048)
        self.assertLess(r["lam_err"], 1e-6)
        self.assertLess(r["speed"], 1e-6)

    def test_free_fall_without_contact(self):
        s = make_stack(1)
        s["y"][1] += 5.0                      # separated: no contact
        step(s, 0.1, 10)
        self.assertAlmostEqual(s["v"][1], -G * 0.1)
        self.assertEqual(s["lam"][1], 0.0)

    def test_one_iteration_fails_on_tall_stack(self):
        r = run(8, 1)
        self.assertGreater(r["speed"], 0.1)

    def test_more_iterations_help_on_average(self):
        self.assertLess(run(6, 256)["speed"], run(6, 1)["speed"])

    def test_impulses_never_negative(self):
        r = run(5, 4)
        self.assertTrue(all(x >= 0 for x in r["lam"]))


if __name__ == "__main__":
    unittest.main()
