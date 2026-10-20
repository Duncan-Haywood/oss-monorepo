"""Real locations for shots from cameras that don't record GPS.

The phone in the photographer's pocket does: every iPhone photo and video says where and when it
was taken. Matching a camera shot's capture time (in UTC) against that track gives a position far
better than the place table's city-level coordinates, together with an honest error estimate.

Tracks come from the Apple Photos library (osxphotos), a folder of exported phone photos
(exiftool), a GPX file, a CSV (time_utc, lat, lon[, accuracy_m]) or a Google Takeout location
history JSON. Matches live in the store's "geo" table, and metadata.fields prefers them over the
place's coordinates. Shots with no location label get a reviewable location-suggestions.csv;
the user's _index.csv files and media are only ever read.
"""
from __future__ import annotations

import bisect
import csv
import errno
import json
import logging
import math
import re
import statistics
import subprocess
import unicodedata
import zoneinfo
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable, NamedTuple
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import Config
from .models import Asset
from .store import Store

log = logging.getLogger(__name__)

TABLE = "geo"
PRECISION = "phone-match"
DEFAULT_ACCURACY_M = 15.0     # a phone fix that doesn't state its accuracy
VISIT_ACCURACY_M = 100.0      # a Takeout "visit": a place, not a measured point
WANDER_MPS = 0.3              # how fast someone drifts from their last known point, on average
MAX_ERROR_M = 2000.0          # coarser than this, the place table's city is as good
NEAR_PLACE_KM = 25.0          # a suggestion this close to a known place reuses its label
CLUSTER_KM = 15.0             # one day's fixes within this distance are one place
DEFAULT_PHOTOS_LIBRARY = Path("~/Pictures/Photos Library.photoslibrary")
FULL_DISK_ACCESS = "System Settings > Privacy & Security > Full Disk Access"

NOTE_UTC = re.compile(r"\bUTC (\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})")
NOTE_UNRELIABLE = re.compile(r"clock reset|time unknown", re.I)
LATLNG = re.compile(r"^\s*(?:geo:)?\s*(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?\s*$")
MEDIA_EXT = ("jpg", "jpeg", "heic", "heif", "dng", "png", "mov", "mp4", "m4v")


class Fix(NamedTuple):
    time: datetime              # UTC, timezone-aware
    lat: float
    lon: float
    accuracy_m: float | None = None
    source: str = ""


class GeoUnavailable(RuntimeError):
    """An optional dependency or tool needed for this source is missing."""


class PhotosAccessError(PermissionError):
    """macOS privacy protection keeps this process out of the Photos library."""


# --- small helpers -------------------------------------------------------------------------------

