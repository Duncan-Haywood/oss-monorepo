import math
import unittest

from mowerbot import coverage, geometry as g, lawns, planner, simulate
from mowerbot.drive import DiffDrive, LineFollower, Pose


class GeometryTest(unittest.TestCase):
    def test_area_orientation_and_point_tests(self):
        sq = [(0, 0), (0, 2), (2, 2), (2, 0)]  # clockwise
        self.assertAlmostEqual(g.signed_area(sq), -4.0)
        self.assertAlmostEqual(g.signed_area(g.ccw(sq)), 4.0)
        self.assertTrue(g.point_in_ring((1, 1), sq))
        self.assertFalse(g.point_in_ring((3, 1), sq))

    def test_offset_moves_every_edge_by_d(self):
        r = g.offset_ring([(0, 0), (10, 0), (10, 4), (0, 4)], 0.5)
        self.assertAlmostEqual(abs(g.signed_area(r)), 9 * 3)
        grown = g.offset_ring([(0, 0), (1, 0), (1, 1), (0, 1)], -0.5)
        self.assertAlmostEqual(abs(g.signed_area(grown)), 4.0)

    def test_offset_refuses_a_pinched_shape(self):
        self.assertIsNone(g.offset_ring([(0, 0), (10, 0), (10, 0.3), (0, 0.3)], 0.2))
        # An hourglass: two lobes joined by a 0.4 m neck.
        hourglass = [(0, 0), (4, 0), (4, 3), (2.2, 3), (2.2, 5), (4, 5), (4, 8), (0, 8), (0, 5), (1.8, 5), (1.8, 3), (0, 3)]
        self.assertIsNotNone(g.offset_ring(hourglass, 0.1))
        self.assertIsNone(g.offset_ring(hourglass, 0.3))

    def test_segments_cross_ignores_touching(self):
        self.assertTrue(g.segments_cross((0, 0), (2, 2), (0, 2), (2, 0)))
        self.assertFalse(g.segments_cross((0, 0), (1, 1), (1, 1), (2, 0)))


class PlannerTest(unittest.TestCase):
    def test_every_example_lawn_is_almost_fully_covered(self):
        for lawn in lawns.ALL.values():
            p = planner.plan(lawn)
            c = coverage.of_path(lawn, p.path, p.settings.cut_width)
            self.assertGreater(c.fraction, 0.995, lawn.name)
            self.assertLess(c.intrusion_area, 0.05, lawn.name)   # raster edge cells only
            self.assertEqual(p.skipped, [])
            self.assertEqual(p.path[0], lawn.dock)
            self.assertEqual(p.path[-1], lawn.dock)

    def test_path_never_enters_a_no_go_area(self):
        lawn = lawns.BACKYARD
        p = planner.plan(lawn, angle_deg=30)
        for a, b in zip(p.path, p.path[1:]):
            for k in range(11):
                q = (a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10)
                self.assertTrue(lawn.contains(q), q)

    def test_cut_edge_reaches_the_boundary(self):
        lawn = lawns.FRONT
        p = planner.plan(lawn, angle_deg=0)
        xs = [q[0] for q in p.path[1:-1]]
        self.assertAlmostEqual(min(xs), p.settings.cut_width / 2, places=6)

    def test_best_angle_is_no_slower_than_any_fixed_angle(self):
        lawn = lawns.CURVED
        best = planner.plan(lawn)
        for a in (0, 45, 90, 135):
            self.assertLessEqual(best.time_s, planner.plan(lawn, angle_deg=a).time_s + 1e-6)

    def test_stripe_count_follows_the_spacing(self):
        lawn = planner.Lawn([(0, 0), (20, 0), (20, 10), (0, 10)], dock=(1, 1))
        s = planner.Settings(perimeter_passes=0)
        n = len(planner.stripes(lawn, s, 0.0))
        inner = 10 - 2 * s.edge
        self.assertEqual(n, math.ceil((inner - 2e-3) / s.spacing) + 1)

    def test_transit_routes_round_an_obstacle(self):
        lawn = planner.Lawn([(0, 0), (10, 0), (10, 10), (0, 10)], [[(4, 0.5), (6, 0.5), (6, 9.5), (4, 9.5)]])
        free = planner.FreeSpace(lawn, 0.116)
        route = free.route((2, 5), (8, 5))
        self.assertGreater(len(route), 2)
        self.assertGreater(g.path_length(route), 6.0)
        for a, b in zip(route, route[1:]):
            self.assertTrue(free.clear(a, b))

    def test_lawn_from_json_dict(self):
        lawn = planner.Lawn.from_dict({"outer": [[0, 0], [5, 0], [5, 5], [0, 5]], "holes": [[[2, 2], [3, 2], [3, 3]]]})
        self.assertAlmostEqual(lawn.area, 25 - 0.5)
        self.assertEqual(lawn.dock, (0, 0))


