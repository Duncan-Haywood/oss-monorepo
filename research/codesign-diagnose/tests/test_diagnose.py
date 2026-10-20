import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from codesign_diagnose import Problem, LB, UB
from codesign_diagnose.problem import finger_stats, ASSUMED, diagnostics, train_policy, TRAIN
from codesign_diagnose.sim import rollout
from codesign_diagnose.readers import propose, reader

X = [16.0, 5.0, 32.0, 0.3, 0.6]


class Physics(unittest.TestCase):
    def test_heavier_finger_costs_more_and_prints_longer(self):
        a, b = finger_stats([10, 3, 30, 0.2, 0.2]), finger_stats([20, 5, 50, 0.2, 0.2])
        self.assertGreater(b["print_min"], a["print_min"]); self.assertGreater(b["cost_usd"], a["cost_usd"])

    def test_print_cap_makes_a_design_infeasible_without_simulating(self):
        r = Problem().evaluate([26, 6, 60, 0.5, 1.0])
        self.assertFalse(r["feasible"]); self.assertEqual(r["success"], 0.0); self.assertEqual(r["diag"], {})

    def test_force_decides_a_heavy_grasp_and_the_mode_is_reported(self):
        d, _ = Problem().design(X)
        obj = dict(kind="cyl", size=18.0, mass_g=900.0, mu_obj=0.3, dy_mm=0.0, dz_mm=10.0)
        weak, strong = rollout(d, obj, 1.0), rollout(d, obj, 20.0)
        self.assertFalse(weak["success"]); self.assertEqual(weak["mode"], "lift_loss")
        self.assertTrue(strong["success"]); self.assertEqual(strong["mode"], "ok")


class Feedback(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rec = Problem(level=2).evaluate(X)
        p = Problem(level=0).evaluate(X)
        cls.rec0 = p

    def test_levels_expose_nested_information(self):
        d, _ = Problem().design(X)
        f, diag = train_policy(d, TRAIN[:4])
        rec = dict(f_max_n=d["f_max"])
        self.assertEqual(diagnostics(rec, diag, 0), {})
        l1, l2 = diagnostics(rec, diag, 1), diagnostics(rec, diag, 2)
        self.assertNotIn("scenes", l1); self.assertIn("modes", l1)
        self.assertEqual(len(l2["scenes"]), 4); self.assertTrue(set(l1) < set(l2))

    def test_level_zero_record_carries_no_diagnostics(self):
        self.assertEqual(self.rec0["diag"], {})
        self.assertIn("scenes", self.rec["diag"])
        self.assertEqual(self.rec["success"], self.rec0["success"])   # same design, same score at every level

    def test_trained_force_respects_the_strength_limit(self):
        self.assertLessEqual(self.rec["force_n"], self.rec["f_max_n"] + 1e-9)


class Readers(unittest.TestCase):
    def fake(self, ok, diag, feasible=True, x=X):
        st = finger_stats(x)
        return dict(x=list(x), feasible=feasible, success=ok, force_n=5.0, f_max_n=st["f_max"], diag=diag, **st)

    def test_proposals_stay_in_count_and_every_level_returns_k(self):
        scenes = [dict(kind="cyl", size=15, mass_g=1200, mu_obj=0.2, mode="lift_loss", slip_mm=30.0),
                  dict(kind="box", size=30, mass_g=200, mu_obj=0.4, mode="ok", slip_mm=1.0)]
        diag = dict(modes={"lift_loss": 1, "ok": 1}, force_saturated=True, force_n=5.0, f_max=10.0, train_success=0.5,
                    scenes=scenes, sweep=[(0.5, 0.2), (5.0, 0.5)])
        recs = [self.fake(0.6, diag)]
        for lv in (0, 1, 2):
            ps = propose(recs, lv, np.random.default_rng(0), 4, 0.2)
            self.assertEqual(len(ps), 4)
            self.assertTrue(all(len(p) == 5 and np.isfinite(p).all() for p in ps))

    def test_level_two_sizes_the_pad_to_the_heaviest_failure(self):
        light = dict(kind="cyl", size=15, mass_g=300, mu_obj=0.3, mode="lift_loss", slip_mm=30.0)
        heavy = dict(light, mass_g=1400)
        mk = lambda sc: dict(modes={"lift_loss": 1}, force_saturated=True, force_n=5.0, f_max=10.0, train_success=0.5,
                             scenes=[sc], sweep=[(0.5, 0.2), (5.0, 0.5)])
        pl = propose([self.fake(0.6, mk(light))], 2, np.random.default_rng(1), 1, 0.2)[0]
        ph = propose([self.fake(0.6, mk(heavy))], 2, np.random.default_rng(1), 1, 0.2)[0]
        self.assertGreater(ph[4], pl[4])      # the heavier failure asks for more pad friction (index 4 is the TPU thickness)

    def test_infeasible_incumbent_is_made_lighter(self):
        big = [24, 6, 58, 0.2, 0.9]
        ps = propose([self.fake(0.0, {}, feasible=False, x=big)], 1, np.random.default_rng(0), 4, 0.2)
        self.assertLess(np.mean([p[2] for p in ps]), (big[2] - LB[2]) / (UB[2] - LB[2]))   # shorter fingers

    def test_reader_uses_exactly_its_budget_with_a_stub_problem(self):
        class Stub:
            n_evals, level = 0, 0
            def evaluate(self, x):
                self.n_evals += 1
                st = finger_stats(x)
                return dict(x=[float(v) for v in x], feasible=st["print_min"] <= ASSUMED["time_cap_min"],
                            success=float(np.clip(1 - abs(x[3] - 0.5), 0, 1)), force_n=1.0, f_max_n=st["f_max"], diag={}, **st)
        for lv in (0, 1, 2):
            p = Stub(); recs = reader(p, 20, 3, lv)
            self.assertEqual((len(recs), p.n_evals), (20, 20))


if __name__ == "__main__":
    unittest.main()
