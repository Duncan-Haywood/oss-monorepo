"""Local, file-based storage for the watchlist and captured snapshots.

Everything lives under one data directory the customer owns and can delete
or export at any time (`ls`/`rm`/`tar` are the export/retention controls —
no separate feature is needed because nothing leaves the filesystem).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

WATCHLIST_FILENAME = "watchlist.json"
SNAPSHOTS_DIRNAME = "snapshots"


def default_data_dir() -> Path:
    return Path.home() / ".vendor-watch"


def _safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_") or "unnamed"


def _identity_slug(value: str) -> str:
    """Filesystem-safe slug that stays unique when characters are stripped."""
    stripped = value.strip()
    slug = _safe_slug(stripped)
    if slug == stripped:
        return slug
    digest = hashlib.sha256(stripped.encode("utf-8")).hexdigest()[:8]
    return f"{slug}_{digest}"


def watchlist_path(data_dir: Path) -> Path:
    return data_dir / WATCHLIST_FILENAME


def load_watchlist(data_dir: Path) -> list[dict[str, str]]:
    path = watchlist_path(data_dir)
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save_watchlist(data_dir: Path, entries: list[dict[str, str]]) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    watchlist_path(data_dir).write_text(json.dumps(entries, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def add_watch(data_dir: Path, vendor: str, url: str, page_type: str, label: str | None = None) -> dict[str, str]:
    entries = load_watchlist(data_dir)
    entry = {"vendor": vendor, "url": url, "page_type": page_type, "label": label or ""}
    for existing in entries:
        if existing["vendor"] == vendor and existing["url"] == url and existing["page_type"] == page_type:
            return existing
    entries.append(entry)
    save_watchlist(data_dir, entries)
    return entry


def remove_watch(data_dir: Path, vendor: str, url: str, page_type: str) -> bool:
    entries = load_watchlist(data_dir)
    kept = [e for e in entries if not (e["vendor"] == vendor and e["url"] == url and e["page_type"] == page_type)]
    if len(kept) == len(entries):
        return False
    save_watchlist(data_dir, kept)
    return True


def _snapshot_dir(data_dir: Path, vendor: str, page_type: str, url: str) -> Path:
    return data_dir / SNAPSHOTS_DIRNAME / _identity_slug(vendor) / _identity_slug(page_type) / _identity_slug(url)


def _next_sequence(directory: Path) -> int:
    highest = -1
    for path in directory.glob("*.json"):
        prefix = path.name.split("-", 1)[0]
        if prefix.isdigit():
            highest = max(highest, int(prefix))
    return highest + 1


def save_snapshot(data_dir: Path, snapshot: dict[str, Any]) -> Path:
    """Save a snapshot under a monotonically increasing, collision-free filename.

    Filenames sort in capture order by sequence number, not by timestamp text --
    two checks fetched within the same second-resolution timestamp must not
    overwrite each other, so the sequence prefix is what actually guarantees
    uniqueness and ordering; the timestamp suffix is only for readability.
    Sequence is the max existing prefix plus one (not the file count), so
    deleting an older snapshot for retention cannot reuse a remaining name.
    Exclusive create rejects a concurrent check that picks the same sequence.
    """
    directory = _snapshot_dir(data_dir, snapshot["vendor"], snapshot["page_type"], snapshot["page_url"])
    directory.mkdir(parents=True, exist_ok=True)
    timestamp_slug = _safe_slug(snapshot["captured_at"])
    payload = json.dumps(snapshot, indent=2, sort_keys=True) + "\n"
    sequence = _next_sequence(directory)
    while True:
        path = directory / f"{sequence:06d}-{timestamp_slug}.json"
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        except FileExistsError:
            sequence += 1
            continue
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
        return path


def list_snapshots(data_dir: Path, vendor: str, page_type: str, url: str) -> list[Path]:
    directory = _snapshot_dir(data_dir, vendor, page_type, url)
    if not directory.exists():
        return []
    return sorted(directory.glob("*.json"))


def latest_two_snapshots(data_dir: Path, vendor: str, page_type: str, url: str) -> tuple[Path, Path] | None:
    paths = list_snapshots(data_dir, vendor, page_type, url)
    if len(paths) < 2:
        return None
    return paths[-2], paths[-1]