def _utc(value) -> datetime | None:
    """ISO 8601, exiftool 'YYYY:MM:DD HH:MM:SS[Z|+hh:mm]', epoch seconds/ms -> aware UTC.
    A time without an offset is taken as UTC; callers with local times must not use this."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)) or re.fullmatch(r"-?\d+(\.\d+)?", str(value).strip()):
        x = float(value)
        return datetime.fromtimestamp(x / 1000 if abs(x) > 1e11 else x, timezone.utc)
    else:
        s = re.sub(r"^(\d{4}):(\d{2}):(\d{2})", r"\1-\2-\3", str(value).strip())
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _float(value) -> float | None:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _valid(lat, lon) -> bool:
    return (lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180
            and not (lat == 0 and lon == 0))


def _finish(fixes: Iterable[Fix]) -> list[Fix]:
    return sorted({(f.time, f.lat, f.lon, f.source): f for f in fixes}.values(), key=lambda f: f.time)


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(min(1.0, math.sqrt(h)))


def _settings(cfg: Config) -> dict:
    s = cfg.extra.get("geo", {})
    return s if isinstance(s, dict) else {}


# --- track sources -------------------------------------------------------------------------------

def track_from_csv(path) -> list[Fix]:
    """Columns time_utc, lat, lon and optionally accuracy_m (ISO 8601 or epoch time)."""
    path = Path(path).expanduser()
    fixes = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            t, lat, lon = _utc(row.get("time_utc")), _float(row.get("lat")), _float(row.get("lon"))
            if t and _valid(lat, lon):
                fixes.append(Fix(t, lat, lon, _float(row.get("accuracy_m")), f"csv:{path.name}"))
    return _finish(fixes)


def track_from_gpx(path) -> list[Fix]:
    """Track, route and waypoints that carry a <time>. HDOP, when present, becomes ~5 m per unit."""
    path = Path(path).expanduser()
    fixes = []
    for el in ET.parse(path).iter():
        if el.tag.rsplit("}", 1)[-1] not in ("trkpt", "rtept", "wpt"):
            continue
        child = {c.tag.rsplit("}", 1)[-1]: (c.text or "").strip() for c in el}
        t, lat, lon = _utc(child.get("time")), _float(el.get("lat")), _float(el.get("lon"))
        hdop = _float(child.get("hdop"))
        if t and _valid(lat, lon):
            fixes.append(Fix(t, lat, lon, hdop * 5.0 if hdop else None, f"gpx:{path.name}"))
    return _finish(fixes)


def track_from_takeout(path, visit_step=timedelta(minutes=10)) -> list[Fix]:
    """Google location history: the old Takeout Records.json (latitudeE7/longitudeE7) and the
    on-device Timeline exports (semanticSegments/rawSignals, or the iOS list of segments with
    'geo:lat,lon' strings). A visit becomes a fix every `visit_step` across its stay."""
    path = Path(path).expanduser()
    src = f"takeout:{path.name}"
    fixes: list[Fix] = []

    def add(t, lat, lon, acc=None):
        if t and _valid(lat, lon):
            fixes.append(Fix(t, lat, lon, _float(acc), src))

    def parse(v):
        if isinstance(v, dict):
            v = v.get("latLng") or v.get("LatLng")
        m = LATLNG.match(v) if isinstance(v, str) else None
        return (float(m.group(1)), float(m.group(2))) if m else None

    def walk(node, start=None, end=None):
        if isinstance(node, list):
            for x in node:
                walk(x, start, end)
            return
        if not isinstance(node, dict):
            return
        start, end = _utc(node.get("startTime")) or start, _utc(node.get("endTime")) or end
        if "latitudeE7" in node and "longitudeE7" in node:
            add(_utc(node.get("timestamp") or node.get("timestampMs")),
                _float(node["latitudeE7"]) / 1e7, _float(node["longitudeE7"]) / 1e7, node.get("accuracy"))
        for key in ("point", "latLng", "LatLng"):
            pos = parse(node.get(key)) if isinstance(node.get(key), str) else None
            if pos:
                t = _utc(node.get("time") or node.get("timestamp"))
                offset = _float(node.get("durationMinutesOffsetFromStartTime"))
                if t is None and offset is not None and start:
                    t = start + timedelta(minutes=offset)
                add(t, *pos, node.get("accuracyMeters"))
        pos = parse(node.get("placeLocation"))
        if pos and start and end and end >= start:
            t = start
            while t < end:
                add(t, *pos, VISIT_ACCURACY_M)
                t += visit_step
            add(end, *pos, VISIT_ACCURACY_M)
        for key, when in (("start", start), ("end", end)):
            pos = parse(node.get(key))
            if pos:
                add(when, *pos, VISIT_ACCURACY_M)
        for value in node.values():
            if isinstance(value, (dict, list)):
                walk(value, start, end)

    walk(json.loads(path.read_text(encoding="utf-8")))
    return _finish(fixes)


def _exif_fix(row: dict) -> Fix | None:
    """One exiftool -n JSON record -> a fix. Time preference: the GPS clock (UTC), then capture time
    with its offset, then the QuickTime keys' dated creation time, then QuickTime CreateDate (UTC)."""
    lat, lon = _float(row.get("GPSLatitude")), _float(row.get("GPSLongitude"))
    if not _valid(lat, lon):
        return None
    t = _utc(row["GPSDateTime"]) if row.get("GPSDateTime") else None
    if t is None and row.get("DateTimeOriginal") and row.get("OffsetTimeOriginal"):
        t = _utc(f'{row["DateTimeOriginal"]}{row["OffsetTimeOriginal"]}')
    if t is None and re.search(r"[+-]\d\d:?\d\d$|Z$", str(row.get("CreationDate", ""))):
        t = _utc(row["CreationDate"])
    if t is None and str(row.get("SourceFile", "")).lower().endswith((".mov", ".mp4", ".m4v")):
        t = _utc(row.get("CreateDate"))       # QuickTime stores UTC
    if t is None or t.year < 2000:
        return None
    acc = _float(row.get("GPSHPositioningError")) or _float(row.get("LocationAccuracyHorizontal"))
    return Fix(t, lat, lon, acc, f"photo:{Path(str(row.get('SourceFile', ''))).name}")


