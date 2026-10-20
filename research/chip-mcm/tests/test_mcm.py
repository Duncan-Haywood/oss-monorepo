import os
import random
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "chip-abc-sweep", "src"))
from chip_abc_sweep.flow import equivalent, score  # noqa: E402
from chip_mcm.gens import adders, csd, share, verilog  # noqa: E402


def evaluate(terms, patterns, x):
    """Python value of each constant's product from the shared-term structure."""
    wire = {"x": x}
    for name, (gap, sg) in patterns.items():
        wire[name] = x + sg * (x << gap)
    return [sum(sg * (wire[w] << sh) for sh, sg, w in t) for t in terms]


class ShareTest(unittest.TestCase):
    def test_shared_terms_reconstruct_every_constant(self):
        rng = random.Random(1)
        for _ in range(200):
            ks = rng.sample(range(1, 256), rng.choice([2, 4, 8, 16]))
            terms, pats = share(ks)
            for x in (1, 3, 255):
                self.assertEqual(evaluate(terms, pats, x), [x * k for k in ks])

    def test_every_pattern_used_at_least_twice(self):
        rng = random.Random(2)
        for _ in range(100):
            terms, pats = share(rng.sample(range(1, 256), 8))
            for name in pats:
                self.assertGreaterEqual(sum(w == name for t in terms for _, _, w in t), 2)

    def test_never_more_adders_than_csd(self):
        rng = random.Random(3)
        for _ in range(100):
            ks = rng.sample(range(1, 256), 8)
            self.assertLessEqual(adders("mcm", ks), adders("csd", ks))

    def test_repeated_constant_shares_its_pair(self):
        terms, pats = share([11, 11])  # 11 = 16 - 4 - 1 has three digits, so one pair can be shared
        self.assertEqual(len(pats), 1)

    def test_no_shared_pattern_means_identical_to_csd(self):
        terms, pats = share([7])
        self.assertEqual(pats, {})
        self.assertEqual(terms, [[(0, -1, "x"), (3, 1, "x")]])


class SynthTest(unittest.TestCase):
    def test_forms_equivalent_and_mcm_saves_on_a_shared_bank(self):
        ks = [45, 93, 21, 85]
        with tempfile.TemporaryDirectory() as d:
            files, res = {}, {}
            for f in ("op", "csd", "mcm"):
                src, top = verilog(f, ks)
                p = os.path.join(d, top + ".v")
                open(p, "w").write(src)
                files[f] = (p, top)
                res[f] = score(p, top)
            self.assertTrue(equivalent(*files["op"], *files["csd"]))
            self.assertTrue(equivalent(*files["op"], *files["mcm"]))
            self.assertLess(res["mcm"]["cells"], res["op"]["cells"])


if __name__ == "__main__":
    unittest.main()
