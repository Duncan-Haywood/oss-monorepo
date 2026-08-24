from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from check import check_folder  # noqa: E402
from record import render  # noqa: E402
from write_fixtures import write  # noqa: E402

FORBIDDEN = (
    "mls-ready",
    "mls ready",
    "you are compliant",
    "compliant with",
    "certificate of",
    "will accept",
    "board will",
)


def test_record_refuses_warranty_language(tmp_path: Path) -> None:
    write(tmp_path)
    text = render(tmp_path, check_folder(tmp_path), checked_on="2026-08-24").lower()
    for phrase in FORBIDDEN:
        assert phrase not in text, phrase