def track_from_folder(path, exiftool: str = "exiftool") -> list[Fix]:
    """Every photo/video under `path` (exported from the phone) that carries GPS and a datable time."""
    path = Path(path).expanduser()
    if not path.is_dir():
        raise FileNotFoundError(f"no folder at {path}")
    cmd = [exiftool, "-j", "-n", "-q", "-q", "-r", "-api", "LargeFileSupport=1",
           "-Composite:GPSLatitude", "-Composite:GPSLongitude", "-Composite:GPSDateTime",
           "-EXIF:DateTimeOriginal", "-EXIF:OffsetTimeOriginal", "-Keys:CreationDate",
           "-QuickTime:CreateDate", "-GPSHPositioningError", "-LocationAccuracyHorizontal"]
    for ext in MEDIA_EXT:
        cmd += ["-ext", ext]
    try:
        out = subprocess.run(cmd + [str(path)], capture_output=True, text=True, check=False).stdout
    except FileNotFoundError as e:
        raise GeoUnavailable(f"exiftool not found ({exiftool}); install it (brew install exiftool)") from e
    rows = json.loads(out) if out.strip() else []
    return _finish(f for f in map(_exif_fix, rows) if f)


def _photos_library_path(path=None) -> Path:
    """The given library, else the one Photos last opened (what osxphotos.PhotosDB() would use),
    else the system library, else ~/Pictures/Photos Library.photoslibrary."""
    if path:
        return Path(path).expanduser()
    try:
        from osxphotos import utils
        for finder in ("get_last_library_path", "get_system_library_path"):
            found = getattr(utils, finder, lambda: None)()
            if found:
                return Path(found)
    except Exception:            # Photos preferences unreadable or never set
        pass
    return DEFAULT_PHOTOS_LIBRARY.expanduser()


def _photos_access_message(library: Path, why: str) -> str:
    return (f"can't read the Photos library at {library} ({why}). macOS privacy protection blocks it "
            f"for the app running igmp. To use Photos as the location track, open {FULL_DISK_ACCESS}, "
            "turn it on for that app (Terminal, iTerm, or the app that runs Claude Code; add it with + "
            "if it isn't listed), then quit and reopen the app. Without that access, export the iPhone "
            "photos (Photos > File > Export > Export Unmodified Original) and use track_from_folder, "
            "or use a GPX/CSV/Takeout track.")


def _is_privacy_error(e: BaseException | None) -> bool:
    """EPERM/EACCES anywhere in the chain: osxphotos wraps it as OSError('Error copying ...')."""
    seen = set()
    while e is not None and id(e) not in seen:
        seen.add(id(e))
        text = str(e).lower()
        if (isinstance(e, PermissionError) or getattr(e, "errno", None) in (errno.EPERM, errno.EACCES)
                or "operation not permitted" in text or "permission denied" in text):
            return True
        e = e.__cause__ or e.__context__
    return False


