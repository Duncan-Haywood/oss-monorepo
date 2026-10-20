import unittest
from chip_p32passes import baseline_gen, flow


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v = baseline_gen.verilog(flow.make_q(16, 0), 2)

    def test_equal_cycles(self):
        self.assertEqual(baseline_gen.cycles(16, 16), baseline_gen.cycles(32, 16))

    def test_trace_labels_and_positive_counts(self):
        tr = flow.trace(self.v)
        self.assertEqual([l for l, _ in tr], ["coarse"] + [l for l, _ in flow.PASSES])
        self.assertTrue(all(c > 0 for _, c in tr))

    def test_trace_matches_one_shot_run_abc(self):
        # `synth -run :abc` runs abc -fast in Yosys 0.33, so the full trace must end where it ends.
        self.assertEqual(flow.trace(self.v)[-1][1], flow.one_shot(self.v))

    def test_memory_map_expands_then_opt_shrinks(self):
        c = dict(flow.trace(self.v))
        self.assertGreater(c["memory_map"], 3 * c["opt_fast_full"])
        self.assertLess(c["opt_full"], c["memory_map"])

    def test_bad_script_raises(self):
        with self.assertRaises(RuntimeError):
            flow.trace("module accel; endmodule", [("x", "no_such_pass")])


if __name__ == "__main__":
    unittest.main()
