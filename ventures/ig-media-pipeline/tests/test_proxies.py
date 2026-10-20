import json
import os
import subprocess
import sys
import types
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import proxies, reels
from igmp.config import Config
from igmp.models import Asset, Point, Score
from igmp.store import Store


def cfg(tmp_path, **extra):
    return Config(library_roots=[], output_dir=tmp_path / "out",
                  extra={"state_dir": str(tmp_path / "state"), "proxy_preset": "ultrafast", **extra})


def score(s=7.0, keep=True, role="moment"):
    return Score(score=s, keep=keep, role=role, subject="x", mood="calm",
                 vertical_focus=Point(x=0.5, y=0.5), feed_focus=Point(x=0.5, y=0.5))


def photo(i, path, kind="photo", raw=None, event="Mesa"):
    return Asset(id=f"p{i:02d}", kind=kind, files=[str(path)], preview=str(path) if path else None, raw=raw,
                 date_label="2026-10-03", location="Boulder", event=event)


def ffprobe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                         capture_output=True, check=True).stdout
    return json.loads(out)


def lavfi_video(path, size, seconds=0.5, streams=1, audio=True):
    args = ["ffmpeg", "-nostdin", "-v", "error", "-y"]
    for _ in range(streams):
        args += ["-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration={seconds}"]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    for k in range(streams):
        args += ["-map", f"{k}:v"]
    if audio:
        args += ["-map", f"{streams}:a", "-c:a", "aac"]
    args += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-f", "mp4", str(path)]
    subprocess.run(args, check=True)
    return path


# --------------------------------------------------------------------------- sizing

def test_still_long_edge_holds_a_zoomed_reel_crop():
    assert proxies.still_long_edge(6000, 4000) == 3629          # 3:2: 1920 * 1.2 * 1.5 * 1.05
    assert proxies.still_long_edge(4000, 6000) == 2420          # 2:3 portrait: full height crop
    assert proxies.still_long_edge(1600, 4000) == 3402          # taller than 9:16: full width crop
    assert proxies.still_long_edge(1200, 800) == 1200           # never upscaled
    for w, h in [(6000, 4000), (4000, 6000), (8000, 4500), (2000, 4000), (5000, 5000)]:
        n = proxies.still_long_edge(w, h)
        s = n / max(w, h)
        cw, ch = (h * s * 9 / 16, h * s) if w / h > 9 / 16 else (w * s, w * s * 16 / 9)
        assert cw >= 1080 * 1.2 and ch >= 1920 * 1.2            # the 9:16 crop at 1.2x zoom


def test_still_proxy_is_upright_srgb_and_sized(tmp_path):
    src = tmp_path / "shot.jpg"
    img = Image.new("RGB", (4000, 2000), (0, 0, 255))
    img.paste((255, 0, 0), (0, 0, 2000, 2000))                   # stored left half red
    exif = Image.Exif()
    exif[0x0112] = 6                                             # shown rotated 90 deg clockwise
    img.save(src, quality=90, exif=exif)
    dest = tmp_path / "p.jpg"
    proxies.make_still(src, dest)
    with Image.open(dest) as im:
        assert im.size == (1361, 2722) and im.getexif().get(0x0112) in (None, 1)
        top, bottom = im.getpixel((680, 100)), im.getpixel((680, 2600))
    assert top[0] > 200 and top[2] < 60 and bottom[2] > 200     # stored left is now on top


def test_raw_only_still_is_developed_like_reels(tmp_path, monkeypatch):
    seen = {}

    class Raw:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def postprocess(self, **kw):
            seen.update(kw)
            return np.full((3168, 4752, 3), 128, np.uint8)

    monkeypatch.setitem(sys.modules, "rawpy", types.SimpleNamespace(imread=lambda p: Raw()))
    src = tmp_path / "a.ARW"
    src.write_bytes(b"raw")
    dest = tmp_path / "a.jpg"
    proxies.make_raw(src, dest)
    assert seen == {"use_camera_wb": True, "half_size": True, "output_bps": 8}
    assert Image.open(dest).size == (3629, 2419)


