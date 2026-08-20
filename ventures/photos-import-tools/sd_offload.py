#!/usr/bin/env python3
"""Resumable SD card offload with rsync, verification manifest, and iCloud eviction."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


MEDIA_EXTENSIONS = {
    ".3gp", ".arw", ".avi", ".braw", ".cr2", ".cr3", ".dng", ".heic",
    ".insp", ".insv", ".jpeg", ".jpg", ".lrv", ".m4v", ".mov", ".mp4",
    ".mts", ".nef", ".orf", ".raf", ".rw2", ".tif", ".tiff", ".wav", ".xavc",
}

EXCLUDE_DIRS = {".fseventsd", ".Spotlight-V100", "System Volume Information", ".Trashes"}

# rsync stashes partially-transferred files here (relative to each file's
# destination directory) instead of leaving them at the final path. Kept off
# the final path so that --ignore-existing on a later run cannot mistake a
# half-written file for a completed one and skip it forever.
PARTIAL_DIR = ".rsync-partial"


@dataclass
class CardSpec:
    name: str
    source: Path
    dest: Path
    include_paths: tuple[str, ...]


@dataclass
class OffloadStats:
    card: str
    source_files: int = 0
    source_bytes: int = 0
    copied_files: int = 0
    skipped_files: int = 0
    verified_files: int = 0
    errors: list[str] = field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(msg: str, log_path: Path) -> None:
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def evict(path: Path) -> bool:
    try:
        result = subprocess.run(
            ["/usr/bin/brctl", "evict", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0
    except OSError:
        return False


def wait_for_disk_space(min_gb: float = 5.0) -> None:
    while True:
        stat = os.statvfs("/")
        avail_gb = (stat.f_bavail * stat.f_frsize) / (1024**3)
        if avail_gb >= min_gb:
            return
        time.sleep(20)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_media_files(root: Path) -> list[Path]:
    files: list[Path] = []
    if not root.exists():
        return files
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDE_DIRS or part == PARTIAL_DIR for part in path.parts):
            continue
        if path.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        files.append(path)
    return sorted(files)


def evict_tree(root: Path) -> int:
    count = 0
    if not root.exists():
        return count
    for path in root.rglob("*"):
        if path.is_file() and evict(path):
            count += 1
    return count


def background_evictor(root: Path, stop: threading.Event, log_path: Path) -> None:
    while not stop.wait(20):
        freed = evict_tree(root)
        if freed:
            log(f"Background evicted {freed} files from {root}", log_path)


def build_rsync_cmd(source: Path, dest: Path) -> list[str]:
    # --partial-dir (not bare --partial): an interrupted transfer keeps its
    # partial in PARTIAL_DIR, away from the final name, so --ignore-existing on
    # the next run does not see the final path yet and rsync resumes the file to
    # completion. Bare --partial leaves the partial at the final path, which
    # --ignore-existing then skips permanently -- a truncated file the tool can
    # detect at verify but never recover, violating the interrupted-import
    # kill criterion. PARTIAL_DIR is also excluded so it is never mirrored back.
    excludes = [*sorted(EXCLUDE_DIRS), PARTIAL_DIR]
    return [
        "rsync",
        "-avh",
        f"--partial-dir={PARTIAL_DIR}",
        "--ignore-existing",
        "--modify-window=2",
        *(f"--exclude={name}" for name in excludes),
        f"{source}/",
        f"{dest}/",
    ]


def rsync_copy(source: Path, dest: Path, log_path: Path) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    stop = threading.Event()
    evictor = threading.Thread(target=background_evictor, args=(dest, stop, log_path), daemon=True)
    evictor.start()
    cmd = build_rsync_cmd(source, dest)
    log(f"rsync: {' '.join(cmd)}", log_path)
    proc = subprocess.run(cmd, check=False)
    stop.set()
    evictor.join(timeout=5)
    if proc.returncode != 0:
        raise RuntimeError(f"rsync failed with exit code {proc.returncode}")
    return proc.returncode


def verify_and_manifest(
    card: CardSpec,
    stats: OffloadStats,
    manifest_path: Path,
    log_path: Path,
    verify_hash: bool = False,
) -> None:
    manifest_entries: list[dict[str, object]] = []
    verified = 0

    for include in card.include_paths:
        source_root = card.source / include
        for source_file in iter_media_files(source_root):
            rel = source_file.relative_to(card.source)
            dest_file = card.dest / rel
            entry: dict[str, object] = {
                "relative_path": rel.as_posix(),
                "source_bytes": source_file.stat().st_size,
                "status": "missing",
            }
            if not dest_file.exists():
                stats.errors.append(f"Missing after copy: {rel}")
                manifest_entries.append(entry)
                continue
            if dest_file.stat().st_size != source_file.stat().st_size:
                stats.errors.append(f"Size mismatch: {rel}")
                entry["status"] = "size_mismatch"
                manifest_entries.append(entry)
                continue
            entry["dest_bytes"] = dest_file.stat().st_size
            # Size alone cannot catch partial-write or bit-flip corruption that
            # leaves the byte count unchanged; hashing both sides is the only
            # check that backs this venture's "no lost/corrupted media" promise.
            if verify_hash:
                source_hash = sha256_file(source_file)
                dest_hash = sha256_file(dest_file)
                entry["sha256"] = dest_hash
                if source_hash != dest_hash:
                    stats.errors.append(f"Hash mismatch: {rel}")
                    entry["status"] = "hash_mismatch"
                    manifest_entries.append(entry)
                    continue
            entry["status"] = "verified"
            verified += 1
            evict(dest_file)
            manifest_entries.append(entry)

    stats.copied_files = verified
    stats.skipped_files = 0
    stats.verified_files = verified
    payload = {
        "card": card.name,
        "source": str(card.source),
        "destination": str(card.dest),
        "generated_at": iso_now(),
        "stats": asdict(stats),
        "files": manifest_entries,
    }
    manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    log(
        f"Manifest written: {manifest_path} ({verified} verified, {len(stats.errors)} errors)",
        log_path,
    )


def count_source(card: CardSpec) -> tuple[int, int]:
    files: list[Path] = []
    for include in card.include_paths:
        files.extend(iter_media_files(card.source / include))
    total_bytes = sum(path.stat().st_size for path in files)
    return len(files), total_bytes


def offload_card(
    card: CardSpec,
    log_path: Path,
    manifest_path: Path,
    verify_hash: bool = False,
) -> OffloadStats:
    stats = OffloadStats(card=card.name, started_at=iso_now())
    stats.source_files, stats.source_bytes = count_source(card)
    log(
        f"Starting offload: {card.name} ({stats.source_files} files, "
        f"{stats.source_bytes / (1024**3):.2f} GiB) -> {card.dest}",
        log_path,
    )
    wait_for_disk_space(min_gb=8.0)
    for include in card.include_paths:
        source = card.source / include
        if not source.exists():
            log(f"Skipping missing path: {source}", log_path)
            continue
        dest = card.dest / include
        wait_for_disk_space(min_gb=8.0)
        rsync_copy(source, dest, log_path)
        for media in iter_media_files(dest):
            evict(media)
    verify_and_manifest(card, stats, manifest_path, log_path, verify_hash=verify_hash)
    stats.finished_at = iso_now()
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Offload SD cards to staging with verification.")
    parser.add_argument(
        "--staging-root",
        default=str(
            Path.home()
            / "Library/Mobile Documents/com~apple~CloudDocs/media-assets/SD_Import_2026-06-14"
        ),
    )
    parser.add_argument("--card", choices=("insta360", "sony", "all"), default="all")
    parser.add_argument(
        "--verify",
        choices=("size", "hash"),
        default="size",
        help="Post-copy verification: 'size' compares byte counts only; "
        "'hash' also compares source/dest SHA-256 to catch same-size corruption.",
    )
    args = parser.parse_args()
    verify_hash = args.verify == "hash"

    staging = Path(args.staging_root)
    logs = staging / "_logs"
    logs.mkdir(parents=True, exist_ok=True)

    cards: list[CardSpec] = []
    if args.card in ("insta360", "all"):
        cards.append(
            CardSpec(
                name="Insta360_X5",
                source=Path("/Volumes/Insta360 X5"),
                dest=staging / "Insta360_X5",
                include_paths=("DCIM", "MISC"),
            )
        )
    if args.card in ("sony", "all"):
        cards.append(
            CardSpec(
                name="Sony_A7RV",
                source=Path("/Volumes/Untitled 1"),
                dest=staging / "Sony_A7RV",
                include_paths=("DCIM", "PRIVATE"),
            )
        )

    summary: list[dict[str, object]] = []
    for card in cards:
        if not card.source.exists():
            log(f"Card not mounted, skipping: {card.source}", logs / "offload.log")
            continue
        card_log = logs / f"{card.name}.log"
        manifest = staging / f"{card.name}_manifest.json"
        stats = offload_card(card, card_log, manifest, verify_hash=verify_hash)
        summary.append(asdict(stats))

    summary_path = staging / "OFFLOAD_SUMMARY.json"
    summary_path.write_text(
        json.dumps({"generated_at": iso_now(), "cards": summary}, indent=2) + "\n",
        encoding="utf-8",
    )
    log(f"Summary: {summary_path}", logs / "offload.log")
    return 0 if all(not item.get("errors") for item in summary) else 1


if __name__ == "__main__":
    sys.exit(main())
