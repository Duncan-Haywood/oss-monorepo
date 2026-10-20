"""File a flat library into one folder per event, with the camera's files sorted by type.

    <root>/2026-10-03_Great-Sand-Dunes/RAW/    .ARW / .DNG, each with its .xmp beside it
    <root>/2026-10-03_Great-Sand-Dunes/JPG/    the camera JPGs (and the .xmp of a JPG-only shot)
    <root>/2026-10-03_Great-Sand-Dunes/VIDEO/  clips and their .LRF/.LRV proxies

The event folder is the shot's `event_key` (day, place, event; shots before 5 am belong to the
evening before), the same name its photos, reels and carousels are filed under in the output.
The XMP stays next to its RAW because Lightroom, Capture One and Bridge only read a sidecar
there.

Only files at the top of a library root that follow the naming scheme are moved; subfolders
(Insta360 folders with an _index.csv, anything else) are left as they are. Moves are renames on
the same drive, never copies or deletes, and an existing file is never overwritten. Every move is
appended to <root>/_organize/<timestamp>.jsonl (flushed to disk) before it happens, so a drive
that drops off mid-run leaves a manifest that `undo` reverses and a re-run finishes.

The catalog keys a shot by "<root folder name>/<file stem>", which does not change, so every
score, edit and plan stays attached; the next scan only refreshes the paths.
"""
from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import datetime
from pathlib import Path

from .catalog import RAW_EXT, TYPE_DIRS, scan_flat

log = logging.getLogger(__name__)

VIDEO_LIKE = {".mp4", ".mov", ".insv", ".lrf", ".lrv", ".thm"}
JPG_LIKE = {".jpg", ".jpeg", ".heic", ".insp"}
MANIFESTS = "_organize"


def type_dir(path: Path, has_raw: bool) -> str:
    ext = path.suffix.lower()
    if ext in RAW_EXT:
        return "RAW"
    if ext == ".xmp":
        return "RAW" if has_raw else "JPG"
    if ext in JPG_LIKE:
        return "JPG"
    if ext in VIDEO_LIKE:
        return "VIDEO"
    return ""                           # anything else: the event folder itself


def plan(root: Path) -> list[tuple[Path, Path]]:
    """(source, destination) for every loose shot file at the top of `root`."""
    moves = []
    for a in scan_flat(root):
        event = a.event_key or "undated"
        for f in sorted({Path(f) for f in a.files}):     # the shot's files include its .xmp
            if f.parent != root:
                continue
            moves.append((f, root / event / type_dir(f, a.raw is not None) / f.name))
    return moves


def summary(moves: list[tuple[Path, Path]], root: Path) -> str:
    by = Counter((d.relative_to(root).parts[0], d.parent.name if d.parent.name in TYPE_DIRS else "")
                 for _, d in moves)
    events = sorted({e for e, _ in by})
    lines = [f"{root}: {len(moves)} files into {len(events)} event folders"]
    for e in events:
        parts = ", ".join(f"{by[(e, t)]} {t or 'other'}" for t in (*TYPE_DIRS, "") if by[(e, t)])
        lines.append(f"  {e}/  {parts}")
    return "\n".join(lines)


def apply(root: Path, moves: list[tuple[Path, Path]]) -> dict:
    """Do the moves, logging each before it happens. Returns counts."""
    if not moves:
        return {"moved": 0, "skipped": 0}
    mdir = root / MANIFESTS
    mdir.mkdir(exist_ok=True)
    manifest = mdir / f"{datetime.now():%Y%m%d-%H%M%S}.jsonl"
    moved = skipped = 0
    with manifest.open("a") as log_fh:
        for src, dst in moves:
            if dst.exists() or not src.exists():
                skipped += 1
                continue
            if src.stat().st_dev != src.parent.stat().st_dev:
                raise OSError(f"{src} is not on the root's drive")
            dst.parent.mkdir(parents=True, exist_ok=True)
            log_fh.write(json.dumps({"src": str(src), "dst": str(dst)}) + "\n")
            log_fh.flush()
            os.fsync(log_fh.fileno())
            os.rename(src, dst)          # same drive: atomic, no copy
            moved += 1
    log.info("organize: %d moved, %d skipped; manifest %s", moved, skipped, manifest)
    return {"moved": moved, "skipped": skipped, "manifest": str(manifest)}


def undo(manifest: Path) -> dict:
    """Move every file in a manifest back where it was (newest first)."""
    rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    back = skipped = 0
    for r in reversed(rows):
        src, dst = Path(r["src"]), Path(r["dst"])
        if dst.exists() and not src.exists():
            os.rename(dst, src)
            back += 1
        else:
            skipped += 1
    for r in rows:                       # drop type and event folders the undo emptied
        for d in (Path(r["dst"]).parent, Path(r["dst"]).parent.parent):
            try:
                d.rmdir()
            except OSError:
                pass
    return {"restored": back, "skipped": skipped}
