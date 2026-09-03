"""Local, file-based storage for the watchlist and captured snapshots.

Everything lives under one data directory the customer owns and can delete
or export at any time (`ls`/`rm`/`tar` are the export/retention controls —
no separate feature is needed because nothing leaves the filesystem).
"""

from __future__ import annotations

import hashlib
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


def _url_slug(url: str) -> str:
    """A short, deterministic, collision-resistant directory component for a URL.

    Two different watched URLs for the same vendor/page_type (e.g. two
    "terms" pages) must never share a snapshot directory, and a lossy text
    slug of the URL can still collide -- the hash is what actually
    guarantees separation; the readable prefix is only for humans browsing
    the data directory.
    """
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    return f"{_safe_slug(url)[:40]}-{digest}"


def _snapshot_dir(data_dir: Path, vendor: str, page_type: str, page_url: str) -> Path:
    return data_dir / SNAPSHOTS_DIRNAME / _safe_slug(vendor) / _safe_slug(page_type) / _url_slug(page_url)


def _sequence_of(path: Path) -> int:
    match = re.match(r"(\d+)-", path.name)
    return int(match.group(1)) if match else -1


def save_snapshot(data_dir: Path, snapshot: dict[str, Any]) -> Path:
    """Save a snapshot under a monotonically increasing, collision-free filename.

    The sequence number is one past the highest *existing* sequence, not a
    count of files present -- a count silently reuses a number (and
    overwrites a still-present snapshot) after any file is removed, e.g. via
    the documented `rm` retention workflow. The while-loop below is the
    actual uniqueness guarantee for a same-second concurrent write; the
    sequence number alone only guarantees it survives gaps from deletion.
    """
    directory = _snapshot_dir(data_dir, snapshot["vendor"], snapshot["page_type"], snapshot["page_url"])
    directory.mkdir(parents=True, exist_ok=True)
    existing = list(directory.glob("*.json"))
    sequence = max((_sequence_of(p) for p in existing), default=-1) + 1
    timestamp_slug = _safe_slug(snapshot["captured_at"])
    path = directory / f"{sequence:06d}-{timestamp_slug}.json"
    while path.exists():
        sequence += 1
        path = directory / f"{sequence:06d}-{timestamp_slug}.json"
    path.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def list_snapshots(data_dir: Path, vendor: str, page_type: str, page_url: str) -> list[Path]:
    directory = _snapshot_dir(data_dir, vendor, page_type, page_url)
    if not directory.exists():
        return []
    return sorted(directory.glob("*.json"))


def latest_two_snapshots(data_dir: Path, vendor: str, page_type: str, page_url: str) -> tuple[Path, Path] | None:
    paths = list_snapshots(data_dir, vendor, page_type, page_url)
    if len(paths) < 2:
        return None
    return paths[-2], paths[-1]
