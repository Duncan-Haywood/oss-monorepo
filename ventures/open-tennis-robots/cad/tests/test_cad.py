"""CAD checks. Skipped when build123d is not installed (pip install -r cad/requirements.txt)."""

import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    from build123d import GeomType
    HAVE_CAD = True
except ImportError:  # pragma: no cover
    HAVE_CAD = False

from otr_cad.params import Collector, Feeder

HERE = Path(__file__).resolve().parent
COMMITTED = HERE.parent.parent / "manufacturing" / "collector-package.zip"
COMMITTED_FEEDER = HERE.parent.parent / "manufacturing" / "feeder-package.zip"


class ParamsTest(unittest.TestCase):
    def test_defaults_pass_design_rules(self):
        p = Collector()
        self.assertEqual(p.check(), [])
        self.assertTrue(0.7 * p.ball_d <= p.rod_gap <= 0.85 * p.ball_d)
        self.assertGreaterEqual(p.drum_capacity(), 75)

    def test_rules_catch_bad_changes(self):
        self.assertTrue(any("drum" in r for r in Collector(drum_x=300.0).check()))
        self.assertTrue(any("rod gap" in r for r in Collector(rod_gap_target=70.0).check()))
        self.assertTrue(any("motor" in r for r in Collector(motor_len=240.0).check()))


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class GeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import collector as C
        cls.C = C
        cls.p = Collector()
        cls.parts = C.all_parts(cls.p)

    def test_no_collisions_and_three_ground_contacts(self):
        from otr_cad.package import collisions, ground_contacts
        self.assertEqual(collisions(self.parts), [])
        contacts = ground_contacts(self.parts)
        self.assertEqual(set(contacts), {"wheel", "ball_caster", "drum_disc"})
        for z in contacts.values():
            self.assertAlmostEqual(z, 0.0, places=2)

    def test_collision_check_can_fail(self):
        from otr_cad.package import collisions
        bad = self.C.all_parts(Collector(motor_face_inset=-20.0))
        self.assertTrue(any("wheel" in c for c in collisions(bad)))

    def test_printed_part_bolts_line_up_with_base_plate_holes(self):
        """Every vertical pilot hole in a part sitting on the base must land on a base-plate hole."""
        base = next(x for x in self.parts if x.name == "base_plate")
        holes = [(e.arc_center.X, e.arc_center.Y) for e in base.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        checked = 0
        for part in self.parts:
            if part.kind != "print":
                continue
            for solid in part.placed():
                for f in solid.faces():
                    if f.geom_type != GeomType.CYLINDER or abs(f.radius - 2.0) > 1e-6:
                        continue
                    ax = f.axis_of_rotation
                    if abs(abs(ax.direction.Z) - 1) > 1e-6:
                        continue
                    z0 = f.bounding_box().min.Z
                    # Pilot holes that start at the base top face (z = base_top), or reach down through it.
                    if abs(z0 - self.p.base_top) > 1e-3 and abs(f.bounding_box().max.Z - self.p.base_z) > 1e-3:
                        continue
                    x, y = ax.position.X, ax.position.Y
                    self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes),
                                    f"{part.name} pilot hole at ({x:.1f}, {y:.1f}) has no base-plate hole")
                    checked += 1
        self.assertGreaterEqual(checked, 4 + 4 + 4 + 4)

    def test_laser_parts_fit_a_standard_sheet(self):
        for part in self.parts:
            if part.kind == "laser":
                bb = part.flat.bounding_box()
                self.assertLessEqual(max(bb.size.X, bb.size.Y), 1220, part.name)  # 4 x 8 ft sheet

    def test_rods_pass_through_disc_holes(self):
        disc = next(x for x in self.parts if x.name == "drum_disc")
        rod_holes = [e for e in disc.flat.edges()
                     if e.geom_type == GeomType.CIRCLE and abs(e.radius - (self.p.rod_d + 0.2) / 2) < 1e-6]
        self.assertEqual(len(rod_holes), self.p.n_rods)
        for e in rod_holes:
            self.assertAlmostEqual(math.hypot(e.arc_center.X, e.arc_center.Y), self.p.rod_circle_r, places=6)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class PackageTest(unittest.TestCase):
    def test_package_contents_and_reproducibility(self):
        import ezdxf
        from otr_cad.package import build
        with tempfile.TemporaryDirectory() as d:
            m = build(Path(d) / "collector", drawings=False)
            out = Path(d) / "collector"
            self.assertEqual(m["design_rules"], [])
            self.assertEqual(m["collisions"], [])
            for name in ("bom.csv", "cut_list.csv", "laser_parts.csv", "print_parts.csv", "README.txt",
                         "step/assembly.step"):
                self.assertTrue((out / name).exists(), name)
            first = (Path(d) / "collector-package.zip").read_bytes()
            build(Path(d) / "collector", drawings=False)
            self.assertEqual(first, (Path(d) / "collector-package.zip").read_bytes())
            dxfs = sorted((out / "laser").glob("*.dxf"))
            self.assertGreaterEqual(len(dxfs), 6)
            for f in dxfs:
                doc = ezdxf.readfile(f)
                self.assertEqual(doc.header.get("$INSUNITS"), 4)  # millimetres
                self.assertGreater(len(list(doc.modelspace())), 0)
            self.assertGreaterEqual(len(list((out / "print").glob("*.stl"))), 5)

    def test_committed_package_is_current(self):
        """manufacturing/collector-package.zip must match what the generator makes today."""
        import zipfile
        self.assertTrue(COMMITTED.exists(), "run: python -m otr_cad collector --out ../manufacturing/collector")
        with zipfile.ZipFile(COMMITTED) as z:
            committed = json.loads(z.read("collector/manifest.json"))
        # A fresh process, as a maker runs it: ezdxf's writer state can carry over between
        # builds in one process after other tests have read DXFs.
        with tempfile.TemporaryDirectory() as d:
            subprocess.run([sys.executable, "-m", "otr_cad", "collector", "--out", str(Path(d) / "collector")],
                           cwd=HERE.parent, check=True, capture_output=True)
            fresh = json.loads((Path(d) / "collector" / "manifest.json").read_text())
        self.assertEqual(committed["params"], json.loads(json.dumps(fresh["params"])))
        folder = json.loads((COMMITTED.parent / "collector" / "manifest.json").read_text())
        self.assertEqual(folder["files"], committed["files"], "manufacturing/collector/ and the zip disagree")
        stale = sorted(k for k in set(committed["files"]) | set(fresh["files"])
                       if committed["files"].get(k) != fresh["files"].get(k))
        self.assertEqual(stale, [], "stale: rebuild with python -m otr_cad collector --out ../manufacturing/collector")


