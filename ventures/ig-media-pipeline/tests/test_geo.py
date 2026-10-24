import csv
import errno
import importlib.util
import json
import math
import shutil
import subprocess
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from igmp import geo, metadata
from igmp.config import Config
from igmp.geo import Fix
from igmp.models import Asset
from igmp.store import Store

UTC = timezone.utc
PLACES = {
    "Harbor": {"city": "Harbor", "state": "Coast", "country": "Nowhere", "country_code": "NW",
               "timezone": "Asia/Kolkata", "lat": 15.0, "lon": 74.0},
    "Mesa-Top": {"city": "Mesa", "state": "Highland", "country": "Elsewhere", "country_code": "XE",
                 "timezone": "America/Chicago", "lat": 35.0, "lon": -95.0},
    "Valley": {"country": "Nowhere", "country_code": "NW", "timezone": "Asia/Kolkata"},      # no coordinates
    "Misc": {"country": "Nowhere"},                                                         # no timezone
}


def cfg(tmp_path, **extra):
    return Config(library_roots=[], output_dir=tmp_path / "out", places=PLACES, extra=extra)


def flat(tmp_path, name="a1", when=datetime(2026, 7, 1, 14, 30), location="Harbor"):     # 09:00 UTC
    f = tmp_path / f"{name}.ARW"
    f.write_bytes(b"raw")
    return Asset(id=name, kind="photo", files=[str(f)], raw=str(f), taken_at=when,
                 date_label=when.strftime("%Y-%m-%d") if when else "", location=location, camera="A7RV")


def utc(*args):
    return datetime(*args, tzinfo=UTC)


# --- track sources -------------------------------------------------------------------------------

def test_csv_track_parses_times_sorts_and_skips_bad_rows(tmp_path):
    p = tmp_path / "track.csv"
    p.write_text("time_utc,lat,lon,accuracy_m\n"
                 "2026-05-18T20:20:00Z,10.5,20.5,8\n"
                 "2026-05-18T22:10:00+02:00,10.1,20.1,\n"       # an offset is honoured
                 "2026-05-18 20:15:00,10.2,20.2,30\n"            # no offset = UTC
                 "1779135120,10.3,20.3,\n"                       # epoch seconds
                 "2026-05-18T20:30:00Z,95,20,\n"                 # impossible latitude
                 ",10,20,\n"                                     # no time
                 "2026-05-18T20:40:00Z,0,0,\n")                  # null island
    track = geo.track_from_csv(p)
    assert [f.time for f in track] == sorted(f.time for f in track)
    assert track[0] == Fix(utc(2026, 5, 18, 20, 10), 10.1, 20.1, None, "csv:track.csv")
    assert track[1] == Fix(utc(2026, 5, 18, 20, 12), 10.3, 20.3, None, "csv:track.csv")
    assert track[2].accuracy_m == 30 and track[2].time == utc(2026, 5, 18, 20, 15)
    assert track[3] == Fix(utc(2026, 5, 18, 20, 20), 10.5, 20.5, 8.0, "csv:track.csv") and len(track) == 4


def test_gpx_track_reads_track_and_route_points_with_time(tmp_path):
    p = tmp_path / "walk.gpx"
    p.write_text("""<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="1.0" lon="2.0"><name>no time, skipped</name></wpt>
  <trk><trkseg>
    <trkpt lat="10.002" lon="20.002"><time>2026-05-18T20:02:00Z</time><hdop>2</hdop></trkpt>
    <trkpt lat="10.001" lon="20.001"><ele>5</ele><time>2026-05-18T20:01:00Z</time></trkpt>
  </trkseg></trk>
  <rte><rtept lat="-10.5" lon="-20.5"><time>2026-05-18T21:30:00+01:00</time></rtept></rte>
</gpx>""")
    track = geo.track_from_gpx(p)
    assert [(f.lat, f.lon) for f in track] == [(10.001, 20.001), (10.002, 20.002), (-10.5, -20.5)]
    assert track[0].accuracy_m is None and track[1].accuracy_m == 10.0
    assert track[2].time == utc(2026, 5, 18, 20, 30) and track[0].source == "gpx:walk.gpx"