def test_flat_video_proxy(tmp_path):
    src = lavfi_video(tmp_path / "clip.mp4", "2560x1440")
    dest = tmp_path / "clip.proxy.mp4"
    proxies.make_video(src, dest, "video", cfg(tmp_path))
    info = ffprobe(dest)
    v = [s for s in info["streams"] if s["codec_type"] == "video"]
    a = [s for s in info["streams"] if s["codec_type"] == "audio"]
    assert len(v) == 1 and (v[0]["width"], v[0]["height"]) == (1920, 1080) and v[0]["codec_name"] == "h264"
    assert v[0]["pix_fmt"] == "yuv420p" and v[0]["avg_frame_rate"] == "30/1" and a
    assert abs(float(info["format"]["duration"]) - 0.5) < 0.1


def test_360_video_proxy_keeps_both_lenses_and_the_insv_name(tmp_path):
    from igmp import render
    src = lavfi_video(tmp_path / "VID_20260516_002404_00_198.insv", "2400x2400", streams=2)
    c = cfg(tmp_path)
    job = proxies.Job("v1", "video360", str(src), proxies._rel("v1", "video360"))
    entry = proxies.make(job, c)
    dest = c.proxy_dir / entry["proxy"]
    assert dest.suffix == ".insv"
    v = [s for s in ffprobe(dest)["streams"] if s["codec_type"] == "video"]
    assert [(s["width"], s["height"]) for s in v] == [(1920, 1920), (1920, 1920)]
    info = render.probe_media(str(dest), c)
    assert info["video_streams"] == 2 and render._projection(str(dest), info, None) == "dfisheye"


def test_video_args_scale_a_single_stream_360_to_3840(tmp_path):
    args = proxies.video_args(Path("a.insv"), Path("b.insv"), "video360", cfg(tmp_path), streams=1)
    assert "min(3840,iw)" in args[args.index("-vf") + 1] and args[-2:] == ["mp4", "b.insv"]


# --------------------------------------------------------------------------- staging

def library(tmp_path, n=4):
    lib = tmp_path / "lib"
    lib.mkdir()
    assets = []
    for i in range(n):
        p = lib / f"shot{i}.jpg"
        Image.new("RGB", (600, 400), (40 * i, 80, 120)).save(p)
        assets.append(photo(i, p))
    insp = lib / "IMG_20260516_002404_00_198.insp"
    Image.new("RGB", (800, 400), (9, 9, 9)).save(insp, "JPEG")
    assets.append(photo(9, insp, kind="photo360"))
    return lib, assets


def test_stage_is_incremental_and_resumable(tmp_path):
    c = cfg(tmp_path)
    store = Store(c.db_path)
    lib, assets = library(tmp_path)
    for a in assets:
        store.put("assets", a.id, a)
        store.put("scores", a.id, score())
    dropped = photo(7, lib / "skip.jpg")
    Image.new("RGB", (60, 40)).save(lib / "skip.jpg")
    store.put("scores", dropped.id, score(keep=False))
    edit_full = tmp_path / "out" / "photos" / "p00.jpg"
    edit_full.parent.mkdir(parents=True)
    Image.new("RGB", (500, 400)).save(edit_full)
    store.put("edits", "p00", {"status": "shipped", "full": str(edit_full)})
    everything = [*assets, dropped]

    keys = {j.key: j for j in proxies.jobs(store, everything)}
    assert set(keys) == {"p00", "p01", "p02", "p03", "p09", "edit:p00"}       # keepers only, plus the edit
    assert keys["p09"].recipe == "insp" and keys["p09"].rel.endswith(".jpg")

    first = proxies.stage(c, store, everything, workers=2, limit=2)            # stopped part-way
    assert first["staged"] == 2
    second = proxies.stage(c, store, everything, workers=2)
    assert (second["staged"], second["current"]) == (4, 2)
    again = proxies.stage(c, store, everything, workers=2)
    assert (again["staged"], again["current"]) == (0, 6)

    os.utime(lib / "shot1.jpg", (1, 1))                                         # changed source
    assert proxies.stage(c, store, everything, workers=2)["staged"] == 1
    manifest = json.loads((c.proxy_dir / "manifest.json").read_text())["items"]
    assert manifest["p09"]["source"] == str(lib / "IMG_20260516_002404_00_198.insp")
    assert (c.proxy_dir / manifest["p09"]["proxy"]).read_bytes() == (lib / "IMG_20260516_002404_00_198.insp").read_bytes()

    (lib / "shot2.jpg").rename(tmp_path / "away.jpg")                          # its drive went away
    res = proxies.stage(c, store, everything, workers=2)
    assert (res["offline"], res["staged"]) == (1, 0) and "p02" in json.loads(
        (c.proxy_dir / "manifest.json").read_text())["items"]