def _privacy_reason(e: BaseException) -> str:
    while e.__cause__ or e.__context__:
        e = e.__cause__ or e.__context__
    return getattr(e, "strerror", None) or str(e)


def track_from_photos_library(path=None, apple_only: bool = True) -> list[Fix]:
    """Every photo and video with a location in the Apple Photos library (default: the library
    Photos last opened). Trashed, shared-album and Shared-with-You items are left out; with
    `apple_only`, so are items whose EXIF names another camera maker (imports, other people's
    pictures). Photos records no GPS accuracy osxphotos exposes, so fixes carry None (15 m assumed).

    Reading the library needs Full Disk Access for the app running this (macOS privacy); without
    it this raises PhotosAccessError saying what to grant, and never tries another way in."""
    try:
        import osxphotos
    except ImportError as e:
        raise GeoUnavailable("the Photos route needs osxphotos: pip install 'igmp[geo]'") from e
    library = _photos_library_path(path)
    if library.suffix != ".photoslibrary" and library.name == "Photos.sqlite":
        library = library.parent.parent
    try:                                         # a plain read: denied -> tell the user, stop
        with (library / "database" / "Photos.sqlite").open("rb"):
            pass
    except FileNotFoundError:
        raise FileNotFoundError(f"no Photos library at {library}") from None
    except OSError as e:
        if _is_privacy_error(e):
            raise PhotosAccessError(_photos_access_message(library, _privacy_reason(e))) from e
        raise
    try:
        db = osxphotos.PhotosDB(dbfile=str(library))
    except OSError as e:          # osxphotos: OSError("Error copying ...") <- PermissionError(EPERM)
        if _is_privacy_error(e):
            raise PhotosAccessError(_photos_access_message(library, _privacy_reason(e))) from e
        raise
    fixes = []
    for p in db.photos(images=True, movies=True, intrash=False):
        if getattr(p, "intrash", False) or getattr(p, "shared", False) or getattr(p, "syndicated", False):
            continue
        lat, lon = getattr(p, "latitude", None), getattr(p, "longitude", None)
        if lat is None or lon is None:
            lat, lon = (getattr(p, "location", None) or (None, None))[:2]
        t = _utc(p.date) if getattr(p, "date", None) else None
        if not _valid(lat, lon) or t is None or t.year < 2000:     # 1970 = osxphotos' "no date"
            continue
        if apple_only:
            make = getattr(getattr(p, "exif_info", None), "camera_make", None)
            if make and "apple" not in str(make).lower():
                continue
        fixes.append(Fix(t, float(lat), float(lon), None, f"photos:{p.uuid}"))
    return _finish(fixes)


def track_from(path) -> list[Fix]:
    """Pick the reader from the path: *.photoslibrary, a folder, .gpx, .csv or .json."""
    p = Path(path).expanduser()
    if p.suffix == ".photoslibrary":
        return track_from_photos_library(p)
    if p.is_dir():
        return track_from_folder(p)
    readers = {".gpx": track_from_gpx, ".csv": track_from_csv, ".json": track_from_takeout}
    if p.suffix.lower() not in readers:
        raise ValueError(f"don't know how to read a track from {p}")
    return readers[p.suffix.lower()](p)


def load_track(cfg: Config) -> list[Fix]:
    """The sources named in the settings ([geo] tracks = [...], "photos" meaning the system Photos
    library), or the Photos library when none are named."""
    sources = _settings(cfg).get("tracks") or ["photos"]
    fixes: list[Fix] = []
    for s in [sources] if isinstance(sources, str) else sources:
        if s == "photos":
            fixes += track_from_photos_library()
        elif Path(s).expanduser().is_dir() and Path(s).suffix != ".photoslibrary":
            fixes += track_from_folder(s, cfg.exiftool)
        else:
            fixes += track_from(s)
    return _finish(fixes)


