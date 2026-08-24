"""Local, file-based storage for the watchlist and captured snapshots.

Everything lives under one data directory the customer owns and can delete
or export at any time (`ls`/`rm`/`tar` are the export/retention controls —
no separate feature is needed because nothing leaves the filesystem).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

WATCHLIST_FILENAME = "watchlist.json"
SNAPSHOTS_DIRNAME = "snapshots"


def default_data_dir() -> Path:
    return Path.home() / ".vendor-watch"


def _safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_") or "unnamed"


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


def _snapshot_dir(data_dir: Path, vendor: str, page_type: str) -> Path:
    return data_dir / SNAPSHOTS_DIRNAME / _safe_slug(vendor) / _safe_slug(page_type)


def save_snapshot(data_dir: Path, snapshot: dict[str, Any]) -> Path:
    """Save a snapshot under a monotonically increasing, collision-free filename.

    Filenames sort in capture order by sequence number, not by timestamp text --
    two checks fetched within the same second-resolution timestamp must not
    overwrite each other, so the sequence prefix is what actually guarantees
    uniqueness and ordering; the timestamp suffix is only for readability.
    """
    directory = _snapshot_dir(data_dir, snapshot["vendor"], snapshot["page_type"])
    directory.mkdir(parents=True, exist_ok=True)
    sequence = len(list(directory.glob("*.json")))
    timestamp_slug = _safe_slug(snapshot["captured_at"])
    path = directory / f"{sequence:06d}-{timestamp_slug}.json"
    path.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def list_snapshots(data_dir: Path, vendor: str, page_type: str) -> list[Path]:
    directory = _snapshot_dir(data_dir, vendor, page_type)
    if not directory.exists():
        return []
    return sorted(directory.glob("*.json"))


def latest_two_snapshots(data_dir: Path, vendor: str, page_type: str) -> tuple[Path, Path] | None:
    paths = list_snapshots(data_dir, vendor, page_type)
    if len(paths) < 2:
        return None
    return paths[-2], paths[-1]
