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
