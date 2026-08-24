from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from check import check_folder, check_file  # noqa: E402
from write_fixtures import jpeg_bytes, png_bytes, write  # noqa: E402


@pytest.fixture
def fixtures(tmp_path: Path) -> Path:
    write(tmp_path)
    return tmp_path


def test_passing_files_have_no_findings(fixtures: Path) -> None:
    by_name = {r.info.path.name: r for r in check_folder(fixtures)}
    assert by_name["sunset-8x10.png"].findings == ()
    assert by_name["harbor-11x14.jpg"].findings == ()


def test_four_labelled_failures(fixtures: Path) -> None:
    by_name = {r.info.path.name: r for r in check_folder(fixtures)}
    assert [f.rule for f in by_name["tiny-8x10.png"].findings] == ["implied_dpi"]
    assert [f.rule for f in by_name["web-8x10.png"].findings] == ["web_filename"]
    assert [f.rule for f in by_name["crop-16x20.png"].findings] == ["named_aspect"]
    assert [f.rule for f in by_name["sketch.png"].findings] == ["pixel_floor"]


def test_notes_txt_is_not_a_print_file(fixtures: Path) -> None:
    names = {r.info.path.name for r in check_folder(fixtures)}
    assert "notes.txt" not in names
    assert len(names) == 6


def test_landscape_8x10_at_floor_passes(tmp_path: Path) -> None:
    path = tmp_path / "wide-8x10.png"
    path.write_bytes(png_bytes(1500, 1200))
    report = check_file(path)
    assert report.size_token == "8x10"
    assert report.findings == ()


def test_jpeg_header_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "art-11x14.jpg"
    path.write_bytes(jpeg_bytes(1650, 2100))
    report = check_file(path)
    assert report.info.format == "jpeg"
    assert report.info.width == 1650
    assert report.info.height == 2100
    assert report.findings == ()
