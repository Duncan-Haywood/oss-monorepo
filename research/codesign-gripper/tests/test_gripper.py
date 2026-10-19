import os, sys, json, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from codesign_gripper import Problem, LB, UB, finger_stats, scenarios, random_search, cma_es, bayes_opt, score_proposals, best_curve
from codesign_gripper.sim import rollout
from codesign_gripper.stl import finger_mesh, is_watertight, volume_mm3, write_stl

DES = dict(w=14, t=4, L=40, v=0.4, mu=0.8)
OBJ = dict(kind="cyl", size=18, mass_g=200, mu_obj=0.4, dy_mm=2, dz_mm=0)


class T(unittest.TestCase):
    def test_strong_grip_holds_and_no_grip_drops(self):
        self.assertTrue(rollout(DES, OBJ, 15.0)["success"])
        self.assertFalse(rollout(DES, OBJ, 0.05)["success"])

    def test_heavier_object_needs_more_force(self):
        heavy = dict(OBJ, mass_g=900, mu_obj=0.2)
        self.assertFalse(rollout(DES, heavy, 3.0)["success"])
        self.assertTrue(rollout(DES, heavy, 38.0)["success"])

    def test_stats_monotone(self):
        a, b = finger_stats([12, 4, 30, 0.3, 0.5]), finger_stats([12, 4, 30, 0.3, 1.0])
        self.assertGreater(b["print_min"], a["print_min"])
        self.assertGreater(b["mu"], a["mu"])
        self.assertGreater(finger_stats([12, 6, 30, 0, 0])["f_break_n"], finger_stats([12, 3, 30, 0, 0])["f_break_n"])
        self.assertGreater(finger_stats([12, 4, 60, 0, 0])["print_min"], finger_stats([12, 4, 30, 0, 0])["print_min"])

    def test_infeasible_design_is_not_simulated_but_counts(self):
        p = Problem(); r = p.evaluate(UB)
        self.assertFalse(r["feasible"]); self.assertEqual(r["success"], 0.0); self.assertEqual(p.n_evals, 1)
        self.assertGreater(p.penalised(r), 1.0)

    def test_clipping(self):
        r = Problem().evaluate([100, -5, 0, 5, 5])
        self.assertEqual(r["x"], [UB[0], LB[1], LB[2], UB[3], UB[4]])

    def test_scenarios_deterministic(self):
        self.assertEqual(scenarios(5, 7), scenarios(5, 7))
        self.assertNotEqual(scenarios(5, 7), scenarios(5, 8))

    def test_budgets_equal_and_determinism(self):
        for f in (random_search, cma_es, bayes_opt):
            p = Problem(test=scenarios(2, 1)); recs = f(p, 9, 0)
            self.assertEqual((len(recs), p.n_evals), (9, 9))
        a = [r["x"] for r in random_search(Problem(), 4, 3)]
        self.assertEqual(a, [r["x"] for r in random_search(Problem(), 4, 3)])

    def test_good_design_beats_a_thin_weak_one(self):
        p = Problem(test=scenarios(10, 5))
        good = p.evaluate([12, 4, 30, 0.3, 0.9]); weak = p.evaluate([8, 2, 60, 0.0, 0.0])
        self.assertGreater(good["success"], weak["success"])

    def test_score_proposals_and_curve(self):
        d = tempfile.mkdtemp(); path = os.path.join(d, "r.json")
        json.dump({"round": 1, "notes": "", "designs": [[12, 4, 30, 0.3, 0.9], [26, 6, 60, 1, 1]]}, open(path, "w"))
        recs = score_proposals(Problem(test=scenarios(3, 1)), [path])
        self.assertEqual(len(recs), 2)
        c = best_curve(recs, [1, 2]); self.assertEqual(c[0], c[1])

    def test_stl_watertight_volume_and_file(self):
        V, Tr = finger_mesh(12, 4, 30, 0.3)
        self.assertTrue(is_watertight(Tr))
        self.assertLess(volume_mm3(V, Tr), 12 * 4 * 30)
        self.assertGreater(volume_mm3(V, Tr), 0.8 * 12 * 4 * 30 * 0.9)
        flat = finger_mesh(12, 4, 30, 0.0)
        self.assertAlmostEqual(volume_mm3(*flat), 12 * 4 * 30, places=6)
        path = os.path.join(tempfile.mkdtemp(), "f.stl"); write_stl(path, "f", 12, 4, 30, 0.3)
        self.assertEqual(open(path).read().count("facet normal"), len(Tr))


if __name__ == "__main__":
    unittest.main()
