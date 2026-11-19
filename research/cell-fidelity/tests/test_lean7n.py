"""Tests for experiments/lean7n (milestone 7n): the lean score read and the report algebra."""
import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
D = HERE / "experiments" / "lean7n"
sys.path.insert(0, str(D))


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


N = _mod("triage", D / "triage.py")
R = _mod("lean7n_run", D / "run.py")


class LeanRead(unittest.TestCase):
    def test_needs(self):
        self.assertEqual(N.needs("O1"), (2,))
        self.assertEqual(N.needs("O2"), (2, 10))
        self.assertEqual(N.needs("O3"), ())

    def test_lean_matches_full_observables(self):
        xs, L = [0.5, 1.5, 2.5], 3.0
        p2, p10 = [1.0, 2.0, 0.5], [0.2, 1.0, 3.0]
        lost = [0, 1, 0, 0, 0, 3, 0, 0, 0, 7]
        full = N.M.observables(p2, p10, xs, L, lost)
        plat = {2: p2, 10: p10}
        for k in ("O1", "O2"):
            self.assertAlmostEqual(N.lean_observable(k, plat, xs, L), full[k])
        self.assertAlmostEqual(N.lean_observable("O3", {}, xs, L, lost), full["O3"])

    def test_scale_free(self):
        # the plating current integral is F times the dead-lithium change per node (both positive here); F cancels
        xs, L = [0.5, 1.5, 2.5], 3.0
        p = {2: [1.0, 2.0, 0.5], 10: [0.2, 1.0, 3.0]}
        q = {k: [96485.33 * v for v in vs] for k, vs in p.items()}
        self.assertAlmostEqual(N.lean_observable("O2", p, xs, L), N.lean_observable("O2", q, xs, L))

    def test_state_change_and_empty(self):
        self.assertEqual(N.state_change([1, 2, 3], [2, 2, 5]), [1.0, 0.0, 2.0])
        o = N.lean_observable("O1", {2: [0.0, 0.0]}, [0.5, 1.5], 2.0)
        self.assertTrue(math.isnan(o))
        self.assertTrue(N.decide(N.drift_score({"obs": "O1", "c0": 1, "c1": 1}, {"O1": o}), 0.05))


class Report(unittest.TestCase):
    def _r(self, ext, s, s7, th=0.05, tT=6.0, tA=10.0, look=3.0):
        T = dict(pick="O1", extend=ext, score=s, theta=th, obs={"O1": 0.5}, score_full=s7, seconds=tT, t_look=look,
                 t_score=0.01, t_score_full=0.02, cycles=50 if ext else 10, lost_mol=[1.0] * 50, mesh_vs_xn=0.0)
        P = dict(score=s7, extend=s7 >= th, obs={"O1": 0.5}, t_score=0.2)
        ref = dict(lost_mol=[1.0] * 100)
        return R.design_row(dict(cond="Ai2020@1x", j=1, stages=dict(T=T, A=dict(seconds=tA))), dict(stages=dict(T=P)), ref)

    def test_design_row(self):
        r = self._r(True, 0.1, 0.1, tT=10.5)
        self.assertAlmostEqual(r["ratio"], 1.05)
        self.assertAlmostEqual(r["b"], (10.0 - 3.0) / 40)
        self.assertFalse(r["near"])
        self.assertTrue(self._r(True, 0.0502, 0.0502)["near"])

    def test_verdicts(self):
        rows = [self._r(True, 0.1, 0.1, tT=10.0), self._r(False, 0.01, 0.01, tT=4.0)]
        S = R.summarise(rows)
        V = R.verdicts(rows, S, 0.14)
        self.assertEqual(V["H301"]["agree"], 2)
        self.assertEqual(V["H301"]["verdict"], R.verdict(True, False))
        self.assertAlmostEqual(V["H303"]["saving"], 1 - (1.0 + 0.4) / 2)
        flip = [self._r(False, 0.04, 0.1)]
        self.assertEqual(R.verdicts(flip + rows, R.summarise(flip + rows), 0.14)["H301"]["agree"], 2)


if __name__ == "__main__":
    unittest.main()
