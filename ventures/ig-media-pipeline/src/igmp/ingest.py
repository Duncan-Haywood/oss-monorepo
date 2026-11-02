"""Copy SD cards and camera SSDs into the library, verified, named the way the catalog reads them.

    card ──find_cards──> plan (capture time, camera, destination) ──copy_verified──> library root
                                                                                  or the spool

A card is any mounted volume with a DCIM folder or a Sony PRIVATE/M4ROOT. Only DCIM and
PRIVATE/M4ROOT/CLIP are read (M4ROOT also holds thumbnails and proxy clips, which are not
shots); hidden files, system folders and camera housekeeping files (.THM, .BIN) are left out.

Names. Flat cameras (A7RV, Pocket 3, Osmo Action) become
    YYYY-MM-DD_HHMMSS_<Location>[_<Event>]_<Camera>_<Original stem>.<EXT>
at the top of the ingest root, the scheme `catalog.parse_flat` reads. Files that share a folder
and a stem on the card (DSC08969.ARW + .JPG, a clip and its .LRF) get one time and camera, so
they keep sharing a stem and the catalog groups them into one shot. Insta360 files (X5, Ace Pro 2)
keep their camera names, because the catalog pairs their lenses and proxies by those names; they
go into <root>/<YYYY-MM-DD>_Insta360[_<Location>]/ with an _index.csv row each (the local date
and time, place, event and camera `catalog.scan_insta360` reads).

Capture time. In order: the time in a DJI or Insta360 file name (the camera clock, local), the
CreationDate in a Sony clip's M01.XML sidecar (local), exiftool's DateTimeOriginal/CreateDate,
Pillow's EXIF for JPEGs, ffprobe's creation_time for clips, the file's modification time. A
QuickTime CreateDate and ffprobe's creation_time are UTC; those are turned into local time with
the location's `places` timezone, else this machine's, and the file is marked as such.

Copies. Each file is copied to <dest>.tmp while the source is hashed (blake2b, the backup
module's digest), fsynced, re-read and hashed again, compared, then renamed into place. An
existing destination is never overwritten: the same bytes are a skip, anything else a conflict.
Nothing on the card is ever written, renamed or deleted.

The ledger (store table `ingest`, keyed "<camera>|<original name>|<size>|<capture time>") records
every verified file, so a card put in again copies only what is new. A card is "safe to format"
when every media file on it is verified in the library (or the spool) and, with cloud on, pushed.

The spool. When the ingest root is on a /Volumes/<drive> that is not mounted, files go to
<state_dir>/ingest/<root folder name>/ instead, under the same relative paths. Asset ids are
sha1("<root folder name>/<stem>"), so a spooled file has the id it will have in the root, and
`settle` later moves the spool into the root without changing any id.
"""
from __future__ import annotations

import csv
import getpass
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from . import backup, outputs
from .catalog import CAMERA_NAME, CAMERAS, PHOTO_EXT, VIDEO_EXT

log = logging.getLogger(__name__)

TABLE = "ingest"
SIDECAR_EXT = {".xmp", ".lrf", ".lrv"}          # sidecars the catalog groups with their shot
MEDIA_EXT = PHOTO_EXT | VIDEO_EXT | SIDECAR_EXT
# camera housekeeping inside the card folders: Sony thumbnails and proxy clips, DJI/Insta360 misc
SKIP_DIRS = backup.SKIP_DIRS | {"THMBNL", "SUB", "GENERAL", "AVF_INFO", "MISC", "LOST.DIR"}
INSTA360_LABELS = {"Insta360", "X5", "Ace-Pro-2"}
INDEX = "_index.csv"
INDEX_FIELDS = ["file", "local_date", "local_time", "location", "event", "camera"]
EXIFTOOL_BATCH = 200
DJI_NAME = re.compile(r"^DJI_(\d{14})_")         # DJI_20261010173952_0001_D
# how much each time source is trusted when the files of one shot disagree (lower is better)
SOURCE_RANK = {"name": 0, "xml": 1, "exif": 2, "pillow": 3, "exif-utc": 4, "ffprobe-utc": 5, "mtime": 9}
_warned_models: set[str] = set()


@dataclass
class Copy:
    source: Path
    dest: Path
    size: int
    key: str                    # the ledger key
    camera: str
    taken_at: datetime          # local time, as the file name and _index.csv carry it
    status: str = "copy"        # plan: copy | skip | conflict; after copying: copied | failed
    digest: str = ""            # blake2b of the bytes now at dest (empty until known)
    reason: str = ""            # why a file is skipped, in conflict or failed
    time_source: str = ""       # name | xml | exif | pillow | exif-utc | ffprobe-utc | mtime
    insta360: bool = False      # goes into an Insta360 folder with an _index.csv row
    location: str = ""
    event: str = ""
    warning: str = ""
    pushed: bool = False

    def to_json(self) -> dict:
        d = asdict(self)
        d.update(source=str(self.source), dest=str(self.dest), taken_at=self.taken_at.isoformat())
        return d


