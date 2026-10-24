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

from ofr_cad.params import VARIANTS, Robot

HERE = Path(__file__).resolve().parent
MANUFACTURING = HERE.parent.parent / "manufacturing"


class ParamsTest(unittest.TestCase):
    def test_defaults_pass_design_rules(self):
        for v in VARIANTS:
            self.assertEqual(Robot(v).check(), [], v)

    def test_rules_catch_bad_changes(self):
        self.assertTrue(any("gearmotor" in r for r in Robot(wheel_d=60.0).check()))
        self.assertTrue(any("side brush sweeps" in r for r in Robot(side_brush_r=70.0).check()))
        self.assertTrue(any("cliff sensors lead" in r for r in Robot(cliff_front_deg=(10.0, 80.0, -10.0, -80.0)).check()))
        self.assertTrue(any("pad lift" in r for r in Robot("mop", lift=6.0).check()))
        self.assertTrue(any("fan" in r for r in Robot(bin_h=60.0).check()))
        self.assertTrue(any("nozzle" in r for r in Robot("combo", mop_x1_combo=-60.0).check()))

    def test_variants_carry_the_right_modules(self):
        self.assertTrue(Robot("vacuum").has_vacuum and not Robot("vacuum").has_mop)
        self.assertTrue(Robot("mop").has_mop and not Robot("mop").has_vacuum)
        self.assertTrue(Robot("combo").has_mop and Robot("combo").has_vacuum)
        self.assertGreater(Robot("vacuum").bin_ml(), Robot("combo").bin_ml())
        self.assertGreater(Robot("mop").tank_ml(), Robot("combo").tank_ml())


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class GeometryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from ofr_cad import platform as M
        cls.M = M
        cls.parts = {v: M.all_parts(Robot(v)) for v in VARIANTS}

    def test_no_collisions_in_any_variant_or_motion(self):
        from ofr_cad.package import bumper_sweep, collisions, lift_sweep
        for v, parts in self.parts.items():
            p = Robot(v)
            self.assertEqual(collisions(parts), [], v)
            self.assertEqual(lift_sweep(p, parts), [], v)
            self.assertEqual(bumper_sweep(p, parts), [], v)

    def test_ground_contacts(self):
        from ofr_cad.package import ground_contacts
        want = {"vacuum": {"wheel", "ball_caster"}, "mop": {"wheel", "ball_caster", "mop_pad"},
                "combo": {"wheel", "ball_caster", "mop_pad"}}
        for v, parts in self.parts.items():
            contacts = ground_contacts(parts)
            self.assertEqual(set(contacts), want[v])
            for z in contacts.values():
                self.assertAlmostEqual(z, 0.0, places=2)

    def test_collision_checks_can_fail(self):
        from ofr_cad.package import collisions, lift_sweep
        bad = self.M.all_parts(Robot(hub_gap=-6.0))       # gearmotor pushed into the wheel
        self.assertTrue(any("wheel" in c and "gearmotor" in c for c in collisions(bad)))
        p = Robot("mop", lift=8.0)
        self.assertTrue(lift_sweep(p, self.M.all_parts(p)))

    def test_balance(self):
        from ofr_cad.package import balance
        for v, parts in self.parts.items():
            com, mass, bad = balance(Robot(v), parts)
            self.assertEqual(bad, [], v)
            self.assertTrue(1500 < mass < 4000, v)
        # Without the rear caster a full mop tank would tip the robot back.
        mop = Robot("mop")
        com, _, _ = balance(mop, self.parts["mop"])
        self.assertLess(com[0], 10.0)

    def _pilots_land_on(self, plate_name, z_faces, clear_r=1.7):
        """Every vertical insert pilot in a printed part that meets a plate face must sit over one of its holes."""
        checked = 0
        for v, parts in self.parts.items():
            plate = next(x for x in parts if x.name == plate_name)
            holes = [(e.arc_center.X, e.arc_center.Y) for e in plate.flat.edges()
                     if e.geom_type == GeomType.CIRCLE and abs(e.radius - clear_r) < 1e-6]
            for part in parts:
                if part.kind != "print":
                    continue
                for solid in part.placed():
                    for f in solid.faces():
                        if f.geom_type != GeomType.CYLINDER or abs(f.radius - 2.0) > 1e-6:
                            continue
                        ax = f.axis_of_rotation
                        if abs(abs(ax.direction.Z) - 1) > 1e-6:
                            continue
                        bb = f.bounding_box()
                        if not any(abs(bb.min.Z - z) < 1e-3 or abs(bb.max.Z - z) < 1e-3 for z in z_faces(Robot(v))):
                            continue
                        x, y = ax.position.X, ax.position.Y
                        self.assertTrue(any(math.hypot(x - hx, y - hy) < 0.01 for hx, hy in holes),
                                        f"{v}: {part.name} pilot at ({x:.1f}, {y:.1f}) has no {plate_name} hole")
                        checked += 1
        return checked

    def test_printed_parts_bolt_to_base_holes(self):
        n = self._pilots_land_on("base_plate", lambda p: (p.base_top, p.base_z, p.base_top + p.tab_gap))
        self.assertGreaterEqual(n, 3 * (4 + 12 + 4 + 2) + 2 * 6 + 2 * 4)

    def test_posts_bolt_to_deck_holes(self):
        n = self._pilots_land_on("top_deck", lambda p: (p.deck_z,))
        self.assertEqual(n, 3 * 4)

    def test_parts_fit_bed_and_sheet(self):
        for v, parts in self.parts.items():
            for part in parts:
                bb = (part.flat or part.shape).bounding_box()
                if part.kind == "print":
                    self.assertLessEqual(max(bb.size.X, bb.size.Y), 220, f"{v} {part.name}")
                if part.kind == "laser":
                    self.assertLessEqual(max(bb.size.X, bb.size.Y), 600, f"{v} {part.name}")

    def test_everything_inside_the_footprint(self):
        """Nothing sticks out past the bumper's outer circle except the side brush (that is its job)."""
        from build123d import Box, Cylinder, Location
        for v, parts in self.parts.items():
            p = Robot(v)
            outside = Box(1000, 1000, 400).moved(Location((0, 0, 150))) - Cylinder(p.shell_r + 0.01, 400).moved(
                Location((0, 0, 150)))
            for part in parts:
                if part.name == "side_brush_sweep":
                    continue
                for s in part.placed():
                    self.assertLess((s & outside).volume, 1.0, f"{v} {part.name}")


