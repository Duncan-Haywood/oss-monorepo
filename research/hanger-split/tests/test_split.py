import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_split import split, joint  # noqa: E402
from hanger_print import geom, mesh, strength as S  # noqa: E402

D = geom.Design(w=22.8, slope=15.92, bow=0.59, r=2.86)
J = split.Joint()


class Geometry(unittest.TestCase):
    def test_every_shell_closed_and_oriented(self):
        for name, (v, f) in split.half_mesh(D, J):
            self.assertEqual(mesh.edge_counts(f), 0, name)
            self.assertGreater(mesh.volume(v, f), 0, name)

    def test_turned_half_is_a_proper_copy(self):
        m = split.half_mesh(D, J)
        t = split.turned(m, D.depth)
        for (_, (v, f)), (_, (v2, f2)) in zip(m, t):
            self.assertAlmostEqual(mesh.volume(v, f), mesh.volume(v2, f2), places=3)
            self.assertEqual(mesh.edge_counts(f2), 0)

    def test_bosses_sit_on_opposite_faces_when_turned(self):
        m = dict(split.half_mesh(D, J))
        zs = [z for _, _, z in m["boss_low"][0]]
        self.assertEqual((min(zs), max(zs)), (0.0, D.depth / 2))
        zt = [z for _, _, z in dict(split.turned(split.half_mesh(D, J), D.depth))["boss_low_L"][0]]
        self.assertAlmostEqual(min(zt), D.depth / 2)
        self.assertAlmostEqual(max(zt), D.depth)


    def test_bolt_holes_are_centred_on_the_split_plane(self):
        for sh in split.half_shells(D, J):
            if "hole" in sh:
                h = sh["hole"]
                self.assertAlmostEqual(sum(x for x, _ in h) / len(h), 0.0, places=6)

    def test_half_fits_220_bed_for_the_rack_and_xxl(self):
        for w in (16, 19, 22, 25, 25.8):
            ok, *_ = split.bed_fit(geom.Design(w=w, slope=15.92, bow=0.59, r=2.86), J, 220)
            self.assertTrue(ok, w)

    def test_a_very_wide_half_does_not_fit(self):
        self.assertFalse(split.bed_fit(geom.Design(w=30, slope=15.92, bow=0.59, r=2.86), J, 220)[0])


class Strength(unittest.TestCase):
    def test_couple_balances_root_moment(self):
        self.assertAlmostEqual(joint.bolt_force(D, J) * J.spacing, joint.root_moment(D))

    def test_wider_spacing_lowers_bolt_force(self):
        wide = split.Joint(y_low=-22.0, y_high=22.0)
        self.assertLess(joint.bolt_force(D, wide), joint.bolt_force(D, J))

    def test_safety_factor_scales_with_load_and_creep(self):
        _, _, a = joint.checks(D, J)
        _, _, b = joint.checks(D, J, mass_kg=S.MASS_KG * 2)
        self.assertAlmostEqual(a / b, 2.0, places=6)
        _, _, c = joint.checks(D, J, creep=0.5)
        self.assertLess(c, a)

    def test_governing_mode_is_the_minimum(self):
        sf, gov, v = joint.checks(D, J)
        self.assertEqual(v, min(sf.values()))
        self.assertEqual(sf[gov], v)

    def test_thicker_arm_depth_strengthens_the_boss_modes(self):
        deep = geom.Design(22.8, 15.92, 0.59, 2.86, depth=16)
        self.assertGreater(joint.checks(deep, J)[0]["bearing"], joint.checks(D, J)[0]["bearing"])

    def test_peg_shears_before_steel_bolt(self):
        self.assertLess(joint.checks(D, J, peg=True)[0]["bolt"], joint.checks(D, J)[0]["bolt"])

    def test_joint_is_weaker_than_the_arm_root_somewhere(self):
        """Sanity: the joint's governing SF is finite and the arm's is larger at this depth."""
        self.assertGreater(S.safety_factor(D), joint.checks(D, J)[2])


if __name__ == "__main__":
    unittest.main()