def test_takeout_records_json(tmp_path):
    p = tmp_path / "Records.json"
    p.write_text(json.dumps({"locations": [
        {"latitudeE7": 105000000, "longitudeE7": -205000000, "accuracy": 12, "timestamp": "2026-05-18T20:00:00.123Z"},
        {"latitudeE7": 106000000, "longitudeE7": -206000000, "timestampMs": "1779134700000"},
    ]}))
    track = geo.track_from_takeout(p)
    assert (track[0].lat, track[0].lon, track[0].accuracy_m) == (10.5, -20.5, 12)
    assert track[1].time == utc(2026, 5, 18, 20, 5)


def test_takeout_device_exports_paths_and_visits(tmp_path):
    android = tmp_path / "Timeline.json"
    android.write_text(json.dumps({
        "semanticSegments": [
            {"startTime": "2026-05-18T22:00:00.000+02:00", "endTime": "2026-05-18T22:30:00.000+02:00",
             "visit": {"topCandidate": {"placeLocation": {"latLng": "10.5°, 20.5°"}}}},
            {"startTime": "2026-05-18T22:30:00.000+02:00", "endTime": "2026-05-18T23:00:00.000+02:00",
             "timelinePath": [{"point": "10.6°, 20.6°", "time": "2026-05-18T22:40:00.000+02:00"}]},
        ],
        "rawSignals": [{"position": {"LatLng": "10.7°, 20.7°", "accuracyMeters": 9,
                                     "timestamp": "2026-05-18T21:30:00.000Z"}}],
    }))
    track = geo.track_from_takeout(android)
    visit = [f for f in track if (f.lat, f.lon) == (10.5, 20.5)]
    assert [f.time for f in visit] == [utc(2026, 5, 18, 20, m) for m in (0, 10, 20, 30)]
    assert visit[0].accuracy_m == geo.VISIT_ACCURACY_M
    assert Fix(utc(2026, 5, 18, 20, 40), 10.6, 20.6, None, "takeout:Timeline.json") in track
    assert any(f.lat == 10.7 and f.accuracy_m == 9 for f in track)

    ios = tmp_path / "location-history.json"
    ios.write_text(json.dumps([
        {"startTime": "2026-05-18T22:00:00.000+02:00", "endTime": "2026-05-18T22:20:00.000+02:00",
         "activity": {"start": "geo:10.100000,20.100000", "end": "geo:10.200000,20.200000"}},
        {"startTime": "2026-05-18T22:20:00.000+02:00", "endTime": "2026-05-18T23:20:00.000+02:00",
         "timelinePath": [{"point": "geo:10.300000,20.300000", "durationMinutesOffsetFromStartTime": "15"}]},
    ]))
    track = geo.track_from_takeout(ios)
    assert [(f.time, f.lat) for f in track] == [(utc(2026, 5, 18, 20, 0), 10.1), (utc(2026, 5, 18, 20, 20), 10.2),
                                               (utc(2026, 5, 18, 20, 35), 10.3)]


def test_exif_record_time_preference():
    base = {"SourceFile": "/x/IMG_0001.HEIC", "GPSLatitude": -12.5, "GPSLongitude": -45.25}
    gps_clock = geo._exif_fix({**base, "GPSDateTime": "2026:05:18 20:16:14Z", "DateTimeOriginal": "2026:05:18 22:16:15",
                               "OffsetTimeOriginal": "+02:00", "GPSHPositioningError": 4.7})
    assert gps_clock == Fix(utc(2026, 5, 18, 20, 16, 14), -12.5, -45.25, 4.7, "photo:IMG_0001.HEIC")
    with_offset = geo._exif_fix({**base, "DateTimeOriginal": "2026:05:18 22:16:15", "OffsetTimeOriginal": "+02:00"})
    assert with_offset.time == utc(2026, 5, 18, 20, 16, 15)
    assert geo._exif_fix({**base, "DateTimeOriginal": "2026:05:18 22:16:15"}) is None      # local, zone unknown
    mov = {"SourceFile": "/x/IMG_0002.MOV", "GPSLatitude": 1.5, "GPSLongitude": 2.5}
    assert geo._exif_fix({**mov, "CreationDate": "2026:05:18 22:20:00+02:00", "CreateDate": "2026:05:18 20:21:00",
                          "LocationAccuracyHorizontal": 8.5}) == Fix(utc(2026, 5, 18, 20, 20), 1.5, 2.5, 8.5,
                                                                    "photo:IMG_0002.MOV")
    assert geo._exif_fix({**mov, "CreateDate": "2026:05:18 20:21:00"}).time == utc(2026, 5, 18, 20, 21)
    assert geo._exif_fix({**mov, "CreateDate": "0000:00:00 00:00:00"}) is None
    assert geo._exif_fix({"SourceFile": "a.jpg", "GPSDateTime": "2026:05:18 20:16:14Z"}) is None


