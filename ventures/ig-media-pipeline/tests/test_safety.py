"""The library boundary: config overlap, the writers, tool arguments and the audit-hook tripwire."""
from __future__ import annotations

import multiprocessing
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pytest
from PIL import Image

from igmp import safety
from igmp.config import Config, load
from igmp.judge import ClaudeCodeBackend, JudgeTask
from igmp.models import Score


@pytest.fixture
def lib(tmp_path: Path) -> Path:
    root = tmp_path / "Volume" / "Library"
    root.mkdir(parents=True)
    (root / "a.JPG").write_bytes(b"original")
    return root


@pytest.fixture
def cfg(tmp_path: Path, lib: Path) -> Config:
    return Config(library_roots=[lib], output_dir=tmp_path / "out")


# --- config ----------------------------------------------------------------------------------

@pytest.mark.parametrize("out", ["Volume/Library", "Volume/Library/IG", "Volume/Library/../Library/IG",
                                 "Volume/LIBRARY/IG", "Volume", "."])
def test_config_refuses_output_overlapping_the_library(tmp_path, lib, out):
    with pytest.raises(safety.UnsafeConfig):
        safety.check_config(Config(library_roots=[lib], output_dir=tmp_path / out))


def test_config_refuses_output_reached_through_a_symlink(tmp_path, lib):
    (tmp_path / "shortcut").symlink_to(lib)
    with pytest.raises(safety.UnsafeConfig):
        safety.check_config(Config(library_roots=[lib], output_dir=tmp_path / "shortcut" / "IG"))


def test_config_accepts_a_sibling_folder_and_load_checks(tmp_path, lib):
    safety.check_config(Config(library_roots=[lib], output_dir=tmp_path / "Volume" / "IG"))
    bad = tmp_path / "bad.toml"
    bad.write_text(f'library_roots = ["{lib}"]\noutput_dir = "{lib}/IG"\nbackend = "api"\n')
    with pytest.raises(safety.UnsafeConfig, match="inside"):
        load(bad)


# --- writers ---------------------------------------------------------------------------------

def test_writes_land_inside_output_only(cfg, lib, tmp_path, library_tree):
    before = library_tree(lib)
    safety.write_text(cfg, cfg.output_dir / "x.txt", "ok")
    assert (cfg.output_dir / "x.txt").read_text() == "ok"
    for target in (lib / "new.txt", lib / "a.JPG", lib / "a.JPG.pp3", lib / "._a.JPG",
                   cfg.output_dir / ".." / "Volume" / "Library" / "b.txt"):
        with pytest.raises(safety.LibraryWriteError):
            safety.write_text(cfg, target, "no")
    with pytest.raises(safety.UnsafeWrite, match="outside output_dir"):
        safety.write_text(cfg, tmp_path / "elsewhere.txt", "no")
    assert library_tree(lib) == before


def test_a_symlink_from_output_into_the_library_is_refused(cfg, lib, library_tree):
    before = library_tree(lib)
    cfg.output_dir.mkdir()
    (cfg.output_dir / "photos").symlink_to(lib)
    with pytest.raises(safety.LibraryWriteError):
        safety.write_text(cfg, cfg.output_dir / "photos" / "x.jpg", "no")
    with pytest.raises(safety.LibraryWriteError):
        safety.make_dirs(cfg, cfg.output_dir / "photos" / "event")
    assert library_tree(lib) == before


def test_never_replaces_a_file_igmp_did_not_write(cfg):
    cfg.output_dir.mkdir()
    mine, theirs = cfg.output_dir / "mine.txt", cfg.output_dir / "theirs.txt"
    theirs.write_text("the user's")
    safety.write_text(cfg, mine, "v1")
    safety.write_text(cfg, mine, "v2")              # igmp's own file: replaced
    assert mine.read_text() == "v2"
    with pytest.raises(safety.UnsafeWrite, match="did not write"):
        safety.write_text(cfg, theirs, "x")
    assert theirs.read_text() == "the user's"
    mine.write_text("edited by hand")               # changed after igmp wrote it: hands off
    with pytest.raises(safety.UnsafeWrite):
        safety.write_text(cfg, mine, "v3")
    assert mine.read_text() == "edited by hand"


def test_atomic_write_leaves_nothing_on_failure(cfg):
    target = cfg.output_dir / "photos" / "x.jpg"
    with pytest.raises(RuntimeError, match="crash"):
        with safety.atomic(cfg, target) as tmp:
            tmp.write_bytes(b"half a file")
            raise RuntimeError("crash")
    assert not target.exists() and list(target.parent.iterdir()) == []


