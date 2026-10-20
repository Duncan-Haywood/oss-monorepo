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

from otr_cad.params import Collector

HERE = Path(__file__).resolve().parent
COMMITTED = HERE.parent.parent / "manufacturing" / "collector-package.zip"


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


if __name__ == "__main__":
    unittest.main()
