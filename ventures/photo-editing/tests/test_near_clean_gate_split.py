"""``tools/near_clean_gate.py`` row filters: --split (tune or held by body) and --clean-truths."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

HAVE_NUMPY = importlib.util.find_spec("numpy") is not None
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))


def _write(rows) -> str:
    fd = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    with fd:
        fd.write("".join(json.dumps(r) + "\n" for r in rows))
    return fd.name


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class RowFilters(unittest.TestCase):
    def setUp(self):
        import near_clean_gate

        self.ncg = near_clean_gate

    def test_load_keeps_only_the_named_split(self):
        p = _write([
            {"file": "a", "split": "tune", "cpsnr": {"D": 1}, "lpsnr": {"D": 1}},
            {"file": "b", "split": "held", "cpsnr": {"D": 1}, "lpsnr": {"D": 1}},
            {"file": "c", "skipped": "ValueError"},
        ])
        self.assertEqual([r["file"] for r in self.ncg.load([p])], ["a", "b"])
        self.assertEqual([r["file"] for r in self.ncg.load([p], "tune")], ["a"])
        self.assertEqual([r["file"] for r in self.ncg.load([p], "held")], ["b"])

    def test_clean_truths_drops_rows_whose_truth_is_noisier_than_the_noise_added(self):
        base = {"cpsnr": {"D": 1}, "lpsnr": {"D": 1}, "split": "tune"}
        p = _write([
            dict(base, file="clean", snr=200.0, truth_sigma18=0.0005),  # truth SNR 360 >= 200: kept
            dict(base, file="grainy", snr=200.0, truth_sigma18=0.02),  # truth SNR 9 < 200: dropped
            dict(base, file="grainy-low", snr=12.0, truth_sigma18=0.01),  # truth SNR 18 >= 12: kept
            dict(base, file="old", snr=200.0),  # no field: kept
        ])
        self.assertEqual([r["file"] for r in self.ncg.load([p])], ["clean", "grainy", "grainy-low", "old"])
        self.assertEqual([r["file"] for r in self.ncg.load([p], clean_truths=True)], ["clean", "grainy-low", "old"])

    def test_the_raw_grain_reading_wins_over_the_texture_prone_one(self):
        # eval/near-clean-truth-noise-2026-11-19.md: frame_noise on a foliage truth reads 0.014 (SNR 13) where the
        # raw holds 0.0012 (SNR 150), so a row at SNR 60 is clean by the raw and was dropped by the old column.
        row = {"snr": 60.0, "truth_sigma18": 0.014, "truth_grain18": 0.0012}
        self.assertTrue(self.ncg.clean_enough(row))
        self.assertFalse(self.ncg.clean_enough(dict(row, snr=200.0)))  # 150 < 200: the truth's grain rivals it
        self.assertFalse(self.ncg.clean_enough({"snr": 60.0, "truth_sigma18": 0.014}))  # no raw reading: old rule
        self.assertFalse(self.ncg.clean_enough({"snr": 60.0, "truth_sigma18": 0.0005, "truth_grain18": 0.01}))


if __name__ == "__main__":
    unittest.main()


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class Whitened(unittest.TestCase):
    """eval/noise-pca-whitened-level-2026-11-21.md's pick and test on hand-made rows."""

    def _rows(self, gain):
        rows = []
        for i, (snr, sc) in enumerate([(s, c) for s in (200.0, 60.0, 25.0, 12.0) for c in ("equal", "wb")] * 2):
            up = gain if sc == "wb" and snr <= 25 else 0.0
            arm = {"D": 30.0, "ship+12": 30.5, "mpcw+12": 30.5 + up / 2, "mpcws+12": 30.5 + up}
            rows.append({"file": f"f{i}", "split": "held" if (i // 2) % 2 else "tune", "snr": snr, "scenario": sc,
                         "truth_sigma18": 0.0001, "tile": [0, 0], "cpsnr": dict(arm), "lpsnr": dict(arm),
                         "sigma18": {"ship": 0.01, "mpcw": 0.011, "mpcws": 0.012}, "true_sigma18": 0.012})
        return _write(rows)

    def _run(self, *argv):
        import contextlib
        import io

        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            import near_clean_gate

            near_clean_gate.main(list(argv))
        return out.getvalue()

    def test_pick_takes_the_larger_gain_and_the_test_passes_it(self):
        p = self._rows(0.2)
        self.assertIn("pick: mpcws", self._run("whitened", p, "--split", "tune"))
        self.assertIn("verdict: ship mpcws on Bayer", self._run("whitened", p, "--split", "held", "--eig", "mpcws"))

    def test_no_gain_stops_and_fails_h3(self):
        p = self._rows(0.0)
        self.assertIn("pick: none: stop", self._run("whitened", p, "--split", "tune"))
        out = self._run("whitened", p, "--split", "held", "--eig", "mpcws")
        self.assertIn("FAIL h3", out)
        self.assertIn("verdict: what ships stays", out)
