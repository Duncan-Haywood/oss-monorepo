from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from accuracy import ACCURACY, measure  # noqa: E402
from record import render  # noqa: E402
from write_fixtures import write  # noqa: E402


def test_measure_matches_printed_constants(tmp_path: Path) -> None:
    write(tmp_path)
    got = measure(tmp_path)
    assert got["photos"] == ACCURACY["photos"]
    assert got["precision"] == ACCURACY["precision"]
    assert got["recall"] == ACCURACY["recall"]
    assert got["true_positives"] == ACCURACY["true_positives"]
    assert got["false_positives"] == ACCURACY["false_positives"]
    assert got["false_negatives"] == ACCURACY["false_negatives"]


def test_record_prints_the_same_figures(tmp_path: Path) -> None:
    write(tmp_path)
    from check import check_folder

    text = render(tmp_path, check_folder(tmp_path), checked_on="2026-08-24")
    assert f"precision **{ACCURACY['precision']}**" in text
    assert f"recall **{ACCURACY['recall']}**" in text
    assert "not a certificate" in text.lower()
    assert "silent pass" in text.lower()
    assert "visual_watermark" in text
    assert "unimplemented" in text
    assert "Do not submit" in text
