import math
import unittest

from floorbots import airflow, mopping, power, room, sim
from floorbots import coverage as C
from floorbots import drive
from floorbots import variants as V


class RoomTest(unittest.TestCase):
    def test_raster_matches_exact_area(self):
        for r in room.PRESETS.values():
            g = room.rasterise(r)
            self.assertAlmostEqual(g.free_count() * g.res ** 2, r.floor_area(), delta=0.02 * r.floor_area(), msg=r.name)

    def test_ascii(self):
        g = room.from_ascii(["...", ".#.", "..."])
        self.assertEqual(g.free_count(), 8)
        self.assertFalse(g.is_free(1, 1))


class PlannerTest(unittest.TestCase):
    def setUp(self):
        self.g = room.rasterise(room.PRESETS["living"])

    def test_cspace_keeps_the_body_off_walls(self):
        mask = C.cspace(self.g, 0.175)
        offs = C.disk(0.175 / self.g.res)
        for j in range(self.g.h):
            for i in range(self.g.w):
                if mask[j * self.g.w + i]:
                    for di, dj in offs:
                        self.assertTrue(self.g.is_free(i + di, j + dj))

    def test_plan_stays_in_region_and_returns_to_dock(self):
        p = C.plan(self.g)
        for i, j in p.waypoints:
            self.assertEqual(p.reach[j * self.g.w + i], 1)
        self.assertEqual(p.waypoints[0], p.waypoints[-1])
        for k in range(1, len(p.waypoints)):
            self.assertTrue(C.line_clear(self.g, p.reach, p.waypoints[k - 1], p.waypoints[k]))

    def test_every_reachable_cell_is_covered_by_lanes(self):
        """With no overlap, lanes alone still sweep every robot-centre cell (the decomposition is complete)."""
        p = C.plan(self.g, overlap=0.0, edge=False)
        painted = C.paint(self.g, p.waypoints, p.phases, {"lane": 0.085})
        missed = [k for k in range(len(p.reach)) if p.reach[k] and not painted[k]]
        self.assertEqual(missed, [])

    def test_decomposition_splits_at_obstacles(self):
        g = room.from_ascii([
            "..........",
            "..........",
            "....##....",
            "....##....",
            "..........",
            "..........",
        ], res=0.1)
        reach = bytearray(g.free)
        cells = C.decompose(g, reach)
        self.assertEqual(len(cells), 4)  # before, below, above, after the block

    def test_overlap_trades_time_for_robustness(self):
        lo = C.plan(self.g, overlap=0.0)
        hi = C.plan(self.g, overlap=0.3)
        self.assertGreater(hi.lanes, lo.lanes)
        self.assertGreater(power.plan_time_s(hi), power.plan_time_s(lo))

    def test_side_brush_reaches_walls_the_mop_pad_does_not(self):
        v = V.VARIANTS["combo"]
        p = C.plan(self.g, clean_width=v.lane_width)
        vac = C.coverage(self.g, C.paint(self.g, p.waypoints, p.phases, v.radii(V.VACUUM_TOOL)))
        mop = C.coverage(self.g, C.paint(self.g, p.waypoints, p.phases, v.radii(V.COMBO_MOP_TOOL)))
        self.assertGreater(vac, 0.94)
        self.assertLess(mop, vac - 0.05)

    def test_unreachable_room_raises(self):
        g = room.from_ascii(["...", "...", "..."], res=0.1)
        with self.assertRaises(ValueError):
            C.plan(g)


