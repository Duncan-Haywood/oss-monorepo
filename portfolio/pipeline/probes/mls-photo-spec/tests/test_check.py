from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from check import check_folder, check_photo  # noqa: E402
from write_fixtures import jpeg_bytes, png_bytes, write  # noqa: E402


@pytest.fixture
def fixtures(tmp_path: Path) -> Path:
    write(tmp_path)
    return tmp_path


def test_passing_photos_have_no_findings(fixtures: Path) -> None:
    by_name = {r.info.path.name: r for r in check_folder(fixtures)}
    assert by_name["living-1024x768.png"].findings == ()
    assert by_name["kitchen-1200x800.jpg"].findings == ()


def test_long_edge_and_aspect_and_branding_and_staging(fixtures: Path) -> None:
    by_name = {r.info.path.name: r for r in check_folder(fixtures)}
    assert [f.rule for f in by_name["too-small-64x48.png"].findings] == ["long_edge"]
    assert [f.rule for f in by_name["wide-banner-1600x400.png"].findings] == ["aspect"]
    assert [f.rule for f in by_name["agent-logo-1200x800.png"].findings] == [
        "branding_filename"
    ]
    assert [f.rule for f in by_name["living-staged.png"].findings] == ["staging_pair"]


def test_notes_txt_is_not_a_photo(fixtures: Path) -> None:
    names = {r.info.path.name for r in check_folder(fixtures)}
    assert "notes.txt" not in names
    assert len(names) == 6


def test_staged_with_original_sibling_passes(tmp_path: Path) -> None:
    (tmp_path / "living.png").write_bytes(png_bytes(1024, 768))
    (tmp_path / "living-staged.png").write_bytes(png_bytes(1024, 768))
    by_name = {r.info.path.name: r for r in check_folder(tmp_path)}
    assert by_name["living-staged.png"].findings == ()
    assert by_name["living.png"].findings == ()


def test_instant_jpeg_header_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "room.jpg"
    path.write_bytes(jpeg_bytes(1600, 1200))
    report = check_photo(path)
    assert report.info.format == "jpeg"
    assert report.info.width == 1600
    assert report.info.height == 1200
    assert report.findings == ()
