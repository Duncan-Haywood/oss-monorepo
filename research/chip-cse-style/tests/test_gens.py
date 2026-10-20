import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_cse_style import gens
from chip_cse_style.flow import equivalent, score

REF = os.path.join(HERE, "..", "designs", "add16.v")


class StyleTest(unittest.TestCase):
    def test_every_style_is_proved_equivalent(self):
        with tempfile.TemporaryDirectory() as d:
            for st in gens.STYLES:
                f = os.path.join(d, st + ".v")
                open(f, "w").write(gens.gen_add16(st))
                self.assertTrue(equivalent(REF, "add16", f, "add16"), st)

    def test_miter_rejects_a_broken_style(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "bad.v")
            open(f, "w").write(gens.gen_add16("gen").replace("5'd1", "5'd2"))
            self.assertFalse(equivalent(REF, "add16", f, "add16"))

    def test_styles_differ_as_text_and_score_runs(self):
        self.assertEqual(len({gens.gen_add16(s) for s in gens.STYLES}), len(gens.STYLES))
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "p.v")
            open(f, "w").write(gens.gen_add16("plus"))
            self.assertGreater(score(f, "add16")["cells"], 0)


if __name__ == "__main__":
    unittest.main()
