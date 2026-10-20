import json, os, tempfile, unittest
from eda_harness import harness as H


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.prob = H.Problem(n_vec=6)

    def mk(self):
        d = tempfile.mkdtemp()
        return H.Harness(self.prob, os.path.join(d, "log.jsonl"), os.path.join(d, "c")), d

    def test_all_stages_pass_and_cache_hits(self):
        h, d = self.mk()
        a = h.evaluate({"p": 3, "wb": 5}); b = h.evaluate({"p": 3, "wb": 5})
        self.assertTrue(a["passed"] and a["gate_match"] and a["rtl_match"])
        self.assertFalse(a["cache_hit"]); self.assertTrue(b["cache_hit"])
        self.assertEqual(a["cells"], b["cells"])
        lines = open(os.path.join(d, "log.jsonl")).read().splitlines()
        self.assertEqual(len(lines), 2); self.assertIn("stage_seconds", json.loads(lines[0]))

    def test_broken_rtl_is_caught(self):
        h, _ = self.mk()
        orig = self.prob.verilog
        self.prob.verilog = lambda c: orig(c).replace("+", "-", 1)    # mutate the design
        try:
            r = h.evaluate({"p": 2, "wb": 4})
        finally:
            self.prob.verilog = orig
        self.assertFalse(r["passed"])
        self.assertIn(r["failed_stage"], ("lint", "rtl_sim"))

    def test_pareto_and_proposers(self):
        h, _ = self.mk()
        hist = H.run_loop(h, H.GridProposer({"p": [1, 4], "wb": [4]}), 2)
        f = H.pareto(hist)
        self.assertEqual(len(f), 2)                        # fewer cells vs fewer cycles: both non-dominated
        sp = {"p": [1, 2, 4, 8], "wb": [4, 6, 8]}
        lex, far = H.GridProposer(sp), H.GridProposer(sp, order="farthest")
        a = [lex.propose([]) for _ in range(12)]
        b = [far.propose([]) for _ in range(12)]
        self.assertEqual(a[:3], [{"p": 1, "wb": 4}, {"p": 1, "wb": 6}, {"p": 1, "wb": 8}])   # default order unchanged
        self.assertEqual(sorted(map(str, a)), sorted(map(str, b)))                          # same 12 designs, different order
        self.assertNotEqual(a, b)
        self.assertEqual(b[0], {"p": 2, "wb": 6})                                            # centre-most first
        with self.assertRaises(ValueError):
            H.GridProposer(sp, order="nope")
        r = H.RandomProposer(self.prob.space, 1).propose([])
        self.assertIn(r["p"], self.prob.space["p"])


if __name__ == "__main__":
    unittest.main()
