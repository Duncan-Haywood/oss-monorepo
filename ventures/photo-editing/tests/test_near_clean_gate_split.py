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


if __name__ == "__main__":
    unittest.main()
