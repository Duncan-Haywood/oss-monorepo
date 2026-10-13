import math, pathlib, sys, unittest
root = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(root / "src"))
from robofab_program import check, parse_program
from robofab_program.twin import ik, L1, L2
from robofab_program.mutate import mutants


def prog(stage, task):
    return (root / "programs" / stage / f"{task}.rob").read_text()


class TwinTests(unittest.TestCase):
    def test_ik_roundtrip(self):
        q1, q2 = ik(0.3, 0.1)
        x = L1 * math.cos(q1) + L2 * math.cos(q1 + q2)
        y = L1 * math.sin(q1) + L2 * math.sin(q1 + q2)
        self.assertAlmostEqual(x, 0.3, 9); self.assertAlmostEqual(y, 0.1, 9)

    def test_ik_out_of_reach(self):
        self.assertIsNone(ik(0.6, 0.0))

    def test_parse_rejects_garbage(self):
        with self.assertRaises(ValueError):
            parse_program("MOVE 1 2")

    def test_revised_programs_pass_ref(self):
        for t in ["move", "wall", "heavy"]:
            self.assertTrue(check(prog("revised", t), t, "REF")["pass"], t)

    def test_draft_wall_collides_everywhere(self):
        for lv in ["L0", "L1", "L2", "REF"]:
            self.assertIn("collision", check(prog("drafts", "wall"), "wall", lv)["violations"])

    def test_missing_wait_only_seen_from_l2(self):
        txt = prog("drafts", "move")
        self.assertTrue(check(txt, "move", "L1")["pass"])
        self.assertIn("premature_move", check(txt, "move", "L2")["violations"])

    def test_far_payload_only_in_ref(self):
        txt = prog("revised", "far")
        self.assertTrue(check(txt, "far", "L2")["pass"])
        self.assertIn("payload", check(txt, "far", "REF")["violations"])

    def test_deterministic(self):
        txt = prog("revised", "move")
        self.assertEqual(check(txt, "move", "REF", seed=3), check(txt, "move", "REF", seed=3))

    def test_mutant_count_and_control(self):
        m = mutants(prog("revised", "move"))
        self.assertEqual(len(m), 54)
        ok = [k for k, v in m.items() if k == ("grip_wait", "wait=0.25")]
        self.assertTrue(check(m[ok[0]], "move", "REF")["pass"])

    def test_too_fast_joint_speed(self):
        txt = prog("revised", "move").replace("MOVE 0.15 0.30 0.10 1.0", "MOVE 0.15 0.30 0.10 0.15")
        self.assertIn("joint_speed", check(txt, "move", "L1")["violations"])
        self.assertNotIn("joint_speed", check(txt, "move", "L0")["violations"])


if __name__ == "__main__":
    unittest.main()
