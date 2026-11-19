"""``tools/near_clean_gate.py`` --split: one sweep serves as tune and held-out rows by the body's split."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import near_clean_gate as ncg  # noqa: E402


def test_load_keeps_only_the_named_split(tmp_path):
    rows = [
        {"file": "a", "split": "tune", "cpsnr": {"D": 1}, "lpsnr": {"D": 1}},
        {"file": "b", "split": "held", "cpsnr": {"D": 1}, "lpsnr": {"D": 1}},
        {"file": "c", "skipped": "ValueError"},
    ]
    p = tmp_path / "rows.jsonl"
    p.write_text("".join(json.dumps(r) + "\n" for r in rows))
    assert [r["file"] for r in ncg.load([str(p)])] == ["a", "b"]
    assert [r["file"] for r in ncg.load([str(p)], "tune")] == ["a"]
    assert [r["file"] for r in ncg.load([str(p)], "held")] == ["b"]


def test_clean_truths_drops_rows_whose_truth_is_noisier_than_the_noise_added(tmp_path):
    base = {"cpsnr": {"D": 1}, "lpsnr": {"D": 1}, "split": "tune"}
    rows = [
        dict(base, file="clean", snr=200.0, truth_sigma18=0.0005),  # truth SNR 360 >= 200: kept
        dict(base, file="grainy", snr=200.0, truth_sigma18=0.02),  # truth SNR 9 < 200: dropped
        dict(base, file="grainy-low", snr=12.0, truth_sigma18=0.01),  # truth SNR 18 >= 12: kept
        dict(base, file="old", snr=200.0),  # no field: kept
    ]
    p = tmp_path / "rows.jsonl"
    p.write_text("".join(json.dumps(r) + "\n" for r in rows))
    assert [r["file"] for r in ncg.load([str(p)])] == ["clean", "grainy", "grainy-low", "old"]
    assert [r["file"] for r in ncg.load([str(p)], clean_truths=True)] == ["clean", "grainy-low", "old"]