class FeederParamsTest(unittest.TestCase):
    def test_defaults_pass_design_rules(self):
        p = Feeder()
        self.assertEqual(p.check(), [])
        self.assertGreater(p.turntable_top, p.mast_top_z)

    def test_rules_catch_bad_changes(self):
        self.assertTrue(any("wheel gap" in r for r in Feeder(wheel_gap=67.0).check()))
        self.assertTrue(any("ball path" in r for r in Feeder(plate_half_y=36.0).check()))
        self.assertTrue(any("muzzle" in r for r in Feeder(head_x=-300.0).check()))
        self.assertTrue(any("drive motors" in r for r in Feeder(rail_z=90.0).check()))

    def test_feed_rules_catch_bad_changes(self):
        self.assertTrue(any("meter" in r for r in Feeder(shuttle_h=140.0).check()))
        self.assertTrue(any("retainer" in r for r in Feeder(retain_t=3.0).check()))  # arms too stiff for the wheels
        self.assertTrue(any("retainer" in r for r in Feeder(retain_t=0.4).check()))   # too weak to hold
        self.assertEqual(Feeder().check(), [])
        self.assertTrue(any("top wheel" in r for r in Feeder(feed_col_x=-100.0).check()))
        self.assertTrue(any("stroke" in r for r in Feeder(feed_stroke=40.0).check()))
        self.assertTrue(any("holds about" in r for r in Feeder(tub_h=150.0).check()))
        self.assertTrue(any("falls only" in r for r in Feeder(hopper_out_x=-60.0, hopper_out_z=1300.0).check()))
        self.assertTrue(any("bows" in r for r in Feeder(hopper_out_z=1500.0, hose_min_bend=400.0).check()))

    def test_launch_window_is_the_edge_of_the_launch_check(self):
        p = Feeder()
        lo, hi, why = p.launch_window()
        self.assertTrue(lo < p.launch_v_max < hi)  # the shipped 25 m/s sits inside the window
        self.assertEqual(Feeder(launch_v_max=hi * 0.999).check_launch(), [])
        self.assertTrue(Feeder(launch_v_max=hi * 1.001).check_launch())
        self.assertTrue(Feeder(launch_v_max=lo * 0.999).check_launch())
        self.assertEqual(Feeder(launch_v_max=lo * 1.001).check_launch(), [])
        self.assertIn(why, ("wheel rpm", "nip traction"))
        # more topspin: the slow end rises (bottom wheel) and the fast end falls (top wheel)
        lo2, hi2, _ = p.launch_window(3500.0)
        self.assertTrue(lo2 > lo and hi2 < hi)
        self.assertEqual(p.launch_window(4000.0)[:2], (0.0, 0.0))  # no speed carries that much spin
        # a soft ball squeeze: traction binds and the window shrinks; very soft, none passes
        self.assertEqual(Feeder(ball_stiff_n_mm=15.0).launch_window()[2], "nip traction")
        self.assertEqual(Feeder(ball_stiff_n_mm=5.0).launch_window()[:2], (0.0, 0.0))

    def test_plate_clearance_is_a_yaw_tolerance(self):
        p = Feeder()
        c = p.plate_clearance()
        self.assertAlmostEqual(c["gap_mm"], 6.5)
        self.assertAlmostEqual(c["run_mm"], 110 + 33.5 + p.nip_x)
        self.assertAlmostEqual(math.tan(math.radians(c["yaw_tol_deg"])), c["gap_mm"] / c["run_mm"])
        # slower ball: longer in the head, so the same sideways speed margin shrinks
        self.assertLess(p.plate_clearance(18.0)["side_speed_ms"], c["side_speed_ms"])
        self.assertAlmostEqual(c["side_speed_ms"], c["yaw_tol_deg"] and
                               25.0 * math.tan(math.radians(c["yaw_tol_deg"])), places=6)
        # wider plate gap, more yaw allowed
        self.assertGreater(Feeder(plate_half_y=45.0).plate_clearance()["yaw_tol_deg"], c["yaw_tol_deg"])

    def test_axle_squaring_stack_fits_inside_the_plate_yaw_limit(self):
        p = Feeder()
        a = p.axle_squaring()
        self.assertAlmostEqual(a["limit_deg"], p.plate_clearance()["yaw_tol_deg"])
        self.assertLessEqual(a["rss_deg"], a["worst_deg"])
        self.assertAlmostEqual(a["worst_deg"], a["motor_seat_deg"] + a["bore_offset_deg"] + a["plate_parallel_deg"])
        self.assertGreater(a["margin"], 3.0)  # the shipped tolerances leave room: no reaming needed
        # a sloppy build eats the margin
        self.assertLess(Feeder(plate_slot_play_mm=4.0, seat_gap_mm=1.0).axle_squaring()["margin"], a["margin"])

    def test_launch_checks_tie_the_head_to_the_flight_model(self):
        p = Feeder()
        self.assertAlmostEqual(p.nip_len, 74.0, delta=0.5)
        rt, rb = p.launch_rpm
        self.assertTrue(0 < rb < rt < p.wheel_rpm_max)
        # the same wheel speeds the flight model's launcher gives for this shot
        sys.path.insert(0, str(HERE.parent.parent / "src"))
        try:
            from tennisbots.launcher import WheelLauncher
        except ImportError:  # pragma: no cover
            return
        w = WheelLauncher()
        self.assertEqual((w.speed_efficiency, w.spin_efficiency, w.max_rpm), (p.speed_eff, p.spin_eff, p.wheel_rpm_max))
        wt, wb = w.wheel_rpm(p.launch_v_max, p.launch_topspin_rpm * 2 * math.pi / 60)
        self.assertAlmostEqual(rt, wt, delta=1.0)
        self.assertAlmostEqual(rb, wb, delta=1.0)
        # catches bad changes
        self.assertTrue(any("rpm" in r for r in Feeder(launch_v_max=30.0).check()))
        self.assertTrue(any("nip pushes" in r for r in Feeder(launch_v_max=25.0, ball_stiff_n_mm=10.0).check()))
        self.assertTrue(any("nip pushes" in r for r in Feeder(wheel_mu=0.4).check()))

    def test_hose_is_longer_than_every_chord_and_the_mouth_swings_back_when_nose_up(self):
        p = Feeder()
        self.assertGreaterEqual(p.hose_len, max(c for _, c, _ in p.hose_chords()))
        self.assertLess(p.mouth_world(45.0)[0], p.mouth_world(-15.0)[0])
        self.assertAlmostEqual(p.mouth_world(0.0)[0], p.head_x + p.feed_col_x, places=6)

    def test_hose_end_directions_show_the_gap_the_chord_check_hides(self):
        # Outlet straight down, socket along the tilted column: at a low outlet some pose has no curve within the
        # bend and fall limits; at the 2026-11-04 outlet every pose fits but not with one cut length.
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1560.0).hose_take_up_mm())
        raised = Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0)
        self.assertTrue(all(x is not None for _, x in raised.hose_pose_ranges()))
        self.assertGreater(raised.hose_take_up_mm(), 200.0)
        # A single floating pulley moves half the hose it pays out.
        self.assertAlmostEqual(raised.take_up_stroke_mm(), raised.hose_take_up_mm() / 2)
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1560.0).take_up_stroke_mm())

    def test_every_extra_degree_of_nose_up_costs_the_hose_take_up(self):
        r = Feeder().hose_take_up_by_elev_max()
        vals = [t for _, t in r]
        self.assertTrue(all(v is not None for v in vals))
        self.assertEqual(vals, sorted(vals))   # more tilt never needs less take-up
        # A gentler hose (tighter bends allowed) can only widen the fit.
        self.assertTrue(all(x is not None for _, x in Feeder(hose_min_bend=100.0).hose_pose_ranges()[1:4]))

    def test_take_up_design_reaches_every_pose_with_the_stroke(self):
        p = Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0)   # the pulley's sizing, kept for comparison
        t = p.take_up_design()
        self.assertTrue(t["ok"])
        self.assertAlmostEqual(t["stroke_mm"], p.take_up_stroke_mm(), places=6)
        self.assertEqual(t["pulley_d_mm"], 2 * p.hose_min_bend)
        self.assertAlmostEqual(t["track_mm"], t["stroke_mm"] + t["pulley_d_mm"] + 60)
        for e, xlo, xhi in t["poses"]:       # the pulley can reach a position inside every pose's window
            self.assertLessEqual(xlo, t["stroke_mm"] + 1e-9)
            self.assertLessEqual(xlo, xhi)
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1560.0).take_up_design())

    def test_a_pulley_loop_cannot_carry_balls(self):
        # A hose wrapped round a horizontal axle turns by the wrap angle; from straight down it may turn only until
        # it reaches the minimum fall, so a ball-carrying hose wraps at most 90 - 30 = 60 deg, not the 180 a floating
        # pulley needs.
        p = Feeder()
        self.assertAlmostEqual(p.pulley_wrap_max_deg(), 60.0)
        self.assertFalse(p.pulley_take_up_passes_balls())
        self.assertFalse(Feeder(feed_min_slope_deg=0.0).pulley_take_up_passes_balls())

    def test_sleeve_take_up_fits_every_pose_and_the_old_outlet_does_not(self):
        p = Feeder()
        t = p.sleeve_take_up_design()
        self.assertIsNotNone(t)
        lo, hi = t["free_mm"]
        self.assertAlmostEqual(hi - lo, t["stroke_mm"])
        # the sleeve holds the stroke, the collar, the gap under the shelf and the end margin
        self.assertGreaterEqual(t["sleeve_mm"] + 1e-9, t["stroke_mm"] + p.sleeve_overlap_mm + p.collar_h_mm + p.sleeve_top_mm)
        self.assertAlmostEqual(t["start_z"], p.hopper_out_z - t["sleeve_mm"])
        # every pose has a free length inside the stroke, re-checked from the sleeve's lower end
        r = p._ranges_from(p.hopper_out_x, t["start_z"])
        self.assertEqual(len(r), 5 * (p.az_steps + 1))   # every elevation step at every azimuth step
        for (e, a, (rlo, rhi)), (e2, a2, xlo, xhi) in zip(r, t["poses"]):
            self.assertEqual((e, a), (e2, a2))
            self.assertTrue(rlo <= lo + xlo + 1e-6 <= rhi + 1e-6, e)
            self.assertLessEqual(xlo, t["stroke_mm"] + 1e-9)
        # the collar stays in the tube: highest under its top end, lowest the overlap above its bottom
        hi_d, lo_d = t["collar_travel"]
        self.assertGreaterEqual(hi_d - p.collar_h_mm, p.sleeve_top_mm - 1e-9)
        self.assertAlmostEqual(lo_d, t["sleeve_mm"] - p.sleeve_overlap_mm)
        # the outlet the pulley was sized at (x -330, z 1700) has no sleeve that works
        self.assertIsNone(Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0).sleeve_take_up_design())

    def test_the_take_up_is_sized_with_the_head_turned_in_azimuth(self):
        # 2026-11-10: the head turns +-30 deg on the turntable while the hopper stays put, so the socket mouth swings
        # sideways (about 200 mm at +45 deg) and the column axis leans out of the x-z plane. The outlet sized at azimuth 0
        # (z 2000) has no sleeve once the turned poses count; the shipped 2025 does.
        old = Feeder(hopper_out_z=2000.0)
        self.assertIsNotNone(old.sleeve_take_up_design(azimuth=False))
        self.assertIsNone(old.sleeve_take_up_design())
        # at +45 deg turned the full 30 deg, the shortest hose that fits is longer than the azimuth-0 slide reaches
        t0 = old.sleeve_take_up_design(azimuth=False)
        turned = old._ranges_from(old.hopper_out_x, t0["start_z"])
        worst = [x for e, a, x in turned if e == old.elev_max and a == old.az_max][0]
        self.assertGreater(worst[0], t0["free_mm"][1] + 20.0)
        p = Feeder()
        self.assertEqual(p.hopper_out_z, 2025.0)
        t = p.sleeve_take_up_design()
        self.assertIsNotNone(t)
        self.assertTrue(any(a == p.az_max for _, a, _, _ in t["poses"]))
        self.assertGreater(t["stroke_mm"], t0["stroke_mm"])     # turning costs slide
        # the 3-D curve family reduces to the planar one at azimuth 0
        from otr_cad.params import _hose_curve_range, _hose_curve_range_3d
        (mx, my, mz), u = p.mouth_world_3d(30.0, 0.0)
        self.assertAlmostEqual(my, 0.0)
        a = _hose_curve_range(p.hopper_out_x, t["start_z"], mx, mz, math.radians(30.0), p.hose_min_bend, p.feed_min_slope_deg)
        b = _hose_curve_range_3d((p.hopper_out_x, 0.0, t["start_z"]), (mx, 0.0, mz), u, p.hose_min_bend, p.feed_min_slope_deg)
        self.assertAlmostEqual(a[0], b[0], places=6)
        self.assertAlmostEqual(a[1], b[1], places=6)
        # a turned head moves the mouth sideways by the column's offset from the turntable axis
        (x30, y30, z30), u30 = p.mouth_world_3d(0.0, 30.0)
        self.assertAlmostEqual(y30, p.feed_col_x * math.sin(math.radians(30.0)), places=6)
        self.assertAlmostEqual(math.hypot(*u30), 1.0)

    def test_take_up_parts_match_the_design(self):
        from otr_cad.feeder import _sleeve_d, take_up_parts
        p = Feeder()
        t = p.sleeve_take_up_design()
        parts = {x.name: x for x in take_up_parts(p)}
        self.assertEqual(set(parts), {"take_up_sleeve", "take_up_collar", "take_up_spring"})
        sb = parts["take_up_sleeve"].placed()[0].bounding_box()
        self.assertAlmostEqual(sb.max.Z - sb.min.Z, t["tube_mm"], places=3)
        self.assertAlmostEqual(sb.min.Z, t["start_z"], places=3)
        bore, od = _sleeve_d(p)
        self.assertGreater(bore, p.hose_od)
        cb = parts["take_up_collar"].placed()[0].bounding_box()
        self.assertTrue(sb.min.Z < cb.min.Z and cb.max.Z < sb.max.Z)   # the collar is inside the tube
        self.assertLess((parts["take_up_collar"].placed()[0] & parts["take_up_sleeve"].placed()[0]).volume, 1.0)
        # a ball dropping down the sleeve meets a funnel, not the hose's rim: the funnel's top is wider than the ball
        self.assertGreater(bore - 2.0 - 6.0, p.ball_d)
        self.assertEqual(take_up_parts(Feeder(hopper_out_x=-330.0, hopper_out_z=1700.0)), [])

    def test_bow_radius_is_the_circular_arc_bound(self):
        import math
        p = Feeder()
        c = min(c for _, c, _ in p.hose_chords())
        r = p.hose_bow_radius()
        if p.hose_len >= math.pi * c / 2:   # more than a semicircle: the bound is the semicircle's radius
            self.assertAlmostEqual(r, c / 2)
        else:
            self.assertAlmostEqual(2 * r * math.asin(c / (2 * r)), p.hose_len, places=3)
        # A longer hose across the same chord never bends tighter than the semicircle.
        self.assertGreaterEqual(r, c / 2 - 1e-9)

    def test_wind_ballast_grows_with_wind_and_shrinks_with_weight(self):
        p = Feeder()
        self.assertGreater(Feeder(design_wind=12.0).ballast_kg(20.0), p.ballast_kg(20.0))
        self.assertLess(p.ballast_kg(40.0), p.ballast_kg(20.0))
        # Moment balance: at the ballast it returns, the base is on the edge of tipping.
        w = p.ballast_kg(20.0) + 20.0
        h = (p.rail_top + p.net_top) / 2 / 1000
        arm = abs(p.wheel_x[0] - p.wheel_x[1]) / 2 / 1000
        self.assertAlmostEqual(w * 9.81 * arm, p.wind_force_n * h, places=6)

    def test_azimuth_drive_sizing(self):
        p = Feeder()
        self.assertEqual(p.az_ratio, 10.0)
        self.assertAlmostEqual(p.az_centre_dist, 1.5 * (150 + 15) / 2)
        # the trimmed plate stays inside the pinion's tip circle with the clearance asked for
        self.assertAlmostEqual(p.az_centre_dist - (p.az_pinion_r + p.az_module) - p.az_trim_r, p.az_clear_mm)
        self.assertEqual(p.check_azimuth(), [])
        d = p.azimuth_drive(0.31, 76.0)
        # triangular profile, by hand: 30 deg in 1 s accelerates at 4 theta / t^2
        self.assertAlmostEqual(d["alpha_rad_s2"], 4 * math.radians(30) / 1.0)
        self.assertAlmostEqual(d["torque_inertia_nm"], 0.31 * 4 * math.radians(30))
        # Lewis bending on the printed sector, by hand
        f_t = d["torque_out_nm"] / (p.az_gear_r / 1000) * p.az_shock
        self.assertAlmostEqual(d["tooth_stress_mpa"], f_t / (p.az_gear_face_mm * p.az_module * (0.484 - 2.87 / 150)))
        # one full step through 10:1 is 0.18 deg
        self.assertAlmostEqual(d["step_deg"], 0.18)
        # the fastest slew is where the margin is exactly the factor asked for
        from dataclasses import replace
        q = replace(p, az_slew_s=d["fastest_slew_s"])
        self.assertAlmostEqual(q.azimuth_drive(0.31, 76.0)["torque_margin"], p.az_torque_factor, places=3)
        # a quarter-second slew of the measured head is beyond the stepper
        fast = replace(p, az_slew_s=0.25)
        self.assertTrue(any("azimuth stepper needs" in b for b in fast.check_azimuth(0.31)))

    def test_azimuth_hose_torque_vanishes_straight_ahead(self):
        # the taut-hose chord lies in the plane through the turntable axis when the head is not turned
        self.assertAlmostEqual(Feeder(az_max=0.0).az_hose_torque_nm(), 0.0, places=9)
        self.assertGreater(Feeder().az_hose_torque_nm(), 0.0)

    def test_azimuth_gear_teeth_printable(self):
        p = Feeder()
        # m1.5 slots are too narrow to laser in 5 mm aluminium (the reason the sector is printed), wide enough to print
        self.assertLess(p.az_root_gap_mm(), 0.6 * p.plate_t)
        self.assertGreater(p.az_root_gap_mm(), p.print_min_gap_mm)
        # the involute half-angle at the pitch circle is half the (thinned) tooth over the pitch radius
        self.assertAlmostEqual(p.az_tooth_half_angle(p.az_gear_r) * 2 * p.az_gear_r, math.pi * 1.5 / 2 - p.az_backlash_mm)
        self.assertTrue(any("slots" in b for b in Feeder(az_module=0.5, az_gear_teeth=450).check_azimuth()))

