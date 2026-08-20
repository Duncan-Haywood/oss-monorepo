#!/usr/bin/env python3
"""Resumable SD card offload with rsync, verification manifest, and iCloud eviction."""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from atomic_io import write_json_atomic


MEDIA_EXTENSIONS = {
    ".3gp", ".arw", ".avi", ".braw", ".cr2", ".cr3", ".dng", ".heic",
    ".insp", ".insv", ".jpeg", ".jpg", ".lrv", ".m4v", ".mov", ".mp4",
    ".mts", ".nef", ".orf", ".raf", ".rw2", ".tif", ".tiff", ".wav", ".xavc",
}

EXCLUDE_DIRS = {".fseventsd", ".Spotlight-V100", "System Volume Information", ".Trashes"}


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
        if any(part in EXCLUDE_DIRS for part in path.parts):
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
    # --partial keeps a half-copied file so an interrupted offload can resume,
    # but that file must then be re-checked on the next run. --ignore-existing
    # would skip it purely because it exists, freezing it at its truncated size
    # forever -- an unrecoverable interrupted import, exactly kill_criteria #1.
    # rsync's default size+mtime quick-check already skips fully-copied files
    # (the idempotency we want) while re-transferring a partial, so the correct
    # resumable copy is --partial WITHOUT --ignore-existing.
    return [
        "rsync",
        "-avh",
        "--partial",
        "--modify-window=2",
        "--exclude=.fseventsd",
        "--exclude=.Spotlight-V100",
        "--exclude=System Volume Information",
        "--exclude=.Trashes",
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
                "status": "missing",
            }
            try:
                # Reading the source's own size must stay inside this
                # try/except too: a flaky card reader or a card ejected
                # mid-verification can make this stat() fail exactly like the
                # dest-side reads below, and it ran unguarded before this fix
                # -- crashing the whole card's verification loop and losing
                # every already-verified entry in the same run.
                source_bytes = source_file.stat().st_size
                entry["source_bytes"] = source_bytes
                if not dest_file.exists():
                    stats.errors.append(f"Missing after copy: {rel}")
                    manifest_entries.append(entry)
                    continue
                dest_bytes = dest_file.stat().st_size
                if dest_bytes != source_bytes:
                    stats.errors.append(f"Size mismatch: {rel}")
                    entry["status"] = "size_mismatch"
                    manifest_entries.append(entry)
                    continue
                entry["dest_bytes"] = dest_bytes
                # Size alone cannot catch partial-write or bit-flip corruption
                # that leaves the byte count unchanged; hashing both sides is
                # the only check that backs this venture's "no lost/corrupted
                # media" promise.
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
            except OSError as error:
                # A verified-but-evicted dest file becomes an iCloud-only
                # placeholder; re-reading it (e.g. hashing on a later re-run)
                # can fail if the download stalls or the volume is offline.
                # One unreadable file must not crash the whole verification
                # loop -- that would lose the manifest for every file already
                # confirmed good in this same run, exactly the kind of silent
                # loss kill_criteria #2 rules out.
                stats.errors.append(f"Read error: {rel} ({error})")
                entry["status"] = "read_error"
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
    write_json_atomic(manifest_path, payload)
    log(
        f"Manifest written: {manifest_path} ({verified} verified, {len(stats.errors)} errors)",
        log_path,
    )


def offload_exit_code(summary: list[dict[str, object]]) -> int:
    # An empty summary means no card was mounted, so nothing was offloaded.
    # Reporting success there is the dangerous case: a wrapper that ejects or
    # reformats the card on exit 0 would destroy the originals believing they
    # were safely copied. Distinguish "nothing offloaded" (2) from "offloaded
    # with errors" (1) and "offloaded clean" (0).
    if not summary:
        return 2
    if any(item.get("errors") for item in summary):
        return 1
    return 0


def count_source(card: CardSpec) -> tuple[int, int]:
    # This is the pre-copy size estimate logged before rsync_copy runs, not
    # the post-copy verification pass -- a bare stat() here ran unguarded
    # before this fix, so a file that disappears or goes unreadable between
    # the rglob() scan and this call (flaky card reader, card ejected early)
    # crashed offload_card with an unhandled OSError before a single file was
    # copied, aborting the whole card's offload rather than just losing one
    # manifest entry the way the already-guarded verification loop does.
    files: list[Path] = []
    for include in card.include_paths:
        files.extend(iter_media_files(card.source / include))
    total_files = 0
    total_bytes = 0
    for path in files:
        try:
            total_bytes += path.stat().st_size
        except OSError:
            continue
        total_files += 1
    return total_files, total_bytes


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
    write_json_atomic(summary_path, {"generated_at": iso_now(), "cards": summary})
    log(f"Summary: {summary_path}", logs / "offload.log")
    if not summary:
        log("No card was mounted; nothing offloaded.", logs / "offload.log")
    return offload_exit_code(summary)


if __name__ == "__main__":
    sys.exit(main())
