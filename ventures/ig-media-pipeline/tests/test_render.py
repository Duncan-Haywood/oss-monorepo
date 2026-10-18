"""Reel rendering: pure command building, the geometry maths, and a small real encode."""
from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import render
from igmp.config import Config
from igmp.models import Point, ReelPlan, Shot
from igmp.render import (FPS, MIN_MOVING_ZOOM, OUT_H, OUT_W, Levels, SegmentSource, build_ffmpeg_args,
                         fit_box, fit_placement, fit_shots, frames_for, gentle_levels, kenburns_window,
                         pan_window)

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
HAVE_FFMPEG = Path(FFMPEG).exists() and Path(FFPROBE).exists()
needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg not installed")


def cfg_for(tmp_path, **extra) -> Config:
    extra = {"reel_preset": "veryfast", "reel_hwaccel": False, **extra}
    return Config(library_roots=[], output_dir=tmp_path, ffmpeg=FFMPEG, ffprobe=FFPROBE, extra=extra)


def plan_of(*shots: Shot) -> ReelPlan:
    return ReelPlan(event_key="2026-10-03_Mesa", title="t", shots=list(shots), cover_asset_id="a",
                    caption="c")


# --------------------------------------------------------------------------- pure maths


def test_frames_and_fit_shots():
    assert frames_for(1.5) == 45
    assert frames_for(0.01) == 1
    shots = [Shot(asset_id=str(i), duration_s=4) for i in range(5)]
    fitted = fit_shots(shots, 15.0)
    assert [s.duration_s for s in fitted] == [4, 4, 4, 3]
    assert sum(frames_for(s.duration_s) for s in fitted) == 450
    # a remainder too short to show is dropped
    fitted = fit_shots([Shot(asset_id="a", duration_s=5), Shot(asset_id="b", duration_s=5)], 5.2)
    assert [s.asset_id for s in fitted] == ["a"]


@pytest.mark.parametrize("size", [(6000, 4000), (4000, 6000), (1080, 1350), (1080, 1920), (500, 3000)])
@pytest.mark.parametrize("focus", [(0.5, 0.5), (0.0, 0.0), (1.0, 1.0), (0.9, 0.2)])
@pytest.mark.parametrize("zoom", [1.0, 1.6])
def test_fit_box_inside_and_aspect(size, focus, zoom):
    W, H = size
    x, y, w, h = fit_box(W, H, 9 / 16, focus, zoom)
    assert abs(w / h - 9 / 16) < 1e-9
    assert x >= -1e-9 and y >= -1e-9 and x + w <= W + 1e-6 and y + h <= H + 1e-6
    if zoom == 1.0:                                     # the largest box touches two sides
        assert abs(w - W) < 1e-6 or abs(h - H) < 1e-6


def test_fit_box_centres_on_focus_when_it_can():
    x, y, w, h = fit_box(6000, 4000, 9 / 16, (0.4, 0.5))
    assert abs((x + w / 2) - 2400) < 1e-6 and h == 4000
    x, y, w, h = fit_box(6000, 4000, 9 / 16, (0.0, 0.5))      # clamped to the left edge
    assert x == 0


def test_kenburns_window_is_smooth_and_inside():
    W, H, n = 2160, 3840, 90
    wins = [kenburns_window(i, n, W, H, (0.8, 0.3), 1.0, 1.3) for i in range(n)]
    assert wins[0] == pytest.approx((0, 0, W, H))
    assert wins[-1][2] == pytest.approx(W / 1.3)
    for x, y, w, h in wins:
        assert x >= -1e-6 and y >= -1e-6 and x + w <= W + 1e-6 and y + h <= H + 1e-6
    widths = np.array([w for _, _, w, _ in wins])
    ratios = widths[1:] / widths[:-1]                   # geometric zoom: constant ratio
    assert np.ptp(ratios) < 1e-9


def test_gentle_levels():
    assert gentle_levels(0.0, 1.0) is None              # already full range
    assert gentle_levels(0.03, 0.91) is None            # a normal exposure is left alone
    assert gentle_levels(0.01, 0.4) is None             # night frame: no white push, blacks fine
    assert gentle_levels(0.45, 0.5) is None             # near-uniform frame
    lv = gentle_levels(0.15, 0.80)                      # flat footage
    assert lv.out_lo == pytest.approx(0.09) and lv.out_hi == pytest.approx(0.86)
    lv = gentle_levels(0.08, 0.95)                      # slightly raised blacks only
    assert lv.out_lo == pytest.approx(0.03) and lv.out_hi == 0.95
    assert 1.0 < lv.gain <= 1.3
    lv = gentle_levels(0.30, 0.55)                      # very flat: gain capped
    assert lv.gain == pytest.approx(1.3)
    assert lv.out_lo < 0.30 and lv.out_hi > 0.55
    expr = Levels(0.1, 0.9, 0.05, 0.95).lutyuv()
    assert expr.startswith("lutyuv=y='clip(val*") and ",16,235)'" in expr


# --------------------------------------------------------------------------- command building