def test_proxy_dir_setting(tmp_path):
    assert cfg(tmp_path).proxy_dir == tmp_path / "state" / "proxies"
    assert cfg(tmp_path, proxy_dir=str(tmp_path / "cloud")).proxy_dir == tmp_path / "cloud"


# --------------------------------------------------------------------------- reels read proxies

def staged(c, key, source, rel, data=b"x"):
    p = c.proxy_dir / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    m = proxies.load_manifest(c.proxy_dir)
    m["items"][key] = {"source": str(source), "proxy": rel, "size": 1, "mtime": 1.0}
    proxies.save_manifest(c.proxy_dir, m)
    return p


def test_source_for_falls_back_to_proxies_when_originals_are_away(tmp_path):
    c = cfg(tmp_path)
    store = Store(c.db_path)
    gone = Path("/Volumes/Not Connected/2026")
    still = photo(1, gone / "a.jpg")
    raw = photo(2, gone / "b.ARW", raw=str(gone / "b.ARW"))
    insp = photo(3, gone / "IMG_1.insp", kind="photo360")
    clip = Asset(id="v1", kind="video", files=[], preview=str(gone / "c.mp4"))
    clip360 = Asset(id="v2", kind="video360", files=[], preview=str(gone / "VID.insv"))
    edited = photo(4, gone / "d.jpg")
    store.put("edits", edited.id, {"status": "shipped", "full": "/Volumes/Gone/IG/photos/d.jpg"})
    want = {
        still.id: staged(c, still.id, still.preview, "p0/p01.jpg"),
        raw.id: staged(c, raw.id, raw.preview, "p0/p02.jpg"),
        insp.id: staged(c, insp.id, insp.preview, "p0/p03.jpg"),
        clip.id: staged(c, clip.id, clip.preview, "v1/v1.mp4"),
        clip360.id: staged(c, clip360.id, clip360.preview, "v2/v2.insv"),
        edited.id: staged(c, "edit:p04", "/Volumes/Gone/IG/photos/d.jpg", "p0/edit-p04.jpg"),
    }
    for a in (still, raw, insp, clip, clip360, edited):
        src = reels.source_for(a, store, c)
        assert src == {"kind": a.kind, "path": str(want[a.id])}, a.id
    # nothing staged: the path is passed on unchanged (the renderer reports it missing)
    lost = photo(5, gone / "e.jpg")
    assert reels.source_for(lost, store, c)["path"] == str(gone / "e.jpg")


def test_originals_win_over_proxies_while_connected(tmp_path):
    c = cfg(tmp_path)
    store = Store(c.db_path)
    src = tmp_path / "a.jpg"
    src.write_bytes(b"jpg")
    a = photo(1, src)
    staged(c, a.id, src, "p0/p01.jpg")
    assert reels.source_for(a, store, c)["path"] == str(src)


def test_a_developed_raw_beats_its_proxy(tmp_path):
    c = cfg(tmp_path)
    raw = Path("/Volumes/Not Connected/b.ARW")
    staged(c, "p02", raw, "p0/p02.jpg")
    assert reels._developed(raw, c) == c.proxy_dir / "p0" / "p02.jpg"
    cached = c.state_dir / "links" / "b.raw.jpg"
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(b"dev")
    assert reels._developed(raw, c) == cached


