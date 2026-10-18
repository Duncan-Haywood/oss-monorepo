import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "chip-abc-sweep", "src"))
from chip_abc_sweep.flow import equivalent, score  # noqa: E402
from chip_constmul.gens import binary_digits, csd, verilog  # noqa: E402


class DigitTest(unittest.TestCase):
    def test_csd_reconstructs_and_is_non_adjacent(self):
        for k in range(1, 1024):
            d = csd(k)
            self.assertEqual(sum(s * 2 ** i for i, s in d), k)
            idx = [i for i, _ in d]
            self.assertTrue(all(b - a >= 2 for a, b in zip(idx, idx[1:])))

    def test_csd_never_longer_than_binary(self):
        for k in range(1, 1024):
            self.assertLessEqual(len(csd(k)), len(binary_digits(k)))

    def test_known_values(self):
        self.assertEqual(csd(255), [(0, -1), (8, 1)])
        self.assertEqual(csd(7), [(0, -1), (3, 1)])


class SynthTest(unittest.TestCase):
    def test_forms_equivalent_and_csd_saves_on_255(self):
        with tempfile.TemporaryDirectory() as d:
            files, res = {}, {}
            for f in ("op", "bin", "csd"):
                src, top = verilog(f, 255)
                p = os.path.join(d, top + ".v")
                open(p, "w").write(src)
                files[f] = (p, top)
                res[f] = score(p, top)
            self.assertTrue(equivalent(*files["op"], *files["bin"]))
            self.assertTrue(equivalent(*files["op"], *files["csd"]))
            self.assertLess(res["csd"]["cells"], res["op"]["cells"])

    def test_miter_rejects_a_wrong_constant(self):
        with tempfile.TemporaryDirectory() as d:
            a, ta = verilog("op", 13)
            b, tb = verilog("csd", 11)
            pa, pb = os.path.join(d, "a.v"), os.path.join(d, "b.v")
            open(pa, "w").write(a)
            open(pb, "w").write(b)
            self.assertFalse(equivalent(pa, ta, pb, tb))

    def test_power_of_two_is_wiring(self):
        with tempfile.TemporaryDirectory() as d:
            src, top = verilog("op", 16)
            p = os.path.join(d, top + ".v")
            open(p, "w").write(src)
            self.assertEqual(score(p, top)["cells"], 0)


if __name__ == "__main__":
    unittest.main()