def test_move_stays_inside_output(cfg, lib, library_tree):
    before = library_tree(lib)
    a = safety.write_text(cfg, cfg.output_dir / "a.txt", "x")
    moved = safety.move(cfg, a, cfg.output_dir / "sub" / "a.txt")
    assert moved.read_text() == "x" and not a.exists()
    with pytest.raises(safety.LibraryWriteError):
        safety.move(cfg, lib / "a.JPG", cfg.output_dir / "taken.JPG")
    with pytest.raises(safety.LibraryWriteError):
        safety.move(cfg, moved, lib / "a.txt")
    assert library_tree(lib) == before


def test_scratch_folders_are_private_and_removed(cfg):
    with safety.scratch(cfg) as work:
        (work / "seg.mp4").write_bytes(b"x")
        assert work.parent == safety.resolve(cfg.state_dir / "tmp")
    assert not work.exists()


def test_component_keeps_a_name_inside_its_folder():
    for bad in ("../../etc", "..", "a/b", ".hidden", "x:y", "\x00"):
        name = safety.component(bad)
        assert "/" not in name and not name.startswith(".") and name not in ("", "..")
    assert safety.component("2026-10-04..10-07_Valley_Drive") == "2026-10-04..10-07_Valley_Drive"


# --- external tools --------------------------------------------------------------------------

def test_tools_get_library_paths_only_as_inputs(cfg, lib, tmp_path):
    b = safety.boundary(cfg)
    src = str(lib / "a.JPG")
    work = tmp_path / "out" / "photos" / ".rt-work"
    work.mkdir(parents=True)
    link = work / "a.JPG"
    link.symlink_to(lib / "a.JPG")                                 # rawedit's private link
    allowed = [["ffmpeg", "-ss", "1", "-i", src, "-f", "rawvideo", "-"],
               ["/opt/homebrew/bin/ffprobe", "-v", "error", src],
               ["exiftool", "-j", "-n", "-q", "-r", "-api", "LargeFileSupport=1", "-EXIF:DateTimeOriginal", str(lib)],
               ["rawtherapee-cli", "-o", str(work / "out.jpg"), "-q", "-Y", "-p", "x.pp3", "-c", str(link)]]
    for cmd in allowed:
        safety.check_tool_args(cmd, b)
    safety.check_tool_args(["ffmpeg", "-y", "-i", src, str(work / "o.mp4")], b, strict=False)
    refused = [["ffmpeg", "-i", "x.mp4", src],                      # a library file as ffmpeg's output
               ["ffmpeg", "-i", src, "-y", "/tmp/out.mp4"],         # -y overwrites without asking (strict)
               ["ffprobe", "-o", src, "/tmp/x.mp4"],
               ["exiftool", "-Artist=x", src],                      # edits in place, leaves a_original
               ["exiftool", "-overwrite_original", "-XMP-dc:Title=x", src],
               ["exiftool", "-tagsfromfile", src, "-xmp:all", "/tmp/out.jpg"],
               ["exiftool", "-w", "txt", src],                      # writes a.txt beside the original
               ["rawtherapee-cli", "-o", "/tmp/x.jpg", "-c", src],  # the original itself
               ["rawtherapee-cli", "-O", "/tmp/x.jpg", "-c", str(link)],   # -O: params beside the output
               ["rawtherapee-cli", "-s", "-o", "/tmp/x.jpg", "-c", str(link)],
               ["sh", "-c", f"touch {src}.pp3"],
               ["claude", "-p", "x", "--add-dir", str(lib)]]
    for cmd in refused:
        with pytest.raises(safety.UnsafeWrite):
            safety.check_tool_args(cmd, b)


def test_tools_never_run_inside_the_library_or_with_ffreport(cfg, lib, monkeypatch):
    monkeypatch.setenv("FFREPORT", "file=report.log")
    monkeypatch.chdir(lib)                             # igmp started from inside the library
    res = safety.run([sys.executable, "-c", "import os; print(os.getcwd()); print(os.environ.get('FFREPORT'))"],
                     cfg, capture_output=True, text=True)
    cwd, report = res.stdout.split()
    assert lib.resolve() not in Path(cwd).resolve().parents and Path(cwd).resolve() != lib.resolve()
    assert report == "None"
    with pytest.raises(safety.LibraryWriteError):
        safety.run(["true"], cfg, cwd=lib)
    with pytest.raises(safety.LibraryWriteError):
        safety.run(["ffmpeg", "-i", "/tmp/x.mp4", str(lib / "out.mp4")], cfg, writes=[lib / "out.mp4"])


def test_tripwire_stops_claude_being_pointed_at_the_library(cfg, lib):
    task = JudgeTask(key="k", instructions="score it", output=Score, images=[lib / "a.JPG"])
    with safety.guard(cfg) as g:
        with pytest.raises(safety.LibraryWriteError):
            ClaudeCodeBackend(cfg).judge(task)             # --add-dir <library>: refused before launch
    assert len(g.violations) == 1