def test_manifest_changes_are_picked_up(tmp_path):
    c = cfg(tmp_path)
    assert proxies.proxy_for(c, "/Volumes/X/a.jpg") is None          # no manifest yet
    staged(c, "a", "/Volumes/X/a.jpg", "a/a.jpg")
    assert proxies.proxy_for(c, "/Volumes/X/a.jpg") == c.proxy_dir / "a" / "a.jpg"
    (c.proxy_dir / "a" / "a.jpg").unlink()                                # evicted from a cloud folder
    assert proxies.proxy_for(c, "/Volumes/X/a.jpg") is None


# --------------------------------------------------------------------------- clip stretches

def test_plan_stretches_pads_merges_and_caps():
    # best window first, then segments longest first; padded, merged, sorted
    assert proxies.plan_stretches(100, [(10, 20), (50, 52)], (30, 34), pad=1.5, cap=60) == \
        [(8.5, 21.5), (28.5, 35.5), (48.5, 53.5)]
    assert proxies.plan_stretches(100, [(10, 12), (11.5, 14)], None, pad=1, cap=60) == [(9.0, 15.0)]
    # the cap: the best window whole, then what is left of the longest segment, cut around its middle
    got = proxies.plan_stretches(600, [(100, 200), (300, 310)], (40, 50), pad=1.5, cap=60)
    assert got[0] == (38.5, 51.5) and abs(sum(b - a for a, b in got) - 60) < 1e-6
    assert got[1] == (126.5, 173.5)
    # a best window longer than the cap is cut around its middle; clip ends are respected
    assert proxies.plan_stretches(200, [], (0, 100), pad=1.5, cap=60) == [(20.75, 80.75)]
    assert proxies.plan_stretches(5, [(0, 5)], None, pad=1.5, cap=60) == [(0.0, 5.0)]
    assert proxies.plan_stretches(90, [], None, cap=60) == [(0.0, 60.0)]


def test_stretch_times_spread_over_the_stretches():
    assert proxies.stretch_times([(0, 2), (10, 12)], 4) == [0.5, 1.5, 10.5, 11.5]


def gray_ramp(path, seconds=6.0, size="320x240"):
    """Each frame's grey level is 8 x its index (mod 256): a frame is told from its neighbours."""
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i",
                    f"nullsrc=s={size}:r=30:d={seconds},geq=lum='mod(N*8,256)':cb=128:cr=128",
                    "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", "-f", "mp4", str(path)], check=True)
    return path


def level_at(path, t):
    """The grey level of the frame the renderer gets from `-ss t -i path`."""
    out = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{t:.3f}", "-i", str(path),
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    return float(np.frombuffer(out, np.uint8).mean())


def test_clip_proxy_keeps_only_its_stretches_frame_exact(tmp_path):
    c = cfg(tmp_path)
    src = gray_ramp(tmp_path / "clip.mp4")
    job = proxies.Job("v1", "video", str(src), proxies._rel("v1", "video"), [[[1.0, 2.0]], [4.0, 4.5], 0.5, 60.0])
    entry = proxies.make(job, c)
    proxy = c.proxy_dir / entry["proxy"]
    assert entry["stretches"] == [[0.5, 2.5], [3.5, 5.0]] and entry["info"]["width"] == 320
    a, b = ffprobe(src), ffprobe(proxy)
    assert abs(float(a["format"]["duration"]) - float(b["format"]["duration"])) < 1 / 30
    for t in (0.5, 0.6, 1.0, 1.517, 2.0, 2.4, 3.5, 3.6, 4.0, 4.9):
        assert abs(level_at(src, t) - level_at(proxy, t)) <= 2, t           # the same frame, same time
    assert level_at(proxy, 3.0) < 20 and level_at(src, 3.0) > 100             # between stretches: black
    assert any(s["codec_type"] == "audio" for s in b["streams"])