@pytest.mark.skipif(shutil.which("exiftool") is None, reason="exiftool not installed")
def test_folder_track_reads_exported_phone_media(tmp_path):
    from PIL import Image
    folder = tmp_path / "export"
    (folder / "sub").mkdir(parents=True)
    a, b, c = folder / "IMG_0001.JPG", folder / "sub" / "IMG_0002.JPG", folder / "IMG_0003.JPG"
    for p in (a, b, c):
        Image.new("RGB", (8, 8)).save(p)
    run = lambda *args: subprocess.run(["exiftool", "-q", "-overwrite_original", *args], check=True)
    run("-GPSLatitude=12.5", "-GPSLatitudeRef=S", "-GPSLongitude=45.25", "-GPSLongitudeRef=W",
        "-GPSDateStamp=2026:05:18", "-GPSTimeStamp=20:16:14", "-GPSHPositioningError=4.7", str(a))
    run("-GPSLatitude=10", "-GPSLatitudeRef=N", "-GPSLongitude=20", "-GPSLongitudeRef=E",
        "-DateTimeOriginal=2026:05:18 22:30:00", "-OffsetTimeOriginal=+02:00", str(b))
    run("-DateTimeOriginal=2026:05:18 22:30:00", str(c))                # no GPS: not a fix
    (folder / "notes.txt").write_text("ignored")
    track = geo.track_from_folder(folder)
    assert track == [Fix(utc(2026, 5, 18, 20, 16, 14), -12.5, -45.25, 4.7, "photo:IMG_0001.JPG"),
                     Fix(utc(2026, 5, 18, 20, 30), 10.0, 20.0, None, "photo:IMG_0002.JPG")]
    if shutil.which("ffmpeg"):
        mov = folder / "IMG_0004.MOV"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.2",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(mov)], check=True)
        run("-Keys:GPSCoordinates=1.5, 2.5, 100", "-Keys:CreationDate=2026:05:18 22:40:00+02:00",
            "-Keys:LocationAccuracyHorizontal=8.5", str(mov))
        assert Fix(utc(2026, 5, 18, 20, 40), 1.5, 2.5, 8.5, "photo:IMG_0004.MOV") in geo.track_from_folder(folder)


def test_empty_folder_is_an_empty_track(tmp_path):
    if shutil.which("exiftool") is None:
        pytest.skip("exiftool not installed")
    assert geo.track_from_folder(tmp_path) == []


# --- Apple Photos (mocked: the real library needs Full Disk Access) -------------------------------

class FakePhoto:
    def __init__(self, uuid, date, location, intrash=False, shared=False, make="Apple"):
        self.uuid, self.date, self.location = uuid, date, location
        self.latitude, self.longitude = location
        self.intrash, self.shared = intrash, shared
        self.exif_info = types.SimpleNamespace(camera_make=make)


def fake_osxphotos(monkeypatch, photos=(), error=None):
    module = types.ModuleType("osxphotos")
    calls = {}

    class PhotosDB:
        def __init__(self, dbfile=None):
            calls["dbfile"] = dbfile
            if error:
                raise error

        def photos(self, images=True, movies=True, intrash=False):
            calls["photos"] = (images, movies, intrash)
            return list(photos)

    module.PhotosDB = PhotosDB
    monkeypatch.setitem(sys.modules, "osxphotos", module)
    return calls


def library(tmp_path):
    lib = tmp_path / "Photos Library.photoslibrary"
    (lib / "database").mkdir(parents=True)
    (lib / "database" / "Photos.sqlite").write_bytes(b"")
    return lib


def test_photos_track_keeps_own_located_media(tmp_path, monkeypatch):
    plus2 = timezone(timedelta(hours=2))
    calls = fake_osxphotos(monkeypatch, [
        FakePhoto("b", datetime(2026, 5, 18, 22, 30, tzinfo=plus2), (10.2, 20.2)),
        FakePhoto("a", datetime(2026, 5, 18, 22, 10, tzinfo=plus2), (10.1, 20.1), make=None),
        FakePhoto("trash", datetime(2026, 5, 18, 22, 0, tzinfo=plus2), (1.0, 1.0), intrash=True),
        FakePhoto("shared", datetime(2026, 5, 18, 22, 0, tzinfo=plus2), (1.0, 1.0), shared=True),
        FakePhoto("nowhere", datetime(2026, 5, 18, 22, 0, tzinfo=plus2), (None, None)),
        FakePhoto("undated", datetime(1970, 1, 1, tzinfo=UTC), (1.0, 1.0)),
        FakePhoto("sony", datetime(2026, 5, 18, 22, 0, tzinfo=plus2), (1.0, 1.0), make="SONY"),
    ])
    lib = library(tmp_path)
    track = geo.track_from_photos_library(lib)
    assert calls["dbfile"] == str(lib) and calls["photos"] == (True, True, False)
    assert track == [Fix(utc(2026, 5, 18, 20, 10), 10.1, 20.1, None, "photos:a"),
                     Fix(utc(2026, 5, 18, 20, 30), 10.2, 20.2, None, "photos:b")]
    assert len(geo.track_from_photos_library(lib, apple_only=False)) == 3