class CoverageTest(unittest.TestCase):
    def test_a_single_stripe_cuts_its_width(self):
        lawn = planner.Lawn([(0, 0), (10, 0), (10, 2), (0, 2)])
        c = coverage.of_path(lawn, [(1, 1), (9, 1)], 0.2)
        self.assertAlmostEqual(c.cut_area, 8 * 0.2 + math.pi * 0.1 ** 2, delta=0.06)

    def test_capsule_row(self):
        self.assertEqual(coverage.capsule_row((0, 0), (10, 0), 1, 1.5), None)
        lo, hi = coverage.capsule_row((0, 0), (10, 0), 1, 0)
        self.assertAlmostEqual(lo, -1)
        self.assertAlmostEqual(hi, 11)
        lo, hi = coverage.capsule_row((0, 0), (10, 10), 1, 5)
        self.assertAlmostEqual(hi - lo, 2 * math.sqrt(2))


class FollowerTest(unittest.TestCase):
    def test_follows_a_square_with_sharp_corners(self):
        path = [(0, 0), (3, 0), (3, 3), (0, 3), (0, 0)]
        drive = DiffDrive()
        f = LineFollower(path, drive)
        pose = Pose(0, 0, 0)
        worst = 0.0
        for _ in range(4000):
            if f.finished:
                break
            l, r = f.command(pose)
            pose = drive.integrate(pose, l, r, 0.05)
            worst = max(worst, min(abs(pose.y), abs(pose.y - 3), abs(pose.x), abs(pose.x - 3)))
        self.assertTrue(f.finished)
        self.assertLess(worst, 0.05)

    def test_wheel_speeds_respect_the_limit(self):
        d = DiffDrive()
        l, r = d.wheels(1.0, 3.0)
        self.assertLessEqual(max(abs(l), abs(r)), d.max_wheel_speed + 1e-12)


class SimulationTest(unittest.TestCase):
    def test_closed_loop_coverage_on_the_front_lawn(self):
        lawn = lawns.FRONT
        p = planner.plan(lawn)
        r = simulate.run(lawn, p, seed=3)
        self.assertTrue(r.finished)
        self.assertGreater(r.coverage.fraction, 0.99)
        self.assertLess(r.max_cross_track_m, 0.15)

    def test_fix_losses_cost_time_not_coverage(self):
        lawn = lawns.FRONT
        p = planner.plan(lawn)
        calm = simulate.run(lawn, p, simulate.Noise(fix_losses_per_hour=0.0), seed=5)
        lossy = simulate.run(lawn, p, simulate.Noise(fix_losses_per_hour=60.0), seed=5)
        self.assertGreater(lossy.fix_losses, 0)
        self.assertGreater(lossy.waiting_s, 0)
        self.assertGreater(lossy.time_s, calm.time_s)
        self.assertGreater(lossy.coverage.fraction, 0.99)

    def test_noisier_gnss_cuts_worse(self):
        lawn = lawns.FRONT
        p = planner.plan(lawn)
        good = simulate.run(lawn, p, simulate.Noise(gnss_sigma=0.015, fix_losses_per_hour=0), seed=2)
        bad = simulate.run(lawn, p, simulate.Noise(gnss_sigma=0.30, fix_losses_per_hour=0), seed=2)
        self.assertLess(bad.coverage.fraction, good.coverage.fraction)


if __name__ == "__main__":
    unittest.main()
