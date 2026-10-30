import sys
import unittest
from pathlib import Path

import numpy as np

R = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(R / "hanger-3dseeds" / "experiments"), str(R / "hanger-3dseeds" / "src"), str(R / "hanger-3d" / "src"),
                str(R / "hanger-fit" / "src"), str(Path(__file__).resolve().parents[1] / "experiments")]
import importlib.util  # noqa: E402

_s = importlib.util.spec_from_file_location('radius_run', Path(__file__).resolve().parents[1] / 'experiments' / 'run.py')
run = importlib.util.module_from_spec(_s)
_s.loader.exec_module(run)


class CapTest(unittest.TestCase):
    def test_radius_hits_cap(self):
        self.assertAlmostEqual(run.to_cap(np.ones(4), 10.0).r, 10.0)
        self.assertAlmostEqual(run.to_cap(np.zeros(4), 10.0).r, 0.15)

    def test_other_bounds_unchanged(self):
        h = run.to_cap(np.ones(4), 15.0)
        self.assertAlmostEqual(h.bow, 5.0)
        self.assertAlmostEqual(h.w, 30.0)


if __name__ == "__main__":
    unittest.main()