def test_offline_shot_outside_the_stretches_fails_clearly(tmp_path):
    from igmp.models import Shot
    c = cfg(tmp_path)
    store = Store(c.db_path)
    clip = Asset(id="v1", kind="video", files=[], preview="/Volumes/Not Connected/c.mp4", duration_s=30)
    staged(c, "v1", clip.preview, "v1/v1.mp4")
    m = proxies.load_manifest(c.proxy_dir)
    m["items"]["v1"].update(stretches=[[2.0, 8.0], [20.0, 25.0]], duration=30.0, fps=30.0)
    proxies.save_manifest(c.proxy_dir, m)
    inside = Shot(asset_id="v1", start_s=21.0, duration_s=2.0)
    assert reels.source_for(clip, store, c, inside)["path"] == str(c.proxy_dir / "v1" / "v1.mp4")
    ramp = Shot(asset_id="v1", start_s=3.0, duration_s=2.0, speed=2.0)        # 4 s of source: 3-7 s
    assert reels.source_for(clip, store, c, ramp)["path"].endswith("v1.mp4")
    with pytest.raises(proxies.OutsideStretches, match="outside the staged stretches"):
        reels.source_for(clip, store, c, Shot(asset_id="v1", start_s=7.0, duration_s=2.0))
    with pytest.raises(proxies.OutsideStretches):
        reels.source_for(clip, store, c, Shot(asset_id="v1", start_s=12.0, duration_s=1.0))
    late = Shot(asset_id="v1", start_s=40.0, duration_s=2.0)                 # clamped to 28-30 s, as render does
    with pytest.raises(proxies.OutsideStretches):
        reels.source_for(clip, store, c, late)


# --------------------------------------------------------------------------- planning reads proxies

def test_offline_probes_and_previews_use_the_staged_set(tmp_path, monkeypatch):
    from igmp import media
    c = cfg(tmp_path)
    src = gray_ramp(tmp_path / "clip.mp4", size="640x360")
    clip = Asset(id="v1", kind="video", files=[str(src)], preview=str(src), duration_s=6.0)
    job = proxies.Job("v1", "video", str(src), proxies._rel("v1", "video"), [[], [1.0, 2.0], 0.5, 60.0])
    m = proxies.load_manifest(c.proxy_dir)
    m["items"]["v1"] = proxies.make(job, c)
    proxies.save_manifest(c.proxy_dir, m)
    still_src = tmp_path / "s.jpg"
    Image.new("RGB", (900, 600), (200, 10, 10)).save(still_src)
    still = photo(1, still_src)
    m["items"]["p01"] = proxies.make(proxies.Job("p01", "still", str(still_src), "p0/p01.jpg"), c)
    proxies.save_manifest(c.proxy_dir, m)
    online = media.probe(src, c)
    away = tmp_path / "away"
    away.mkdir()
    src.rename(away / src.name)                                              # the drive goes away
    still_src.rename(away / still_src.name)

    assert media.probe(src, c) == online                                      # as recorded
    assert reels._dims(clip, c) == (640, 360) and reels._fps(clip, c) == 30.0
    seen = []
    real = media.frame_at
    monkeypatch.setattr(media, "frame_at", lambda p, t, cfg_, size=1024: (seen.append(t), real(p, t, cfg_, size))[1])
    sheet = media.preview_image(clip, c)
    assert sheet.exists() and seen and all(0.5 <= t <= 2.5 for t in seen)   # frames from the stretch only
    with Image.open(media.preview_image(still, c)) as im:
        assert im.getpixel((10, 10))[0] > 150


def test_planner_sees_only_staged_stretches_of_an_offline_clip(tmp_path, monkeypatch):
    from igmp import reels, proxies
    from igmp.models import Asset, Score, Point
    from igmp.config import Config
    c = Config(library_roots=[], output_dir=tmp_path / "out")
    gone = tmp_path / "away" / "clip.mp4"                     # never created: the drive is off
    monkeypatch.setattr(proxies, "entry_for", lambda cfg, path: {"stretches": [[2.0, 9.5]], "proxy": "x.mp4"}
                        if str(path) == str(gone) else None)
    a = Asset(id="v", kind="video", files=[str(gone)], preview=str(gone), duration_s=30)
    s = Score(score=8, keep=True, role="moment", subject="s", mood="m", vertical_focus=Point(x=.5, y=.5),
              feed_focus=Point(x=.5, y=.5), best_in_s=3, best_out_s=6)
    text = reels.listing([(a, s)], c)
    assert "drive offline - use only 2.0-9.5s" in text