def test_photos_without_osxphotos_says_how_to_install(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "osxphotos", None)
    with pytest.raises(geo.GeoUnavailable, match=r"igmp\[geo\]"):
        geo.track_from_photos_library(library(tmp_path))


def test_photos_privacy_block_on_first_read_names_the_setting(tmp_path, monkeypatch):
    calls = fake_osxphotos(monkeypatch)
    lib = library(tmp_path)
    real_open = Path.open

    def blocked(self, *args, **kw):
        if self.name == "Photos.sqlite":
            raise PermissionError(errno.EPERM, "Operation not permitted", str(self))
        return real_open(self, *args, **kw)

    monkeypatch.setattr(Path, "open", blocked)
    with pytest.raises(geo.PhotosAccessError) as e:
        geo.track_from_photos_library(lib)
    assert "Full Disk Access" in str(e.value) and "Privacy & Security" in str(e.value)
    assert "Operation not permitted" in str(e.value) and "dbfile" not in calls   # osxphotos never tried


def test_photos_privacy_block_inside_osxphotos_is_recognised(tmp_path, monkeypatch):
    lib = library(tmp_path)
    db = lib / "database" / "Photos.sqlite"
    inner = PermissionError(errno.EPERM, "Operation not permitted", str(db))
    mid = OSError(f"Error copying {db} to /tmp/x: {inner}")
    mid.__cause__ = inner
    outer = OSError(f"Error copying{db} to /tmp/x")       # what osxphotos raises
    outer.__cause__ = mid
    fake_osxphotos(monkeypatch, error=outer)
    with pytest.raises(geo.PhotosAccessError, match="Full Disk Access") as e:
        geo.track_from_photos_library(lib)
    assert isinstance(e.value, PermissionError) and e.value.__cause__ is outer


def test_photos_other_errors_pass_through(tmp_path, monkeypatch):
    fake_osxphotos(monkeypatch, error=OSError("database is malformed"))
    with pytest.raises(OSError, match="malformed") as e:
        geo.track_from_photos_library(library(tmp_path))
    assert not isinstance(e.value, geo.PhotosAccessError)
    with pytest.raises(FileNotFoundError):
        geo.track_from_photos_library(tmp_path / "missing.photoslibrary")


# --- utc_of --------------------------------------------------------------------------------------

def test_utc_of_uses_the_place_timezone_with_dst(tmp_path):
    c = cfg(tmp_path)
    assert geo.utc_of(flat(tmp_path), c) == utc(2026, 7, 1, 9, 0)                    # +05:30
    assert geo.utc_of(flat(tmp_path, when=datetime(2026, 7, 1, 12, 0), location="Mesa-Top"), c) == utc(2026, 7, 1, 17)
    assert geo.utc_of(flat(tmp_path, when=datetime(2026, 1, 5, 12, 0), location="Mesa-Top"), c) == utc(2026, 1, 5, 18)
    assert geo.utc_of(flat(tmp_path, location="Misc"), c) is None          # place without a timezone
    assert geo.utc_of(flat(tmp_path, location=""), c) is None
    assert geo.utc_of(flat(tmp_path, when=None), c) is None


INDEX = ("file,from_folder,kind,local_date,local_time,utc_offset,location,event,note\n"
         "IMG_20260518_221614_00_009.insp,Camera01,insp,,,,,,camera on UTC+2; UTC 2026-05-18 20:16:14; location pending\n"
         "IMG_20260518_221614_00_009.dng,Camera01,dng,,,,,,camera on UTC+2; UTC 2026-05-18 20:16:14; location pending\n"
         "VID_20261004_133938_00_001.insv,Camera04,insv,2026-10-04,13:39:38,-6,Ridge,Trip,\n"
         "VID_20261005_100000_00_002.insv,Camera04,insv,2026-10-05,10:00:00,-6,Mesa-Top,,"
         "camera clock reset; setup, exact time unknown\n"
         "VID_20261006_100000_00_003.insv,Camera04,insv,2026-10-06,10:00:00,-6,Mesa-Top,,\n")


