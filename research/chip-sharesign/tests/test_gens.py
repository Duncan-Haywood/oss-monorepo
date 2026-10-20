import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from chip_sharesign import flow, gens


class T(unittest.TestCase):
    def _files(self, fam, w, k):
        d = tempfile.mkdtemp()
        out = {}
        for sh in (True, False):
            out[sh] = os.path.join(d, f"{int(sh)}.v")
            open(out[sh], "w").write(gens.FAMILIES[fam](w, k, sh))
        return out

    def test_variants_equivalent(self):
        for fam in gens.FAMILIES:
            f = self._files(fam, 6, 3)
            self.assertTrue(flow.equivalent(f[True], "top", f[False], "top"), fam)

    def test_operand_swap_is_not_unsharing(self):
        d = tempfile.mkdtemp()
        a, b = os.path.join(d, "a.v"), os.path.join(d, "b.v")
        open(a, "w").write("module top(input [7:0] a,b, output [7:0] x,y); assign x=a+b+8'd1; assign y=a+b+8'd2; endmodule")
        open(b, "w").write("module top(input [7:0] a,b, output [7:0] x,y); assign x=a+b+8'd1; assign y=b+a+8'd2; endmodule")
        self.assertEqual(flow.score(a, "top"), flow.score(b, "top"))

    def test_association_unshares(self):
        f = self._files("addconst", 8, 2)
        self.assertNotEqual(flow.score(f[True], "top"), flow.score(f[False], "top"))


if __name__ == "__main__":
    unittest.main()
