"""Tests added by the 2026-11-18 quality fix (audit 2026-11-17-simdesign-filletfloor.json, defects 0, 3, 4)."""
import os, sys, unittest
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
from simdesign_filletfloor import Params, PROCESSES, FREE, solve
from simdesign_filletfloor.dfm import STEEL_SHEET
from simdesign_filletfloor.model import make_mesh, _min_dist
from convergence import extrapolate, repair_depth


class Convergence(unittest.TestCase):
    def test_far_field_stress_matches_beam_theory(self):
        # Vertical arm between corner and clamp: outer-fibre stress = 6 F (L - w/2) / (b w^2) + F / (w b)
        # (bending plus the axial share of the tip load). Element centroids sit just inside the fibre.
        p = Params(w=12, r=6, b=3)
        f = solve(p, STEEL_SHEET, h=0.5, return_field=True)
        band = (f["cen"][:, 1] > 40) & (f["cen"][:, 1] < 55)
        beam = 6 * p.F * (p.L - p.w / 2) / (p.b * p.w ** 2) + p.F / (p.w * p.b)
        self.assertAlmostEqual(f["vm"][band].max() / beam, 1.0, delta=0.03)

    def test_stress_scales_as_one_over_depth(self):
        a = solve(Params(w=12, r=6, b=2), STEEL_SHEET, h=1.0)
        b = solve(Params(w=12, r=6, b=5), STEEL_SHEET, h=1.0)
        self.assertAlmostEqual(a["max_vm_mpa"] / b["max_vm_mpa"], 2.5, places=6)
        self.assertAlmostEqual(a["tip_deflection_mm"] / b["tip_deflection_mm"], 2.5, places=6)

    def test_peak_excludes_clamp_singularity(self):
        # The fixed edge at y = H is a stress singularity; the reported peak must come from y < H - w.
        # (On these designs the fillet governs, so the exclusion rarely changes the number: test the zone.)
        p = Params(w=12, r=6, b=3)
        f = solve(p, STEEL_SHEET, h=1.0, return_field=True)
        self.assertGreater((~f["free"]).sum(), 50)
        self.assertTrue(np.all(f["free"] == (f["cen"][:, 1] < p.H - p.w)))

    def test_fine_mesh_builds(self):
        m = make_mesh(Params(w=12, r=6, b=3), h=0.25)  # raised TypeError before the fix
        self.assertGreater(m.t.shape[1], 20000)

    def test_blocked_distance_equals_one_shot(self):
        rng = np.random.default_rng(0)
        g, bnd = rng.random((500, 2)), rng.random((70, 2))
        one = np.min(np.linalg.norm(g[:, None, :] - bnd[None, :, :], axis=2), axis=1)
        self.assertTrue(np.array_equal(_min_dist(g, bnd, max_pairs=1000), one))

    def test_extrapolation_recovers_known_limit(self):
        hs = (0.55, 0.4, 0.3, 0.25)
        s, q = extrapolate(hs, [140.0 - 20.0 * h ** 1.5 for h in hs])
        self.assertAlmostEqual(s, 140.0, places=3)
        self.assertAlmostEqual(q, 1.5, places=2)

    def test_repair_rounds_up_to_stock_and_checks_web(self):
        laser = PROCESSES["laser cutting"]
        self.assertEqual(repair_depth(laser, w=15.0, b=2.0, sigma=130.0, limit=100.0), (3, True))   # need 2.6 -> 3
        self.assertEqual(repair_depth(laser, w=3.5, b=3.0, sigma=130.0, limit=100.0), (4, False))   # web 3.5 < 4
        b, ok = repair_depth(FREE["steel sheet"], w=15.0, b=2.0, sigma=130.0, limit=100.0)
        self.assertAlmostEqual(b, 2.6); self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