@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class FeederGeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from otr_cad import feeder as F
        cls.F = F
        cls.p = Feeder()
        cls.parts = F.all_parts(cls.p)

    def test_no_collisions_and_ground_contacts(self):
        from otr_cad.package import collisions, elevation_sweep, ground_contacts
        self.assertEqual(collisions(self.parts), [])
        self.assertEqual(elevation_sweep(self.p), [])
        contacts = ground_contacts(self.parts, ("wheel", "levelling_foot"))
        self.assertEqual(set(contacts), {"wheel", "levelling_foot"})
        for z in contacts.values():
            self.assertAlmostEqual(z, 0.0, places=2)

    def test_elevation_sweep_can_fail(self):
        from otr_cad.package import elevation_sweep
        bad = Feeder(mast_top_z=700.0)  # turntable raised into the head's path
        self.assertEqual(bad.check(), [])
        self.assertTrue(any("turntable" in c for c in elevation_sweep(bad, steps=2)))

    def test_head_tilts_nose_up(self):
        up = dict(self.F.swept_solids(self.p, 45.0))["launcher_wheel[0]"].center()
        flat = dict(self.F.swept_solids(self.p, 0.0))["launcher_wheel[0]"].center()
        self.assertLess(up.X, flat.X)   # the top wheel swings back when the nose rises
        self.assertLess(up.Z, flat.Z)

    def test_cheek_feet_land_on_turntable_plate_holes(self):
        plate = next(x for x in self.parts if x.name == "turntable_plate")
        holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        checked = 0
        foot = next(x for x in self.parts if x.name == "cheek_foot")
        for solid in foot.placed():
            for f in solid.faces():
                if f.geom_type != GeomType.CYLINDER or abs(f.radius - 2.0) > 1e-6:
                    continue
                ax = f.axis_of_rotation
                if abs(abs(ax.direction.Z) - 1) > 1e-6:
                    continue
                x, y = ax.position.X, ax.position.Y
                self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes), (x, y))
                checked += 1
        self.assertEqual(checked, 4)

    def test_mast_plate_holes_meet_posts_and_bearing(self):
        plate = next(x for x in self.parts if x.name == "mast_plate")
        centres = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                   if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.75) < 1e-6]
        for px, py in [(x, y) for x, y in self.F._post_xy(self.p)]:
            self.assertTrue(any(math.hypot(px - cx, py - cy) < 0.01 for cx, cy in centres), (px, py))
        self.assertEqual(len(centres), 8)

    def test_laser_parts_fit_a_standard_sheet(self):
        for part in self.parts:
            if part.kind == "laser":
                bb = part.flat.bounding_box()
                self.assertLessEqual(max(bb.size.X, bb.size.Y), 1220, part.name)

    def test_feed_screws_land_on_head_plate_holes(self):
        """Every pilot in the printed floor and roof must meet a hole in both head plates."""
        p = self.p
        plate = next(x for x in self.parts if x.name == "head_motor_plate")
        # the plate sketch is already in the head frame (x forward, z up from the ball path)
        holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        checked = 0
        for name in ("feed_floor", "feed_roof_column"):
            part = next(x for x in self.parts if x.name == name)
            for f in part.shape.faces():
                if f.geom_type != GeomType.CYLINDER or abs(f.radius - 2.0) > 1e-6:
                    continue
                ax = f.axis_of_rotation
                if abs(abs(ax.direction.Y) - 1) > 1e-6:
                    continue
                x, z = ax.position.X, ax.position.Z
                self.assertTrue(any(math.hypot(x - hx, z - hz) < 0.01 for hx, hz in holes), (name, x, z))
                checked += 1
        self.assertEqual(checked, 8)

    def test_retainer_blocks_a_free_ball_but_leaves_the_pocket_clear(self):
        from build123d import Location, Sphere
        p = self.p
        sh = next(x for x in self.parts if x.name == "feed_shuttle").shape
        zc = p.shuttle_z0 + p.shuttle_h / 2

        def hit(x):
            return (Sphere(p.ball_d / 2).moved(Location((x, 0, zc))) & sh).volume

        self.assertLess(hit(p.feed_col_x), 1.0)                      # a ball sits in the pocket untouched
        x_front = p.feed_col_x + 60.0
        self.assertGreater(max(hit(x_front - p.retain_len + d) for d in range(0, 40, 4)), 500.0)  # arms are in its way
        self.assertLess(hit(x_front + 80.0), 1.0)                    # clear again beyond the front

    def test_shuttle_meters_one_ball_and_stays_clear_when_advanced(self):
        from build123d import Cylinder, Location
        from otr_cad.package import clashes
        p = self.p
        sh = next(x for x in self.parts if x.name == "feed_shuttle")
        top = p.shuttle_z0 + p.shuttle_h
        # A slice of the column bore just above the shuttle: open when retracted, shut when advanced.
        bore = Cylinder(p.hole_d / 2, 4.0).moved(Location((p.head_x + p.feed_col_x, 0, p.launch_z + top - 4.0 + 2.0)))
        retracted = sh.shape.moved(Location((p.head_x, 0, p.launch_z)))
        advanced = sh.shape.moved(Location((p.head_x + p.feed_stroke, 0, p.launch_z)))
        self.assertLess((retracted & bore).volume / bore.volume, 0.35)  # only the arms, which flank the pocket
        self.assertGreater((advanced & bore).volume / bore.volume, 0.97)
        others = [(f"{x.name}[{i}]", s) for x in self.parts if x.name in self.F.HEAD_PARTS and x.name != "feed_shuttle"
                  for i, s in enumerate(x.placed())]
        self.assertEqual(clashes([("shuttle advanced", advanced)] + others), [])

    def test_hopper_posts_stand_on_the_deck_and_meet_the_shelf(self):
        p = self.p
        for part in (x for x in self.parts if x.name.startswith("hopper_post")):
            bb = part.placed()[0].bounding_box()
            self.assertAlmostEqual(bb.min.Z, p.rail_top + p.plate_t, places=3)
            self.assertAlmostEqual(bb.max.Z, p.shelf_underside_z(part.placed()[0].center().X + 10.0), places=2)
        deck = next(x for x in self.parts if x.name == "base_deck")
        xs = {round(x) for x, _ in self.F._shelf_posts(p)}
        self.assertEqual(xs, {round(p.post_rear_x), round(p.post_front_x)})
        for x, y in self.F._shelf_posts(p):
            bb = deck.placed()[0].bounding_box()
            self.assertTrue(bb.min.X < x < bb.max.X and bb.min.Y < y < bb.max.Y, (x, y))

    def test_hopper_braces_are_sized_and_clear_posts_and_shelf(self):
        from otr_cad.package import clashes
        p = self.p
        self.assertEqual(p.check_hopper_frame(), [])
        for ax in "xy":
            self.assertGreater(p.brace_buckling_n(ax), p.brace_min_factor * p.brace_force_n(ax))
            part = next(x for x in self.parts if x.name == f"hopper_brace_{ax}")
            self.assertAlmostEqual(part.shape.bounding_box().size.X if ax == "x" else part.shape.bounding_box().size.Y,
                                   p.brace_len(ax), places=3)
        named = [(f"{x.name}[{i}]", s) for x in self.parts
                 if x.name.startswith("hopper_") and x.name not in ("hopper_tub", "hopper_spigot", "hopper_hose")
                 for i, s in enumerate(x.placed())]
        self.assertEqual(clashes(named), [])
        # A weaker brace or a much larger sway load must be refused.
        self.assertTrue(Feeder(ext_I_2020_mm4=500.0).check_hopper_frame())
        self.assertTrue(Feeder(side_load_min_n=1500.0).check_hopper_frame())

    def test_head_plates_clear_the_ball(self):
        """The ball path (a 67 mm cylinder along x) must not touch either head plate."""
        from build123d import Cylinder, Location
        p = self.p
        ball = Cylinder(p.ball_d / 2, 400.0).moved(Location((p.head_x, 0, p.launch_z), (0, 90, 0)))
        for name in ("head_motor_plate", "head_guard_plate"):
            plate = next(x for x in self.parts if x.name == name)
            for s in plate.placed():
                self.assertLess((s & ball).volume, 1.0, name)

    def test_azimuth_sweep_is_clear_and_can_fail(self):
        from otr_cad.package import azimuth_sweep
        self.assertEqual(azimuth_sweep(self.p), [])
        # the front posts where they were until 2026-11-10: turned 30 deg nose up, the head's plates cut into them
        self.assertTrue(any("hopper_post_front" in c for c in azimuth_sweep(Feeder(shelf_post_y=225.0))))

    def test_turning_inertia_from_the_cad(self):
        j0, m0 = self.F.turning_inertia(self.p, 0.0)
        j45, m45 = self.F.turning_inertia(self.p, 45.0)
        self.assertAlmostEqual(m0, m45)              # tilting moves mass, it does not add any
        self.assertGreater(j45, j0)                  # nose up swings the column and plates out behind the axis
        self.assertLessEqual(j45, self.p.az_inertia_kgm2)
        # the motors alone, as point masses on their axes: a floor the solid model must exceed
        r = (self.p.plate_half_y + self.p.plate_t + self.p.motor_len / 2) / 1000
        self.assertGreater(j0, 2 * self.F.COTS_MASS_KG["launcher_motor"] * r * r)

    def test_azimuth_gear_bolts_and_pinion(self):
        plate = next(x for x in self.parts if x.name == "turntable_plate")
        for v in plate.flat.vertices():   # every point of the outline is inside the trim circle
            self.assertLessEqual(math.hypot(v.X - self.p.head_x, v.Y), self.p.az_trim_r + 1e-6)
        holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
        for x, y in self.F._az_bolts(self.p):
            self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes), (x, y))
        sector = next(x for x in self.parts if x.name == "az_gear_sector").placed()[0]
        sb = sector.bounding_box()
        self.assertAlmostEqual(sb.max.Z, self.p.mast_top_z + self.p.plate_t + self.p.bearing_h, places=6)  # under the plate
        self.assertAlmostEqual(sb.max.Y, self.p.az_gear_r + self.p.az_module, places=1)
        # tooth count: the sector spans +-(az_max + margin) of pitch angles
        prof = self.F.az_gear_profile(self.p)
        tips = [q for q in prof if abs(math.hypot(*q) - (self.p.az_gear_r + self.p.az_module)) < 1e-6]
        n = int(math.radians(self.p.az_sector_half_deg) // (2 * math.pi / self.p.az_gear_teeth))
        self.assertEqual(len(tips), 2 * (2 * n + 1))
        mast = next(x for x in self.parts if x.name == "mast_plate")
        bores = [(e.arc_center.X, e.arc_center.Y) for e in mast.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - self.F.AZ_BOSS_D / 2) < 1e-6]
        self.assertEqual(len(bores), 1)
        self.assertAlmostEqual(bores[0][0], self.p.head_x)
        self.assertAlmostEqual(bores[0][1], self.p.az_centre_dist)

