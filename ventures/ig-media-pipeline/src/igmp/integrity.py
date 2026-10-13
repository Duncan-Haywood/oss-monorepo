"""Proof that a run left the library as it found it.

A manifest lists every file, folder and link under each library root, hidden ones included, so
a stray ._* AppleDouble file, .DS_Store, .pp3 sidecar or *_original backup shows up as "added".
Each file is listed with its size and modification time, and optionally a fast content hash:
BLAKE2b of the size and three 64 KiB samples (start, middle, end). An in-place metadata edit
(exiftool, or a converter writing XMP into the file) lands in the first samples. A full hash of
a multi-hundred-GB library would take hours.

`igmp run` (and every stage) takes a size-and-mtime snapshot before and after and fails loudly
if they differ. `igmp verify-library --record` saves one to compare against later.

Folders macOS maintains on its own at a volume root (.Spotlight-V100, .fseventsd, .Trashes...)
are skipped. Only reading happens here: os.scandir, lstat, and files opened "rb" to hash them.
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from . import safety
from .config import Config

SAMPLE = 64 * 1024
SKIP = {".Spotlight-V100", ".fseventsd", ".Trashes", ".TemporaryItems", ".DocumentRevisions-V100",
        ".PKInstallSandboxManager", ".PKInstallSandboxManager-SystemSoftware",
        "System Volume Information", "$RECYCLE.BIN"}

Entry = dict          # {"type": "file"|"dir"|"link", "size", "mtime_ns", "hash"?, "target"?}


def fast_hash(path: str, size: int) -> str:
    h = hashlib.blake2b(str(size).encode(), digest_size=16)
    with open(path, "rb") as fh:
        for offset in sorted({0, max(0, size // 2 - SAMPLE // 2), max(0, size - SAMPLE)}):
            fh.seek(offset)
            h.update(fh.read(SAMPLE))
    return h.hexdigest()


def snapshot(roots: list[Path], hash_files: bool = False) -> tuple[dict[str, Entry], list[str]]:
    """(entries keyed by absolute path, folders that could not be read)."""
    entries: dict[str, Entry] = {}
    unreadable: list[str] = []
    stack = [str(Path(r)) for r in roots if Path(r).is_dir()]
    while stack:
        folder = stack.pop()
        try:
            with os.scandir(folder) as it:
                items = list(it)
        except OSError as e:
            unreadable.append(f"{folder}: {e.strerror or e}")
            continue
        for item in items:
            if item.name in SKIP:
                continue
            try:
                st = item.stat(follow_symlinks=False)
            except OSError as e:
                unreadable.append(f"{item.path}: {e.strerror or e}")
                continue
            if stat.S_ISLNK(st.st_mode):
                entries[item.path] = {"type": "link", "target": os.readlink(item.path)}
            elif stat.S_ISDIR(st.st_mode):
                entries[item.path] = {"type": "dir"}
                stack.append(item.path)
            else:
                e: Entry = {"type": "file", "size": st.st_size, "mtime_ns": st.st_mtime_ns}
                if hash_files and stat.S_ISREG(st.st_mode):
                    e["hash"] = fast_hash(item.path, st.st_size)
                entries[item.path] = e
    return entries, unreadable


@dataclass
class Diff:
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)        # "path: what changed"

    def __bool__(self) -> bool:
        return bool(self.added or self.removed or self.changed)

    def lines(self, limit: int = 50) -> list[str]:
        out = [f"added    {p}{'   (Finder writes these when a folder is opened)' if p.endswith('.DS_Store') else ''}"
               for p in self.added]
        out += [f"removed  {p}" for p in self.removed]
        out += [f"changed  {c}" for c in self.changed]
        return out[:limit] + ([f"... and {len(out) - limit} more"] if len(out) > limit else [])

    def summary(self) -> str:
        return f"{len(self.added)} added, {len(self.removed)} removed, {len(self.changed)} changed"


def compare(before: dict[str, Entry], after: dict[str, Entry]) -> Diff:
    d = Diff(added=sorted(set(after) - set(before)), removed=sorted(set(before) - set(after)))
    for p in sorted(set(before) & set(after)):
        a, b = before[p], after[p]
        what = []
        if a["type"] != b["type"]:
            what.append(f"{a['type']} -> {b['type']}")
        elif a["type"] == "file":
            if a["size"] != b["size"]:
                what.append(f"size {a['size']} -> {b['size']}")
            if "hash" in a and "hash" in b and a["hash"] != b["hash"]:
                what.append("content")
            if a["mtime_ns"] != b["mtime_ns"]:
                what.append("modified time")
        elif a["type"] == "link" and a.get("target") != b.get("target"):
            what.append(f"link target {a.get('target')} -> {b.get('target')}")
        if what:
            d.changed.append(f"{p}: {', '.join(what)}")
    return d


def manifest_path(cfg: Config) -> Path:
    return cfg.state_dir / "library-manifest.json"


def record(cfg: Config, path: Path | None = None, hash_files: bool = False) -> tuple[Path, int, list[str]]:
    """Save a manifest of the library (under state/ unless `path` says otherwise; never in the
    library). Returns (where, how many entries, unreadable folders)."""
    entries, unreadable = snapshot(cfg.library_roots, hash_files)
    where = path or manifest_path(cfg)
    doc = {"version": 1, "created": datetime.now().isoformat(timespec="seconds"),
           "roots": [str(r) for r in cfg.library_roots], "hashed": hash_files, "entries": entries}
    safety.write_text(cfg, where, json.dumps(doc, indent=0, sort_keys=True))
    return where, len(entries), unreadable


def check(cfg: Config, path: Path | None = None) -> tuple[Diff, dict]:
    """Compare the library with a saved manifest (re-hashing if it was recorded with hashes)."""
    where = path or manifest_path(cfg)
    doc = json.loads(Path(where).read_text())
    roots = [Path(r) for r in doc["roots"]]
    now, _ = snapshot(roots, doc.get("hashed", False))
    return compare(doc["entries"], now), doc
