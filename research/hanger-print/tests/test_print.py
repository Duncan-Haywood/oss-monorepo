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

    def test_half_carries_the_post_and_the_turn_search_is_fine(self):
        # One half of a two-piece hanger must carry the post and loop; and a 5-degree turn grid
        # misses the best angle by up to 2.6 mm here (quality audit 2026-11-17-hanger-print).
        xxl = geom.Design(w=25.8, slope=15.92, bow=0.59, r=2.86)
        pts = [p for s in geom.shells(xxl) if s["name"] in ("arm_right", "hub", "post", "loop")
               for p in s["outline"]]

        def side(a):
            c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
            xs = [c * x - s_ * y for x, y in pts]
            ys = [s_ * x + c * y for x, y in pts]
            return max(max(xs) - min(xs), max(ys) - min(ys))

        ref = min(side(k / 10.0) for k in range(900))
        fits, _, bw, bh = geom.bbox_fits(xxl, 220, half=True)
        self.assertAlmostEqual(max(bw, bh), ref, delta=0.5)
        self.assertFalse(fits)


class Loop(unittest.TestCase):
    def test_post_stays_out_of_the_loop_hole(self):
        # Run to the hole's centre, the 14 mm post filled the lower half of the 10 mm hole once
        # the slicer merged the shells, so no 10 mm pin could pass (found 2026-11-18).
        post = {s["name"]: s for s in geom.shells(D)}["post"]["outline"]
        cy = geom.POST_H
        for x, y in post:
            self.assertGreaterEqual(math.hypot(x, y - cy), geom.LOOP_RI - 1e-9)
        top = max(y for _, y in post)
        self.assertLessEqual(top, cy - geom.LOOP_RI + 1e-9)
        # and it still reaches the ring, so the loop is attached
        self.assertGreater(top, cy - geom.LOOP_RO)


CAD = Path(__file__).resolve().parents[1] / "experiments" / "cad"


def read_stl(path):
    """Stdlib ASCII STL reader: (verts, faces) with vertices merged by their printed coordinates."""
    idx, verts, faces, tri = {}, [], [], []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith("vertex"):
            key = tuple(line.split()[1:4])
            if key not in idx:
                idx[key] = len(verts)
                verts.append(tuple(float(c) for c in key))
            tri.append(idx[key])
            if len(tri) == 3:
                faces.append(tuple(tri))
                tri = []
    return verts, faces


def min_square(verts):
    best = None
    for a in range(90):
        c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
        xs = [c * x - s_ * y for x, y, _ in verts]
        ys = [s_ * x + c * y for x, y, _ in verts]
        side = max(max(xs) - min(xs), max(ys) - min(ys))
        best = side if best is None else min(best, side)
    return best


class TwoPiece(unittest.TestCase):
    """The shipped two-piece files (quality audit 2026-11-17-hanger-print, defect 0: the only
    print files fitted no 220 mm bed). Stdlib only, so it checks what a user downloads."""

    def test_every_half_is_closed_flat_on_the_bed_and_fits_220(self):
        for w in (16, 19, 22, 25):
            for part in ("A", "B"):
                v, f = read_stl(CAD / f"rack_w{w}_{part}.stl")
                self.assertEqual(mesh.edge_counts(f), 0, f"w{w} {part}")
                self.assertGreater(mesh.volume(v, f), 0, f"w{w} {part}")
                self.assertAlmostEqual(min(p[2] for p in v), 0.0, places=3)
                self.assertLessEqual(max(p[2] for p in v), 8.0 + 1e-3)
                self.assertLessEqual(min_square(v), 220.0, f"w{w} {part}")

    def test_halves_have_the_lap_and_bolt_holes(self):
        v, f = read_stl(CAD / "rack_w22_A.stl")
        # A's lap is 4 mm thick: vertices at z = 4 exist only in the joint zone (hub disc, r 28.6)
        lap = [p for p in v if abs(p[2] - 4.0) < 1e-3]
        self.assertTrue(lap)
        self.assertTrue(all(math.hypot(p[0], p[1]) <= 28.6 / math.cos(math.pi / 96) + 1e-3 for p in lap))
        # bolt holes: vertices on a 2.2 mm circle round (+-17, -10) in both halves
        for part in ("A", "B"):
            v, _ = read_stl(CAD / f"rack_w22_{part}.stl")
            for sx in (-17.0, 17.0):
                ring = [p for p in v if abs(math.hypot(p[0] - sx, p[1] + 10.0) - 2.2) < 0.02]
                self.assertGreaterEqual(len(ring), 32, f"{part} hole at {sx}")


