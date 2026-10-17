import os, sys, tempfile, unittest
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from shapely.geometry import Polygon
from simdesign_dfm import (Params, PROCESSES, FREE, rule_violations, analysis_params, process_mass, evaluate,
                           mass_g, build_polygon, write_dxf, read_dxf, write_extruded_stl)
from simdesign_dfm.dfm import ALU_CAST


class T(unittest.TestCase):
    def test_cnc_rejects_radius_below_tool_radius(self):
        v = rule_violations(PROCESSES["CNC routing"], Params(w=12, r=1.0, b=6))
        self.assertGreater(v["inner radius"], 0)
        self.assertEqual(rule_violations(PROCESSES["CNC routing"], Params(w=12, r=4.0, b=6))["inner radius"], 0)

    def test_stock_thickness_rule(self):
        self.assertEqual(rule_violations(PROCESSES["laser cutting"], Params(w=12, r=3, b=4))["stock thickness"], 0)
        self.assertGreater(rule_violations(PROCESSES["laser cutting"], Params(w=12, r=3, b=4.5))["stock thickness"], 0)

    def test_laser_web_at_least_thickness(self):
        self.assertGreater(rule_violations(PROCESSES["laser cutting"], Params(w=4, r=3, b=6))["web >= thickness"], 0)

    def test_fdm_has_no_rule_beyond_shared_guards(self):
        self.assertEqual(sum(rule_violations(PROCESSES["FDM"], Params(w=12, r=0, b=5)).values()), 0)

    def test_casting_wall_ratio_and_draft_narrowing(self):
        c = PROCESSES["casting"]
        self.assertGreater(rule_violations(c, Params(w=24, r=6, b=4))["wall ratio"], 0)
        p = Params(w=14, r=8, b=8)
        self.assertAlmostEqual(analysis_params(c, p).w, 14 - 8 * np.tan(np.radians(1.5)), places=9)

    def test_draft_mass_is_between_face_and_parting_plane_sections(self):
        c, p = PROCESSES["casting"], Params(w=14, r=8, b=8)
        self.assertLess(process_mass(c, p), mass_g(p, ALU_CAST))
        self.assertGreater(process_mass(c, p), mass_g(analysis_params(c, p), ALU_CAST))

    def test_zero_draft_mass_equals_plain_mass(self):
        c0 = replace(PROCESSES["casting"], draft_deg=0.0)
        p = Params(w=14, r=8, b=8)
        self.assertAlmostEqual(process_mass(c0, p), mass_g(p, ALU_CAST), places=9)

    def test_simpson_is_exact_for_a_drafted_square_prism(self):
        # area(d) is quadratic in the offset for a square, so Simpson over the half depth is exact.
        sq = Polygon([(0, 0), (20, 0), (20, 20), (0, 20)])
        areas = [sq.buffer(-f, join_style=2).area for f in (0, .5, 1)]
        simpson = (areas[0] + 4 * areas[1] + areas[2]) / 6
        exact = np.mean([(20 - 2 * t) ** 2 for t in np.linspace(0, 1, 20001)])
        self.assertAlmostEqual(simpson, exact, places=3)

    def test_fe_feasibility_flags(self):
        e = evaluate(FREE["plastic"], Params(w=12, r=6, b=15))
        self.assertFalse(e["feasible"])           # the simdesign-bracket reference design fails its limits
        self.assertGreater(e["violations"]["stress"], 0)
        self.assertTrue(evaluate(FREE["plastic"], Params(w=22, r=10, b=6))["feasible"])

    def test_stiff_metal_is_not_deflection_limited(self):
        self.assertLess(evaluate(FREE["steel sheet"], Params(w=12, r=8, b=3))["fe"]["tip_deflection_mm"], 1.0)

    def test_dxf_roundtrip_preserves_area(self):
        poly = build_polygon(Params(w=12, r=6, b=5), 48)
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "x.dxf"); write_dxf(f, poly); back = read_dxf(f)
        self.assertEqual(len(back), len(poly))
        self.assertAlmostEqual(Polygon(back).area, Polygon(poly).area, delta=1e-2)

    def test_stl_volume_matches_mass(self):
        p = Params(w=12, r=6, b=15)
        with tempfile.TemporaryDirectory() as d:
            info = write_extruded_stl(os.path.join(d, "x.stl"), build_polygon(p, 200), p.b)
        self.assertAlmostEqual(info["volume_mm3"] * 1.24e-3, mass_g(p), delta=0.01 * mass_g(p))


if __name__ == "__main__":
    unittest.main()
