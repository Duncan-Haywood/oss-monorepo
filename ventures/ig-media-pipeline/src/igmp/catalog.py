"""Turn organised folders into assets.

Two layouts are read:
  flat:     YYYY-MM-DD_HHMMSS_Location[_Event]_Camera_Original.EXT   (time may be missing; day may be "xx")
  Insta360: camera-named files plus an _index.csv giving local date, time, location and event
"""
from __future__ import annotations

import csv
import hashlib
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from .models import Asset

CAMERAS = ("A7RV", "Pocket3", "OsmoAction", "Insta360", "X5", "Ace-Pro-2")
PHOTO_EXT = {".jpg", ".jpeg", ".arw", ".dng", ".insp"}
RAW_EXT = {".arw", ".dng"}
VIDEO_EXT = {".mp4", ".mov", ".insv"}
IGNORED_EXT = {".lrf", ".lrv", ".bin", ".thm", ".csv", ".list"}

DATE = re.compile(r"^\d{4}-\d{2}-(\d{2}|xx)$")
TIME = re.compile(r"^\d{6}$")
CAMERA_NAME = re.compile(r"^(VID|LRV|IMG)_(\d{8})_(\d{6})_(?:(\d{2})_)?(\d{3})")


def asset_id(*parts: str) -> str:
    return hashlib.sha1("/".join(parts).encode()).hexdigest()[:12]


def parse_flat(name: str) -> dict | None:
    """'2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW' -> fields, or None if not our scheme."""
    stem, ext = (name.rsplit(".", 1) + [""])[:2]
    parts = stem.split("_")
    if len(parts) < 3 or not DATE.match(parts[0]):
        return None
    cam_at = next((i for i, p in enumerate(parts) if p in CAMERAS), None)
    if cam_at is None:
        return None
    timed = len(parts) > 1 and TIME.match(parts[1]) is not None
    labels = parts[2 if timed else 1:cam_at]
    taken = None
    if timed and "xx" not in parts[0]:
        taken = datetime.strptime(parts[0] + parts[1], "%Y-%m-%d%H%M%S")
    return {
        "date_label": parts[0],
        "taken_at": taken,
        "location": labels[0] if labels else "",
        "event": "_".join(labels[1:]),
        "camera": parts[cam_at],
        "original": "_".join(parts[cam_at + 1:]),
        "stem": stem,
        "ext": "." + ext.lower(),
    }


def _kind(exts: set[str], camera: str) -> str | None:
    if exts & VIDEO_EXT:
        return "video360" if ".insv" in exts else "video"
    if exts & PHOTO_EXT:
        return "photo360" if ".insp" in exts else "photo"
    return None


def _assemble(group_key: str, paths: list[Path], meta: dict) -> Asset | None:
    by_ext = {p.suffix.lower(): p for p in paths if p.suffix.lower() not in IGNORED_EXT}
    kind = _kind(set(by_ext), meta.get("camera", ""))
    if kind is None:
        return None
    if kind.startswith("video"):
        preview = next(str(by_ext[e]) for e in (".insv", ".mp4", ".mov") if e in by_ext)
        raw = None
    else:
        preview = next((str(by_ext[e]) for e in (".jpg", ".jpeg", ".insp") if e in by_ext), None)
        raw = next((str(by_ext[e]) for e in (".arw", ".dng") if e in by_ext), None)
        preview = preview or raw
    return Asset(id=asset_id(group_key), kind=kind, files=sorted(str(p) for p in paths),
                 preview=preview, raw=raw, **{k: meta[k] for k in
                 ("taken_at", "date_label", "location", "event", "camera", "clock_time") if k in meta})


TYPE_DIRS = ("RAW", "JPG", "VIDEO")     # an event folder's camera files, sorted by type (organize.py)


def _flat_assets(files, prefix: str) -> list[Asset]:
    groups: dict[str, list[Path]] = defaultdict(list)
    meta: dict[str, dict] = {}
    for p in files:
        if p.is_file() and not p.name.startswith((".", "_")):
            fields = parse_flat(p.name)
            if fields:
                groups[fields["stem"]].append(p)
                meta[fields["stem"]] = fields
    out = [_assemble(f"{prefix}/{k}", v, meta[k]) for k, v in sorted(groups.items())]
    return [a for a in out if a]


def scan_flat(folder: Path) -> list[Asset]:
    return _flat_assets(folder.iterdir(), folder.name)


def is_event_folder(folder: Path) -> bool:
    return any((folder / t).is_dir() for t in TYPE_DIRS)


def scan_event(folder: Path, prefix: str) -> list[Asset]:
    """An organised event folder: a shot's RAW, JPG and sidecar sit in different type folders.
    Ids use the library root's name, as they did before the files were filed, so every score
    and edit stays attached."""
    files = [p for d in (folder, *(folder / t for t in TYPE_DIRS)) if d.is_dir() for p in d.iterdir()]
    return _flat_assets(files, prefix)


def scan_insta360(folder: Path) -> list[Asset]:
    index_path = folder / "_index.csv"
    rows = {}
    if index_path.exists():
        with index_path.open() as fh:
            rows = {r["file"]: r for r in csv.DictReader(fh)}
    groups: dict[str, list[Path]] = defaultdict(list)
    for p in folder.iterdir():
        m = CAMERA_NAME.match(p.name)
        if p.is_file() and m and not p.name.startswith("."):
            # VID/LRV share a clip; IMG .insp/.dng share a photo
            groups[f"{'IMG' if m.group(1) == 'IMG' else 'VID'}_{m.group(2)}_{m.group(3)}_{m.group(5)}"].append(p)
    assets = []
    for key, paths in sorted(groups.items()):
        row = next((rows[p.name] for p in paths if p.name in rows), {})
        taken = None
        if row.get("local_date") and row.get("local_time"):
            taken = datetime.strptime(f'{row["local_date"]} {row["local_time"]}', "%Y-%m-%d %H:%M:%S")
        camera = row.get("camera") or ("X5" if any("_00_" in p.name or "_01_" in p.name for p in paths) else "Insta360")
        meta = {"taken_at": taken, "date_label": row.get("local_date", ""),
                "location": row.get("location", ""), "event": row.get("event", ""), "camera": camera}
        meta["clock_time"] = datetime.strptime(key.split("_", 1)[1][:15], "%Y%m%d_%H%M%S")
        a = _assemble(f"{folder.parent.name}/{folder.name}/{key}", paths, meta)
        if a:
            assets.append(a)
    return assets


def scan(roots: list[Path]) -> list[Asset]:
    assets: list[Asset] = []
    for root in roots:
        if not root.exists():
            continue
        assets += scan_flat(root)
        for sub in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))):
            if (sub / "_index.csv").exists():
                assets += scan_insta360(sub)
            elif is_event_folder(sub):
                assets += scan_event(sub, root.name)
            else:
                assets += scan_flat(sub)
    return assets
