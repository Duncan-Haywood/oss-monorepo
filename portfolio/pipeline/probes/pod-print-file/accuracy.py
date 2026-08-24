"""Fixture-corpus accuracy. Author-authored, not held-out."""

from __future__ import annotations

from pathlib import Path

from check import check_folder

# Recomputed by measure(); the constants below are what the record prints
# and test_accuracy.py fails if measure() disagrees.
ACCURACY = {
    "date": "2026-08-24",
    "files": 6,
    "precision": 1.0,
    "recall": 1.0,
    "true_positives": 4,
    "false_positives": 0,
    "false_negatives": 0,
    "limits": (
        "Author-authored fixtures, not held-out. Silent on unimplemented "
        "rows (bleed margin, CMYK/ICC, PDF fonts, lab-specific)."
    ),
}

# Each fixture filename maps to the finding rules it must raise.
# An empty tuple means the file should raise nothing.
EXPECTED: dict[str, tuple[str, ...]] = {
    "sunset-8x10.png": (),
    "harbor-11x14.jpg": (),
    "tiny-8x10.png": ("implied_dpi",),
    "web-8x10.png": ("web_filename",),
    "crop-16x20.png": ("named_aspect",),
    "sketch.png": ("pixel_floor",),
    "notes.txt": (),  # not a print file; ignored by the walker
}


def fixture_dir() -> Path:
    return Path(__file__).resolve().parent / "fixtures"


def measure(folder: Path | None = None) -> dict:
    folder = folder or fixture_dir()
    reports = check_folder(folder)
    tp = fp = fn = 0
    for report in reports:
        got = {f.rule for f in report.findings}
        expected = set(EXPECTED.get(report.info.path.name, ()))
        tp += len(got & expected)
        fp += len(got - expected)
        fn += len(expected - got)
    precision = 1.0 if tp + fp == 0 else tp / (tp + fp)
    recall = 1.0 if tp + fn == 0 else tp / (tp + fn)
    return {
        "files": len(reports),
        "precision": precision,
        "recall": recall,
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
    }