# --------------------------------------------------------------------------- where things go

def _volume(path: Path) -> Path | None:
    """The removable volume a path lives on: /Volumes/<name> (macOS), /media/<user>/<name> or
    /run/media/<user>/<name> (Linux); None for the system disk."""
    vol = outputs.volume_root(path)
    if vol is not None:
        return vol
    parts = Path(path).expanduser().absolute().parts
    if len(parts) >= 4 and parts[1] == "media":
        return Path(*parts[:4])
    if len(parts) >= 5 and parts[1] == "run" and parts[2] == "media":
        return Path(*parts[:5])
    return None


def _online(path: Path) -> bool:
    vol = _volume(path)
    return vol is None or outputs._mounted(vol)


def ingest_root(cfg) -> Path:
    """The configured ingest root (setting `ingest_root`, else the last library root)."""
    s = (cfg.extra or {}).get("ingest_root")
    if s:
        return Path(s).expanduser()
    if not cfg.library_roots:
        raise ValueError("no ingest_root and no library_roots configured")
    return Path(cfg.library_roots[-1]).expanduser()


def spool_dir(cfg) -> Path:
    """Where ingest writes while the root's drive is away: same folder name, so ids do not change."""
    return cfg.state_dir / "ingest" / ingest_root(cfg).name


def dest_root(cfg) -> Path:
    """The ingest root when it can be written, else the spool. Never a path on a missing volume."""
    root = ingest_root(cfg)
    if _online(root):
        return root
    spool = spool_dir(cfg)
    if not _online(spool):
        raise RuntimeError(f"neither {root} nor the spool {spool} is connected")
    return spool


def _spool_files(spool: Path) -> list[Path]:
    if not spool.is_dir():
        return []
    return [p for p in backup.walk(spool) if p.is_file()]


def scan_roots(cfg) -> list[Path]:
    """The library roots to scan: library_roots, plus the spool while it holds files."""
    roots = [Path(r).expanduser() for r in cfg.library_roots]
    if not roots and not (cfg.extra or {}).get("ingest_root"):
        return roots                    # nothing configured to ingest into, so no spool either
    spool = spool_dir(cfg)
    if spool not in roots and _spool_files(spool):
        roots.append(spool)
    return roots


def find_cards(volumes: Path | None = None) -> list[Path]:
    """Mounted volumes that look like camera cards (a DCIM folder or a Sony PRIVATE/M4ROOT)."""
    if volumes is not None:
        bases = [Path(volumes)]
    elif sys.platform == "darwin":
        bases = [Path("/Volumes")]
    else:
        user = getpass.getuser()
        bases = [Path("/media") / user, Path("/run/media") / user, Path("/media")]
    cards: list[Path] = []
    for base in bases:
        try:
            children = sorted(base.iterdir())
        except OSError:
            continue
        for vol in children:
            if vol.name.startswith(".") or vol in cards:
                continue
            try:
                if (vol / "DCIM").is_dir() or (vol / "PRIVATE" / "M4ROOT").is_dir():
                    cards.append(vol)
            except OSError:
                continue
    return cards


def holds_library(cfg, card: Path) -> bool:
    """True when the volume holds a library root, output_dir or state_dir (never a card to ingest)."""
    card = Path(card).absolute()
    for p in (*cfg.library_roots, cfg.output_dir, cfg.state_dir, ingest_root(cfg)):
        try:
            Path(p).expanduser().absolute().relative_to(card)
            return True
        except ValueError:
            continue
    return False


def card_files(card: Path) -> list[Path]:
    """Every media file on a card, in a stable order."""
    card = Path(card)
    tops = [d for d in (card / "DCIM", card / "PRIVATE" / "M4ROOT" / "CLIP") if d.is_dir()]
    if not tops:
        tops = [card]                   # a plain folder of camera files
    out = []
    for top in tops:
        for dirpath, dirs, files in os.walk(top):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
            for name in sorted(files):
                if not name.startswith(".") and Path(name).suffix.lower() in MEDIA_EXT:
                    out.append(Path(dirpath) / name)
    return out


# --------------------------------------------------------------------------- capture time, camera

