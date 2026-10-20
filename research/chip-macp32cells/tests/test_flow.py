import unittest
from chip_macp32cells import baseline_gen, flow


class T(unittest.TestCase):
    def test_cycles_equal_once_lanes_cover_hidden_width(self):
        self.assertEqual(baseline_gen.cycles(16, 16), baseline_gen.cycles(32, 16))
        self.assertGreater(baseline_gen.cycles(8, 16), baseline_gen.cycles(16, 16))

    def test_quantised_model_is_deterministic_per_seed(self):
        a, b, c = flow.make_q(16, 0), flow.make_q(16, 0), flow.make_q(16, 1)
        self.assertTrue((a["W0"] == b["W0"]).all())
        self.assertFalse((a["W0"] == c["W0"]).all())

    def test_score_counts_cells_and_flip_flops(self):
        r = flow.score(flow.make_q(16, 0), 2)
        self.assertEqual(r["cells"], r["ff"] + r["comb"])
        self.assertGreater(r["ff"], 0)

    def test_unknown_flow_rejected(self):
        with self.assertRaises(KeyError):
            flow.score(flow.make_q(16, 0), 2, "Z")


if __name__ == "__main__":
    unittest.main()
