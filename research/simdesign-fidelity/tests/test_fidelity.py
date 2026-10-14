import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_fidelity.models import Material, Case, beam_eb, beam_timoshenko, fe2d, fe3d
from simdesign_fidelity.design import size_h, evaluate_design

M = Material()


class T(unittest.TestCase):
    def test_euler_closed_form(self):
        d, s = beam_eb(100, 10, 20, 100, M)
        self.assertAlmostEqual(d, 100 * 100 ** 3 / (3 * 3000 * 20 * 1000 / 12))
        self.assertAlmostEqual(s, 100 * 90 * 5 / (20 * 1000 / 12))

    def test_timoshenko_adds_shear(self):
        self.assertGreater(beam_timoshenko(40, 20, 20, 100, M)[0], beam_eb(40, 20, 20, 100, M)[0])

    def test_slender_2d_matches_euler(self):
        d, s = fe2d(200, 10, 20, 100, M, n=6)
        de, se = beam_eb(200, 10, 20, 100, M)
        self.assertAlmostEqual(d / de, 1.0, delta=0.01)
        self.assertAlmostEqual(s / se, 1.0, delta=0.02)

    def test_stubby_2d_matches_timoshenko_better_than_euler(self):
        d, _ = fe2d(40, 20, 20, 100, M, n=8)
        self.assertLess(abs(d - beam_timoshenko(40, 20, 20, 100, M)[0]), abs(d - beam_eb(40, 20, 20, 100, M)[0]))

    def test_3d_close_to_2d_for_narrow_beam_plane_stress(self):
        # a narrow beam (b << h) is close to plane stress
        d3, _ = fe3d(100, 20, 4, 100, M, n=2)
        d2, _ = fe2d(100, 20, 4, 100, M, n=8)
        self.assertAlmostEqual(d3 / d2, 1.0, delta=0.06)

    def test_sizing_meets_the_active_limit(self):
        c = Case(L=100, b=20, F=100)
        h, hd, hs, _ = size_h("timoshenko", c, 2.0, M)
        ev = evaluate_design(h, c, 2.0, M, truth="timoshenko")
        self.assertAlmostEqual(max(ev["defl_util"], ev["stress_util"]), 1.0, delta=0.01)


if __name__ == "__main__":
    unittest.main()
