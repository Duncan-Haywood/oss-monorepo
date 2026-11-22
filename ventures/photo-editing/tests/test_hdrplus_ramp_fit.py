"""``tools/hdrplus_ramp_fit.py``'s ``fit``: picks on tune only, the committed R1 tests and R2's count
(eval/hdrplus-ramp-fit-2026-11-22.md). Synthetic rows with known gains."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None


def _rows(bursts, gain, true_loss=0.0, bad=()):
    """Every arm on the shipped ramps scores (40, 50); the `GOOD` pair adds `gain` dB to both metrics (minus 0.5 on
    luma for bursts in `bad`); `true` on the shipped ramps loses `true_loss` dB colour."""

    import hdrplus_ramp_fit as h

    good = ((0.3, 1.0), (1.2, 2.0))
    out = []
    for i, b in enumerate(bursts):
        base = {"burst": b, "model": "x", "iso": 100, "m": 0.15, "m_src": "profiles", "true_sigma18": 0.005 + 0.001 * i}
        out.append({**base, "arm": "D", "cl": None, "ll": None, "scores": [39.0, 49.0]})
        for arm in h.ARMS:
            for cl, ll in [(h.SHIP_C, h.SHIP_L), good, ((0.2, 0.8), h.SHIP_L)]:
                c, lu = 40.0, 50.0
                if (cl, ll) == (h.SHIP_C, h.SHIP_L) and arm == "true":
                    c -= true_loss
                if (cl, ll) == good:
                    c, lu = c + gain, lu + gain - (0.5 if b in bad else 0.0)
                out.append({**base, "arm": arm, "cl": list(cl), "ll": list(ll), "scores": [c, lu]})
    return out


@unittest.skipIf(np is None, "numpy not installed")
class Fit(unittest.TestCase):
    def run_fit(self, rows, tune, held):
        import hdrplus_ramp_fit as h

        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "rows.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
            (d / "tune.txt").write_text("\n".join(tune) + "\n")
            (d / "held.txt").write_text("\n".join(held) + "\n")
            from contextlib import redirect_stdout
            import io

            with redirect_stdout(io.StringIO()):
                h.main(["fit", str(d / "rows.jsonl"), "--tune", str(d / "tune.txt"), "--held", str(d / "held.txt"),
                        "--json", str(d / "fit.json")])
            return json.loads((d / "fit.json").read_text())

    def test_clean_gain_passes_every_test(self):
        tune, held = [f"t{i}" for i in range(6)], [f"h{i}" for i in range(9)]
        out = self.run_fit(_rows(tune + held, 0.1), tune, held)
        self.assertEqual(out["ship"]["pick"], [[0.3, 1.0], [1.2, 2.0]])
        self.assertTrue(all(out["ship"]["R1"].values()))
        self.assertAlmostEqual(out["ship"]["held_colour"], 0.1, places=6)

    def test_a_losing_held_burst_fails_h3_only_where_it_should(self):
        tune, held = [f"t{i}" for i in range(6)], [f"h{i}" for i in range(9)]
        out = self.run_fit(_rows(tune + held, 0.1, bad={"h4"}), tune, held)
        r1 = out["ship"]["R1"]
        self.assertFalse(r1["h3"])
        self.assertTrue(r1["h1"])
        self.assertEqual(out["ship"]["held_worse"], 1)

    def test_pick_is_made_on_tune_not_held(self):
        # every held burst is bad for the good pair, so held would not pick it; tune still does
        tune, held = [f"t{i}" for i in range(6)], [f"h{i}" for i in range(9)]
        out = self.run_fit(_rows(tune + held, 0.1, bad=set(held)), tune, held)
        self.assertEqual(out["ship"]["pick"], [[0.3, 1.0], [1.2, 2.0]])
        self.assertFalse(out["ship"]["R1"]["h1"])

    def test_r2_counts_oracle_losses_on_shipped_and_picked_ramps(self):
        tune, held = [f"t{i}" for i in range(6)], [f"h{i}" for i in range(9)]
        out = self.run_fit(_rows(tune + held, 0.1, true_loss=0.3), tune, held)
        self.assertEqual(out["R2"]["shipped"], 9)
        self.assertEqual(out["R2"]["picked"], 0)


if __name__ == "__main__":
    unittest.main()
