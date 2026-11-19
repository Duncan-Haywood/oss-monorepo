import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "rangeline"
spec = importlib.util.spec_from_file_location("rangeline_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["rangeline_run"] = run
spec.loader.exec_module(run)


class RangeLine(unittest.TestCase):
    def test_second_picks_avoid_5z_and_5zy_and_are_fixed(self):
        for k, want in ((12, [0, 1, 14, 16, 32, 45, 58, 60]), (8, None)):
            used = set(run.FN.used_picks(k)) | set(run.FN.fresh_picks(range(64), k))
            p = run.second_picks(range(64), k)
            self.assertEqual(len(p), 8)
            self.assertFalse(used & set(p))
            if want:
                self.assertEqual(p, want)

    def test_in_range(self):
        self.assertTrue(run.in_range(100, [90, 120, 110]))
        self.assertTrue(run.in_range(90, [90, 120]))
        self.assertFalse(run.in_range(89.9, [90, 120]))
        self.assertFalse(run.in_range(121, [90, 120]))

    def test_min_k(self):
        self.assertEqual(run.min_k(16), 12)
        self.assertEqual(run.min_k(4), None)

    def test_verdicts(self):
        e = lambda ns, nr, nl, nl40, c=0.01: dict(e=dict(NS=ns, NR=nr, NL=nl, NL40=nl40, C=c))
        S = {"Ai2020": e(.05, .04, .04, .05), "Chen2020": e(.05, .04, .04, .05),
             "OKane2022": e(.07, .03, .03, .05, .01), "NCA_Kim2011": e(.03, .04, .04, .03)}
        V = run.verdicts(S, 20, 24)
        self.assertEqual(V["H252"], "supported")
        self.assertEqual(V["H253"], "supported")
        self.assertEqual(V["H254"], "supported")
        self.assertEqual(V["H255"], "supported")


if __name__ == "__main__":
    unittest.main()
