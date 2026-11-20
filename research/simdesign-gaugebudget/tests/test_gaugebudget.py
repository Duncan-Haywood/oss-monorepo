import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugebudget import Params, PROCESSES, evaluate, rule_violations, solve, patch_max, PATCH_RHO


class T(unittest.TestCase):
    def test_patch_measure_never_exceeds_peak(self):
        e = evaluate(PROCESSES["CNC routing"], Params(w=12, r=6, b=6), h=2.5, measure="patch")
        self.assertLessEqual(e["fe"]["patch_mpa"], e["fe"]["peak_mpa"] + 1e-9)
        self.assertAlmostEqual(e["fe"]["max_vm_mpa"], e["fe"]["patch_mpa"])

    def test_peak_measure_reproduces_plain_solve(self):
        proc = PROCESSES["CNC routing"]
        p = Params(w=12, r=6, b=6)
        e = evaluate(proc, p, h=2.5, measure="peak")["fe"]
        s = solve(p, proc.material, h=2.5)
        self.assertAlmostEqual(e["max_vm_mpa"], s["max_vm_mpa"])
        self.assertAlmostEqual(e["tip_deflection_mm"], s["tip_deflection_mm"])

    def test_looser_measure_makes_borderline_design_feasible(self):
        from dataclasses import replace
        proc = PROCESSES["FDM"]
        p = Params(w=24, r=14, b=4.0)
        e = evaluate(proc, p, h=2.5, measure="peak")["fe"]
        # limit between patch and peak value: infeasible under peak, passes the stress rule under patch
        lim = 0.5 * (e["peak_mpa"] + e["patch_mpa"])
        q = replace(proc, material=replace(proc.material, sigma_allow=lim))
        self.assertGreater(evaluate(q, p, 2.5, "peak")["violations"]["stress"], 0)
        self.assertEqual(evaluate(q, p, 2.5, "patch")["violations"]["stress"], 0)

    def test_fillet_floor_override_is_enforced(self):
        from dataclasses import replace
        proc = replace(PROCESSES["laser cutting"], r_min=1.0)
        self.assertGreater(rule_violations(proc, Params(w=10, r=0.5, b=3))["inner radius"], 0)
        self.assertEqual(rule_violations(proc, Params(w=10, r=1.0, b=3))["inner radius"], 0)

    def test_dfm_laser_floor_default(self):
        self.assertEqual(PROCESSES["laser cutting"].r_min, 0.2)

    def test_rho_is_three_mm(self):
        self.assertEqual(PATCH_RHO, 3.0)

    def test_single_gauge_search_returns_that_gauge(self):
        from simdesign_gaugebudget.optimise import _search
        p, n = _search(PROCESSES["laser cutting"], 3, seed=0, popsize=4, maxiter=3, h=2.5, measure="peak")
        self.assertEqual(p.b, 3)
        self.assertGreater(n, 0)

    def test_search_is_deterministic_for_a_seed(self):
        from simdesign_gaugebudget.optimise import _search
        a = _search(PROCESSES["laser cutting"], 3, seed=1, popsize=4, maxiter=3, h=2.5, measure="peak")[0]
        b = _search(PROCESSES["laser cutting"], 3, seed=1, popsize=4, maxiter=3, h=2.5, measure="peak")[0]
        self.assertEqual((a.w, a.r), (b.w, b.r))


    # --- added by the 2026-11-20 quality audit (portfolio/quality/audits/2026-11-20-simdesign-gaugebudget.json)

    def test_outer_fibre_stress_matches_beam_theory(self):
        """Away from the corner the vertical arm is a beam: sigma = 6M/(b w^2) + F/(w b), M = F (L - w/2)."""
        import numpy as np
        from simdesign_gaugebudget.dfm import STEEL_SHEET
        p = Params(w=12.0, r=6.0, b=4.0)
        f = solve(p, STEEL_SHEET, h=0.6, return_field=True)
        cen, vm = f["cen"], f["vm"]
        band = (cen[:, 1] > 30) & (cen[:, 1] < 40) & (cen[:, 0] > 2 * p.w / 3)
        fibre = np.polyval(np.polyfit(cen[band, 0], vm[band], 1), p.w)
        beam = 6 * p.F * (p.L - p.w / 2) / (p.b * p.w ** 2) + p.F / (p.w * p.b)
        self.assertAlmostEqual(fibre / beam, 1.0, delta=0.02)

    def test_plane_stress_beam_deflection_is_insensitive_to_poisson(self):
        """Plane stress: a slender bent arm's tip deflection barely depends on nu. Plane strain would scale it by 1 - nu^2."""
        from simdesign_gaugebudget.model import Material
        p = Params(w=6.0, r=2.0, b=4.0)
        t0 = solve(p, Material(E=200000.0, nu=0.0), h=1.5)["tip_deflection_mm"]
        t1 = solve(p, Material(E=200000.0, nu=0.45), h=1.5)["tip_deflection_mm"]
        self.assertGreater(t1 / t0, 0.95)

    def test_fine_mesh_builds(self):
        """make_mesh used to set d = None above 4e7 grid-boundary pairs and crash at h <= 0.3 mm."""
        import numpy as np
        from simdesign_gaugebudget.model import make_mesh, _min_dist
        rng = np.random.default_rng(0)
        g, bnd = rng.random((500, 2)), rng.random((70, 2))
        brute = np.min(np.linalg.norm(g[:, None, :] - bnd[None, :, :], axis=2), axis=1)
        np.testing.assert_array_equal(_min_dist(g, bnd, max_pairs=1000), brute)
        m = make_mesh(Params(w=14.38, r=11.02, b=2.0), h=0.3)
        self.assertGreater(m.t.shape[1], 10000)

    def test_optimise_keeps_the_lightest_feasible_gauge(self):
        from unittest import mock
        import importlib
        opt = importlib.import_module("simdesign_gaugebudget.optimise")
        proc = PROCESSES["laser cutting"]
        masses = {1: None, 1.5: 30.0, 2: 20.0, 3: 25.0}  # None = infeasible
        fake_proc = type(proc)(**{**proc.__dict__, "b_stock": tuple(masses)})

        def fake_search(pr, b, *a):
            return Params(w=10.0, r=1.0, b=float(b)), 1

        def fake_eval(pr, p, h=2.5, measure="peak"):
            m = masses[p.b if p.b != int(p.b) else int(p.b)]
            fe = {"max_vm_mpa": 1.0, "peak_mpa": 1.0, "tip_deflection_mm": 0.1}
            return {"feasible": m is not None, "mass_g": 1.0 if m is None else m, "fe": fe}

        with mock.patch.object(opt, "_search", fake_search), mock.patch.object(opt, "evaluate", fake_eval):
            r = opt.optimise(fake_proc)
        self.assertTrue(r["feasible"])
        self.assertEqual(r["params"].b, 2.0)
        self.assertEqual(r["mass_g"], 20.0)

    def test_headline_gauge2_design_fails_off_the_search_mesh(self):
        """The 33.29 g 'repeatable optimum' (big budget, seeds 1 and 3) passes only on the h = 2.5 search mesh."""
        import json
        from simdesign_gaugebudget.dfm import STEEL_SHEET
        res = json.load(open(os.path.join(os.path.dirname(__file__), "..", "experiments", "results.json")))
        r = next(x for x in res if (x["twin"], x["budget"], x["seed"], x["gauge"]) == ("rules", "big", 1, 2))
        p = Params(w=r["w"], r=r["r"], b=r["b"])
        self.assertTrue(evaluate(PROCESSES["laser cutting"], p, h=2.5)["feasible"])
        beam = 6 * p.F * (p.L - p.w / 2) / (p.b * p.w ** 2) + p.F / (p.w * p.b)
        self.assertAlmostEqual(beam, 109.0, delta=0.1)
        self.assertGreater(beam, STEEL_SHEET.sigma_allow)
        self.assertGreater(solve(p, STEEL_SHEET, h=1.25)["max_vm_mpa"], 115.0)

if __name__ == "__main__":
    unittest.main()