@unittest.skipUnless(HAVE_CAD, "build123d not installed")
class PackageTest(unittest.TestCase):
    def test_package_contents_and_reproducibility(self):
        import ezdxf
        from ofr_cad.package import build
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "combo"
            m = build(out, Robot("combo"), drawings=False)
            self.assertEqual(m["design_rules"], [])
            self.assertEqual(m["collisions"], [])
            for name in ("bom.csv", "cut_list.csv", "laser_parts.csv", "print_parts.csv", "README.txt",
                         "step/assembly.step"):
                self.assertTrue((out / name).exists(), name)
            first = (Path(d) / "combo-package.zip").read_bytes()
            build(out, Robot("combo"), drawings=False)
            self.assertEqual(first, (Path(d) / "combo-package.zip").read_bytes())
            dxfs = sorted((out / "laser").glob("*.dxf"))
            self.assertEqual(len(dxfs), 2)
            for f in dxfs:
                doc = ezdxf.readfile(f)
                self.assertEqual(doc.header.get("$INSUNITS"), 4)  # millimetres
                self.assertGreater(len(list(doc.modelspace())), 0)
            self.assertGreaterEqual(len(list((out / "print").glob("*.stl"))), 14)

    def test_committed_packages_are_current(self):
        """manufacturing/<variant>-package.zip must match what the generator makes today."""
        for v in VARIANTS:
            committed_zip = MANUFACTURING / f"{v}-package.zip"
            self.assertTrue(committed_zip.exists(), f"run: python -m ofr_cad {v} --out ../manufacturing/{v}")
            with zipfile.ZipFile(committed_zip) as z:
                committed = json.loads(z.read(f"{v}/manifest.json"))
            # A fresh process, as a maker runs it: ezdxf's writer state can carry over between builds.
            with tempfile.TemporaryDirectory() as d:
                subprocess.run([sys.executable, "-m", "ofr_cad", v, "--out", str(Path(d) / v)],
                               cwd=HERE.parent, check=True, capture_output=True)
                fresh = json.loads((Path(d) / v / "manifest.json").read_text())
            self.assertEqual(committed["params"], json.loads(json.dumps(fresh["params"])))
            folder = json.loads((MANUFACTURING / v / "manifest.json").read_text())
            self.assertEqual(folder["files"], committed["files"], f"manufacturing/{v}/ and the zip disagree")
            stale = sorted(k for k in set(committed["files"]) | set(fresh["files"])
                           if committed["files"].get(k) != fresh["files"].get(k))
            self.assertEqual(stale, [], f"stale: rebuild with python -m ofr_cad {v} --out ../manufacturing/{v}")
            self.assertEqual(committed["design_rules"], [])
            self.assertEqual(committed["collisions"], [])


if __name__ == "__main__":
    unittest.main()
