import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_orderblocks import explicit, flow, orders, trace

REF = os.path.join(HERE, "..", "designs", "add16.v")


def write(d, text):
    p = os.path.join(d, "v.v")
    with open(p, "w") as fh:
        fh.write(text)
    return p


class OrdersTest(unittest.TestCase):
    def test_default_orders_reproduce_generator(self):
        from chip_abc_orderblocks import gens
        self.assertEqual(orders.csel4((0, 1, 2), (0, 1, 2)), gens.gen_add16("csel", 4))

    def test_order_changes_only_chain_operands(self):
        text = orders.csel4((2, 0, 1), (1, 2, 0))
        self.assertIn("5'd0 + a[7:4] + b[7:4];", text)
        self.assertIn("b[7:4] + 5'd1 + a[7:4];", text)

    def test_all_orders_are_equivalent_to_reference(self):
        with tempfile.TemporaryDirectory() as d:
            for o0, o1 in [((0, 1, 2), (2, 1, 0)), ((1, 2, 0), (0, 2, 1))]:
                self.assertTrue(flow.equivalent(REF, "add16", write(d, orders.csel4(o0, o1)), "add16"))


class TraceTest(unittest.TestCase):
    def test_sharing_orders_have_fewer_adders_after_opt_merge(self):
        with tempfile.TemporaryDirectory() as d:
            share = trace.signatures(write(d, orders.csel4((0, 1, 2), (1, 0, 2))), "add16")
            apart = trace.signatures(write(d, orders.csel4((0, 1, 2), (0, 2, 1))), "add16")
        count = lambda s: sum(int(n) for t, n in s[4][0] if t.startswith("$add"))
        self.assertEqual((count(share), count(apart)), (7, 10))
        self.assertIsNone(trace.first_difference(share, share, 0))
        self.assertEqual(trace.STAGES[trace.first_difference(share, apart, 0)], "opt -nodffe -nosdff")

    def test_canonical_ignores_names(self):
        a = "wire \\foo\ncell $add $auto$1\nconnect \\foo \\bar"
        b = "wire \\xyz\ncell $add $auto$9\nconnect \\xyz \\qux"
        self.assertEqual(trace.canonical(a), trace.canonical(b))


class ExplicitFlowTest(unittest.TestCase):
    def test_explicit_flow_reproduces_synth(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(d, orders.csel4((0, 1, 2), (0, 1, 2)))
            for sc in ("yosys_default", "dch_map"):
                self.assertEqual(explicit.score(p, "add16", sc), flow.score(p, "add16", sc))

    def test_removing_opt_merge_changes_the_sharing_variant(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(d, orders.csel4((0, 1, 2), (0, 1, 2)))
            self.assertNotEqual(explicit.score(p, "add16", "dch_map", True), explicit.score(p, "add16", "dch_map", False))


if __name__ == "__main__":
    unittest.main()


class MixedTest(unittest.TestCase):
    def test_mixed_default_reproduces_generator(self):
        from chip_abc_orderblocks import gens
        d = {c: (0, 1, 2) for c in orders.CHAINS}
        self.assertEqual(orders.csel4_mixed(d), gens.gen_add16("csel", 4))

    def test_prediction_rule(self):
        self.assertTrue(orders.shares((0, 1, 2), (1, 0, 2)))
        self.assertFalse(orders.shares((0, 2, 1), (0, 1, 2)))
        d = {c: (2, 0, 1) for c in orders.CHAINS}
        d["x2"], d["y2"] = (0, 1, 2), (1, 0, 2)
        self.assertEqual(orders.predicted_shared(d), (2,))

    def test_shared_block_removes_one_adder_and_stays_equivalent(self):
        d = {c: (2, 0, 1) for c in orders.CHAINS}
        d["x2"], d["y2"] = (0, 1, 2), (1, 0, 2)
        with tempfile.TemporaryDirectory() as t:
            p = write(t, orders.csel4_mixed(d))
            self.assertTrue(flow.equivalent(REF, "add16", p, "add16"))
            sig = trace.signatures(p, "add16")
            adds = sum(int(n) for k, n in sig[4][0] if k.startswith(("$add", "$alu")))
            self.assertEqual(adds, 9)
