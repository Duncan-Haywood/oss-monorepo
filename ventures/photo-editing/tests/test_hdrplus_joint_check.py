"""``tools/hdrplus_joint_check.py``'s ``judge``: the committed J1 tests (eval/hdrplus-joint-check-2026-11-22.md) on
synthetic rows with known gains."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

try:
    import numpy as np  # noqa: F401
except ImportError:  # pragma: no cover
    np = None


def _rows(n=9, gain=0.05, bad=(), d_win=()):
    """D scores (39, 49) except on `d_win` bursts (41, 51); every arm (40, 50); `candidate` adds `gain` to both,
    less 0.5 luma on `bad` bursts."""

    import hdrplus_joint_check as j

    out = []
    for i in range(n):
        b = f"b{i}"
        base = {"burst": b, "model": "x", "iso": 100, "m": 0.2, "m_src": "profiles", "true_sigma18": 0.004 + 0.001 * i}
        out.append({**base, "arm": "D", "scores": [41.0, 51.0] if b in d_win else [39.0, 49.0]})
        for name, *_ in j.ARMS:
            c, lu = 40.0, 50.0
            if name == "candidate":
                c, lu = c + gain, lu + gain - (0.5 if b in bad else 0.0)
            out.append({**base, "arm": name, "scores": [c, lu]})
    return out


@unittest.skipIf(np is None, "numpy not installed")
class JudgeTest(unittest.TestCase):
    def test_clean_gain_passes_all(self):
        import hdrplus_joint_check as j

        r = j.judge_rows(_rows())["candidate"]
        self.assertEqual(r["tests"], {"h1": True, "h2": True, "h3": True, "h4": True})
        self.assertAlmostEqual(r["luma"], 0.05, places=6)

    def test_one_bad_burst_fails_h4_only_when_mean_holds(self):
        import hdrplus_joint_check as j

        r = j.judge_rows(_rows(n=30, gain=0.1, bad=("b3",)))["candidate"]
        self.assertFalse(r["tests"]["h4"])
        self.assertEqual(r["worse_bursts"], ["b3"])
        self.assertTrue(r["tests"]["h3"])

    def test_small_gain_fails_h3(self):
        import hdrplus_joint_check as j

        self.assertFalse(j.judge_rows(_rows(gain=0.01))["candidate"]["tests"]["h3"])

    def test_new_loser_to_directional_fails_h2(self):
        import hdrplus_joint_check as j

        # on b0 D scores 41/51: ship (40/50) already loses by 1 dB, so that is not new; the candidate loses too
        r = j.judge_rows(_rows(d_win=("b0",)))["candidate"]
        self.assertEqual(r["new_losers_to_D"], 0)
        self.assertTrue(r["tests"]["h2"])
        rows = _rows()
        for row in rows:  # D at 40.05/50.0 on b1: ship ties, the candidate is 0.45 under on luma via bad
            if row["burst"] == "b1" and row["arm"] == "D":
                row["scores"] = [40.0, 50.0]
        rows = [r for r in rows if not (r["burst"] == "b1" and r["arm"] == "candidate")]
        rows.append({"burst": "b1", "model": "x", "iso": 100, "m": 0.2, "m_src": "profiles", "true_sigma18": 0.005,
                     "arm": "candidate", "scores": [40.0, 49.8]})
        self.assertFalse(j.judge_rows(rows)["candidate"]["tests"]["h2"])

    def test_collapse_rule(self):
        import hdrplus_joint_check as j

        ship = (1e-4, 1e-6)
        self.assertTrue(j.collapsed({"ship": ship, "mpcws": (7.5e-13, 0.0)}))
        self.assertFalse(j.collapsed({"ship": ship, "mpcws": (0.5e-4, 0.5e-6)}))
        self.assertFalse(j.collapsed({"ship": (0.0, 0.0), "mpcws": (0.0, 0.0)}))  # both zero: nothing to fall back to


if __name__ == "__main__":
    unittest.main()
