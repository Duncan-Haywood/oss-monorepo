import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_print import geom, mesh, strength as S  # noqa: E402

D = geom.Design(w=22.8, slope=15.92, bow=0.59, r=2.86)


class Mesh(unittest.TestCase):
    def test_every_shell_is_closed_and_oriented(self):
        for d in (D, geom.Design(w=16, slope=15.92, bow=0.59, r=2.86), geom.Design(w=20.5, slope=22, bow=0, r=0.15),
                  geom.Design(w=22.5, slope=16, bow=-1.0, r=2.0, depth=5)):
            for name, (v, f) in mesh.hanger_mesh(d):
                self.assertEqual(mesh.edge_counts(f), 0, name)
                self.assertGreater(mesh.volume(v, f), 0, name)

    def test_volume_is_outline_area_times_depth(self):
        for s, (name, (v, f)) in zip(geom.shells(D), mesh.hanger_mesh(D)):
            a = abs(geom.area(s["outline"])) - (abs(geom.area(s["hole"])) if "hole" in s else 0.0)
            self.assertAlmostEqual(mesh.volume(v, f) / (a * D.depth), 1.0, delta=0.02, msg=name)

    def test_arms_are_mirror_images(self):
        m = dict(mesh.hanger_mesh(D))
        self.assertAlmostEqual(mesh.volume(*m["arm_left"]), mesh.volume(*m["arm_right"]), places=3)

    def test_arm_reaches_the_design_width(self):
        o = geom.arm_outline(D)
        # w is the arm length along the slope (hanger-fit's definition), so the horizontal reach
        # is (w - r) cos(slope) + r, less than w
        reach = (D.w - D.r) * math.cos(math.radians(D.slope)) + D.r
        self.assertAlmostEqual(max(x for x, _ in o) / 10.0, reach, delta=0.15)

    def test_stl_and_scad_carry_every_triangle_and_shell(self):
        m = mesh.hanger_mesh(D)
        txt = mesh.stl(m)
        self.assertEqual(txt.count("facet normal"), sum(len(f) for _, (_, f) in m))
        sc = mesh.scad(D)
        self.assertEqual(sc.count("linear_extrude"), 5)
        self.assertIn("difference()", sc)


class Strength(unittest.TestCase):
    def test_hand_calculation(self):
        d = geom.Design(w=20, slope=0, bow=0, r=1.0, depth=10)
        # F = 1.5*9.81*2/2 = 14.715 N, lever 190 mm, Z = 10*20^2/6 = 666.67 mm^3
        self.assertAlmostEqual(S.root_stress(d), 2.0 * 14.715 * 190 / 666.6667, places=3)
        self.assertAlmostEqual(S.safety_factor(d), 40.0 / S.root_stress(d), places=9)

    def test_depth_for_sf_inverts_safety_factor(self):
        d = geom.Design(w=21, slope=20, bow=0, r=1.0)
        dd = geom.Design(d.w, d.slope, d.bow, d.r, depth=S.depth_for_sf(d, 3.0))
        self.assertAlmostEqual(S.safety_factor(dd), 3.0, places=6)

    def test_thin_ends_are_weaker(self):
        thin = geom.Design(w=20, slope=20, bow=0, r=0.15)
        round_ = geom.Design(w=20, slope=20, bow=0, r=2.0)
        self.assertLess(S.safety_factor(thin), 1.0)
        self.assertGreater(S.safety_factor(round_), 3.0)

    def test_deflection_scales_with_cube_of_length(self):
        a = geom.Design(w=12, slope=0, bow=0, r=1.0)
        b = geom.Design(w=23, slope=0, bow=0, r=1.0)
        self.assertAlmostEqual(S.tip_deflection(b) / S.tip_deflection(a), (220 / 110) ** 3, places=6)

    def test_sliced_mass_is_below_solid(self):
        sh = geom.shells(D)
        solid = sum(abs(geom.area(s["outline"])) for s in sh) * D.depth * S.RHO
        self.assertLess(S.sliced_mass_g(sh, D.depth), solid)


class Bed(unittest.TestCase):
    def test_turning_helps_and_halves_fit_better(self):
        whole = geom.bbox_fits(D, 400)
        self.assertTrue(whole[0])
        self.assertFalse(geom.bbox_fits(D, 220)[0])
        self.assertTrue(geom.bbox_fits(D, 220, half=True)[0])


if __name__ == "__main__":
    unittest.main()