def _parse_exif_time(s) -> datetime | None:
    if not s or not isinstance(s, str) or s.startswith("0000"):
        return None
    try:
        return datetime.strptime(s[:19], "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def _name_time(p: Path) -> datetime | None:
    """The camera clock in a DJI or Insta360 file name (local time)."""
    m = DJI_NAME.match(p.name)
    if m:
        return datetime.strptime(m.group(1), "%Y%m%d%H%M%S")
    m = CAMERA_NAME.match(p.name)
    if m:
        return datetime.strptime(m.group(2) + m.group(3), "%Y%m%d%H%M%S")
    return None


def _sony_xml(p: Path) -> dict:
    """A Sony clip's C0001M01.XML: CreationDate (local, with offset) and the camera model."""
    for x in sorted(p.parent.glob(f"{p.stem}M[0-9][0-9].[Xx][Mm][Ll]")):
        try:
            text = x.read_text(errors="replace")
        except OSError:
            continue
        out = {}
        m = re.search(r'<CreationDate\s+value="([^"]+)"', text)
        if m:
            try:
                out["taken_at"] = datetime.fromisoformat(m.group(1)).replace(tzinfo=None)  # the local wall time
            except ValueError:
                pass
        m = re.search(r'modelName="([^"]+)"', text)
        if m:
            out["model"] = m.group(1)
        m = re.search(r'manufacturer="([^"]+)"', text)
        if m:
            out["make"] = m.group(1)
        return out
    return {}


def _pillow(p: Path) -> dict:
    try:
        from PIL import Image
        with Image.open(p) as im:
            exif = im.getexif()
            sub = exif.get_ifd(0x8769)
    except Exception:               # not an image Pillow reads (ARW often is not)
        return {}
    out = {"model": str(exif.get(0x0110) or "").strip(), "make": str(exif.get(0x010F) or "").strip()}
    t = _parse_exif_time(sub.get(0x9003) or sub.get(0x9004) or exif.get(0x0132))
    if t:
        out["taken_at"] = t
    return out


def _ffprobe(p: Path, cfg) -> dict:
    try:
        res = subprocess.run([cfg.ffprobe, "-v", "error", "-print_format", "json", "-show_format", str(p)],
                             capture_output=True, check=False, timeout=60)
        tags = json.loads(res.stdout or b"{}").get("format", {}).get("tags", {}) or {}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {}
    tags = {k.lower(): v for k, v in tags.items()}
    out = {"model": tags.get("model") or tags.get("com.apple.quicktime.model") or "",
           "make": tags.get("make") or tags.get("com.apple.quicktime.make") or ""}
    t = tags.get("creation_time")
    if t:
        try:
            dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
            out["taken_at"] = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return out


def _exiftool(files: list[Path], cfg) -> dict[Path, dict]:
    """exiftool records by path, in batches; {} when exiftool is not installed."""
    out: dict[Path, dict] = {}
    by_str = {str(p): p for p in files}
    for i in range(0, len(files), EXIFTOOL_BATCH):
        batch = files[i:i + EXIFTOOL_BATCH]
        cmd = [cfg.exiftool, "-json", "-n", "-q", "-q", "-api", "LargeFileSupport=1", "-DateTimeOriginal",
               "-CreateDate", "-SubSecTimeOriginal", "-Model", "-Make", *map(str, batch)]
        try:
            res = subprocess.run(cmd, capture_output=True, check=False, timeout=600)
        except FileNotFoundError:
            log.info("ingest: exiftool not found (%s); reading times from names, EXIF and ffprobe", cfg.exiftool)
            return {}
        except (OSError, subprocess.TimeoutExpired) as e:
            log.warning("ingest: exiftool failed (%s)", e)
            continue
        try:
            records = json.loads(res.stdout or b"[]")       # exit 1 still prints the files it read
        except ValueError:
            records = []
        for r in records:
            p = by_str.get(r.get("SourceFile", ""))
            if p is not None:
                out[p] = r
    return out


def read_times(files: list[Path], cfg) -> dict[Path, dict]:
    """{path: {"taken_at", "model", "make", "source"}} for each file. taken_at is naive local time,
    except for the UTC sources (exif-utc, ffprobe-utc), whose datetimes are timezone-aware."""
    exif = _exiftool(list(files), cfg)
    out = {}
    for p in files:
        ext = p.suffix.lower()
        video = ext in VIDEO_EXT or ext in {".lrf", ".lrv"}
        r = exif.get(p, {})
        model, make = str(r.get("Model") or "").strip(), str(r.get("Make") or "").strip()
        taken, source = _name_time(p), "name"
        xml = _sony_xml(p) if video else {}
        if taken is None and xml.get("taken_at"):
            taken, source = xml["taken_at"], "xml"
        if taken is None:
            t = _parse_exif_time(r.get("DateTimeOriginal"))
            if t is None:
                t = _parse_exif_time(r.get("CreateDate"))
                if t is not None and video:     # QuickTime CreateDate is UTC
                    t, source = t.replace(tzinfo=timezone.utc), "exif-utc"
                else:
                    source = "exif"
            else:
                source = "exif"
            taken = t
        model, make = model or xml.get("model", ""), make or xml.get("make", "")
        if (taken is None or not model) and ext in {".jpg", ".jpeg", ".arw", ".dng"}:
            pil = _pillow(p)
            if taken is None and pil.get("taken_at"):
                taken, source = pil["taken_at"], "pillow"
            model, make = model or pil.get("model", ""), make or pil.get("make", "")
        if (taken is None or not model) and video:
            ff = _ffprobe(p, cfg)
            if taken is None and ff.get("taken_at"):
                taken, source = ff["taken_at"], "ffprobe-utc"
            model, make = model or ff.get("model", ""), make or ff.get("make", "")
        if taken is None:
            taken, source = datetime.fromtimestamp(p.stat().st_mtime).replace(microsecond=0), "mtime"
        out[p] = {"taken_at": taken, "model": model, "make": make, "source": source}
    return out


def label(text: str) -> str:
    """A name label: no underscores or spaces inside (the catalog splits on '_'), hyphens instead."""
    s = re.sub(r"[^\w\-]+", "-", str(text or "").strip(), flags=re.UNICODE).replace("_", "-")
    return re.sub(r"-{2,}", "-", s).strip("-")


def _shot_key(p: Path) -> str:
    """The files of one shot share this: the stem, or for Insta360 names the key catalog.scan_insta360
    groups by (VID_..._00_001.insv and its LRV_..._11_001.lrv are one clip with different stems)."""
    m = CAMERA_NAME.match(p.name)
    if m:
        return f"{'IMG' if m.group(1) == 'IMG' else 'VID'}_{m.group(2)}_{m.group(3)}_{m.group(5)}"
    return p.stem


def camera_label(model: str, make: str, path: Path, fallback: str = "") -> str:
    """An EXIF model (and make) as one of catalog.CAMERAS. An unknown model becomes a sanitised
    label with a warning: the catalog only parses flat names whose camera is in CAMERAS."""
    m = re.sub(r"[\s_\-]+", "", f"{model}".lower())
    mk = (make or "").lower()
    if m in {"ilce7rm5", "a7rv"}:
        return "A7RV"
    if "pocket3" in m or (mk.startswith("dji") and m.startswith("fc")):
        return "Pocket3"
    if "osmoaction" in m:
        return "OsmoAction"
    if "acepro2" in m:
        return "Ace-Pro-2"
    if m.endswith("x5") and ("insta360" in m or "insta360" in mk or m == "x5"):
        return "X5"
    if "insta360" in m or "insta360" in mk:
        return "Insta360"
    if not m:
        # no model at all: Insta360 names and 360 files are at least known to be Insta360
        if CAMERA_NAME.match(path.name) or path.suffix.lower() in {".insv", ".insp"}:
            return "Insta360"
        guess = "DJI" if DJI_NAME.match(path.name) else "Unknown"
    else:
        guess = label(model) or "Unknown"
    if fallback in CAMERAS:
        return fallback             # the settings name the camera for files that carry no usable model
    if guess not in _warned_models:
        _warned_models.add(guess)
        log.warning("ingest: camera %r (%s) is not one of %s; the catalog will not read its flat names "
                    "until it is added", guess, model or "no model", ", ".join(CAMERAS))
    return guess


def _local(t: datetime, cfg, location: str) -> datetime:
    """A capture time as local wall time: UTC times go to the place's timezone, else this machine's."""
    if t.tzinfo is None:
        return t.replace(microsecond=0)
    tz = (cfg.places or {}).get(location, {}).get("timezone") if location else None
    if tz:
        try:
            from zoneinfo import ZoneInfo
            return t.astimezone(ZoneInfo(tz)).replace(tzinfo=None, microsecond=0)
        except Exception:
            log.warning("ingest: unknown timezone %r for %s", tz, location)
    return t.astimezone().replace(tzinfo=None, microsecond=0)


# --------------------------------------------------------------------------- the plan

def ledger_key(camera: str, name: str, size: int, taken: datetime) -> str:
    return f"{camera}|{name}|{size}|{taken.isoformat(timespec='seconds')}"


def _primary_rank(p: Path, info: dict) -> tuple:
    ext = p.suffix.lower()
    return (SOURCE_RANK.get(info.get("source", "mtime"), 9), ext in SIDECAR_EXT, not info.get("model"), p.name)


def plan(card: Path, cfg, store, *, location: str = "", event: str = "", reader=None) -> list[Copy]:
    """Every media file on the card with its destination and status (copy, skip or conflict)."""
    location, event = label(location), label(event)
    if event and not location:
        raise ValueError("an event needs a location: the catalog reads the first label as the place")
    files = card_files(card)
    if not files:
        return []
    info = (reader or read_times)(files, cfg)
    root = dest_root(cfg)
    # one time and camera per shot: files that share a folder and a stem on the card
    groups: dict[tuple[str, str], list[Path]] = {}
    for p in files:
        groups.setdefault((str(p.parent), _shot_key(p)), []).append(p)
    copies: list[Copy] = []
    seen: set[Path] = set()
    for (_, stem), members in sorted(groups.items()):
        best = min(members, key=lambda p: _primary_rank(p, info.get(p, {})))
        bi = info.get(best) or {"taken_at": datetime.fromtimestamp(best.stat().st_mtime), "source": "mtime"}
        camera = camera_label(bi.get("model", "") or next((info[p].get("model", "") for p in members
                                                           if info.get(p, {}).get("model")), ""),
                              bi.get("make", ""), best, str((cfg.extra or {}).get("ingest_camera", "") or ""))
        taken = _local(bi["taken_at"], cfg, location)
        source = bi.get("source", "mtime")
        for p in sorted(members):
            insta = camera in INSTA360_LABELS and CAMERA_NAME.match(p.name) is not None
            if insta:
                folder = "_".join(x for x in (taken.strftime("%Y-%m-%d"), "Insta360", location) if x)
                dest = root / folder / p.name
            else:
                prefix = "_".join(x for x in (taken.strftime("%Y-%m-%d_%H%M%S"), location, event, camera) if x)
                dest = root / f"{prefix}_{stem}{p.suffix}"
            size = p.stat().st_size
            c = Copy(source=p, dest=dest, size=size, key=ledger_key(camera, p.name, size, taken), camera=camera,
                     taken_at=taken, time_source=source, insta360=insta, location=location, event=event)
            if camera not in CAMERAS and not insta:
                c.warning = f"camera {camera!r} is not in catalog.CAMERAS; scan will not read this name"
            if source.endswith("utc"):
                c.warning = (c.warning + "; " if c.warning else "") + "capture time from a UTC clock, shifted to local"
            elif source == "mtime":
                c.warning = (c.warning + "; " if c.warning else "") + "no capture time in the file; used its mtime"
            _status(c, store, seen)
            seen.add(c.dest)
            copies.append(c)
    return copies


def _status(c: Copy, store, seen: set[Path]) -> None:
    row = store.get(TABLE, c.key) if store is not None else None
    if row:
        c.status, c.reason, c.digest = "skip", "in the ledger", row.get("blake2b", "")
        c.dest, c.pushed = Path(row.get("dest", c.dest)), bool(row.get("pushed"))
        return
    if c.dest in seen:
        c.status, c.reason = "conflict", "another file on this card has the same destination"
        return
    if c.dest.exists():
        if c.dest.stat().st_size == c.size:
            d = backup.digest(c.dest)
            if d == backup.digest(c.source):
                c.status, c.reason, c.digest = "skip", "already at the destination", d
                return
        c.status, c.reason = "conflict", "a different file is already at the destination"


# --------------------------------------------------------------------------- copying

def _verified_copy(src: Path, dst: Path) -> str:
    """Copy src to dst through <dst>.tmp, hashing as it reads; returns the digest. Never overwrites."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".tmp")
    h = hashlib.blake2b(digest_size=20)
    try:
        with src.open("rb") as fi, tmp.open("wb") as fo:
            while chunk := fi.read(backup.CHUNK):
                h.update(chunk)
                fo.write(chunk)
            fo.flush()
            os.fsync(fo.fileno())
        # the re-read may come from the page cache rather than the disk; it still catches a short
        # or garbled write and a source that changed while it was read
        if backup.digest(tmp) != h.hexdigest():
            raise OSError("the copy does not match the source")
        shutil.copystat(src, tmp)
        if dst.exists():
            raise FileExistsError(f"{dst} appeared while copying")
        os.replace(tmp, dst)
    finally:
        tmp.unlink(missing_ok=True)
    return h.hexdigest()


def copy_verified(c: Copy) -> Copy:
    """Copy one planned file into place, verified. Sets status copied/failed/conflict and digest."""
    try:
        c.digest = _verified_copy(c.source, c.dest)
        c.status, c.reason = "copied", ""
    except FileExistsError as e:
        c.status, c.reason = "conflict", str(e)
    except OSError as e:
        c.status, c.reason = "failed", str(e)
        log.warning("ingest: %s not copied: %s", c.source, e)
    return c


def _read_index(path: Path) -> tuple[list[str], dict[str, dict]]:
    if not path.exists():
        return list(INDEX_FIELDS), {}
    with path.open(newline="") as fh:
        r = csv.DictReader(fh)
        fields = list(r.fieldnames or INDEX_FIELDS)
        return fields, {row["file"]: row for row in r if row.get("file")}


def merge_index(path: Path, rows: dict[str, dict]) -> int:
    """Add rows to an Insta360 folder's _index.csv (rows already there are kept). Returns rows added."""
    fields, have = _read_index(path)
    new = {k: v for k, v in rows.items() if k not in have}
    if not new:
        return 0
    fields += [f for f in INDEX_FIELDS if f not in fields]
    have.update(new)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        for k in sorted(have):
            w.writerow(have[k])
    os.replace(tmp, path)
    return len(new)


def _index_row(c: Copy) -> dict:
    return {"file": c.dest.name, "local_date": c.taken_at.strftime("%Y-%m-%d"),
            "local_time": c.taken_at.strftime("%H:%M:%S"), "location": c.location, "event": c.event,
            "camera": c.camera}


def _ledger_value(c: Copy, card: Path) -> dict:
    return {"source": str(c.source), "dest": str(c.dest), "size": c.size, "blake2b": c.digest,
            "ingested_at": datetime.now().isoformat(timespec="seconds"), "card": Path(card).name,
            "camera": c.camera, "taken_at": c.taken_at.isoformat(), "pushed": c.pushed}


def _safe(copies: list[Copy], pushing: bool, dry_run: bool) -> tuple[bool, list[str]]:
    """Whether the card may be formatted, and why not."""
    why = []
    if dry_run:
        why.append("dry run: nothing was copied")
    if not copies:
        why.append("no media files found on the card")
    n = {s: sum(c.status == s for c in copies) for s in ("conflict", "failed", "copy")}
    if n["conflict"]:
        why.append(f"{n['conflict']} conflict(s): a different file is at the destination")
    if n["failed"]:
        why.append(f"{n['failed']} file(s) failed to copy or verify")
    if n["copy"] and not dry_run:
        why.append(f"{n['copy']} file(s) not copied")
    if pushing:
        unpushed = sum(c.status in ("copied", "skip") and not c.pushed for c in copies)
        if unpushed:
            why.append(f"{unpushed} file(s) not pushed to the bucket")
    return not why, why


def _ingest_card(cfg, store, card: Path, *, location: str, event: str, dry_run: bool,
                 push: Callable | None, workers: int, reader) -> dict:
    started = datetime.now()
    root = dest_root(cfg)
    copies = plan(card, cfg, store, location=location, event=event, reader=reader)
    if not dry_run:
        # files found already at the destination go into the ledger too, so a re-insert is a lookup
        for c in copies:
            if c.status == "skip" and c.reason == "already at the destination":
                store.put(TABLE, c.key, _ledger_value(c, card))
        todo = [c for c in copies if c.status == "copy"]
        with ThreadPoolExecutor(max(1, workers)) as pool:
            for fut in as_completed([pool.submit(copy_verified, c) for c in todo]):
                c = fut.result()
                if c.status == "copied":
                    store.put(TABLE, c.key, _ledger_value(c, card))
        index_files: list[Path] = []
        by_folder: dict[Path, dict] = {}
        for c in copies:
            if c.insta360 and c.status in ("copied", "skip") and c.dest.parent.is_dir():
                by_folder.setdefault(c.dest.parent, {})[c.dest.name] = _index_row(c)
        for folder, rows in by_folder.items():
            merge_index(folder / INDEX, rows)
            index_files.append(folder / INDEX)
        if push is not None:
            landed = [c for c in copies if c.status in ("copied", "skip") and c.dest.exists()]
            try:
                result = push([c.dest for c in landed] + index_files) or {}
            except Exception as e:          # a bucket that is down must not lose the copies
                log.warning("ingest: push failed: %s", e)
                result = {"pushed": [], "failed": [str(c.dest) for c in landed]}
            pushed = {str(p) for p in result.get("pushed", [])}
            for c in landed:
                if str(c.dest) in pushed:
                    c.pushed = True
                    row = store.get(TABLE, c.key)
                    if row is not None and not row.get("pushed"):
                        row["pushed"] = True
                        store.put(TABLE, c.key, row)
    counts = {s: sum(c.status == s for c in copies) for s in ("copy", "copied", "skip", "conflict", "failed")}
    safe, why = _safe(copies, push is not None, dry_run)
    out = {"card": str(card), "dest_root": str(root), "spooled": root != ingest_root(cfg),
           "counts": counts, "safe_to_format": safe, "why": why,
           "warnings": sorted({c.warning for c in copies if c.warning}), "report": None}
    if not dry_run:
        rdir = cfg.state_dir / "ingest" / "reports"
        rdir.mkdir(parents=True, exist_ok=True)
        stem = f"{label(Path(card).name) or 'card'}-{started.strftime('%Y%m%d-%H%M%S')}"
        report, n = rdir / f"{stem}.json", 1
        while report.exists():          # two runs within one second keep both reports
            n += 1
            report = rdir / f"{stem}-{n}.json"
        body = {**out, "started": started.isoformat(timespec="seconds"),
                "finished": datetime.now().isoformat(timespec="seconds"), "location": location, "event": event,
                "pushing": push is not None, "files": [c.to_json() for c in copies]}
        report.write_text(json.dumps(body, indent=1, default=str))
        out["report"] = str(report)
    out["copies"] = copies
    return out


def run(cfg, store, cards: list[Path], *, location: str = "", event: str = "", dry_run: bool = False,
        push: Callable | None = None, workers: int = 2, reader=None) -> dict:
    """Ingest cards one after another. Returns totals per status and, per card (keyed by its path),
    counts, safe_to_format, the reasons it is not safe, warnings and the report's path."""
    totals = {s: 0 for s in ("copy", "copied", "skip", "conflict", "failed")}
    per_card = {}
    for card in cards:
        r = _ingest_card(cfg, store, Path(card), location=location, event=event, dry_run=dry_run,
                         push=push, workers=workers, reader=reader)
        for k, v in r["counts"].items():
            totals[k] += v
        per_card[str(card)] = r
    return {**totals, "cards": per_card}


# --------------------------------------------------------------------------- the spool, watching

def settle(cfg, store) -> dict:
    """Move the spool into the ingest root once its drive is connected. Each file is copied and
    verified (or renamed on the same disk), then removed from the spool; a different file at the
    destination is a conflict and both stay. Ledger rows follow the files; _index.csv rows merge."""
    root, spool = ingest_root(cfg), spool_dir(cfg)
    files = _spool_files(spool)
    counts = {"moved": 0, "same": 0, "conflict": 0, "failed": 0, "indexes": 0, "records": 0, "waiting": 0}
    if not files:
        return counts
    if not _online(root):
        counts["waiting"] = len(files)
        return counts
    moved: dict[str, str] = {}
    indexes = [p for p in files if p.name == INDEX]
    for src in (p for p in files if p.name != INDEX):
        dst = root / src.relative_to(spool)
        try:
            if dst.exists():
                if dst.stat().st_size == src.stat().st_size and backup.digest(dst) == backup.digest(src):
                    src.unlink()
                    counts["same"] += 1
                    moved[str(src)] = str(dst)
                else:
                    counts["conflict"] += 1
                    log.warning("ingest settle: %s differs from %s; both kept", src, dst)
                continue
            if src.stat().st_dev == (dst.parent.stat().st_dev if dst.parent.exists() else root.stat().st_dev):
                dst.parent.mkdir(parents=True, exist_ok=True)
                os.rename(src, dst)         # same disk: a rename is atomic
            else:
                _verified_copy(src, dst)
                src.unlink()
            counts["moved"] += 1
            moved[str(src)] = str(dst)
        except OSError as e:
            counts["failed"] += 1
            log.warning("ingest settle: %s not moved: %s", src, e)
    for idx in indexes:
        folder = root / idx.parent.relative_to(spool)
        _, rows = _read_index(idx)
        # rows of files still in the spool (conflicts, failures) stay in the spool's index
        landed = {k: v for k, v in rows.items() if (folder / k).exists() and not (idx.parent / k).exists()}
        if landed:
            folder.mkdir(parents=True, exist_ok=True)
            merge_index(folder / INDEX, landed)
            counts["indexes"] += 1
        left = {k: v for k, v in rows.items() if k not in landed}
        if left:
            if len(left) < len(rows):
                idx.unlink()
                merge_index(idx, left)
        else:
            idx.unlink()
    if moved:
        for key, row in list(store.all(TABLE)):
            if row.get("dest") in moved:
                row["dest"] = moved[row["dest"]]
                store.put(TABLE, key, row)
                counts["records"] += 1
    for d in sorted((p for p in spool.rglob("*") if p.is_dir()), key=lambda p: -len(p.parts)):
        try:
            d.rmdir()
        except OSError:
            pass
    return counts


def fingerprint(card: Path) -> str:
    """A cheap identity for one insertion of a card: its media files' names, sizes and mtimes."""
    h = hashlib.sha1()
    for p in card_files(card):
        try:
            st = p.stat()
        except OSError:
            continue
        h.update(f"{p.relative_to(card)}|{st.st_size}|{st.st_mtime_ns}\n".encode())
    return h.hexdigest()


def watch(cfg, store, *, interval: float = 5.0, once: bool = False, volumes: Path | None = None,
          **run_kwargs) -> list[dict]:
    """Ingest each card once per insertion. A card that is taken out and put back (or written to)
    is ingested again, which the ledger makes cheap. Returns the run results (for `once`)."""
    seen: dict[str, str] = {}
    results = []
    while True:
        present = {}
        for card in find_cards(volumes):
            if holds_library(cfg, card):
                continue
            fp = fingerprint(card)
            present[str(card)] = fp
            if seen.get(str(card)) == fp:
                continue
            log.info("ingest: card %s", card)
            r = run(cfg, store, [card], **run_kwargs)
            results.append(r)
            for line in summary(r):
                log.info("%s", line)
            seen[str(card)] = fp
        for gone in set(seen) - set(present):
            seen.pop(gone)
        if once:
            return results
        time.sleep(interval)


# --------------------------------------------------------------------------- the command

def summary(result: dict) -> list[str]:
    lines = []
    for card, r in result["cards"].items():
        n = r["counts"]
        where = r["dest_root"] + (" (spool: the library drive is not connected; `igmp ingest --settle` "
                                  "moves it later)" if r["spooled"] else "")
        if n["copy"] and not n["copied"]:
            lines.append(f"{card}: {n['copy']} to copy, {n['skip']} already in, {n['conflict']} conflicts -> {where}")
        else:
            lines.append(f"{card}: {n['copied']} copied, {n['skip']} already in, {n['conflict']} conflicts, "
                         f"{n['failed']} failed -> {where}")
        lines.append("  safe to format: " + ("yes, every file is verified in the library"
                                             + (" and pushed" if r.get("pushed_on") else "")
                                             if r["safe_to_format"] else "no: " + "; ".join(r["why"])))
        for w in r["warnings"]:
            lines.append(f"  warning: {w}")
        if r.get("report"):
            lines.append(f"  report: {r['report']}")
    return lines


def _pusher(cfg, store):
    """A push callable when cloud is configured and the cloud modules are present, else None."""
    try:
        from . import bucket as bucket_mod
        from . import cloud
    except ImportError:
        return None
    b = bucket_mod.open_bucket(cfg)
    if b is None:
        return None
    return lambda paths: cloud.push_paths(cfg, store, b, paths)


def cli_ingest(cfg, store, args) -> int:
    if getattr(args, "settle", False):
        r = settle(cfg, store)
        print(f"spool: {r['moved']} moved, {r['same']} already there, {r['conflict']} conflicts, "
              f"{r['failed']} failed, {r['waiting']} waiting for {ingest_root(cfg)}")
        return 1 if r["conflict"] or r["failed"] else 0
    location = getattr(args, "location", "") or (cfg.extra or {}).get("ingest_location", "")
    event = getattr(args, "event", "") or ""
    dry_run = bool(getattr(args, "dry_run", False))
    push = None if dry_run or getattr(args, "no_push", False) else _pusher(cfg, store)
    if not dry_run and _spool_files(spool_dir(cfg)) and _online(ingest_root(cfg)):
        s = settle(cfg, store)
        if s["moved"] or s["conflict"]:
            print(f"spool: {s['moved']} moved into {ingest_root(cfg)}, {s['conflict']} conflicts")
    kwargs = dict(location=location, event=event, dry_run=dry_run, push=push)
    if getattr(args, "watch", False):
        print("watching for camera cards (ctrl-c stops)")
        try:
            watch(cfg, store, **kwargs)
        except KeyboardInterrupt:
            pass
        return 0
    cards = [Path(p).expanduser() for p in (getattr(args, "paths", None) or [])]
    if not cards:
        cards = [c for c in find_cards() if not holds_library(cfg, c)]
    if not cards:
        print("no camera cards found (a mounted volume with DCIM or PRIVATE/M4ROOT)")
        return 1
    try:
        result = run(cfg, store, cards, **kwargs)
    except ValueError as e:
        print(f"ingest: {e}")
        return 1
    for r in result["cards"].values():
        r["pushed_on"] = push is not None
    for line in summary(result):
        print(line)
    return 1 if result["conflict"] or result["failed"] else 0
