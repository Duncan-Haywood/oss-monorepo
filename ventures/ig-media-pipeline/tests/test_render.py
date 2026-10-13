"""Reel rendering: pure command building, the geometry maths, and a small real encode."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import render
from igmp.config import Config
from igmp.models import Point, ReelPlan, Shot
from igmp.render import (FPS, OUT_H, OUT_W, Levels, SegmentSource, build_ffmpeg_args, fit_box,
                         fit_shots, frames_for, gentle_levels, kenburns_window)

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
HAVE_FFMPEG = Path(FFMPEG).exists() and Path(FFPROBE).exists()
needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg not installed")


def cfg_for(tmp_path, **extra) -> Config:
    extra = {"reel_preset": "veryfast", "reel_hwaccel": False, **extra}
    return Config(library_roots=[], output_dir=tmp_path, ffmpeg=FFMPEG, ffprobe=FFPROBE, extra=extra)


def plan_of(*shots: Shot) -> ReelPlan:
    return ReelPlan(event_key="2026-10-03_Dunes", title="t", shots=list(shots), cover_asset_id="a",
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
    assert "pow(1.08000000,in/59)" in chains[0]
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
    assert "pow(0.83333333,in/29)" in graph[1]                 # pull-out
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