class PowerTest(unittest.TestCase):
    def test_pack(self):
        b = power.Battery()
        self.assertAlmostEqual(b.rated_wh, 74.88)
        self.assertEqual(b.cutoff_mv, 12800)

    def test_mop_outlasts_vacuum(self):
        self.assertGreater(power.runtime_h(V.VARIANTS["mop"]), 3 * power.runtime_h(V.VARIANTS["vacuum"]))

    def test_mission_goes_home_with_a_small_battery(self):
        g = room.rasterise(room.PRESETS["apartment"])
        v = V.VARIANTS["vacuum"]
        p = C.plan(g, clean_width=v.lane_width)
        full = power.mission(p, v)
        self.assertEqual(full.dock_trips, 0)
        small = power.mission(p, v, power.Battery(series=4, parallel=1, cell_mah=300))
        self.assertGreater(small.dock_trips, 0)
        self.assertGreater(small.total_time_s, full.total_time_s)
        self.assertGreater(small.energy_wh, full.energy_wh)
        self.assertAlmostEqual(full.clean_time_s, power.plan_time_s(p), places=6)


class AirflowTest(unittest.TestCase):
    def test_operating_point_is_on_both_curves(self):
        fan, s = airflow.Fan(), airflow.System()
        op = airflow.operating_point(fan, s)
        self.assertAlmostEqual(fan.pressure(op.flow_m3s), s.pressure(op.flow_m3s), delta=0.5)
        self.assertTrue(0 < op.flow_m3s < fan.q_max)

    def test_lower_nozzle_means_faster_air_less_flow(self):
        rows = airflow.sweep_gap()
        speeds = [o.inlet_speed_ms for _, o in rows]
        flows = [o.flow_m3s for _, o in rows]
        self.assertEqual(speeds, sorted(speeds, reverse=True))
        self.assertEqual(flows, sorted(flows))

    def test_fan_power_assumption_matches_variants(self):
        op = airflow.operating_point()
        self.assertAlmostEqual(op.electrical_w, V.VARIANTS["vacuum"].loads_w["fan"], delta=2.0)


class MopTest(unittest.TestCase):
    def test_dose_and_duty_are_inverse(self):
        pump = mopping.Pump()
        d = mopping.duty_for(pump, 3.0, 0.17, 0.25)
        self.assertAlmostEqual(mopping.dose_ml_m2(pump, d, 0.17, 0.25), 3.0)

    def test_too_small_pump_is_refused(self):
        with self.assertRaises(ValueError):
            mopping.duty_for(mopping.Pump(flow_ml_min=2.0), 10.0, 0.17, 0.25)

    def test_tank_range(self):
        self.assertAlmostEqual(mopping.tank_area_m2(300, 3.0), 295 / 3.0)


class DriveSimTest(unittest.TestCase):
    def test_pure_pursuit_reaches_goal(self):
        pose, t = drive.follow([(0, 0), (1, 0), (1, 1)], drive.Pose(0, 0, 0), drive.DiffDrive())
        self.assertLess(math.hypot(pose.x - 1, pose.y - 1), 0.05)

    def test_noise_free_sim_matches_the_plan(self):
        g = room.rasterise(room.PRESETS["bedroom"])
        p = C.plan(g)
        r = sim.simulate(p, V.VACUUM_TOOL, sim.Noise(0, 1, 0, 0))
        self.assertLess(r.max_offtrack_m, 0.01)
        self.assertAlmostEqual(r.coverage, r.nominal_coverage, delta=0.005)
        self.assertAlmostEqual(r.distance_m, p.length(), delta=0.05 * p.length())

    def test_noise_costs_coverage_and_repeats(self):
        g = room.rasterise(room.PRESETS["bedroom"])
        p = C.plan(g, overlap=0.0)
        a = sim.simulate(p, V.MOP_TOOL, sim.Noise(0.05, 0.5, 0.05, 0.05), seed=3)
        b = sim.simulate(p, V.MOP_TOOL, sim.Noise(0.05, 0.5, 0.05, 0.05), seed=3)
        clean = sim.simulate(p, V.MOP_TOOL, sim.Noise(0, 1, 0, 0))
        self.assertEqual(a.coverage, b.coverage)
        self.assertLess(a.coverage, clean.coverage)


if __name__ == "__main__":
    unittest.main()