def test_staged_copy_is_private_and_removed(cfg, lib, library_tree):
    before = library_tree(lib)
    with safety.guard(cfg):
        with safety.staged_copy(cfg, lib / "a.JPG") as copy:
            assert copy.read_bytes() == b"original" and not safety.in_library(cfg, copy)
            (copy.parent / "a.JPG.pp3").write_text("a sidecar lands beside the copy")
    assert not copy.parent.exists() and library_tree(lib) == before


# --- tripwire --------------------------------------------------------------------------------

def test_tripwire_blocks_every_kind_of_library_write(cfg, lib, tmp_path, library_tree):
    target = lib / "a.JPG"
    elsewhere = tmp_path / "elsewhere.txt"
    elsewhere.write_text("x")
    attempts = {
        "open w": lambda: open(target, "w"),
        "open r+": lambda: open(target, "r+b"),
        "append": lambda: open(target, "a"),
        "os.open": lambda: os.open(lib / "b", os.O_WRONLY | os.O_CREAT),
        "AppleDouble file": lambda: (lib / "._a.JPG").write_bytes(b""),
        "rename": lambda: os.rename(target, lib / "b.JPG"),
        "replace onto": lambda: os.replace(elsewhere, target),
        "delete": lambda: target.unlink(),
        "mkdir": lambda: (lib / "sub").mkdir(),
        "utime": lambda: os.utime(target),
        "chmod": lambda: os.chmod(target, 0o600),
        "truncate": lambda: os.truncate(target, 0),
        "symlink": lambda: os.symlink(elsewhere, lib / "link"),
        "rmtree": lambda: shutil.rmtree(lib),
        "copy onto": lambda: shutil.copyfile(elsewhere, lib / "a.JPG.pp3"),
        "move": lambda: shutil.move(str(target), str(tmp_path / "gone.JPG")),
        "sqlite": lambda: sqlite3.connect(lib / "x.db"),
        "mkstemp": lambda: tempfile.mkstemp(dir=lib),
        "PIL save": lambda: Image.new("RGB", (2, 2)).save(lib / "x.jpg"),
        "subprocess": lambda: subprocess.run(["touch", str(lib / "x.pp3")]),
        "exiftool write": lambda: subprocess.run(["exiftool", "-overwrite_original", "-Artist=x", str(target)]),
        "os.system": lambda: os.system(f"touch {lib}/y.pp3"),
    }
    if hasattr(os, "setxattr"):
        attempts["xattr"] = lambda: os.setxattr(target, "user.igmp", b"1")
    if safety._fd_path(0) is not None or sys.platform.startswith("linux"):
        fd = os.open(target, os.O_RDONLY)             # read-only, then try to change it through the fd
        attempts["utime via fd"] = lambda: os.utime(fd)
        attempts["chmod via fd"] = lambda: os.chmod(fd, 0o600)
    before = library_tree(lib)
    with safety.guard(cfg) as g:
        for name, attempt in attempts.items():
            with pytest.raises(safety.LibraryWriteError):
                attempt()
        with open(target, "rb") as fh:           # reading is fine
            assert fh.read() == b"original"
        safety._deny_command(["ffprobe", "-v", "error", str(target)])           # and so is probing it
        sqlite3.connect(f"{(lib / 'a.JPG').as_uri()}?mode=ro", uri=True).close()   # read-only sqlite too
        cfg.output_dir.mkdir()
        (cfg.output_dir / "ok.txt").write_text("fine")         # and writing outside the library
    assert len(g.violations) == len(attempts)
    assert library_tree(lib) == before
    (lib / "after.txt").write_text("x")          # with the guard down, nothing is blocked any more


def _write_in_worker(path: str) -> str:
    try:
        Path(path).write_text("x")
    except safety.LibraryWriteError:
        return "blocked"
    return "written"


def test_worker_processes_get_the_tripwire(cfg, lib):
    ctx = multiprocessing.get_context("spawn")         # what macOS uses
    with ProcessPoolExecutor(1, mp_context=ctx, initializer=safety.guard_worker, initargs=(cfg,)) as pool:
        assert pool.submit(_write_in_worker, str(lib / "x.txt")).result() == "blocked"
        assert pool.submit(_write_in_worker, str(cfg.output_dir.parent / "fine.txt")).result() == "written"
    assert not (lib / "x.txt").exists()


def test_dry_run_guard_blocks_output_writes_too(cfg, lib):
    with safety.guard(cfg, dry_run=True) as g:
        with pytest.raises(safety.UnsafeWrite, match="dry run"):
            cfg.output_dir.mkdir(parents=True)
        with pytest.raises(safety.LibraryWriteError):
            (lib / "x").write_text("x")
    assert len(g.violations) == 2 and not cfg.output_dir.exists()