def insta(tmp_path, *names, location="", when=None, aid=None):
    folder = tmp_path / "Insta360"
    folder.mkdir(exist_ok=True)
    if not (folder / "_index.csv").exists():
        (folder / "_index.csv").write_text(INDEX)
    for n in names:
        (folder / n).write_bytes(b"x")
    kind = "photo360" if names[0].startswith("IMG") else "video360"
    return Asset(id=aid or names[0][:30], kind=kind, files=[str(folder / n) for n in names], preview=str(folder / names[0]),
                 taken_at=when, location=location, camera="X5")


def test_utc_of_insta360_reads_the_index_without_changing_it(tmp_path):
    c = cfg(tmp_path)
    pending = insta(tmp_path, "IMG_20260518_221614_00_009.dng", "IMG_20260518_221614_00_009.insp")
    assert geo.utc_of(pending, c) == utc(2026, 5, 18, 20, 16, 14)
    unknown_place = insta(tmp_path, "VID_20261004_133938_00_001.insv", location="Ridge",
                          when=datetime(2026, 10, 4, 13, 39, 38))
    assert geo.utc_of(unknown_place, c) == utc(2026, 10, 4, 19, 39, 38)          # the index's utc_offset
    clock_reset = insta(tmp_path, "VID_20261005_100000_00_002.insv", location="Mesa-Top",
                        when=datetime(2026, 10, 5, 10, 0))
    assert geo.utc_of(clock_reset, c) is None
    placed = insta(tmp_path, "VID_20261006_100000_00_003.insv", location="Mesa-Top", when=datetime(2026, 10, 6, 10, 0))
    assert geo.utc_of(placed, c) == utc(2026, 10, 6, 15, 0)
    stray = insta(tmp_path, "IMG_20260601_101010_00_100.insp")
    assert geo.utc_of(stray, c) is None
    assert (tmp_path / "Insta360" / "_index.csv").read_text() == INDEX


# --- matching ------------------------------------------------------------------------------------

def track_two(minutes_apart=10, metres_apart=1000.0, acc=None):
    t0 = utc(2026, 7, 1, 8, 55)
    dlat = metres_apart / 111_195.0
    return [Fix(t0, 15.0, 74.0, acc, "p0"), Fix(t0 + timedelta(minutes=minutes_apart), 15.0 + dlat, 74.0, acc, "p1")]


def test_interpolates_between_bracketing_fixes(tmp_path):
    c = cfg(tmp_path)
    a = flat(tmp_path)                                                         # 09:00 UTC, midway
    r = geo.match([a], track_two(), c)["a1"]
    assert r["method"] == "interpolated" and r["precision"] == "phone-match"
    assert r["lat"] == pytest.approx(15.0 + 500 / 111_195.0, abs=1e-6) and r["lon"] == 74.0
    assert r["error_m"] == pytest.approx(math.sqrt(15 ** 2 + 500 ** 2 + (0.3 * 150) ** 2), abs=0.1)
    assert r["sources"] == ["p0", "p1"] and r["gap_s"] == 300 and r["fixes_apart_m"] == 1000
    assert r["utc"] == "2026-07-01T09:00:00+00:00"


def test_error_grows_with_gap_and_with_distance(tmp_path):
    c = cfg(tmp_path)
    a = [flat(tmp_path)]
    err = lambda **kw: geo.match(a, track_two(**kw), c)["a1"]["error_m"]
    assert err(metres_apart=50) < err(metres_apart=500) < err(metres_apart=1500)
    assert err(minutes_apart=10, metres_apart=0) < err(minutes_apart=30, metres_apart=0) < err(minutes_apart=50, metres_apart=0)
    assert err(metres_apart=0, acc=5.0) < err(metres_apart=0)                  # stated accuracy is used


def test_error_shrinks_towards_a_fix(tmp_path):
    c = cfg(tmp_path)
    near = flat(tmp_path, "near", when=datetime(2026, 7, 1, 14, 26))           # 1 min after the first fix
    mid = flat(tmp_path, "mid")
    r = geo.match([near, mid], track_two(), c)
    assert r["near"]["error_m"] < r["mid"]["error_m"]
    assert r["near"]["lat"] == pytest.approx(15.0 + 100 / 111_195.0, abs=1e-6)