def test_build_args_mixed(tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(
        Shot(asset_id="p", duration_s=2.0, focus=Point(x=0.3, y=0.4), zoom_from=1.0, zoom_to=1.08),
        Shot(asset_id="v", start_s=12.5, duration_s=1.5, focus=Point(x=0.7, y=0.5)),
        Shot(asset_id="x", start_s=1.0, duration_s=2.5, view_yaw_deg=200),
    )
    srcs = [
        SegmentSource("photo", "/tmp/still.ppm", 2160, 3840, focus=(0.3, 0.4)),
        SegmentSource("video", "/clips/a.mp4", 3840, 2160, duration=60, extra_inputs=["-hwaccel", "videotoolbox"],
                      levels=Levels(0.1, 0.9, 0.05, 0.95)),
        SegmentSource("video360", "/clips/b.insv", 3840, 3840, duration=9.5, video_streams=2,
                      projection="dfisheye", lens_fov=200),
    ]
    args = build_ffmpeg_args(plan, srcs, tmp_path / "out.mp4", cfg)
    assert args[0] == FFMPEG and args[-1] == str(tmp_path / "out.mp4")
    joined = " ".join(args)
    # inputs: still, seeked video with hwaccel, seeked 360, silent audio
    assert args[args.index("-i") + 1] == "/tmp/still.ppm"
    assert "-hwaccel videotoolbox -ss 12.500 -t 2.500 -i /clips/a.mp4" in joined
    assert "-ss 1.000 -t 3.500 -i /clips/b.insv" in joined
    assert "anullsrc=channel_layout=stereo:sample_rate=48000" in joined
    graph = args[args.index("-filter_complex") + 1]
    chains = graph.split(";")
    assert len(chains) == 4 and chains[-1] == "[s0][s1][s2]concat=n=3:v=1:a=0[vout]"
    # photo: looped once, sub-pixel Ken Burns per frame, exactly 60 frames
    assert "loop=loop=59:size=1:start=0" in chains[0]
    assert "perspective=" in chains[0] and "eval=frame" in chains[0] and "interpolation=cubic" in chains[0]
    assert "pow(1.08000000,min(1,(in-1)/59))" in chains[0]
    assert chains[0].endswith("trim=end_frame=60,setsar=1[s0]")
    # video: cover-scale 3840x2160 -> 3414x1920, crop around x=0.7
    assert "scale=3414:1920" in chains[1] and "crop=1080:1920:1850:0" in chains[1]
    assert "lutyuv=y=" in chains[1] and "fps=30" in chains[1]
    assert "trim=end_frame=45" in chains[1]
    # 360: both lens streams stacked, v360 at yaw 200 -> -160, 9:16 rectilinear
    assert chains[2].startswith("[2:v:1][2:v:0]hstack=inputs=2,")
    assert "v360=input=dfisheye:ih_fov=200:iv_fov=200:output=flat" in chains[2]
    assert "yaw=-160.000" in chains[2] and "w=1080:h=1920" in chains[2]
    assert "trim=end_frame=75" in chains[2]
    # every segment ends BT.709 limited 4:2:0
    assert all("out_color_matrix=bt709:out_range=tv,format=yuv420p" in c for c in chains[:3])
    # output settings
    for flag, val in [("-c:v", "libx264"), ("-crf", "18"), ("-profile:v", "high"), ("-pix_fmt", "yuv420p"),
                      ("-r", "30"), ("-c:a", "aac"), ("-ac", "2"), ("-movflags", "+faststart"),
                      ("-frames:v", "180"), ("-t", "6.000"), ("-map", "[vout]")]:
        assert val in [args[i + 1] for i, a in enumerate(args[:-1]) if a == flag], flag
    assert "3:a" in args


def test_build_args_clamps_video_start_and_supports_videotoolbox(tmp_path):
    cfg = cfg_for(tmp_path, reel_encoder="videotoolbox")
    plan = plan_of(Shot(asset_id="v", start_s=30, duration_s=2.0))
    srcs = [SegmentSource("video", "/c.mp4", 1512, 2688, duration=10.0)]
    args = build_ffmpeg_args(plan, srcs, "/o.mp4", cfg)
    assert args[args.index("-ss") + 1] == "8.000"          # 10 s clip, 2 s shot
    assert args[args.index("-c:v") + 1] == "h264_videotoolbox"
    graph = args[args.index("-filter_complex") + 1]
    assert "scale=1080:1920" in graph and "crop=1080:1920:0:0" in graph   # already 9:16


def test_build_args_static_photo_and_equirect(tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(Shot(asset_id="p", duration_s=1.0, zoom_from=1.0, zoom_to=1.0),
                   Shot(asset_id="q", duration_s=1.0, zoom_from=1.2, zoom_to=1.0),
                   Shot(asset_id="e", duration_s=1.0))
    srcs = [SegmentSource("photo", "/a.ppm", 2160, 3840), SegmentSource("photo", "/b.ppm", 2160, 3840),
            SegmentSource("photo360", "/c.jpg", 4000, 2000, projection="equirect")]
    graph = build_ffmpeg_args(plan, srcs, "/o.mp4", cfg)
    graph = graph[graph.index("-filter_complex") + 1].split(";")
    assert "perspective" not in graph[0]                       # no move, no resampling
    assert "pow(0.83333333,min(1,(in-1)/29))" in graph[1]                 # pull-out
    assert "v360=input=e:output=flat" in graph[2] and "perspective" in graph[2]


def test_build_args_rejects_mismatch(tmp_path):
    with pytest.raises(ValueError):
        build_ffmpeg_args(plan_of(Shot(asset_id="a", duration_s=1)), [], "/o.mp4", cfg_for(tmp_path))


# --------------------------------------------------------------------------- real encodes


def _probe(path) -> dict:
    out = subprocess.run([FFPROBE, "-v", "error", "-show_streams", "-show_format", "-count_frames",
                          "-of", "json", str(path)], capture_output=True, check=True).stdout
    return json.loads(out)


def _make_sources(tmp_path) -> dict:
    # a landscape photo with an EXIF rotation, a 16:9 test clip, an equirect "360" clip
    img = np.zeros((800, 1200, 3), np.uint8)
    img[..., 0] = np.linspace(0, 255, 1200)[None, :]
    img[..., 1] = np.linspace(0, 255, 800)[:, None]
    img[300:500, 500:700] = 255
    photo = tmp_path / "photo.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6                                     # rotate 90 CW on display
    Image.fromarray(img).save(photo, quality=92, exif=exif)
    clip = tmp_path / "clip.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3",
                    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", str(clip)], check=True)
    pano = tmp_path / "pano.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1024x512:rate=30:duration=2",
                    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", str(pano)], check=True)
    return {"p": {"kind": "photo", "path": str(photo)},
            "v": {"kind": "video", "path": str(clip)},
            "x": {"kind": "video360", "path": str(pano)}}


@needs_ffmpeg
def test_render_reel_small(tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(Shot(asset_id="p", duration_s=1.0, focus=Point(x=0.5, y=0.5)),
                   Shot(asset_id="v", start_s=0.5, duration_s=1.5, focus=Point(x=0.2, y=0.5)),
                   Shot(asset_id="x", duration_s=1.0, view_yaw_deg=90))
    out = render.render_reel(plan, _make_sources(tmp_path), tmp_path / "reels" / "reel.mp4", cfg)
    assert out.exists() and out.parent.name == "reels"
    assert not list(out.parent.glob(".*.mp4"))            # temp file renamed away
    info = _probe(out)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    assert (v["width"], v["height"]) == (OUT_W, OUT_H)
    assert v["codec_name"] == "h264" and v["profile"] == "High" and v["pix_fmt"] == "yuv420p"
    assert v["r_frame_rate"] == "30/1" and int(v["nb_read_frames"]) == 105
    assert v.get("color_space") == "bt709" and v.get("color_range") == "tv"
    assert a["codec_name"] == "aac" and a["channels"] == 2
    assert abs(float(info["format"]["duration"]) - 3.5) < 0.1


@needs_ffmpeg
def test_render_reel_trims_to_reel_seconds(tmp_path):
    cfg = cfg_for(tmp_path)
    cfg.reel_seconds = 1.0
    srcs = _make_sources(tmp_path)
    plan = plan_of(Shot(asset_id="v", duration_s=0.6), Shot(asset_id="v", duration_s=0.9))
    out = render.render_reel(plan, srcs, tmp_path / "r.mp4", cfg)
    assert abs(float(_probe(out)["format"]["duration"]) - 1.0) < 0.1


def _edge_positions(video: Path, row_band: slice) -> np.ndarray:
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(video), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(out, np.uint8).reshape(-1, OUT_H, OUT_W).astype(np.float64)
    pos = []
    for f in frames:
        prof = f[row_band].mean(axis=0)
        mid = (prof.min() + prof.max()) / 2
        i = int(np.argmax(prof > mid))                    # first column past half-way
        pos.append(i - 1 + (mid - prof[i - 1]) / (prof[i] - prof[i - 1]))
    return np.array(pos)


@needs_ffmpeg
def test_kenburns_is_subpixel_smooth(tmp_path):
    """A push-in on a hard edge: the edge must track the ideal path to a fraction of a pixel,
    frame after frame (zoompan on an un-upscaled still is off by up to a pixel and stutters)."""
    img = np.full((1920, 1080, 3), 20, np.uint8)
    img[:, 300:] = 230                                    # vertical edge at x = 300
    photo = tmp_path / "edge.png"
    Image.fromarray(img).save(photo)
    cfg = cfg_for(tmp_path, reel_crf=1, reel_autolevels=False)
    n = 60
    plan = plan_of(Shot(asset_id="p", duration_s=n / FPS, zoom_from=1.0, zoom_to=1.25))
    out = render.render_reel(plan, {"p": {"kind": "photo", "path": str(photo)}}, tmp_path / "kb.mp4", cfg)
    pos = _edge_positions(out, slice(900, 1020))
    assert len(pos) == n
    ideal = np.array([(300 - kenburns_window(i, n, 1080, 1920, (0.5, 0.5), 1.0, 1.25)[0])
                      * 1080 / kenburns_window(i, n, 1080, 1920, (0.5, 0.5), 1.0, 1.25)[2] for i in range(n)])
    err = pos - (ideal - 0.5)                             # pixel-centre vs edge convention
    assert np.abs(err - np.median(err)).max() < 0.3
    assert np.all(np.diff(pos) < 0)                       # moves left every single frame
    assert np.abs(np.diff(pos, 2)).max() < 0.15        # zoompan: 1.3 (0.35 even on a 4x upscale)


@needs_ffmpeg
def test_contact_sheet(tmp_path):
    clip = tmp_path / "c.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30:duration=3",
                    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", str(clip)], check=True)
    sheet = render.reel_contact_sheet(clip, cfg_for(tmp_path), every_s=0.5, cols=3, thumb_h=160)
    tw = 90                                               # 160 * 9/16, even
    assert sheet.size == (3 * tw + 4 * 4, 2 * 160 + 3 * 4)  # 6 frames: 0.0 .. 2.5 s
    # thumbnails are pictures, the gaps are the dark background
    arr = np.asarray(sheet)
    assert arr[4 + 80, 4 + 45].sum() > 0 and tuple(arr[1, 1]) == (24, 24, 24)


def test_pull_out_renders(tmp_path):
    """A pull-out ends a hair off zoom 1.0, which ffmpeg's perspective filter rejected (EINVAL)."""
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg not installed")
    img = tmp_path / "p.jpg"
    Image.new("RGB", (1200, 800), (90, 120, 160)).save(img)
    cfg = Config(library_roots=[], output_dir=tmp_path)
    plan = ReelPlan(event_key="e", shots=[Shot(asset_id="a", duration_s=1.0, zoom_from=1.08, zoom_to=1.0)],
                    cover_asset_id="a", caption="c")
    out = render.render_reel(plan, {"a": {"kind": "photo", "path": str(img)}}, tmp_path / "r.mp4", cfg)
    assert out.exists()


# --------------------------------------------------------------------------- fit layout and pans


def _ff_eval(expr: str, **frame: float) -> float:
    """Evaluate one of the renderer's ffmpeg expressions in Python (ffmpeg's clip gives NaN when
    min > max, which is what makes perspective fail with EINVAL)."""
    ns = {"clip": lambda x, lo, hi: math.nan if lo > hi else min(max(x, lo), hi),
          "floor": math.floor, "max": max, "min": min, "pow": pow, **frame}
    return float(eval(re.sub(r"\bin\b", "IN", expr), {"__builtins__": {}}, ns))


@pytest.mark.parametrize("aspect", [3 / 2, 16 / 9, 4 / 3, 4 / 5, 9 / 16, 1 / 2, 3 / 1])
def test_fit_placement(aspect):
    x, y, w, h = fit_placement(OUT_W, OUT_H, aspect)
    assert all(v % 2 == 0 for v in (x, y, w, h))
    assert 0 <= x and x + w <= OUT_W and 0 <= y and y + h <= OUT_H
    assert w / h == pytest.approx(aspect, rel=0.004)          # the whole frame, undistorted
    if aspect >= 9 / 16:
        assert (x, w) == (0, OUT_W)                           # full width
    else:
        assert h == OUT_H and abs(x - (OUT_W - w) / 2) <= 1
    if h < 0.8 * OUT_H:
        assert abs(y + h / 2 - 0.46 * OUT_H) <= 2             # a little above the middle
    assert fit_placement(OUT_W, OUT_H, 1.5) == (0, 524, 1080, 720)


def test_pan_window_eases_stays_inside_and_never_clamps():
    n, canvas, base = 90, (4464, 3840), (2160, 3840)
    p = np.arange(n) / (n - 1)
    ease = p * p * (3 - 2 * p)
    for zoom in [(1.0, 1.0), (1.0, 1.3), (1.3, 1.0), (1.2, 1.2)]:
        # ends at the very edges: both get clamped so the largest window of the shot fits
        wins = np.array([pan_window(i, n, canvas, base, (0.0, 0.2), (1.0, 0.8), *zoom) for i in range(n)])
        x, y, w, h = wins.T
        assert (x >= -1e-9).all() and (y >= -1e-9).all()
        assert (x + w <= canvas[0] + 1e-6).all() and (y + h <= canvas[1] + 1e-6).all()
        cx = x + w / 2
        # the per-frame clamp never engages: the centre is exactly the eased path (no kink)
        assert np.allclose(cx, cx[0] + (cx[-1] - cx[0]) * ease, atol=1e-6)
        v = np.diff(cx)
        assert (v > 0).all()                                  # monotone
        assert v[0] < 0.05 * v.max() and v[-1] < 0.05 * v.max()   # eases in and out
        assert v.max() == pytest.approx(1.5 * (cx[-1] - cx[0]) / (n - 1), rel=0.02)
        zs = base[0] / w
        assert zs[0] == pytest.approx(max(zoom[0], MIN_MOVING_ZOOM if zoom[0] != zoom[1] else 1.0))
        if zoom[0] != zoom[1]:                                # the pull-out limit holds here too
            assert zs.min() >= MIN_MOVING_ZOOM - 1e-12
    # a centred, interior pan is not clamped at all
    x, _, w, _ = pan_window(0, n, canvas, base, (0.3, 0.5), (0.7, 0.5))
    assert x + w / 2 == pytest.approx(0.3 * canvas[0])


@pytest.mark.parametrize("canvas", [(4320, 3840), (4400, 4800)])
@pytest.mark.parametrize("zoom", [(1.0, 1.0), (1.0, 1.08), (1.08, 1.0), (1.2, 1.2)])
@pytest.mark.parametrize("ends", [((0.25, 0.5), (0.75, 0.5)), ((0.9, 0.2), (0.0, 0.8))])
def test_pan_filter_is_the_twin_of_pan_window(canvas, zoom, ends):
    """Evaluate the crop and perspective expressions frame by frame: crop (counting from n = 0)
    and perspective (from in = 1) must agree on the crop corner, and together show exactly
    pan_window() at the base size, with the window inside the crop and the crop even."""
    n, base = 60, (2160, 3840)
    text = render._pan_filter(n, canvas, base, ends[0], ends[1], *zoom)
    crop = re.match(r"crop=w=(\d+):h=(\d+):x='([^']*)':y='([^']*)',perspective=", text)
    assert crop and text.endswith(f",crop={base[0]}:{base[1]}:0:0")
    kw, kh = int(crop[1]), int(crop[2])
    assert (kw, kh) == (min(canvas[0], base[0] + 4), min(canvas[1], base[1] + 4))
    corners = dict(re.findall(r"\b([xy][0-3])='([^']*)'", text.split("perspective=")[1]))
    assert ("(in-1)" in text) and ("pow(" in text) == (zoom[0] != zoom[1])
    for i in range(n):
        ox, oy = _ff_eval(crop[3], n=i), _ff_eval(crop[4], n=i)
        assert ox % 2 == 0 and oy % 2 == 0 and 0 <= ox <= canvas[0] - kw and 0 <= oy <= canvas[1] - kh
        c = {k: _ff_eval(v, IN=i + 1) for k, v in corners.items()}
        x, y, w, h = pan_window(i, n, canvas, base, *ends, *zoom)
        # output pixel X of the kw x kh crop samples c["x0"] + X * (x1 - x0) / kw
        assert c["x0"] + ox == pytest.approx(x, abs=1e-3) and c["y0"] + oy == pytest.approx(y, abs=1e-3)
        assert (c["x1"] - c["x0"]) * base[0] / kw == pytest.approx(w, abs=1e-3)
        assert (c["y2"] - c["y0"]) * base[1] / kh == pytest.approx(h, abs=1e-3)
        assert c["x1"] == c["x3"] and c["y0"] == c["y1"] and c["x0"] == c["x2"] and c["y2"] == c["y3"]
        # the window lies inside the crop, a pixel in from its edges unless at the canvas edge
        assert 0 <= c["x0"] and c["x0"] + w <= kw + 1e-6 and 0 <= c["y0"] and c["y0"] + h <= kh + 1e-6
        assert c["x0"] >= 1 or ox == 0


def test_build_args_fit(tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(Shot(asset_id="p", duration_s=2.0, layout="fit", focus=Point(x=0.6, y=0.5)),
                   Shot(asset_id="q", duration_s=1.0, layout="fit", zoom_from=1.0, zoom_to=1.0),
                   Shot(asset_id="v", duration_s=1.5, layout="fit", focus_to=Point(x=0.9, y=0.5)),
                   Shot(asset_id="w", duration_s=1.0, layout="fit", zoom_from=1.25))
    srcs = [SegmentSource("photo", "/a.ppm", 2160, 1440, focus=(0.6, 0.5)),
            SegmentSource("photo", "/b.ppm", 2160, 1440),
            SegmentSource("video", "/v.mp4", 3840, 2160, duration=10),
            SegmentSource("video", "/w.mp4", 3840, 2160, duration=10)]
    args = build_ffmpeg_args(plan, srcs, tmp_path / "o.mp4", cfg)
    seg = args[args.index("-filter_complex") + 1].split(";")
    assert len(seg) == 4 * 4 + 1 and seg[-1] == "[s0][s1][s2][s3]concat=n=4:v=1:a=0[vout]"
    # photo: the 2x whole still, split into foreground and background
    assert seg[0] == "[0:v:0]scale=2160:1440:flags=lanczos,split=2[fit0v0f][fit0v0b]"
    # background: made once at 1/4 size (cover crop, blur, darken), upscaled, then held
    assert seg[1] == ("[fit0v0b]scale=720:480:flags=bilinear,crop=270:480,gblur=sigma=8:steps=2,"
                      "colorchannelmixer=rr=0.78:gg=0.78:bb=0.78,scale=1080:1920:flags=bicubic,"
                      "loop=loop=59:size=1:start=0,settb=1/30,setpts=N[fit0v0bg]")
    # foreground: the Ken Burns move on its own 2160x1440 canvas, towards focus, then 1080x720
    assert seg[2].startswith("[fit0v0f]loop=loop=59:size=1:start=0,settb=1/30,setpts=N,perspective=")
    assert "pow(1.08000000,min(1,(in-1)/59))" in seg[2] and "max(1.0005," in seg[2]
    assert "clip(1296.0000,(2160/(2*" in seg[2] and "clip(720.0000,(1440/(2*" in seg[2]
    assert seg[2].endswith(",scale=1080:720:flags=lanczos[fit0v0fg]")
    # composited a little above centre in RGB, then the usual tail
    assert seg[3].startswith("[fit0v0bg][fit0v0fg]overlay=x=0:y=524:format=gbrp,"
                             "scale=flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,"
                             "format=yuv420p")
    assert seg[3].endswith("trim=end_frame=60,setsar=1[s0]")
    # a foreground that does not move is shrunk once, before the loop
    assert seg[6] == "[fit1v0f]scale=1080:720:flags=lanczos,loop=loop=29:size=1:start=0,settb=1/30,setpts=N[fit1v0fg]"
    assert "perspective" not in seg[6]
    # video: the clip over a blurred copy of itself, every frame; fit ignores focus_to
    assert seg[8] == "[2:v:0]setpts=PTS-STARTPTS,fps=30,split=2[fit2v0f][fit2v0b]"
    assert seg[9].startswith("[fit2v0b]scale=854:480:flags=bilinear,crop=270:480,gblur=sigma=8:steps=2,"
                             "lutyuv=y='minval+(val-minval)*0.78'")
    assert seg[9].endswith(",scale=1080:1920:flags=bicubic[fit2v0bg]") and "loop" not in seg[9]
    assert seg[10] == "[fit2v0f]scale=1080:608:flags=lanczos[fit2v0fg]"
    assert seg[11].startswith("[fit2v0bg][fit2v0fg]overlay=x=0:y=580:format=yuv420,")
    assert "perspective" not in ";".join(seg[8:12]) and "trim=end_frame=45" in seg[11]
    # a held video zoom crops inside the foreground's own frame
    assert seg[14] == "[fit3v0f]scale=1350:760:flags=lanczos,crop=1080:608:135:76[fit3v0fg]"


def test_build_args_pan(tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(Shot(asset_id="p", duration_s=2.0, focus=Point(x=0.2, y=0.5), focus_to=Point(x=0.8, y=0.5),
                        zoom_from=1.0, zoom_to=1.0),
                   Shot(asset_id="q", duration_s=1.0, focus=Point(x=0.2, y=0.5), focus_to=Point(x=0.8, y=0.5)),
                   Shot(asset_id="v", start_s=2.0, duration_s=1.5, focus=Point(x=0.2, y=0.5),
                        focus_to=Point(x=0.8, y=0.5)))
    srcs = [SegmentSource("photo", "/p.ppm", 4320, 3840, focus=(0.25, 0.5), focus_to=(0.75, 0.5)),
            SegmentSource("photo", "/q.ppm", 4320, 3840, focus=(0.25, 0.5), focus_to=(0.75, 0.5)),
            SegmentSource("video", "/v.mp4", 3840, 2160, duration=10)]
    args = build_ffmpeg_args(plan, srcs, tmp_path / "o.mp4", cfg)
    chains = args[args.index("-filter_complex") + 1].split(";")
    assert len(chains) == 4
    # photo: the wide 2x still, held, a crop that follows the window, sub-pixel perspective, 2160x3840
    assert chains[0].startswith("[0:v:0]scale=4320:3840:flags=lanczos,loop=loop=59:size=1:start=0,"
                                "settb=1/30,setpts=N,crop=w=2164:h=3840:x='clip(2*floor(((clip(1080.0000+"
                                "(2160.0000)*(min(1,n/59))*")
    assert "perspective=x0='(clip(1080.0000+(2160.0000)*(min(1,(in-1)/59))*" in chains[0]
    assert (",crop=2160:3840:0:0,scale=1080:1920:flags=lanczos,"
            "scale=flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709") in chains[0]
    assert "pow(" not in chains[0] and "trim=end_frame=60" in chains[0]
    # with the default push-in the zoom is part of the same expressions
    assert "max(1.0005,1.000000*pow(1.08000000,min(1,(in-1)/29)))" in chains[1]
    # video: cover-scaled at output size, the same moving crop + perspective, no integer crop
    assert chains[2].startswith("[2:v:0]setpts=PTS-STARTPTS,fps=30,scale=3414:1920:flags=lanczos,"
                                "crop=w=1084:h=1920:x='clip(2*floor(")
    assert ",crop=1080:1920:0:0,scale=flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709" in chains[2]
    assert "pow(" not in chains[2]
    assert "-ss 2.000 -t 2.500 -i /v.mp4" in " ".join(args)


def test_no_pan_and_360_render_as_before(tmp_path):
    """focus_to None or equal to focus changes nothing; 360 shots ignore layout and focus_to."""
    cfg = cfg_for(tmp_path)
    shots = [Shot(asset_id="p", duration_s=2.0, focus=Point(x=0.3, y=0.4)),
             Shot(asset_id="v", duration_s=1.5, focus=Point(x=0.7, y=0.5)),
             Shot(asset_id="x", duration_s=1.0, view_yaw_deg=30),
             Shot(asset_id="y", duration_s=1.0, view_yaw_deg=-30)]
    srcs = [SegmentSource("photo", "/a.ppm", 2160, 3840, focus=(0.3, 0.4)),
            SegmentSource("video", "/v.mp4", 3840, 2160, duration=10),
            SegmentSource("video360", "/x.insv", 3840, 3840, duration=9, video_streams=2, projection="dfisheye"),
            SegmentSource("photo360", "/y.jpg", 4000, 2000, projection="equirect")]
    same = [s.model_copy(update={"focus_to": s.focus}) for s in shots]
    flat = [s.model_copy(update={"layout": "fit", "focus_to": Point(x=0.9, y=0.1)}) for s in shots[2:]]
    a = build_ffmpeg_args(plan_of(*shots), srcs, "/o.mp4", cfg)
    assert a == build_ffmpeg_args(plan_of(*same), srcs, "/o.mp4", cfg)
    assert a == build_ffmpeg_args(plan_of(*shots[:2], *flat), srcs, "/o.mp4", cfg)


def test_prepare_sources_fit_and_pan_stills(tmp_path):
    img = tmp_path / "wide.jpg"
    Image.new("RGB", (3000, 2000), (90, 120, 160)).save(img)
    plan = plan_of(Shot(asset_id="p", duration_s=1, layout="fit", focus=Point(x=0.7, y=0.4)),
                   Shot(asset_id="p", duration_s=1, focus=Point(x=0.0, y=0.5), focus_to=Point(x=1.0, y=0.5)),
                   Shot(asset_id="p", duration_s=1, focus=Point(x=0.4, y=0.5), focus_to=Point(x=0.4, y=0.5)))
    fit, pan, still = render.prepare_sources(plan, {"p": {"kind": "photo", "path": str(img)}}, tmp_path,
                                             cfg_for(tmp_path))
    # fit: the whole photo at 2x its size in the reel
    assert (fit.width, fit.height) == (2160, 1440) and Image.open(fit.path).size == (2160, 1440)
    assert fit.focus == pytest.approx((0.7, 0.4)) and fit.focus_to is None
    # pan edge to edge: the whole width at the scale of a 2160x3840 box
    assert (pan.width, pan.height) == (5760, 3840) and Image.open(pan.path).size == (5760, 3840)
    assert pan.focus == pytest.approx((0.0, 0.5)) and pan.focus_to == pytest.approx((1.0, 0.5))
    # no pan: today's 9:16 still
    assert (still.width, still.height) == (2160, 3840) and still.focus_to is None


def _frames(video: Path, fmt: str = "rgb24") -> np.ndarray:
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(video), "-f", "rawvideo", "-pix_fmt", fmt, "-"],
                         capture_output=True, check=True).stdout
    shape = (-1, OUT_H, OUT_W, 3) if fmt == "rgb24" else (-1, OUT_H, OUT_W)
    return np.frombuffer(out, np.uint8).reshape(shape).astype(np.float64)


def _detail(a: np.ndarray) -> float:
    """99th percentile of the horizontal gradient: the edges of a sharp picture, ~1 for a blur
    (a mean would be dominated by 8-bit steps and encoder noise in smooth areas)."""
    a = a.mean(axis=-1) if a.ndim == 3 else a
    return float(np.percentile(np.abs(np.diff(a, axis=1)), 99))


def _edge_centroids(video: Path, row_band: slice, half: int = 8) -> np.ndarray:
    """Sub-pixel x of the one vertical edge in each frame: the centroid of the (signed) gradient
    within +-half px of its peak. Unlike a half-way crossing, this has no bias that depends on
    the edge's sub-pixel phase, so what it sees as jitter is the render's."""
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(video), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(out, np.uint8).reshape(-1, OUT_H, OUT_W).astype(np.float64)
    pos = []
    for f in frames:
        d = np.diff(f[row_band].mean(axis=0))
        k = int(np.argmax(np.abs(d)))
        lo, hi = max(0, k - half), min(len(d), k + half + 1)
        w = d[lo:hi] * np.sign(d[k])
        pos.append(((np.arange(lo, hi) + 0.5) * w).sum() / w.sum())
    return np.array(pos)


def _check_video(path: Path, frames: int) -> None:
    info = _probe(path)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (v["width"], v["height"]) == (OUT_W, OUT_H) and int(v["nb_read_frames"]) == frames
    assert abs(float(info["format"]["duration"]) - frames / FPS) < 0.1


@needs_ffmpeg
def test_fit_photo_shows_the_whole_frame_over_a_blur(tmp_path):
    yy, xx = np.mgrid[0:2000, 0:3000]
    img = np.repeat(np.where((xx // 100 + yy // 100) % 2, 215, 40)[..., None], 3, axis=2).astype(np.uint8)
    img[:, :45] = (230, 30, 30)                           # markers at the far left and right
    img[:, -45:] = (30, 30, 230)
    photo = tmp_path / "wide.png"
    Image.fromarray(img).save(photo)
    cfg = cfg_for(tmp_path, reel_crf=8, reel_autolevels=False)
    plan = plan_of(Shot(asset_id="p", duration_s=1.0, layout="fit", zoom_from=1.0, zoom_to=1.0))
    out = render.render_reel(plan, {"p": {"kind": "photo", "path": str(photo)}}, tmp_path / "fit.mp4", cfg)
    _check_video(out, 30)
    frame = _frames(out)[15]
    x, y, w, h = fit_placement(OUT_W, OUT_H, 1.5)
    ref = np.asarray(Image.fromarray(img).resize((w, h), Image.LANCZOS), np.float64)
    band = frame[y:y + h, x:x + w]
    assert np.abs(band[2:-2] - ref[2:-2]).mean() < 3      # the downscaled source, not a crop
    assert band[h // 2, 6, 0] > 180 and band[h // 2, 6, 2] < 90       # left edge kept
    assert band[h // 2, -7, 2] > 180 and band[h // 2, -7, 0] < 90     # right edge kept
    top, bottom = frame[:y - 2], frame[y + h + 2:]
    # no gradient steeper than a ~30 px blur allows (a full black-white step blurred at sigma 30
    # peaks near 3/px), against the band's sharp edges
    assert _detail(top) < 6 and _detail(bottom) < 6 and _detail(band) > 30
    assert 0.68 < top.mean() / img.mean() < 0.88 and 0.68 < bottom.mean() / img.mean() < 0.88   # darkened


@needs_ffmpeg
def test_fit_video_shows_the_whole_clip_over_a_blur(tmp_path):
    clip = tmp_path / "c.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=2",
                    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-colorspace", "bt709",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-c:v", "libx264", "-crf", "4",
                    "-preset", "ultrafast", str(clip)], check=True)
    cfg = cfg_for(tmp_path, reel_crf=8)                    # levels on: exercises the fit analysis frame
    plan = plan_of(Shot(asset_id="v", duration_s=1.5, layout="fit"))
    out = render.render_reel(plan, {"v": {"kind": "video", "path": str(clip)}}, tmp_path / "fit.mp4", cfg)
    _check_video(out, 45)
    x, y, w, h = fit_placement(OUT_W, OUT_H, 16 / 9)
    got = _frames(out, "gray")
    ref = subprocess.run([FFMPEG, "-v", "error", "-i", str(clip), "-vf", f"scale={w}:{h}:flags=lanczos",
                          "-frames:v", "45", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    ref = np.frombuffer(ref, np.uint8).reshape(-1, h, w).astype(np.float64)
    for k in (0, 22, 44):                                   # the moving picture, frame for frame
        band = got[k, y:y + h, x:x + w]
        assert np.abs(band[2:-2] - ref[k, 2:-2]).mean() < 3
        assert _detail(got[k, :y - 2]) < 6 and _detail(got[k, y + h + 2:]) < 6 and _detail(band) > 30


@needs_ffmpeg
@pytest.mark.parametrize("zoom", [(1.0, 1.0), (1.0, 1.1)])
def test_pan_photo_is_subpixel_smooth(tmp_path, zoom):
    """A pan across a hard edge: the edge follows pan_window() to a fraction of a pixel, and its
    acceleration is the ease's, frame after frame (no jitter, no kink)."""
    img = np.full((2000, 3000, 3), 20, np.uint8)
    img[:, 1500:] = 230                                   # vertical edge at x = 1500
    photo = tmp_path / "edge.png"
    Image.fromarray(img).save(photo)
    cfg = cfg_for(tmp_path, reel_crf=1, reel_autolevels=False)
    n, f0, f1 = 60, (0.42, 0.5), (0.58, 0.5)
    plan = plan_of(Shot(asset_id="p", duration_s=n / FPS, focus=Point(x=f0[0], y=f0[1]),
                        focus_to=Point(x=f1[0], y=f1[1]), zoom_from=zoom[0], zoom_to=zoom[1]))
    out = render.render_reel(plan, {"p": {"kind": "photo", "path": str(photo)}}, tmp_path / "pan.mp4", cfg)
    _check_video(out, n)
    pos = _edge_centroids(out, slice(900, 1020))
    # the still is the union of the two 9:16 boxes, at the scale that makes one box 2160x3840
    _, size, g0, g1 = render.prepare_pan_still(photo, f0, f1, tmp_path / "canvas.ppm", (2160, 3840))
    a, b = fit_box(3000, 2000, 9 / 16, f0), fit_box(3000, 2000, 9 / 16, f1)
    edge = (1500 - a[0]) / (b[0] + b[2] - a[0]) * size[0]
    wins = [pan_window(i, n, size, (2160, 3840), g0, g1, *zoom) for i in range(n)]
    ideal = np.array([(edge - wx) * OUT_W / ww for wx, _, ww, _ in wins])
    err = pos - ideal
    assert np.abs(err - np.median(err)).max() < 0.1      # follows the ideal path
    assert np.abs(np.diff(pos, 2) - np.diff(ideal, 2)).max() < 0.15   # no jitter, no kink
    if zoom[0] == zoom[1]:
        assert np.all(np.diff(pos) < 0)                   # moves left every single frame
        assert pos[0] - pos[-1] > 400


@needs_ffmpeg
def test_pan_video_is_subpixel_smooth(tmp_path):
    img = np.full((1080, 1920, 3), 20, np.uint8)
    img[:, 960:] = 230
    Image.fromarray(img).save(tmp_path / "edge.png")
    clip = tmp_path / "edge.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-i", str(tmp_path / "edge.png"),
                    "-t", "2.5", "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "1", "-preset", "ultrafast",
                    str(clip)], check=True)
    n = 60
    cfg = cfg_for(tmp_path, reel_crf=1, reel_autolevels=False)
    plan = plan_of(Shot(asset_id="v", duration_s=n / FPS, focus=Point(x=0.4, y=0.5), focus_to=Point(x=0.6, y=0.5)))
    out = render.render_reel(plan, {"v": {"kind": "video", "path": str(clip)}}, tmp_path / "pan.mp4", cfg)
    _check_video(out, n)
    pos = _edge_centroids(out, slice(900, 1020))
    canvas = (3414, 1920)                                 # 1920x1080 cover-scaled to 1920 high
    edge = 960 * canvas[0] / 1920
    ideal = np.array([edge - pan_window(i, n, canvas, (OUT_W, OUT_H), (0.4, 0.5), (0.6, 0.5))[0]
                      for i in range(n)])
    err = pos - ideal
    assert np.abs(err - np.median(err)).max() < 0.1      # follows the ideal path
    assert np.abs(np.diff(pos, 2) - np.diff(ideal, 2)).max() < 0.15   # no jitter, no kink
    assert np.all(np.diff(pos) < 0) and pos[0] - pos[-1] > 600


@needs_ffmpeg
@pytest.mark.parametrize("layout,focus_to", [("fill", Point(x=0.9, y=0.5)), ("fit", None)])
def test_pull_out_pan_and_fit_render(tmp_path, layout, focus_to):
    """A pull-out to zoom 1.0 inside a pan or a fit foreground keeps clear of perspective's EINVAL."""
    img = tmp_path / "p.jpg"
    Image.new("RGB", (1200, 800), (90, 120, 160)).save(img)
    plan = plan_of(Shot(asset_id="a", duration_s=1.0, zoom_from=1.08, zoom_to=1.0, layout=layout,
                        focus=Point(x=0.1, y=0.5), focus_to=focus_to))
    out = render.render_reel(plan, {"a": {"kind": "photo", "path": str(img)}}, tmp_path / "r.mp4", cfg_for(tmp_path))
    _check_video(out, 30)
