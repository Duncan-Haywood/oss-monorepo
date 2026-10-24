"""CAD checks. Skipped when build123d is not installed (pip install -r cad/requirements.txt)."""

import json
import math
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

try:
    from build123d import GeomType
    HAVE_CAD = True
except ImportError:  # pragma: no cover
    HAVE_CAD = False

from orm_cad.params import Dock, Mower

HERE = Path(__file__).resolve().parent
MANUFACTURING = HERE.parent.parent / "manufacturing"


class ParamsTest(unittest.TestCase):
    def test_defaults_pass_design_rules(self):
        p = Mower()
        self.assertEqual(p.check(), [])
        self.assertEqual(Dock().check(), [])
        self.assertGreaterEqual(p.guard_r_in - p.blade_tip_r, 12)
        self.assertLess(p.guard_bottom, p.cut_min)
        self.assertGreaterEqual(p.edge_to_blade(), 100)

    def test_rules_catch_bad_changes(self):
        def fails(match, **kw):
            rules = Mower(**kw).check()
            self.assertTrue(any(match in r for r in rules), f"{kw}: {rules}")
        fails("guard wall", guard_r_in=125.0, rod_r=118.0, lobe_r=4.0)
        fails("below the blade plane", guard_bottom=18.0)
        fails("shell edge", shell_half_w=200.0, wheel_gap=2.0, wheel_w=20.0)
        fails("hits the chassis", cut_max=60.0)
        fails("caster", caster_x=380.0, caster_y=100.0)
        fails("printer bed", shell_cols=2)

    def test_mower_matches_the_planner_and_power_defaults(self):
        """The Python package's defaults are read off this design: keep them in step."""
        sys.path.insert(0, str(HERE.parent.parent / "src"))
        from mowerbot import drive, planner, slope
        p = Mower()
        self.assertAlmostEqual(planner.Settings().cut_width * 1000, p.cut_width)
        self.assertAlmostEqual(drive.DiffDrive().track_width * 1000, p.track)
        self.assertAlmostEqual(slope.Chassis().track * 1000, p.track)
        self.assertAlmostEqual(slope.Chassis().wheelbase * 1000, p.wheelbase)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class GeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from orm_cad import mower as M
        cls.M = M
        cls.p = Mower()
        cls.parts = M.all_parts(cls.p)

    def test_no_collisions_at_any_height_or_shell_position(self):
        from orm_cad.package import collisions, height_sweep, shell_travel
        self.assertEqual(collisions(self.parts), [])
        self.assertEqual(height_sweep(self.p), [])
        self.assertEqual(shell_travel(self.p, self.parts), [])

    def test_collision_checks_can_fail(self):
        from orm_cad.package import collisions, height_sweep, shell_travel
        # Drive motors long enough to meet in the middle.
        self.assertTrue(any("gearmotor[0] x gearmotor[1]" in c for c in collisions(self.M.all_parts(Mower(motor_len=160.0)))))
        # Rods moved inside the blade-tip circle hit the spinning blades.
        self.assertTrue(any("blade_sweep" in c for c in height_sweep(Mower(rod_r=110.0))))
        # A shell that can travel further than its clearance to the wheels.
        p = Mower(shell_travel=30.0)
        self.assertTrue(shell_travel(p, self.M.all_parts(p)))

    def test_wheels_and_casters_touch_the_ground_and_nothing_else_does(self):
        from orm_cad.package import ground_clearance, ground_contacts
        contacts = ground_contacts(self.parts, ("wheel", "caster_wheel"))
        self.assertEqual(set(contacts), {"wheel", "caster_wheel"})
        for z in contacts.values():
            self.assertAlmostEqual(z, 0.0, places=2)
        clear = ground_clearance(self.parts, ("wheel", "caster_wheel", "caster_fork", "blade_sweep", "blade_disc"))
        self.assertGreaterEqual(clear, 10.0)

    def test_guard_surrounds_the_blade_below_the_blade_plane(self):
        guard = next(x for x in self.parts if x.name == "guard_segment")
        for h in self.p.cut_steps:
            for s in guard.placed():
                self.assertLess(s.bounding_box().min.Z, h)
        # The four quarters close the ring: sample the circle between the walls.
        r = self.p.guard_r_in + self.p.guard_wall / 2
        z = self.p.guard_bottom + 1
        from build123d import Vector
        placed = guard.placed()
        for k in range(72):
            a = math.radians(5 * k + 2.5)
            pt = Vector(self.p.blade_x + r * math.cos(a), r * math.sin(a), z)
            self.assertTrue(any(s.is_inside(pt) for s in placed), f"gap in the guard at {5 * k + 2.5} deg")

    def test_printed_part_pilots_land_on_holes(self):
        """Every vertical pilot hole in a printed part that bolts to a laser part must land on one of its holes."""
        lasers = []
        for part in self.parts:
            if part.kind != "laser":
                continue
            loc = part.placements[0].position
            holes = [(e.arc_center.X + loc.X, e.arc_center.Y + loc.Y) for e in part.flat.edges()
                     if e.geom_type == GeomType.CIRCLE and abs(e.radius - 2.2) < 1e-6]
            lasers.append((part.name, loc.Z, loc.Z + part.thickness, holes))
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
                    z0, z1 = f.bounding_box().min.Z, f.bounding_box().max.Z
                    x, y = ax.position.X, ax.position.Y
                    for name, zb, zt, holes in lasers:
                        if abs(z0 - zt) < 1e-3 or abs(z1 - zb) < 1e-3:
                            self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes),
                                            f"{part.name} pilot at ({x:.1f}, {y:.1f}) has no hole in {name}")
                            checked += 1
        # cradles 4, posts 16, guard 4, contact block 4, mast socket 4, blade hub 3
        self.assertGreaterEqual(checked, 4 + 16 + 4 + 4 + 4 + 3)

    def test_height_plate_hangs_on_the_rods(self):
        plate = self.M.height_plate(self.p, self.p.cut_nominal)
        holes = [(e.arc_center.X + self.p.blade_x, e.arc_center.Y) for e in plate.flat.edges()
                 if e.geom_type == GeomType.CIRCLE and abs(e.radius - (self.p.rod_d + 0.4) / 2) < 1e-6]
        for x, y in self.p.rod_points():
            self.assertTrue(any(math.hypot(x - hx, y - hy) < 1e-6 for hx, hy in holes))

    def test_laser_parts_fit_a_standard_sheet(self):
        for part in self.parts:
            if part.kind == "laser":
                bb = part.flat.bounding_box()
                self.assertLessEqual(max(bb.size.X, bb.size.Y), 1220, part.name)


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class DockTest(unittest.TestCase):
    def _clash(self, **kw):
        from orm_cad import dock as D
        from orm_cad.package import _named, clashes
        p = Dock(**kw)
        return clashes(D.docked_mower(p), against=_named([x for x in D.all_parts(p) if x.name != "contact_strip"]))

    def test_the_default_mower_docks_without_touching_anything_but_the_strips(self):
        from orm_cad import dock as D
        self.assertEqual(self._clash(), [])
        self.assertGreaterEqual(D.contact_overlap(Dock()), 6)

    def test_docking_check_can_fail(self):
        self.assertTrue(any("shell" in c for c in self._clash(tower_h=150.0)))
        self.assertTrue(any("wheel_guide" in c for c in self._clash(guide_y=192.0)))


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class PackageTest(unittest.TestCase):
    def test_package_contents_and_reproducibility(self):
        import ezdxf
        from orm_cad.package import build
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "dock"
            m = build(out, Dock(), drawings=False)
            self.assertEqual((m["design_rules"], m["collisions"]), ([], []))
            first = (Path(d) / "dock-package.zip").read_bytes()
            build(out, Dock(), drawings=False)
            self.assertEqual(first, (Path(d) / "dock-package.zip").read_bytes())
            for name in ("bom.csv", "laser_parts.csv", "print_parts.csv", "README.txt", "step/assembly.step"):
                self.assertTrue((out / name).exists(), name)
            for f in (out / "laser").glob("*.dxf"):
                doc = ezdxf.readfile(f)
                self.assertEqual(doc.header.get("$INSUNITS"), 4)  # millimetres
                self.assertGreater(len(list(doc.modelspace())), 0)

    def _fresh(self, robot):
        # A fresh process, as a maker runs it.
        with tempfile.TemporaryDirectory() as d:
            subprocess.run([sys.executable, "-m", "orm_cad", robot, "--out", str(Path(d) / robot)],
                           cwd=HERE.parent, check=True, capture_output=True)
            return json.loads((Path(d) / robot / "manifest.json").read_text())

    def _check_committed(self, robot, min_dxf, min_stl):
        z = MANUFACTURING / f"{robot}-package.zip"
        self.assertTrue(z.exists(), f"run: python -m orm_cad {robot} --out ../manufacturing/{robot}")
        with zipfile.ZipFile(z) as zf:
            committed = json.loads(zf.read(f"{robot}/manifest.json"))
        folder = json.loads((MANUFACTURING / robot / "manifest.json").read_text())
        self.assertEqual(folder["files"], committed["files"], f"manufacturing/{robot}/ and the zip disagree")
        self.assertEqual((committed["design_rules"], committed["collisions"]), ([], []))
        self.assertGreaterEqual(len([k for k in committed["files"] if k.endswith(".dxf")]), min_dxf)
        self.assertGreaterEqual(len([k for k in committed["files"] if k.endswith(".stl")]), min_stl)
        fresh = self._fresh(robot)
        self.assertEqual(committed["params"], json.loads(json.dumps(fresh["params"])))
        stale = sorted(k for k in set(committed["files"]) | set(fresh["files"])
                       if committed["files"].get(k) != fresh["files"].get(k))
        self.assertEqual(stale, [], f"stale: rebuild with python -m orm_cad {robot} --out ../manufacturing/{robot}")

    def test_committed_mower_package_is_current(self):
        self._check_committed("mower", 4, 14)

    def test_committed_dock_package_is_current(self):
        self._check_committed("dock", 1, 2)


if __name__ == "__main__":
    unittest.main()