def test_nearest_fix_when_one_side_is_too_far(tmp_path):
    c = cfg(tmp_path)
    t = utc(2026, 7, 1, 9, 0)
    track = [Fix(t - timedelta(minutes=10), 15.0, 74.0, 5.0, "close"), Fix(t + timedelta(minutes=45), 16.0, 75.0)]
    r = geo.match([flat(tmp_path)], track, c)["a1"]
    assert (r["method"], r["lat"], r["lon"], r["sources"]) == ("nearest", 15.0, 74.0, ["close"])
    assert r["error_m"] == pytest.approx(math.sqrt(5 ** 2 + (0.3 * 600) ** 2), abs=0.1)
    # beyond max_gap / 2 on both sides: skipped
    far = [Fix(t - timedelta(minutes=20), 15.0, 74.0), Fix(t + timedelta(minutes=45), 15.001, 74.0)]
    assert geo.match([flat(tmp_path)], far, c) == {}
    # only one fix, after the shot, within max_gap / 2
    assert geo.match([flat(tmp_path)], [Fix(t + timedelta(minutes=14), 1.0, 2.0)], c)["a1"]["lat"] == 1.0
    # a wider max_gap admits more
    assert geo.match([flat(tmp_path)], far, c, max_gap=timedelta(hours=1))["a1"]["method"] == "interpolated"


def test_exact_hit_has_only_the_fix_accuracy(tmp_path):
    t = utc(2026, 7, 1, 9, 0)
    track = [Fix(t - timedelta(minutes=5), 0.5, 0.5), Fix(t, 15.0, 74.0, 7.0), Fix(t + timedelta(minutes=5), 1.0, 1.0)]
    r = geo.match([flat(tmp_path)], track, cfg(tmp_path))["a1"]
    assert (r["method"], r["lat"], r["error_m"], r["gap_s"]) == ("nearest", 15.0, 7.0, 0)


def test_interpolation_crosses_the_antimeridian_the_short_way(tmp_path):
    t = utc(2026, 7, 1, 9, 0)
    track = [Fix(t - timedelta(minutes=5), -17.0, 179.9), Fix(t + timedelta(minutes=5), -17.0, -179.9)]
    r = geo.locate(t, track)
    assert abs(abs(r["lon"]) - 180.0) < 1e-6 and r["fixes_apart_m"] < 25_000


def test_unplaceable_shots_and_coarse_matches_are_skipped(tmp_path):
    c = cfg(tmp_path)
    shots = [flat(tmp_path, "untimed", when=None), flat(tmp_path, "nozone", location="Misc"),
             flat(tmp_path, "ok")]
    assert set(geo.match(shots, track_two(), c)) == {"ok"}
    assert geo.match(shots, track_two(metres_apart=10_000), c) == {}             # ~5 km error > 2 km
    assert set(geo.match(shots, track_two(metres_apart=10_000), c, max_error_m=10_000)) == {"ok"}
    assert geo.match(shots, [], c) == {}


# --- the store, the stage and the sidecars ---------------------------------------------------------

def test_geo_pass_stores_fixes_and_only_rewrites_better_ones(tmp_path):
    c = cfg(tmp_path)
    store = Store(c.db_path)
    a = flat(tmp_path)
    assert geo.stored_fix(store, "a1") is None                                 # no table yet: no error
    assert geo.geo_pass(c, store, [a], track_two()) == 1
    first = store.get("geo", "a1")
    assert first["method"] == "interpolated" and geo.stored_fix(store, "a1") == first
    assert geo.geo_pass(c, store, [a], track_two()) == 0                       # unchanged: nothing written
    exact = [Fix(utc(2026, 7, 1, 9, 0), 15.001, 74.001, 5.0, "exact")]
    assert geo.geo_pass(c, store, [a], exact) == 1 and store.get("geo", "a1")["error_m"] == 5.0
    assert geo.geo_pass(c, store, [a], track_two()) == 0                       # a worse match doesn't replace it
    moved = a.model_copy(update={"taken_at": datetime(2026, 7, 1, 20, 0)})      # time corrected, no fix then
    assert geo.geo_pass(c, store, [moved], track_two()) == 0 and store.get("geo", "a1") is None


