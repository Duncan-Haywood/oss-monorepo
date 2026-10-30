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

    def test_head_plates_clear_the_ball(self):
        """The ball path (a 67 mm cylinder along x) must not touch either head plate."""
        from build123d import Cylinder, Location
        p = self.p
        ball = Cylinder(p.ball_d / 2, 400.0).moved(Location((p.head_x, 0, p.launch_z), (0, 90, 0)))
        for name in ("head_motor_plate", "head_guard_plate"):
            plate = next(x for x in self.parts if x.name == name)
            for s in plate.placed():
                self.assertLess((s & ball).volume, 1.0, name)


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
