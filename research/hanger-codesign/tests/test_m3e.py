"""Milestone 3e: the cross-lattice state transfer and the distinct-state filter behind the pooled rule."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

EXP = Path(__file__).resolve().parents[1] / "experiments"
_saved = sys.modules.get("run")
# 3d's run.py does `import run` for milestone 3a's module; other tests leave their own `run` in
# sys.modules, so pin 3a's while loading (as test_m3d does), then restore
sys.path.insert(0, str(EXP / "m3_fem_tier"))
_s3 = importlib.util.spec_from_file_location("run", EXP / "m3_fem_tier" / "run.py")
_m3 = importlib.util.module_from_spec(_s3)
sys.modules["run"] = _m3
_s3.loader.exec_module(_m3)
_s = importlib.util.spec_from_file_location("m3e_run", EXP / "m3e_pooled" / "run.py")
m3e = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3e)
if _saved is not None:
    sys.modules["run"] = _saved
else:
    sys.modules.pop("run", None)


class TestM3e(unittest.TestCase):
    def test_transfer_onto_the_same_lattice_is_the_identity(self):
        sp = m3e.m3.Disc("D", 800.0, 0.015, "kes")
        X = sp.start(2)
        Y, nout = m3e.transfer(sp, X, m3e.m3.Disc("D", 800.0, 0.015, "kes"))
        self.assertEqual(nout, 0)
        np.testing.assert_allclose(Y, X, atol=1e-12)

    def test_transfer_carries_a_smooth_drape_between_lattices(self):
        a, b = m3e.m3.Disc("D", 800.0, 0.015, "kes"), m3e.m3.Disc("D", 800.0, 0.01, "kes")
        # a smooth axisymmetric droop, linear interpolation error is second order
        r = lambda P: np.hypot(P[:, 0], P[:, 1])
        X = a.X0.copy()
        X[:, 2] = -0.5 * r(a.P) ** 2
        Y, _ = m3e.transfer(a, X, b)
        err = np.abs(Y[:, 2] + 0.5 * r(b.P) ** 2)
        inner = b.free & (r(b.P) < 0.9 * r(a.P).max())       # inside the coarse hull: second order
        self.assertLess(err[inner].max(), 1e-4)
        self.assertLess(err[b.free].max(), 2e-3)                 # rim: nearest-node fallback
        np.testing.assert_array_equal(Y[b.fixed], b.X0[b.fixed])

    def test_distinct_keeps_one_per_state_and_drops_unconverged(self):
        rows = [dict(seed=0, folds=8, energy=-1.0, conv=True), dict(seed=1, folds=8, energy=-1.0 - 1e-12, conv=True),
                dict(seed=2, folds=9, energy=-1.0, conv=True), dict(seed=3, folds=8, energy=-0.9, conv=True),
                dict(seed=4, folds=7, energy=-2.0, conv=False)]
        self.assertEqual(sorted(r["seed"] for r in m3e.distinct(rows)), [1, 2, 3])

    def test_checkpoint_names_are_distinct_per_seed_and_resume_is_exact(self):
        f, a = "D", 0.015
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as e:
            full = {s: m3e.chain_job((f, a, s, d)) for s in (0, 1)}
            parts = sorted(p.name for p in Path(d).glob("partial_*.json"))
            self.assertEqual(parts, [f"partial_D_15_{s}.json" for s in (0, 1)])
            # interrupted after stage 2: keep only the checkpoint, as a killed run would
            for s in (0, 1):
                rows = json.loads((Path(d) / f"partial_D_15_{s}.json").read_text())[:2]
                (Path(e) / f"partial_D_15_{s}.json").write_text(json.dumps(rows))
                for k in (0, 1):
                    n = f"partial_D_15_{s}_stage{k}.npy"
                    (Path(e) / n).write_bytes((Path(d) / n).read_bytes())
            for s in (0, 1):
                res = m3e.chain_job((f, a, s, e))
                self.assertEqual([r["energy"] for r in res], [r["energy"] for r in full[s]])
                self.assertEqual([r["dc"] for r in res[2:]], [r["dc"] for r in full[s][2:]])


if __name__ == "__main__":
    unittest.main()
