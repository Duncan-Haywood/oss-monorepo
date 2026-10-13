"""verify-library on backup.py's <root>/_checksums.csv, and the before/after listing every command takes."""
from __future__ import annotations

import os
from pathlib import Path

from igmp import cli, integrity

RAW = "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW"
JPG = "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.JPG"


def library(tmp_path: Path) -> tuple[Path, Path]:
    lib = tmp_path / "Library"
    (lib / "Insta360").mkdir(parents=True)
    (lib / RAW).write_bytes(b"r" * 200_000)
    (lib / JPG).write_bytes(b"j" * 1000)
    (lib / "Insta360" / "_index.csv").write_text("file,local_date\n")
    (lib / ".DS_Store").write_bytes(b"finder")
    (lib / ".Spotlight-V100").mkdir()                 # macOS housekeeping: skipped
    settings = tmp_path / "config.toml"
    settings.write_text(f'library_roots = ["{lib}"]\noutput_dir = "{tmp_path / "out"}"\nbackend = "api"\n')
    return lib, settings


def test_snapshot_compare_and_sidecars(tmp_path):
    lib, _ = library(tmp_path)
    before, unreadable = integrity.snapshot([lib])
    assert not unreadable and str(lib / ".DS_Store") in before
    assert not any(".Spotlight-V100" in p for p in before)
    (lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.xmp").write_text("<x:xmpmeta/>")   # a sidecar
    (lib / f"._{JPG}").write_bytes(b"")                                                    # AppleDouble
    os.chmod(lib / RAW, 0o600)
    diff = integrity.compare(before, integrity.snapshot([lib])[0])
    sidecars, rest = integrity.split_sidecars(diff)
    assert sidecars == 1
    assert rest.added == [str(lib / f"._{JPG}")] and rest.changed == [f"{lib / RAW}: permissions"]


def test_verify_library_against_the_backup_manifest(tmp_path, capsys):
    lib, settings = library(tmp_path)
    args = ["verify-library", "--config", str(settings)]
    assert cli.main(args) == 2                                  # no _checksums.csv yet
    assert "igmp backup manifest" in capsys.readouterr().out
    assert cli.main(["backup", "manifest", "--config", str(settings)]) == 0
    assert (lib / "_checksums.csv").exists()                    # backup's own file, allowed for `backup` only
    assert cli.main(args) == 0 and cli.main(args + ["--full"]) == 0
    assert "unchanged" in capsys.readouterr().out

    # the tag stage's sidecars are expected; an AppleDouble file, a .pp3 or an edit are not
    (lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.xmp").write_text("<x:xmpmeta/>")
    assert cli.main(args) == 0
    assert "1 XMP sidecar(s) written since" in capsys.readouterr().out
    (lib / f"._{JPG}").write_bytes(b"")
    (lib / f"{RAW}.pp3").write_text("[Version]\n")
    assert cli.main(args) == 1
    out = capsys.readouterr().out
    assert f"._{JPG}" in out and f"{RAW}.pp3" in out


def test_full_mode_finds_damage_that_size_and_time_cannot(tmp_path, capsys):
    lib, settings = library(tmp_path)
    assert cli.main(["backup", "manifest", "--config", str(settings)]) == 0
    raw = lib / RAW
    st = raw.stat()
    with open(raw, "r+b") as fh:                                # an in-place write: same size, same mtime
        fh.write(b"EXIF")
    os.utime(raw, ns=(st.st_atime_ns, st.st_mtime_ns))
    args = ["verify-library", "--config", str(settings)]
    assert cli.main(args) == 0                                  # fast mode can't see it
    assert cli.main(args + ["--full"]) == 1
    assert f"damaged  {RAW}" in capsys.readouterr().out
