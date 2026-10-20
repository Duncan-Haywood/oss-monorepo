"""Where finished outputs go, and the outbox that holds them while the output drive is away.

Outputs (photos/, reels/, carousels/, ready/) belong on `output_dir`, usually an external drive
that drops off. When that drive's volume is not mounted, every output is written under
`<state_dir>/outbox/<the same relative path>` instead, so a run keeps shipping. `sync()` (the
`igmp sync-outputs` command, also run at the start of every command) moves the outbox to
`output_dir` once the drive is back: copied next to its destination, size-checked, renamed into
place, then removed from the outbox; store records that name an outbox path are rewritten to the
path the file now has.

Never mkdir under a missing /Volumes/<drive>: that would create a plain folder on the internal
disk where the drive mounts (and macOS would then mount the drive as "<drive> 1").
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import uuid
from pathlib import Path

from .config import Config

log = logging.getLogger(__name__)
# tables whose rows name output files (the others hold measurements and plans)
RECORD_TABLES = ("edits", "reels", "carousels", "astro", "jobs")


def volume_root(path: Path) -> Path | None:
    """/Volumes/<name> for a path on an external volume (macOS), else None (the system disk)."""
    parts = Path(path).expanduser().absolute().parts
    if len(parts) >= 3 and parts[0] == "/" and parts[1] == "Volumes":
        return Path("/", "Volumes", parts[2])
    return None


def _mounted(volume: Path) -> bool:
    return os.path.ismount(volume)


def output_online(cfg: Config) -> bool:
    """True when output_dir can be written: on the system disk, or its volume is mounted."""
    vol = volume_root(cfg.output_dir)
    return vol is None or _mounted(vol)


def outbox_dir(cfg: Config) -> Path:
    return cfg.state_dir / "outbox"


def out_root(cfg: Config) -> Path:
    """output_dir, or the outbox while output_dir's drive is not connected."""
    return cfg.output_dir if output_online(cfg) else outbox_dir(cfg)


def out_path(cfg: Config, *parts: str | Path) -> Path:
    """An output path: output_dir/<parts>, or <state_dir>/outbox/<parts> while the drive is away."""
    return out_root(cfg).joinpath(*[str(p) for p in parts])


def work_cwd(cfg: Config) -> Path:
    """A folder to run helper processes from: output_dir when connected, else the state disk."""
    return cfg.output_dir if output_online(cfg) else cfg.state_dir


def _pending(box: Path) -> list[Path]:
    if not box.is_dir():
        return []
    # dot-files are half-written temporaries of a run still in progress (or one that died)
    return sorted(p for p in box.rglob("*") if p.is_file() and not any(
        part.startswith(".") for part in p.relative_to(box).parts))


def _move_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.replace(src, dst)            # same disk (output_dir on the system disk)
        return
    except OSError:
        pass
    tmp = dst.with_name(f".{dst.name}.{uuid.uuid4().hex[:8]}")
    try:
        shutil.copyfile(src, tmp)
        if tmp.stat().st_size != src.stat().st_size:
            raise OSError(f"short copy of {src} ({tmp.stat().st_size} of {src.stat().st_size} bytes)")
        os.replace(tmp, dst)
    finally:
        tmp.unlink(missing_ok=True)
    src.unlink()


def _rewrite(value, box: str, out: Path, moved: set[str]):
    """value with every outbox path whose file (or folder) has moved replaced by its new path."""
    if isinstance(value, dict):
        return {k: _rewrite(v, box, out, moved) for k, v in value.items()}
    if isinstance(value, list):
        return [_rewrite(v, box, out, moved) for v in value]
    if isinstance(value, str) and (value == box or value.startswith(box + os.sep)):
        rel = value[len(box):].lstrip(os.sep)
        new = out / rel if rel else out
        if value in moved or (not Path(value).exists() and new.exists()):
            return str(new)
    return value


def update_records(cfg: Config, store, moved: set[str] = frozenset()) -> int:
    """Rewrite store rows naming outbox paths that have moved to output_dir. Returns rows changed."""
    box = str(outbox_dir(cfg))
    changed = 0
    for table in RECORD_TABLES:
        with store.lock:
            rows = store.db.execute(f"SELECT key, value FROM {table} WHERE instr(value, ?) > 0",
                                    (box,)).fetchall()
        for key, text in rows:
            value = json.loads(text)
            new = _rewrite(value, box, cfg.output_dir, moved)
            if new != value:
                store.put(table, key, new)
                changed += 1
    return changed


def sync(cfg: Config, store=None) -> dict:
    """Move the outbox to output_dir when its drive is connected. Returns counts:
    moved, failed, records (store rows rewritten), waiting (files left because the drive is away)."""
    box = outbox_dir(cfg)
    files = _pending(box)
    if not files:
        return {"moved": 0, "failed": 0, "records": 0, "waiting": 0}
    if not output_online(cfg):
        return {"moved": 0, "failed": 0, "records": 0, "waiting": len(files)}
    moved: set[str] = set()
    failed = 0
    for src in files:
        dst = cfg.output_dir / src.relative_to(box)
        try:
            _move_file(src, dst)
            moved.add(str(src))
        except OSError as e:
            failed += 1
            log.warning("outbox: %s not moved: %s", src, e)
    # folders the outbox held (carousel folders are recorded as folders): gone once emptied
    for d in sorted((p for p in box.rglob("*") if p.is_dir()), key=lambda p: -len(p.parts)):
        try:
            d.rmdir()
            moved.add(str(d))
        except OSError:
            pass
    records = update_records(cfg, store, moved) if store is not None else 0
    log.info("outbox: %d file(s) moved to %s (%d failed), %d record(s) updated",
             len(moved & {str(f) for f in files}), cfg.output_dir, failed, records)
    return {"moved": len([f for f in files if str(f) in moved]), "failed": failed, "records": records,
            "waiting": 0}