@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class FeederPackageTest(unittest.TestCase):
    def test_committed_package_is_current(self):
        import zipfile
        self.assertTrue(COMMITTED_FEEDER.exists(), "run: python -m otr_cad feeder --out ../manufacturing/feeder")
        with zipfile.ZipFile(COMMITTED_FEEDER) as z:
            committed = json.loads(z.read("feeder/manifest.json"))
        with tempfile.TemporaryDirectory() as d:
            subprocess.run([sys.executable, "-m", "otr_cad", "feeder", "--out", str(Path(d) / "feeder")],
                           cwd=HERE.parent, check=True, capture_output=True)
            fresh = json.loads((Path(d) / "feeder" / "manifest.json").read_text())
        self.assertEqual(committed["params"], json.loads(json.dumps(fresh["params"])))
        folder = json.loads((COMMITTED_FEEDER.parent / "feeder" / "manifest.json").read_text())
        self.assertEqual(folder["files"], committed["files"], "manufacturing/feeder/ and the zip disagree")
        stale = sorted(k for k in set(committed["files"]) | set(fresh["files"])
                       if committed["files"].get(k) != fresh["files"].get(k))
        self.assertEqual(stale, [], "stale: rebuild with python -m otr_cad feeder --out ../manufacturing/feeder")
        self.assertEqual(committed["design_rules"], [])
        self.assertEqual(committed["collisions"], [])


if __name__ == "__main__":
    unittest.main()
