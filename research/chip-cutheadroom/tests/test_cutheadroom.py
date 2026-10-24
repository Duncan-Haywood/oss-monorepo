import json
import os
import random
import shutil
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from chip_cutheadroom import exact as E  # noqa: E402
from chip_cutheadroom import netlist as N  # noqa: E402
from chip_cutheadroom.designs import DESIGNS  # noqa: E402

HAVE_YOSYS = shutil.which("yosys") is not None


class Synthetic(unittest.TestCase):
    """Hand-built netlists, no Yosys needed."""

    @classmethod
    def setUpClass(cls):
        cls.rep, cls.cost = N.class_costs()

    def test_class_map_is_complete(self):
        self.assertEqual(len(self.cost), 222)
        self.assertTrue(all(r in self.cost for r in self.rep))

    def test_wasteful_xor_is_found(self):
        # xor built from 5 gates over a, b: (a|b) & ~(a&b) computed twice over, exact cost is 1
        a, b = 1, 2
        gates = {3: ("$_OR_", [a, b]), 4: ("$_AND_", [a, b]), 5: ("$_ANDNOT_", [3, 4]),
                 6: ("$_XOR_", [a, b]), 7: ("$_AND_", [5, 6])}  # 7 = xor & xor = xor
        r = N.analyse([a, b], [7], gates, self.rep, self.cost)
        self.assertEqual(r["gates"], 5)
        self.assertEqual(r["removable_disjoint"], 4)

    def test_optimal_netlist_has_no_headroom(self):
        a, b, c = 1, 2, 3
        gates = {4: ("$_AND_", [a, b]), 5: ("$_OR_", [4, c])}
        r = N.analyse([a, b, c], [5], gates, self.rep, self.cost)
        self.assertEqual(r["removable_disjoint"], 0)

    def test_shared_node_is_not_removed(self):
        # node 3 = a&b is shared with a primary output, so it cannot be deleted by rewriting node 5
        a, b = 1, 2
        gates = {3: ("$_AND_", [a, b]), 4: ("$_AND_", [3, a]), 5: ("$_AND_", [4, b])}
        r = N.analyse([a, b], [3, 5], gates, self.rep, self.cost)
        self.assertEqual(r["removable_disjoint"], 1)  # 4 and 5 (= a&b) collapse; 3 stays

    def test_savings_never_negative_total(self):
        rnd = random.Random(0)
        ins = list(range(1, 7))
        gates, nxt = {}, 7
        ops = list(N._OPS)
        sig = list(ins)
        for _ in range(30):
            gates[nxt] = (rnd.choice(ops), [rnd.choice(sig), rnd.choice(sig)])
            sig.append(nxt)
            nxt += 1
        r = N.analyse(ins, [nxt - 1], gates, self.rep, self.cost)
        self.assertGreaterEqual(r["removable_disjoint"], 0)
        self.assertLess(r["removable_disjoint"], r["gates"])


@unittest.skipUnless(HAVE_YOSYS, "yosys not installed")
class WithYosys(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rep, cls.cost = N.class_costs()

    def test_parsed_adder_adds(self):
        src, top = DESIGNS["add16"]
        ins, outs, gates = N.synth(src, top, "default")
        rnd = random.Random(1)
        # input bit ids come in port order a[0..15], b[0..15]
        for _ in range(40):
            a, b = rnd.randrange(1 << 16), rnd.randrange(1 << 16)
            vec = {ins[i]: (a >> i) & 1 for i in range(16)}
            vec.update({ins[16 + i]: (b >> i) & 1 for i in range(16)})
            got = sum(bit << i for i, bit in enumerate(N.evaluate(ins, outs, gates, vec)))
            self.assertEqual(got, a + b)

    def test_small_design_runs(self):
        src, top = DESIGNS["pop8"]
        for flow in N.FLOWS:
            ins, outs, gates = N.synth(src, top, flow)
            r = N.analyse(ins, outs, gates, self.rep, self.cost)
            self.assertEqual(r["gates"], N.gate_count(gates))
            self.assertGreaterEqual(r["removable_disjoint"], 0)


if __name__ == "__main__":
    unittest.main()