def test_geo_pass_loads_the_track_from_settings(tmp_path):
    p = tmp_path / "phone.csv"
    p.write_text("time_utc,lat,lon\n2026-07-01T08:55:00Z,15.0,74.0\n2026-07-01T09:05:00Z,15.01,74.0\n")
    c = cfg(tmp_path, geo={"tracks": [str(p)], "max_gap_minutes": 30})
    store = Store(c.db_path)
    assert geo.geo_pass(c, store, [flat(tmp_path)]) == 1
    assert store.get("geo", "a1")["lat"] == pytest.approx(15.005)


def test_geo_pass_without_photos_access_logs_and_continues(tmp_path, monkeypatch):
    def denied(path=None):
        raise geo.PhotosAccessError("can't read the Photos library ... Full Disk Access")

    monkeypatch.setattr(geo, "track_from_photos_library", denied)
    c = cfg(tmp_path)
    store = Store(c.db_path)
    assert geo.geo_pass(c, store, [flat(tmp_path)]) == 0
    assert "Full Disk Access" in store.get("jobs", "geo:track")["error"]


def test_phone_fix_overrides_city_coordinates_in_metadata(tmp_path):
    c = cfg(tmp_path)
    a = flat(tmp_path)
    city = metadata.fields(a, c, None, None, None, [])
    assert city["igmp:GPSPrecision"] == "city" and city["exif:GPSLatitude"] == "15,0.0000N"
    fix = {"lat": -12.5, "lon": -45.25, "error_m": 42.3, "precision": "phone-match"}
    f = metadata.fields(a, c, None, None, None, [], fix)
    assert f["exif:GPSLatitude"] == "12,30.0000S" and f["exif:GPSLongitude"] == "45,15.0000W"
    assert f["igmp:GPSPrecision"] == "phone-match" and f["igmp:GPSErrorM"] == 42.3
    assert f["photoshop:City"] == "Harbor"                                     # the place names stay
    unlabelled = metadata.fields(flat(tmp_path, location=""), c, None, None, None, [], fix)
    assert unlabelled["igmp:GPSPrecision"] == "phone-match" and "photoshop:City" not in unlabelled


def test_tag_all_writes_the_phone_fix_into_the_sidecar(tmp_path):
    c = cfg(tmp_path)
    store = Store(c.db_path)
    a = flat(tmp_path)
    assert metadata.tag_all(c, store, [a]) == 1                                # no geo table yet
    assert "<igmp:GPSPrecision>city</igmp:GPSPrecision>" in metadata.sidecar_path(a).read_text()
    geo.geo_pass(c, store, [a], track_two())
    assert metadata.tag_all(c, store, [a]) == 1                                # the new fix changes the digest
    text = metadata.sidecar_path(a).read_text()
    assert "<igmp:GPSPrecision>phone-match</igmp:GPSPrecision>" in text and "<igmp:GPSErrorM>" in text


# --- reverse geocoding and suggestions -----------------------------------------------------------

def fake_reverse(monkeypatch):
    def reverse_many(points):
        out = []
        for lat, lon in points:
            if lat < 0:
                out.append({"city": "Pêcheur Bay", "state": "Plains", "country": "South Africa", "country_code": "ZA"})
            else:
                out.append({"city": "Harbor Point", "state": "Coast", "country": "Faraway", "country_code": "NW"})
        return out
    monkeypatch.setattr(geo, "reverse_many", reverse_many)


