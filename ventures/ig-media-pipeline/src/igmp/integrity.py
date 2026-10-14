"""Proof that igmp left the library as it found it (apart from its XMP sidecars).

Two checks, both read-only:

* During every command, cli lists each library root before and after (`snapshot`, hidden files
  included, so a stray ._* AppleDouble file, .DS_Store, .pp3 or `*_original` shows up) and
  `compare`s the two. XMP sidecars of existing originals are the tag stage's job and are counted
  separately (`split_sidecars`); any other difference fails the command.
* `igmp verify-library` compares the library with the checksum manifest `igmp backup manifest`
  keeps at `<root>/_checksums.csv` (backup.py's format and code): fast by size and modification
  time, or `--full` by re-hashing every file. backup.walk skips hidden and *.tmp files, so
  those are listed separately when they are newer than the manifest.

Folders macOS maintains on its own at a volume root (.Spotlight-V100, .fseventsd, .Trashes...)
are skipped.
"""
from __future__ import annotations

import os
import stat
from dataclasses import dataclass, field
from pathlib import Path

from . import backup, safety
from .config import Config

Entry = dict          # {"type": "file"|"dir"|"link", "size", "mtime_ns", "target"?}


# --- before / after a command ------------------------------------------------------------------

def snapshot(roots: list[Path]) -> tuple[dict[str, Entry], list[str]]:
    """(every file, folder and link under the roots, keyed by path; folders that could not be read)."""
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
            if item.name in backup.SKIP_DIRS:
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
                entries[item.path] = {"type": "file", "size": st.st_size, "mtime_ns": st.st_mtime_ns,
                                      "mode": st.st_mode}
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
            if a["mtime_ns"] != b["mtime_ns"]:
                what.append("modified time")
            if a.get("mode") != b.get("mode"):
                what.append("permissions")
        elif a["type"] == "link" and a.get("target") != b.get("target"):
            what.append(f"link target {a.get('target')} -> {b.get('target')}")
        if what:
            d.changed.append(f"{p}: {', '.join(what)}")
    return d


def split_sidecars(diff: Diff, expected: set[str] = frozenset()) -> tuple[int, Diff]:
    """(how many XMP sidecars of existing originals were written or refreshed, the rest of the
    diff). `expected` are further exact paths a command was allowed to write."""
    def ours(path: str) -> bool:
        return path in expected or (path.lower().endswith(".xmp") and safety.sidecar_of(path) is not None)

    added = [p for p in diff.added if not ours(p)]
    changed = [c for c in diff.changed if not ours(c.split(": ", 1)[0])]
    return (len(diff.added) - len(added)) + (len(diff.changed) - len(changed)), \
        Diff(added=added, removed=diff.removed, changed=changed)


# --- against the backup manifest ---------------------------------------------------------------

@dataclass
class RootReport:
    root: Path
    note: str = ""                      # why it was not checked, if it wasn't
    damaged: list[str] = field(default_factory=list)    # content changed, size and mtime did not
    changed: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    new: list[str] = field(default_factory=list)
    hidden: list[str] = field(default_factory=list)     # hidden or *.tmp files newer than the manifest
    unreadable: list[str] = field(default_factory=list)
    sidecars: int = 0                   # XMP sidecars written or refreshed since (expected)
    files: int = 0

    @property
    def problems(self) -> list[str]:
        return ([f"damaged  {r}" for r in self.damaged] + [f"changed  {r}" for r in self.changed]
                + [f"missing  {r}" for r in self.missing] + [f"new      {r}" for r in self.new]
                + [f"new      {r}   (hidden or temporary)" for r in self.hidden]
                + [f"unreadable {r}" for r in self.unreadable])


def _fast(root: Path, known: dict) -> dict[str, list[str]]:
    """backup.verify's report without hashing: size and modification time only."""
    report: dict[str, list[str]] = {"damaged": [], "changed": [], "missing": [], "new": [], "unreadable": []}
    seen = set()
    for p in backup.walk(root):
        rel = p.relative_to(root).as_posix()
        seen.add(rel)
        e = known.get(rel)
        try:
            st = p.stat()
        except OSError:
            report["unreadable"].append(rel)
            continue
        if e is None:
            report["new"].append(rel)
        elif e.size != st.st_size or e.mtime_ns != st.st_mtime_ns:
            report["changed"].append(rel)
    report["missing"] = sorted(set(known) - seen)
    return report


def _hidden_since(root: Path, since_ns: int) -> list[str]:
    out = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in backup.SKIP_DIRS]
        for name in files:
            if name.startswith(".") or name.endswith(".tmp"):
                p = Path(dirpath) / name
                try:
                    if p.lstat().st_mtime_ns > since_ns:
                        out.append(p.relative_to(root).as_posix())
                except OSError:
                    continue
    return sorted(out)


def verify(cfg: Config, full: bool = False) -> list[RootReport]:
    """Each library root against its <root>/_checksums.csv."""
    reports = []
    for root in cfg.library_roots:
        r = RootReport(root)
        reports.append(r)
        manifest = root / backup.MANIFEST
        if not root.is_dir():
            r.note = "not connected"
            continue
        if not manifest.exists():
            r.note = f"no {backup.MANIFEST} yet: run `igmp backup manifest` first"
            continue
        known = backup.load(root)
        found = backup.verify(root) if full else _fast(root, known)
        r.files = len(known)
        sidecar = lambda rel: rel.lower().endswith(".xmp") and safety.sidecar_of(root / rel) is not None
        r.sidecars = sum(sidecar(x) for x in found["changed"] + found["new"])
        r.changed = [x for x in found["changed"] if not sidecar(x)]
        r.new = [x for x in found["new"] if not sidecar(x)]
        r.damaged, r.missing, r.unreadable = found["damaged"], found["missing"], found["unreadable"]
        r.hidden = _hidden_since(root, manifest.stat().st_mtime_ns)
    return reports
