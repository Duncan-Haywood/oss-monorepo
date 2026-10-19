import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_order import gens, variants
from chip_abc_order.flow import equivalent, score

ADD = os.path.join(HERE, "..", "designs", "add16.v")
MUL = os.path.join(HERE, "..", "designs", "mul6.v")


class VariantTest(unittest.TestCase):
    def test_deterministic_per_seed(self):
        s = gens.gen_add16("ripple", 0)
        self.assertEqual(variants.variant(s, ["shuffle", "rename"], 3), variants.variant(s, ["shuffle", "rename"], 3))
        self.assertNotEqual(variants.variant(s, ["shuffle"], 3), variants.variant(s, ["shuffle"], 4))

    def test_rewrites_change_text_not_ports(self):
        s = gens.gen_mul6(*gens.mul6_config_space()[0])
        for k in ("rename", "permute"):  # mul6 has one assign, so `shuffle` is a no-op there
            v = variants.variant(s, [k], 1)
            self.assertNotEqual(v, s, k)
            self.assertIn("module mul6(input [5:0] a, input [5:0] b, output [11:0] p);", v)
        r = gens.gen_add16("ripple", 0)
        self.assertNotEqual(variants.variant(r, ["shuffle"], 1), r)
        self.assertEqual(variants.variant(s, ["shuffle"], 1), s)

    def test_variants_equivalent_to_reference(self):
        cases = [("add16", ADD, gens.gen_add16("ripple", 0)), ("add16", ADD, gens.gen_add16("csel", 4)),
                 ("mul6", MUL, gens.gen_mul6(*gens.mul6_config_space()[0]))]
        with tempfile.TemporaryDirectory() as d:
            for top, ref, src in cases:
                for kinds in (["shuffle"], ["rename"], ["permute"], ["shuffle", "rename", "permute"]):
                    f = os.path.join(d, "v.v")
                    open(f, "w").write(variants.variant(src, kinds, 5))
                    self.assertTrue(equivalent(ref, top, f, top), (top, kinds))

    def test_score_runs_on_variant(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "v.v")
            open(f, "w").write(variants.variant(gens.gen_add16("ripple", 0), ["rename"], 2))
            self.assertGreater(score(f, "add16", "dch_map")["cells"], 0)


if __name__ == "__main__":
    unittest.main()
