"""Tests for experiments/sets7p (milestone 7p): the probe rule, the pool split, and a control that the stdlib
correction reproduces the committed drift estimates of the four committed sets."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
D = EXP / "sets7p"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


S = _mod("sets7p_run", D / "run.py")


def _row(j, lost, pl2=1.0, pl10=1.0, ok=True, cycles=20):
    pl = [[0.0] * 3 for _ in range(cycles)]
    pl[1] = [pl2, 0.0, 0.0]
    pl[9] = [pl10, 0.0, 0.0]
    return dict(j=j, ok=ok, ok_cycles=cycles, pl_node=pl, lost_mol=lost)


class Probe(unittest.TestCase):
    def test_keeps_fading_plating_cells(self):
        lost = [0.0, 1.0] + [1.0] * 17 + [5.0]
        rows = [_row(j, lost) for j in range(4)]
        ok, why = S.probe_ok(rows, {j: 100.0 for j in range(4)})
        self.assertTrue(ok, why)                       # (5 - 1) / 100 = 0.04 >= 0.03

    def test_drops_low_fade_no_plating_and_failures(self):
        lost = [0.0, 1.0] + [1.0] * 17 + [3.0]
        self.assertFalse(S.probe_ok([_row(j, lost) for j in range(4)], {j: 100.0 for j in range(4)})[0])
        hi = [0.0, 1.0] + [1.0] * 17 + [9.0]
        self.assertFalse(S.probe_ok([_row(j, hi, pl10=0.0) for j in range(4)], {j: 100.0 for j in range(4)})[0])
        self.assertFalse(S.probe_ok([_row(j, hi) for j in range(3)], {j: 100.0 for j in range(4)})[0])

    def test_choose_one_per_cell_in_order(self):
        res = {c: (True, "") for c in S.CANDIDATES}
        self.assertEqual(S.choose(res), ["Mohtat2020@3x", "Ecker2015@2x"])
        res["Mohtat2020@3x"] = (False, "")
        res["Ecker2015@2x"] = (False, "")
        self.assertEqual(S.choose(res), ["Mohtat2020@4x", "Ecker2015@3x"])


class Pools(unittest.TestCase):
    def test_split_in_design_order(self):
        p = S.split_pools(list(range(55, -1, -1)))
        self.assertEqual([len(p[k]) for k in S.POOLS], [10, 8, 8, 8, 16])
        self.assertEqual(p["p1"], list(range(10)))
        self.assertEqual(p["p5"], list(range(34, 50)))

    def test_paired_and_sign(self):
        a = [dict(set="s", pool=p, cycles=c, met=True) for p, c in (("p1", 40), ("p2", 50))]
        b = [dict(set="s", pool=p, cycles=c, met=True) for p, c in (("p1", 45), ("p2", 45))]
        pr = S.paired(a, b)
        self.assertEqual([r["d"] for r in pr], [-5, 5])
        self.assertEqual(S.sign_test([-1, -2, -3, 0]), (0, 3, 0.25))


class Control(unittest.TestCase):
    def test_correction_reproduces_committed_mC(self):
        """The four committed sets through correct(): their five pools mapped to p1..p5 give the committed mC."""
        sp, ls = S._stats()
        t7d = {(r["pool"], r["cond"], r["j"]): r["cells"]["000"]["mC"]
               for r in json.loads((EXP / "triage7d" / "rows.json").read_text())}
        name = dict(zip(("5zk", "5zy", "5zz", "7g", "7h"), S.POOLS))
        rows = []
        for o in json.loads((EXP / "drift7c" / "rows.json").read_text()):
            rows.append(dict(set=o["set"], pool=name[o["pool"]], j=o["j"], O1=o["O1"], O2=o["O2"], O3=o["O3"],
                             m=o["cells"]["000"]["m"], ref=t7d[(o["pool"], o["cond"], o["j"])]))
        for d in ("fresh7g", "fresh7h"):
            for o in json.loads((EXP / d / "rows.json").read_text()):
                rows.append(dict(set=o["set"], pool=name[o["pool"]], j=o["j"], O1=o["O1"], O2=o["O2"], O3=o["O3"],
                                 m=o["cells"]["000"]["m"], ref=o["cells"]["000"]["mC"]))
        worst = 0.0
        for st in S.OLD_SETS:
            mine = sorted([r for r in rows if r["set"] == st], key=lambda r: (r["pool"], r["j"]))
            out, _ = S.correct(mine, sp, ls)
            worst = max(worst, max(abs(r["mC"] - r["ref"]) for r in out))
        self.assertLess(worst, 1e-9)


if __name__ == "__main__":
    unittest.main()