def test_suggestions_group_unlabelled_shots_per_day_and_place(tmp_path, monkeypatch):
    fake_reverse(monkeypatch)
    c = cfg(tmp_path)
    store = Store(c.db_path)
    geo.ensure_table(store)
    shots = {
        "d1a": (utc(2026, 5, 18, 9, 0), 15.05, 74.02, "IMG_20260518_120000_00_001.insp"),   # near Harbor
        "d1b": (utc(2026, 5, 18, 10, 0), 15.06, 74.03, "IMG_20260518_130000_00_002.insp"),
        "d1c": (utc(2026, 5, 18, 23, 0), 15.06, 74.03, "IMG_20260519_040000_00_003.insp"),  # 4 am: same evening
        "d2a": (utc(2026, 5, 20, 9, 0), -33.0, 14.0, "IMG_20260520_100000_00_004.insp"),    # far from any place
        "d2b": (utc(2026, 5, 20, 9, 30), -33.01, 14.01, "IMG_20260520_103000_00_005.insp"),
        "d2c": (utc(2026, 5, 20, 15, 0), -34.0, 15.0, "IMG_20260520_160000_00_006.insp"),   # 140 km on: a second place
    }
    assets = []
    for aid, (t, lat, lon, name) in shots.items():
        assets.append(Asset(id=aid, kind="photo360", files=[f"/cam/{name}"], preview=f"/cam/{name}", camera="X5"))
        store.put("geo", aid, {"lat": lat, "lon": lon, "error_m": 30.0, "utc": t.isoformat(),
                               "precision": "phone-match"})
    labelled = flat(tmp_path, "lab")
    store.put("geo", "lab", {"lat": 15.0, "lon": 74.0, "error_m": 5.0, "utc": "2026-05-18T09:00:00+00:00"})
    rows = geo.suggest_locations(c, store, assets + [labelled])
    assert [(r["day"], r["label"], r["shots"]) for r in rows] == [
        ("2026-05-18", "Harbor", 3), ("2026-05-20", "Pecheur-Bay", 2), ("2026-05-20", "Pecheur-Bay", 1)]
    harbor, new = rows[0], rows[1]
    assert harbor["known_label"] == "yes" and (harbor["lat"], harbor["timezone"]) == (15.0, "Asia/Kolkata")
    assert harbor["first_file"] == "IMG_20260518_120000_00_001.insp" and harbor["last_file"].endswith("_003.insp")
    assert new["known_label"] == "" and new["city"] == "Pêcheur Bay" and new["country_code"] == "ZA"
    assert new["timezone"] == "Africa/Johannesburg" and new["median_error_m"] == 30 and new["spread_m"] < 1000
    with (c.state_dir / "location-suggestions.csv").open() as fh:
        written = list(csv.DictReader(fh))
    assert [r["label"] for r in written] == ["Harbor", "Pecheur-Bay", "Pecheur-Bay"]
    assert written[0].keys() >= {"day", "label", "city", "state", "country", "country_code", "timezone", "lat", "lon"}


def test_suggestions_reuse_the_users_country_names(tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "reverse_many", lambda pts: [
        {"city": "Far Cove", "state": "", "country": "Faraway", "country_code": "NW"} for _ in pts])
    c = cfg(tmp_path)
    store = Store(c.db_path)
    geo.ensure_table(store)
    a = Asset(id="x", kind="photo360", files=["/cam/IMG_1.insp"], camera="X5")
    store.put("geo", "x", {"lat": 45.0, "lon": 35.0, "error_m": 9.0, "utc": "2026-06-02T09:00:00+00:00"})
    (row,) = geo.suggest_locations(c, store, [a])
    assert (row["label"], row["country"], row["known_label"]) == ("Far-Cove", "Nowhere", "")


def test_suggestions_without_a_geocoder_keep_coordinates(tmp_path, monkeypatch):
    def missing(points):
        raise geo.GeoUnavailable("no reverse_geocoder")
    monkeypatch.setattr(geo, "reverse_many", missing)
    c = cfg(tmp_path)
    store = Store(c.db_path)
    geo.ensure_table(store)
    store.put("geo", "x", {"lat": -33.0, "lon": 14.0, "error_m": 9.0, "utc": "2026-06-02T09:00:00+00:00"})
    (row,) = geo.suggest_locations(c, store, [Asset(id="x", kind="photo360", files=["/cam/a.insp"])])
    assert row["label"] == "Place--33.00_14.00" and row["lat"] == -33.0 and row["city"] == ""


@pytest.mark.skipif(importlib.util.find_spec("reverse_geocoder") is None, reason="reverse_geocoder not installed")
def test_reverse_is_offline_and_complete():
    r = geo.reverse(48.8566, 2.3522)
    assert r["city"] == "Paris" and r["country_code"] == "FR" and r["state"]
    assert r["country"] in ("France", "FR")
    assert geo.reverse_many([]) == []


def test_timezone_guess_uses_the_nearest_zone_of_the_country():
    if not geo._zones():
        pytest.skip("no tzdata zone.tab")
    assert geo.guess_timezone(-31.9, 115.9, "AU") == "Australia/Perth"
    assert geo.guess_timezone(-33.9, 151.2, "au") == "Australia/Sydney"
    assert geo.guess_timezone(15.0, 74.0, "XX") == ""


def test_track_from_picks_the_reader(tmp_path):
    p = tmp_path / "t.csv"
    p.write_text("time_utc,lat,lon\n2026-07-01T09:00:00Z,1,2\n")
    assert geo.track_from(p)[0].lat == 1.0
    with pytest.raises(ValueError):
        geo.track_from(tmp_path / "t.kml")