# --- when was the shot, in UTC -------------------------------------------------------------------

@lru_cache(maxsize=256)
def _read_index(path: str, mtime_ns: int) -> dict[str, dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return {r["file"]: r for r in csv.DictReader(fh) if r.get("file")}


def index_row(asset: Asset) -> dict | None:
    """The asset's row in the _index.csv next to its files (Insta360 folders), read only."""
    for f in asset.files:
        index = Path(f).parent / "_index.csv"
        try:
            rows = _read_index(str(index), index.stat().st_mtime_ns)
        except (OSError, csv.Error, KeyError):
            continue
        for g in asset.files:
            if Path(g).name in rows:
                return rows[Path(g).name]
    return None


def utc_of(asset: Asset, cfg: Config) -> datetime | None:
    """The shot's moment in UTC: its local time in its place's timezone; for Insta360 shots without
    a usable place, the UTC (or offset) their _index.csv records. None when the time is unknown or
    the index says the camera clock can't be trusted."""
    row = index_row(asset)
    if row and NOTE_UNRELIABLE.search(row.get("note") or ""):
        return None
    if asset.taken_at:
        tz = cfg.places.get(asset.location, {}).get("timezone") if asset.location else None
        if tz:
            try:
                return asset.taken_at.replace(tzinfo=ZoneInfo(tz)).astimezone(timezone.utc)
            except (ZoneInfoNotFoundError, ValueError):
                log.warning("geo: unknown timezone %r for %s", tz, asset.location)
        offset = _float((row or {}).get("utc_offset"))
        if offset is not None:
            return (asset.taken_at - timedelta(hours=offset)).replace(tzinfo=timezone.utc)
    m = NOTE_UTC.search((row or {}).get("note") or "")
    return _utc(m.group(1)) if m else None


# --- matching ------------------------------------------------------------------------------------

def _acc(f: Fix) -> float:
    return f.accuracy_m if f.accuracy_m is not None else DEFAULT_ACCURACY_M


def locate(t: datetime, track: list[Fix], max_gap: timedelta = timedelta(minutes=30),
           times: list[datetime] | None = None) -> dict | None:
    """Where the phone was at `t` (aware), from a time-sorted track. See match() for the rules."""
    if not track:
        return None
    times = times if times is not None else [f.time for f in track]
    i = bisect.bisect_left(times, t)
    prv = track[i - 1] if i > 0 else None
    nxt = track[i] if i < len(track) else None
    if nxt and nxt.time == t:
        prv = None                                     # an exact hit: nearest, no gap
    if prv and nxt and t - prv.time <= max_gap and nxt.time - t <= max_gap:
        span = (nxt.time - prv.time).total_seconds()
        f = (t - prv.time).total_seconds() / span
        dlon = (nxt.lon - prv.lon + 540) % 360 - 180   # across the antimeridian the short way
        lat, lon = prv.lat + f * (nxt.lat - prv.lat), (prv.lon + f * dlon + 540) % 360 - 180
        apart = distance_m(prv.lat, prv.lon, nxt.lat, nxt.lon)
        gap = min(t - prv.time, nxt.time - t).total_seconds()
        unpinned = f * (1 - f) * span           # (t-t0)(t1-t)/(t1-t0): ~t-t0 near a fix, span/4 midway
        error = math.sqrt(((1 - f) * _acc(prv) + f * _acc(nxt)) ** 2
                          + (apart * math.sqrt(f * (1 - f))) ** 2 + (WANDER_MPS * unpinned) ** 2)
        used, method = [prv, nxt], "interpolated"
    else:
        near = [x for x in (prv, nxt) if x and abs(x.time - t) <= max_gap / 2]
        if not near:
            return None
        best = min(near, key=lambda x: abs(x.time - t))
        gap = abs(best.time - t).total_seconds()
        lat, lon, apart = best.lat, best.lon, 0.0
        error = math.sqrt(_acc(best) ** 2 + (WANDER_MPS * gap) ** 2)
        used, method = [best], "nearest"
    return {"lat": round(lat, 6), "lon": round(lon, 6), "error_m": round(error, 1), "method": method,
            "precision": PRECISION, "utc": t.isoformat(timespec="seconds"), "gap_s": round(gap),
            "fixes_apart_m": round(apart), "sources": [x.source for x in used]}


def match(assets: Iterable[Asset], track: list[Fix], cfg: Config, max_gap: timedelta = timedelta(minutes=30),
          max_error_m: float | None = None) -> dict[str, dict]:
    """Phone positions for camera shots, by capture time.

    Rules: when fixes bracket the shot and each is within `max_gap` of it, interpolate linearly
    between them; otherwise use the nearer fix if it is within `max_gap / 2`; otherwise skip.
    Error (1 sigma-ish, metres) = quadrature sum of
      - the fixes' own accuracy (stated, else 15 m), weighted towards the nearer fix,
      - the path term: distance between the two fixes x sqrt(f(1-f)), f = where the shot falls
        between them (0 at a fix, half the distance midway: the walk needn't be straight or even),
      - the wander term: 0.3 m/s x the time the shot is "unpinned" by fixes, (t-t0)(t1-t)/(t1-t0)
        between two fixes (about t-t0 close to a fix, a quarter of the span midway, and growing
        with the span), or the time to the fix for a nearest match. Two identical fixes an hour
        apart don't prove someone stood still in between.
    Matches coarser than `max_error_m` (default 2 km) are dropped: the place table does better."""
    track = sorted(track, key=lambda f: f.time)
    times = [f.time for f in track]
    limit = MAX_ERROR_M if max_error_m is None else max_error_m
    out = {}
    for a in assets:
        if a.kind == "sequence":
            continue
        t = utc_of(a, cfg)
        r = locate(t, track, max_gap, times) if t else None
        if r and r["error_m"] <= limit:
            out[a.id] = r
    return out


# --- storage -------------------------------------------------------------------------------------

def ensure_table(store: Store) -> None:
    """The "geo" table, created through the store's own connection (Store.TABLES lacks it)."""
    with store.lock:
        store.db.execute(f"CREATE TABLE IF NOT EXISTS {TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        store.db.commit()


def stored_fix(store: Store, asset_id: str) -> dict | None:
    """The asset's phone-matched position, or None (also when the geo pass never ran)."""
    try:
        return store.get(TABLE, asset_id)
    except Exception as e:          # sqlite3.OperationalError: no such table
        if "no such table" in str(e):
            return None
        raise


# --- offline reverse geocoding -------------------------------------------------------------------

@lru_cache(maxsize=1)
def _geocoder():
    try:
        import reverse_geocoder
    except ImportError as e:
        raise GeoUnavailable("offline reverse geocoding needs reverse_geocoder: pip install 'igmp[geo]'") from e
    return reverse_geocoder.RGeocoder(mode=1, verbose=False)


def _tz_table(name: str) -> list[list[str]]:
    """A tzdata table (iso3166.tab, zone.tab) from the system zoneinfo or the tzdata package."""
    places = [Path(p) / name for p in zoneinfo.TZPATH]
    try:
        import tzdata
        places.append(Path(tzdata.__file__).parent / "zoneinfo" / name)
    except ImportError:
        pass
    for p in places:
        if p.exists():
            return [line.rstrip("\n").split("\t") for line in p.read_text(encoding="utf-8").splitlines()
                    if line and not line.startswith("#")]
    return []


@lru_cache(maxsize=1)
def _countries() -> dict[str, str]:
    return {r[0]: r[1] for r in _tz_table("iso3166.tab") if len(r) >= 2}


@lru_cache(maxsize=1)
def _zones() -> dict[str, list[tuple[float, float, str]]]:
    def coord(s: str, deg: int) -> float:          # ±DDMM[SS] / ±DDDMM[SS]
        d = s[1:]
        value = int(d[:deg]) + int(d[deg:deg + 2]) / 60 + int(d[deg + 2:deg + 4] or 0) / 3600
        return -value if s[0] == "-" else value

    zones: dict[str, list] = defaultdict(list)
    for r in _tz_table("zone.tab"):
        m = re.match(r"([+-]\d{4,6})([+-]\d{5,7})$", r[1]) if len(r) >= 3 else None
        if m:
            zones[r[0]].append((coord(m.group(1), 2), coord(m.group(2), 3), r[2]))
    return zones


def guess_timezone(lat: float, lon: float, country_code: str) -> str:
    """The country's zone whose principal city is nearest; a guess to review, '' if unknown."""
    zones = _zones().get(country_code.upper(), [])
    return min(zones, key=lambda z: distance_m(lat, lon, z[0], z[1]))[2] if zones else ""


def reverse_many(points: Iterable[tuple[float, float]]) -> list[dict]:
    points = [(float(a), float(b)) for a, b in points]
    if not points:
        return []
    found = _geocoder().query(points)
    return [{"city": r.get("name", ""), "state": r.get("admin1", ""),
             "country": _countries().get(r.get("cc", ""), r.get("cc", "")), "country_code": r.get("cc", "")}
            for r in found]


def reverse(lat: float, lon: float) -> dict:
    """{city, state, country, country_code} of the nearest town of 1000+ people (GeoNames), offline."""
    return reverse_many([(lat, lon)])[0]


# --- suggestions for unlabelled shots ------------------------------------------------------------

def _slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "-", ascii_name).strip("-") or "Unknown"


def _day(utc: datetime, lon: float) -> str:
    """Local calendar day from longitude (solar time); shots before 5 am belong to the evening before,
    as in Asset.event_key."""
    return (utc + timedelta(hours=round(lon / 15)) - timedelta(hours=5)).strftime("%Y-%m-%d")


SUGGESTION_FIELDS = ["day", "label", "known_label", "city", "state", "country", "country_code", "timezone",
                     "lat", "lon", "shots", "first_utc", "last_utc", "first_file", "last_file",
                     "median_error_m", "spread_m"]


def suggest_locations(cfg: Config, store: Store, assets: Iterable[Asset]) -> list[dict]:
    """For shots without a location label, propose one per day and place from their matched fixes,
    with a place-table entry, and write them to state_dir/location-suggestions.csv for review.
    Nothing else is changed: labels go into file names / _index.csv only by the user's hand."""
    picked = []
    for a in assets:
        fix = stored_fix(store, a.id) if not a.location and a.kind != "sequence" else None
        if fix:
            picked.append((a, fix, _utc(fix["utc"])))
    clusters: list[dict] = []
    by_day: dict[str, list[dict]] = defaultdict(list)
    for a, fix, t in sorted(picked, key=lambda x: x[2]):
        day = _day(t, fix["lon"])
        home = next((c for c in by_day[day] if distance_m(c["lat"], c["lon"], fix["lat"], fix["lon"])
                     <= CLUSTER_KM * 1000), None)
        if home is None:
            home = {"day": day, "members": [], "lat": fix["lat"], "lon": fix["lon"]}
            by_day[day].append(home)
            clusters.append(home)
        home["members"].append((a, fix, t))
        n = len(home["members"])
        home["lat"] += (fix["lat"] - home["lat"]) / n
        home["lon"] += (fix["lon"] - home["lon"]) / n

    known = {k: v for k, v in cfg.places.items() if v.get("lat") is not None and v.get("lon") is not None}
    country_names = {v["country_code"]: v["country"] for v in cfg.places.values()
                     if v.get("country_code") and v.get("country")}
    try:
        names = reverse_many((c["lat"], c["lon"]) for c in clusters)
    except GeoUnavailable as e:
        log.warning("geo: %s; suggestions carry coordinates only", e)
        names = [{"city": "", "state": "", "country": "", "country_code": ""} for _ in clusters]

    rows = []
    for c, name in zip(clusters, names):
        lat, lon = round(c["lat"], 5), round(c["lon"], 5)
        near = min(known.items(), key=lambda kv: distance_m(lat, lon, kv[1]["lat"], kv[1]["lon"]), default=None)
        if near and distance_m(lat, lon, near[1]["lat"], near[1]["lon"]) <= NEAR_PLACE_KM * 1000:
            label, place, is_known = near[0], dict(near[1]), True
        else:
            cc = name["country_code"]
            place = {**name, "country": country_names.get(cc, name["country"]), "lat": lat, "lon": lon,
                     "timezone": guess_timezone(lat, lon, cc) if cc else ""}
            label = _slug(name["city"]) if name["city"] else f"Place-{lat:.2f}_{lon:.2f}"
            if label in cfg.places:
                label = f"{label}-{cc or 'new'}"
            is_known = False
        members = c["members"]
        files = sorted(Path(a.preview or a.files[0]).name for a, _, _ in members)
        rows.append({
            "day": c["day"], "label": label, "known_label": "yes" if is_known else "",
            **{k: place.get(k, "") for k in ("city", "state", "country", "country_code", "timezone")},
            "lat": place.get("lat", lat), "lon": place.get("lon", lon), "shots": len(members),
            "first_utc": members[0][2].isoformat(timespec="seconds"),
            "last_utc": members[-1][2].isoformat(timespec="seconds"),
            "first_file": files[0], "last_file": files[-1],
            "median_error_m": round(statistics.median(f["error_m"] for _, f, _ in members)),
            "spread_m": round(max(distance_m(c["lat"], c["lon"], f["lat"], f["lon"]) for _, f, _ in members)),
        })
    rows.sort(key=lambda r: (r["day"], r["first_utc"]))
    out = cfg.state_dir / "location-suggestions.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=SUGGESTION_FIELDS)
        w.writeheader()
        w.writerows(rows)
    log.info("geo: %d location suggestions for %d unlabelled shots -> %s", len(rows), len(picked), out)
    return rows


# --- the stage -----------------------------------------------------------------------------------

def geo_pass(cfg: Config, store: Store, assets: list[Asset], track: list[Fix] | None = None) -> int:
    """Match every shot against the phone's track, store the fixes, refresh the suggestions.
    Returns how many fixes were added or improved. Without a track, one is loaded from the settings
    ([geo] tracks) or the Photos library; a source that can't be read is logged, not fatal."""
    settings = _settings(cfg)
    if track is None:
        try:
            track = load_track(cfg)
        except (GeoUnavailable, PermissionError, FileNotFoundError, ValueError) as e:
            log.warning("geo: no location track: %s", e)
            store.put("jobs", "geo:track", {"error": str(e)})
            return 0
    ensure_table(store)
    results = match(assets, track, cfg, timedelta(minutes=float(settings.get("max_gap_minutes", 30))),
                    _float(settings.get("max_error_m")))
    written = 0
    for a in assets:
        new, old = results.get(a.id), store.get(TABLE, a.id)
        if new is None:
            if old and old.get("precision") == PRECISION and old.get("utc") != _iso(utc_of(a, cfg)):
                store.delete(TABLE, a.id)          # the shot's time changed; the old fix is wrong
            continue
        if old and old.get("utc") == new["utc"] and old.get("error_m", math.inf) <= new["error_m"]:
            continue
        store.put(TABLE, a.id, new)
        written += 1
    log.info("geo: %d of %d shots placed from %d fixes (%d new or better)",
             len(results), len(assets), len(track), written)
    suggest_locations(cfg, store, assets)
    return written


def _iso(t: datetime | None) -> str | None:
    return t.isoformat(timespec="seconds") if t else None
