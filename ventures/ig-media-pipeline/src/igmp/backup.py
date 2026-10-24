"""Checksums and verified backups for the library.

  manifest  hash every file under a root into <root>/_checksums.csv (incremental: files whose size
            and modification time are unchanged keep their hash)
  verify    re-hash everything and report files that changed without a modification time to
            explain it (silent damage), went missing, or are new
  copy      mirror a root to a backup location, hashing each copy and checking it against the
            manifest; nothing at the destination is ever deleted, and a media file that differs at
            the destination is reported, not overwritten (sidecars and indexes are refreshed)
"""
from __future__ import annotations

import csv
import hashlib
import logging
import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

MANIFEST = "_checksums.csv"
CHUNK = 8 << 20
REFRESHABLE = {".xmp", ".csv"}          # files the pipeline rewrites on purpose
SKIP_DIRS = {".Spotlight-V100", ".Trashes", ".fseventsd", ".TemporaryItems", "System Volume Information"}


@dataclass
class Entry:
    rel: str
    size: int
    mtime_ns: int
    blake2b: str


def digest(path: Path) -> str:
    h = hashlib.blake2b(digest_size=20)
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def walk(root: Path):
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(files):
            if name.startswith(".") or name == MANIFEST or name.endswith(".tmp"):
                continue
            yield Path(dirpath) / name


def load(root: Path) -> dict[str, Entry]:
    path = root / MANIFEST
    if not path.exists():
        return {}
    with path.open() as fh:
        return {r["rel"]: Entry(r["rel"], int(r["size"]), int(r["mtime_ns"]), r["blake2b"])
                for r in csv.DictReader(fh)}


def save(root: Path, entries: dict[str, Entry]) -> Path:
    path = root / MANIFEST
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["rel", "size", "mtime_ns", "blake2b"])
        for e in sorted(entries.values(), key=lambda e: e.rel):
            w.writerow([e.rel, e.size, e.mtime_ns, e.blake2b])
    tmp.replace(path)
    return path


def manifest(root: Path, workers: int = 4, save_every: int = 500) -> dict[str, int]:
    """Bring <root>/_checksums.csv up to date. Returns counts of hashed/kept/removed entries."""
    old = load(root)
    entries: dict[str, Entry] = {}
    todo: list[tuple[str, Path, os.stat_result]] = []
    for p in walk(root):
        rel = p.relative_to(root).as_posix()
        st = p.stat()
        prev = old.get(rel)
        if prev and prev.size == st.st_size and prev.mtime_ns == st.st_mtime_ns:
            entries[rel] = prev
        else:
            todo.append((rel, p, st))
    log.info("%s: %d files to hash, %d unchanged", root, len(todo), len(entries))

    def one(item):
        rel, p, st = item
        try:
            return Entry(rel, st.st_size, st.st_mtime_ns, digest(p))
        except OSError as e:
            log.warning("unreadable: %s (%s)", rel, e)
            return None

    hashed = 0
    with ThreadPoolExecutor(workers) as pool:
        for e in pool.map(one, todo):
            if e:
                entries[e.rel] = e
                hashed += 1
                if hashed % save_every == 0:
                    save(root, entries)
                    log.info("%s: hashed %d/%d", root, hashed, len(todo))
    save(root, entries)
    return {"hashed": hashed, "kept": len(entries) - hashed, "removed": len(set(old) - set(entries)),
            "unreadable": len(todo) - hashed}


def verify(root: Path, workers: int = 4) -> dict[str, list[str]]:
    """Re-hash every file against the manifest. 'damaged' means the content changed while size and
    modification time did not, which no normal edit does."""
    known = load(root)
    report: dict[str, list[str]] = {"damaged": [], "changed": [], "missing": [], "new": [], "unreadable": []}
    seen = set()

    def one(p: Path):
        rel = p.relative_to(root).as_posix()
        try:
            return rel, p.stat(), digest(p)
        except OSError:
            return rel, None, None

    with ThreadPoolExecutor(workers) as pool:
        for rel, st, h in pool.map(one, list(walk(root))):
            seen.add(rel)
            e = known.get(rel)
            if st is None:
                report["unreadable"].append(rel)
            elif e is None:
                report["new"].append(rel)
            elif h != e.blake2b:
                same_stamp = e.size == st.st_size and e.mtime_ns == st.st_mtime_ns
                report["damaged" if same_stamp else "changed"].append(rel)
    report["missing"] = sorted(set(known) - seen)
    return report


def copy(root: Path, dest: Path, workers: int = 2) -> dict[str, list[str]]:
    """Mirror root into dest, verified against the manifest. Never deletes at dest."""
    entries = load(root)
    if not entries:
        raise RuntimeError(f"no manifest at {root / MANIFEST}; run `igmp backup manifest` first")
    report: dict[str, list[str]] = {"copied": [], "present": [], "refreshed": [], "conflict": [], "failed": []}

    def one(e: Entry):
        src, dst = root / e.rel, dest / e.rel
        try:
            if dst.exists():
                if dst.stat().st_size == e.size and digest(dst) == e.blake2b:
                    return "present", e.rel
                if Path(e.rel).suffix.lower() not in REFRESHABLE:
                    return "conflict", e.rel          # a media file differs at the backup: look first
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_name(dst.name + ".tmp")
            shutil.copyfile(src, tmp)
            if digest(tmp) != e.blake2b:
                tmp.unlink(missing_ok=True)
                return "failed", e.rel
            shutil.copystat(src, tmp)
            existed = dst.exists()
            tmp.replace(dst)
            return ("refreshed" if existed else "copied"), e.rel
        except OSError as err:
            log.warning("copy failed: %s (%s)", e.rel, err)
            return "failed", e.rel

    with ThreadPoolExecutor(workers) as pool:
        for status, rel in pool.map(one, entries.values()):
            report[status].append(rel)
    return report
