"""Tests for experiments/state7o (milestone 7o): the design list, the refit pipeline's control and its helpers."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
D = HERE / "experiments" / "state7o"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


S = _mod("state7o_run", D / "run.py")


class Helpers(unittest.TestCase):
    def test_rel(self):
        self.assertEqual(S.rel(0.0, 0.0), 0.0)
        self.assertAlmostEqual(S.rel(1.1, 1.0), 0.1)
        self.assertEqual(S.rel(1.0, 0.0), float("inf"))

    def test_verdict(self):
        self.assertEqual(S.verdict(True, True), "supported")
        self.assertEqual(S.verdict(False, True), "refuted")
        self.assertEqual(S.verdict(False, False), "inconclusive")


class Pipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.H, cls.DC = S._deps()
        cls.base = S.reference()

    def test_designs_cover_every_pool(self):
        d = S.designs()
        self.assertEqual(len(d), 200)
        self.assertEqual({p: sum(x[0] == p for x in d) for p, _ in S.SRC},
                         {"5zk": 40, "5zy": 32, "5zz": 32, "7g": 32, "7h": 64})
        self.assertEqual({(p, c, j) for p, c, j, _ in d}, set(self.base))

    def test_control_reproduces_committed_mc_and_7h(self):
        rows, lines = S.corrected(self.base, {k: r["O"] for k, r in self.base.items()}, self.DC)
        self.assertLess(max(abs(r["mC"] - self.base[(r["pool"], r["cond"], r["j"])]["mC"]) for r in rows), 1e-12)
        pol = json.loads((HERE / "experiments" / "runner7m" / "policy.json").read_text())["replay7h"]["sets"]
        for st, (obs, c0, c1) in lines.items():
            self.assertEqual(obs, pol[st]["obs"])
            self.assertAlmostEqual(c0, pol[st]["c0"], places=12)
            self.assertAlmostEqual(c1, pol[st]["c1"], places=12)
        e = S.evaluate(rows, self.H)
        s7h = json.loads((HERE / "experiments" / "fresh7h" / "summary.json").read_text())["summary"]
        self.assertEqual(e["refit_agg"]["met"], s7h["refit"]["theta50"]["met"])
        self.assertAlmostEqual(e["refit_agg"]["cycles"], s7h["refit"]["theta50"]["cycles"])
        self.assertEqual(e["lopo_agg"]["met"], s7h["lopo5"]["theta50"]["met"])
        self.assertAlmostEqual(e["lopo_agg"]["cycles"], s7h["lopo5"]["theta50"]["cycles"])
        for st, f in ((f["set"], f) for f in e["refit"]):
            self.assertAlmostEqual(f["policy"][2], pol[st]["theta"], places=12)

    def test_corrected_is_affine_in_the_picked_observable(self):
        # shifting every design's observables by a constant leaves leave-one-out picks (rank-based) and mC unchanged
        obs = {k: {q: v + (0.5 if q == "O1" else 0.0) for q, v in r["O"].items()} for k, r in self.base.items()}
        a, _ = S.corrected(self.base, {k: r["O"] for k, r in self.base.items()}, self.DC)
        b, _ = S.corrected(self.base, obs, self.DC)
        key = lambda r: (r["pool"], r["cond"], r["j"])
        bm = {key(r): r["mC"] for r in b}
        self.assertLess(max(abs(r["mC"] - bm[key(r)]) for r in a), 1e-9)


if __name__ == "__main__":
    unittest.main()