try:
    import manifold3d  # noqa: F401
    HAVE_MANIFOLD = True
except ImportError:  # the generator needs it; the shipped-file checks above do not
    HAVE_MANIFOLD = False


@unittest.skipUnless(HAVE_MANIFOLD, "manifold3d not installed (requirements.txt)")
class Split(unittest.TestCase):
    def test_halves_rebuild_the_hanger_without_overlap(self):
        from hanger_print import split
        d = geom.Design(w=22, slope=15.92, bow=0.59, r=2.86, depth=8.0)
        a, b = split.halves(d)
        self.assertAlmostEqual((a ^ b).volume(), 0.0, places=3)
        # the union of the halves is the whole hanger less the two bolt holes and B's post notch
        sh = {s["name"]: s for s in geom.shells(d)}
        whole = (split._prism(sh["arm_right"]["outline"], 8) + split._prism(sh["arm_left"]["outline"], 8)
                 + manifold3d.Manifold.cylinder(8, 28.6, 28.6, split.SEG) + split._prism(sh["post"]["outline"], 8)
                 + split._prism(sh["loop"]["outline"], 8, sh["loop"]["hole"]))
        holes = 2 * math.pi * (split.BOLT_HOLE / 2) ** 2 * 8
        lost = whole.volume() - (a + b).volume()
        self.assertGreater(lost, holes * 0.95)
        # holes, plus in B's 4 mm lap the 0.2 mm clearance strips round the post and the
        # 14.4 x 1.6 mm cap of the notch above the post (post top y 27, disc top y 28.6)
        self.assertLess(lost, holes * 1.02 + 4 * (14.4 * 1.6 + 2 * 0.2 * 28 + 14.4 * 0.2))

    def test_joint_hand_calculation(self):
        from hanger_print import split
        d = geom.Design(w=22, slope=15.92, bow=0.59, r=2.86, depth=8.0)
        j = split.joint_check(d)
        F = 1.5 * 9.81 * 2 / 2
        lever = (220 - 28.6) * math.cos(math.radians(15.92))
        P = math.hypot(F * lever / 34.0, F / 2)
        self.assertAlmostEqual(j["bolt_force_N"], P, places=6)
        self.assertAlmostEqual(j["bearing_MPa"], P / (4.0 * 4.0), places=6)
        net = 2 * math.sqrt(28.6 ** 2 - 17 ** 2) - 4.4
        self.assertAlmostEqual(j["lap_section_MPa"], 2 * F * (lever - 17) / (4 * net ** 2 / 6), places=6)
        self.assertAlmostEqual(j["notch_section_MPa"], 2 * (F * lever / 2) / (4 * 28.4 ** 2 / 6), places=6)
        self.assertGreater(min(j["bearing_sf"], j["lap_sf"], j["notch_sf"]), 3.0)

    def test_generator_matches_the_shipped_files(self):
        from hanger_print import split
        d = geom.Design(w=19, slope=15.92, bow=0.59, r=2.86, depth=split.SPLIT_DEPTH)
        a, b = split.halves(d)
        va, fa = split.to_mesh(a)
        self.assertEqual(mesh.stl([("A", (va, fa))], "rack_w19_A"), (CAD / "rack_w19_A.stl").read_text())


if __name__ == "__main__":
    unittest.main()
