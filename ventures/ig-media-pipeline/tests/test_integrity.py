"""verify-library: manifests that catch added, removed and changed files, hidden ones included."""
from __future__ import annotations

import os
from pathlib import Path

from igmp import cli, integrity


def library(tmp_path: Path) -> Path:
    lib = tmp_path / "Library"
    (lib / "Insta360").mkdir(parents=True)
    (lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW").write_bytes(b"r" * 200_000)
    (lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.JPG").write_bytes(b"j" * 1000)
    (lib / "Insta360" / "_index.csv").write_text("file,local_date\n")
    (lib / ".DS_Store").write_bytes(b"finder")
    (lib / ".Spotlight-V100").mkdir()          # macOS housekeeping: skipped
    return lib


def test_manifest_spots_added_removed_and_changed_entries(tmp_path):
    lib = library(tmp_path)
    before, unreadable = integrity.snapshot([lib], hash_files=True)
    assert not unreadable and str(lib / ".DS_Store") in before
    assert not any(".Spotlight-V100" in p for p in before)
    assert not integrity.compare(before, integrity.snapshot([lib], hash_files=True)[0])

    raw = lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW"
    st = raw.stat()
    with open(raw, "r+b") as fh:                # an in-place metadata edit: same size, same mtime
        fh.write(b"EXIF")
    os.utime(raw, ns=(st.st_atime_ns, st.st_mtime_ns))
    (lib / "._2026-10-10_173952_Harbor_Party_A7RV_DSC08969.JPG").write_bytes(b"")
    (lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW.pp3").write_text("[Version]\n")
    (lib / "Insta360" / "_index.csv").unlink()
    (lib / "Spotlight-V100-lookalike").mkdir()

    diff = integrity.compare(before, integrity.snapshot([lib], hash_files=True)[0])
    assert diff.added == sorted([str(lib / "._2026-10-10_173952_Harbor_Party_A7RV_DSC08969.JPG"),
                                 str(lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW.pp3"),
                                 str(lib / "Spotlight-V100-lookalike")])
    assert diff.removed == [str(lib / "Insta360" / "_index.csv")]
    assert diff.changed == [f"{raw}: content"]
    # size and mtime alone cannot see that edit; the content samples can
    stat_only = integrity.compare(integrity.snapshot([lib])[0], integrity.snapshot([lib])[0])
    assert not stat_only


def test_verify_library_command(tmp_path, capsys):
    lib = library(tmp_path)
    settings = tmp_path / "config.toml"
    settings.write_text(f'library_roots = ["{lib}"]\noutput_dir = "{tmp_path / "out"}"\nbackend = "api"\n')
    args = ["verify-library", "--config", str(settings)]
    assert cli.main(args) == 2                                  # nothing recorded yet
    assert cli.main(args + ["--record", "--hash"]) == 0
    assert (tmp_path / "out" / "state" / "library-manifest.json").exists()
    assert cli.main(args) == 0
    assert "library unchanged" in capsys.readouterr().out
    (lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.JPG_original").write_bytes(b"backup")
    assert cli.main(args) == 1
    assert "_original" in capsys.readouterr().out
