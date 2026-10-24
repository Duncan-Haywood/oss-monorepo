import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_insert import model as M  # noqa: E402


class Section(unittest.TestCase):
    def test_stadium_closed_form(self):
        self.assertEqual(M.stadium(0.0, 4.0), 0.0)
        self.assertAlmostEqual(M.stadium(10.0, 4.0), 2 * 10 + (math.pi - 2) * 4)
        self.assertAlmostEqual(M.stadium(1.0, 4.0), math.pi * 4)     # thinner than the bar: a round loop

    def test_vertical_cut_of_a_flat_arm_is_its_thickness(self):
        h = M.Hanger(w=20.0, slope=0.0, r=1.0)
        # a vertical line through the middle of the left arm (alpha 0: n along the arm axis)
        P = float(M.sections(h, -10.0, 0.0))
        self.assertAlmostEqual(P, M.stadium(2.0, 2.0), delta=2 * M.STEP_T * 2)

    def test_line_along_the_arm_cuts_its_whole_length(self):
        h = M.Hanger(w=20.0, slope=0.0, r=1.0)
        P = float(M.sections(h, -0.5, 90.0))     # a horizontal line (alpha 90) just under the arms' axis
        self.assertAlmostEqual(P, M.stadium(40.0, 2.0), delta=2.0)

    def test_miss_is_zero(self):
        h = M.Hanger(w=20.0, slope=15.0, r=1.0)
        self.assertEqual(float(M.sections(h, -30.0, 0.0)), 0.0)
        self.assertEqual(float(M.sections(h, 40.0, 90.0)), 0.0)

    def test_sections_broadcast_grid(self):
        h = M.Hanger(w=18.0, slope=16.0, r=2.0)
        P = M.sections(h, np.array([[-5.0], [0.0]]), np.array([[0.0, 45.0, 90.0]]))
        self.assertEqual(P.shape, (2, 3))

    def test_fold_and_telescoping_shorten_the_inserting_shape(self):
        h = M.Hanger(22.0, 16.0, 2.0, w_collapsed=10.0, fold=40.0)
        i = h.inserting()
        self.assertEqual((i.w, i.slope), (10.0, 56.0))
        self.assertEqual(M.Hanger(22.0, 16.0, 2.0).inserting().w, 22.0)


class Plan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rigid = M.Grid(M.Hanger(22.8, 15.9, 2.86))
        cls.adj = M.Grid(M.Hanger(22.8, 15.9, 2.86, w_collapsed=10.0))
        cls.peak = cls.rigid.min_peak()[0]

    def test_path_starts_clear_and_ends_on_the_stub(self):
        peak, path = self.rigid.min_peak()
        self.assertEqual(path[0][0], M.S_START)
        self.assertEqual(path[-1][1], 90.0)
        self.assertAlmostEqual(path[-1][0], M.STUB_H / 2, delta=M.GRID_S)

    def test_peak_is_at_least_a_hull_round_one_arm(self):
        # the loop cannot get round a straight arm of length L + 2r in less than about 2 (L + 2r)
        self.assertGreater(self.peak, 0.8 * 2 * (22.8 - 2.86))

    def test_no_path_under_the_peak_and_one_just_over(self):
        self.assertIsNone(self.rigid.fastest(self.peak - 0.5)[0])
        self.assertIsNotNone(self.rigid.fastest(self.peak + 0.01)[0])

    def test_more_stretch_allowed_is_never_slower(self):
        a = self.rigid.fastest(self.peak + 0.01)[0]
        b = self.rigid.fastest(self.peak + 40.0)[0]
        self.assertLessEqual(b, a + 1e-9)

    def test_collapsing_the_arms_lowers_the_peak(self):
        self.assertLess(self.adj.min_peak()[0], self.peak - 10.0)

    def test_peak_grows_with_collapsed_width(self):
        peaks = [M.Grid(M.Hanger(22.8, 15.9, 2.86, w_collapsed=w)).min_peak()[0] for w in (6.0, 10.0, 14.0)]
        self.assertEqual(peaks, sorted(peaks))

    def test_peak_is_smooth_in_end_radius(self):
        # the planner once found a gap that opened and closed with the third decimal of r
        peaks = [M.Grid(M.Hanger(22.8, 15.9, r)).min_peak()[0] for r in (2.4, 2.6, 2.8, 3.0)]
        self.assertLess(max(np.diff(peaks)), 3.0)
        self.assertGreaterEqual(min(np.diff(peaks)), -1.0)


class Attempt(unittest.TestCase):
    def test_p_enter_limits(self):
        self.assertEqual(M.p_enter(4.0, 5.0, 1.5), 0.0)
        self.assertGreater(M.p_enter(30.0, 2.0, 1.5), 0.999)
        self.assertLess(M.p_enter(10.0, 2.0, 3.0), M.p_enter(10.0, 2.0, 1.5))

    def test_expected_attempts(self):
        self.assertEqual(M.expected_attempts(1.0), 1.0)
        self.assertAlmostEqual(M.expected_attempts(0.5), 1 + 0.5 + 0.25)
        self.assertEqual(M.expected_attempts(0.0), M.ATTEMPTS)

    def test_buttoned_shirt_collar_refuses_a_rigid_hanger(self):
        h = M.Hanger(22.8, 15.9, 2.86)
        r = M.attempt(h, 22.0, "shirt", route="neck")
        self.assertEqual(r["p_success"], 0.0)
        self.assertIsNone(r["time"])

    def test_rigid_hanger_passes_a_stretchy_tee_neck(self):
        r = M.attempt(M.Hanger(22.8, 15.9, 2.86), 22.0, "tee", route="neck")
        self.assertGreater(r["p_success"], 0.99)
        self.assertGreater(r["neck_strain"], 0.0)

    def test_hem_route_costs_time_and_a_blind_threading_step(self):
        h = M.Hanger(22.8, 15.9, 2.86)
        hem = M.attempt(h, 22.0, "shirt", route="hem")
        neck = M.attempt(h, 22.0, "tee", route="neck")
        self.assertGreater(hem["time"], neck["time"])
        worse = M.attempt(h, 22.0, "shirt", route="hem", sigma_blind=6.0)
        self.assertLess(worse["p_success"], hem["p_success"])

    def test_more_grip_length_never_helps(self):
        h = M.Hanger(22.8, 15.9, 2.86, w_collapsed=10.0)
        a = M.attempt(h, 22.0, "shirt", route="neck")
        b = M.attempt(h, 22.0, "shirt", route="neck", grip_len=12.0)
        self.assertGreaterEqual(a["p_success"], b["p_success"])

    def test_best_route_picks_the_hem_for_a_shirt_on_a_rigid_hanger(self):
        self.assertEqual(M.best_route(M.Hanger(22.8, 15.9, 2.86), 22.0, "shirt")["route"], "hem")


if __name__ == "__main__":
    unittest.main()
