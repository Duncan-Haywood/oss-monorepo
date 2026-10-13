"""media.py on tiny synthetic files: no library drive needed."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import media
from igmp.config import Config
from igmp.models import Asset

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
                                  reason="ffmpeg not installed")


@pytest.fixture
def cfg(tmp_path: Path) -> Config:
    return Config(library_roots=[], output_dir=tmp_path / "out")


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True, capture_output=True)


def clip(path: Path, seconds: float = 4, size: str = "320x240", rate: int = 30) -> Path:
    ffmpeg("-f", "lavfi", "-i", f"testsrc2=size={size}:rate={rate}:duration={seconds}",
           "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-f", "mp4", str(path))
    return path


def dual_fisheye(w_lens: int, rear=(220, 30, 30), front=(30, 30, 220)) -> Image.Image:
    """An .insp-like frame: [rear | front], each lens a filled circle on black."""
    img = Image.new("RGB", (2 * w_lens, w_lens), (0, 0, 0))
    yy, xx = np.mgrid[:w_lens, :w_lens]
    circle = (xx - (w_lens - 1) / 2) ** 2 + (yy - (w_lens - 1) / 2) ** 2 <= (w_lens / 2) ** 2
    arr = np.asarray(img).copy()
    arr[:, :w_lens][circle] = rear
    arr[:, w_lens:][circle] = front
    return Image.fromarray(arr)


def mean_rgb(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=float).reshape(-1, 3).mean(0)


# --------------------------------------------------------------------------- stills

def test_photo_preview_applies_orientation_and_is_cached(tmp_path, cfg):
    src = tmp_path / "2026-10-03_171411_Dunes_A7RV_DSC1.JPG"
    img = Image.new("RGB", (3000, 2000), (90, 120, 150))
    exif = img.getexif()
    exif[0x0112] = 6   # stored sideways: display needs a 90 deg turn
    img.save(src, "JPEG", exif=exif.tobytes(), quality=80)
    a = Asset(id="p1", kind="photo", files=[str(src)], preview=str(src))

    out = media.preview_image(a, cfg)
    assert out == cfg.state_dir / "previews" / "p1.jpg"
    with Image.open(out) as p:
        assert p.size == (683, 1024)          # portrait after orientation, long edge 1024
        assert p.mode == "RGB"
    stamp = out.stat().st_mtime_ns
    src.unlink()                              # cached: the source is not read again
    assert media.preview_image(a, cfg) == out
    assert out.stat().st_mtime_ns == stamp


def test_small_photo_is_not_upscaled_and_other_sizes_cache_separately(tmp_path, cfg):
    src = tmp_path / "small.jpg"
    Image.new("RGB", (800, 600), "white").save(src)
    a = Asset(id="p2", kind="photo", files=[str(src)], preview=str(src))
    with Image.open(media.preview_image(a, cfg)) as p:
        assert p.size == (800, 600)
    small = media.preview_image(a, cfg, size=256)
    assert small.name == "p2_256.jpg"
    with Image.open(small) as p:
        assert p.size == (256, 192)


def test_unreadable_photo_raises_media_error(tmp_path, cfg):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"not a jpeg")
    a = Asset(id="bad", kind="photo", files=[str(bad)], preview=str(bad))
    with pytest.raises(media.MediaError):
        media.preview_image(a, cfg)


# --------------------------------------------------------------------------- 360 stills

def test_reframe_picks_the_right_lens(tmp_path, cfg):
    insp = tmp_path / "IMG_20260522_170929_00_001.insp"
    dual_fisheye(400).save(insp, "JPEG", quality=95)
    front = mean_rgb(media.reframe_360_image(insp, 0, 0, 90, 160, 120, cfg))
    rear = mean_rgb(media.reframe_360_image(insp, 180, 0, 90, 160, 120, cfg))
    assert front[2] > 200 and front[0] < 50     # yaw 0 = front lens = right half (blue)
    assert rear[0] > 200 and rear[2] < 50       # yaw 180 = rear lens = left half (red)
    side = np.asarray(media.reframe_360_image(insp, 90, 0, 90, 160, 120, cfg), dtype=float)
    assert side[:, :40, 2].mean() > 150 and side[:, -40:, 0].mean() > 150   # straddles both


def test_photo360_preview_is_equirect_over_flat_views(tmp_path, cfg):
    insp = tmp_path / "IMG_20260522_170929_00_002.insp"
    dual_fisheye(400).save(insp, "JPEG", quality=95)
    a = Asset(id="s1", kind="photo360", files=[str(insp)], preview=str(insp))
    with Image.open(media.preview_image(a, cfg)) as p:
        assert p.width == 1024
        arr = np.asarray(p, dtype=float)
    pano = arr[:512]
    assert pano[200:300, 480:540, 2].mean() > 180     # yaw 0 (middle) from the front lens
    assert pano[200:300, :40, 0].mean() > 180         # yaw -180 (left edge) from the rear lens


def test_equirect_has_no_black_holes(tmp_path, cfg):
    insp = tmp_path / "IMG_x_00_003.insp"
    dual_fisheye(400).save(insp, "JPEG", quality=95)
    pano = np.asarray(media.equirect_360(insp, cfg, width=360), dtype=float)
    assert pano.shape == (180, 360, 3)
    assert pano.sum(axis=2).min() > 100   # every direction is covered by some lens


# --------------------------------------------------------------------------- video

@needs_ffmpeg
def test_probe_reports_duration_size_fps(tmp_path, cfg):
    info = media.probe(clip(tmp_path / "a.mp4", seconds=2), cfg)
    assert info["width"] == 320 and info["height"] == 240
    assert info["video_streams"] == 1
    assert abs(info["duration_s"] - 2.0) < 0.1
    assert abs(info["fps"] - 30) < 0.01


@needs_ffmpeg
def test_probe_raises_on_corrupt_file(tmp_path, cfg):
    bad = tmp_path / "broken.insv"
    bad.write_bytes(b"\x00" * 4096)
    with pytest.raises(media.MediaError):
        media.probe(bad, cfg)


@needs_ffmpeg
def test_frame_at_returns_scaled_frame(tmp_path, cfg):
    f = media.frame_at(clip(tmp_path / "a.mp4", size="640x480"), 1.0, cfg, size=320)
    assert f.size == (320, 240) and f.mode == "RGB"


@needs_ffmpeg
def test_video_contact_sheet_size_and_cache(tmp_path, cfg):
    src = clip(tmp_path / "2026-10-10_180615_Harbor_Party_Pocket3_DJI-0002.MP4", seconds=4,
               size="640x360")
    a = Asset(id="v1", kind="video", files=[str(src)], preview=str(src))
    out = media.preview_image(a, cfg)
    with Image.open(out) as sheet:
        # 8 frames of 16:9 laid out 2 x 4 inside a 1024 box
        assert max(sheet.size) <= 1024
        assert sheet.size == (2 * 455, 4 * 256)


@needs_ffmpeg
def test_sample_frames_prefers_the_proxy(tmp_path, cfg):
    src = clip(tmp_path / "x.MP4", seconds=3, size="640x360")
    proxy = clip(tmp_path / "x.LRF", seconds=3, size="320x180")
    a = Asset(id="v2", kind="video", files=[str(proxy), str(src)], preview=str(src))
    assert media.proxy_path(a) == proxy
    frames = media.sample_frames(a, cfg, fps=2.0, size=160)
    assert len(frames) == 6
    assert frames[1][0] == 0.5
    assert frames[0][1].shape == (90, 160) and frames[0][1].dtype == np.uint8


@needs_ffmpeg
def test_insv_two_streams_frame_and_reframe(tmp_path, cfg):
    insv = tmp_path / "VID_20261009_154049_00_017.insv"
    ffmpeg("-f", "lavfi", "-i", "color=c=0x1E1EDC:size=256x256:rate=30:duration=1",   # stream 0: front, blue
           "-f", "lavfi", "-i", "color=c=0xDC1E1E:size=256x256:rate=30:duration=1",   # stream 1: rear, red
           "-map", "0:v", "-map", "1:v", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset",
           "ultrafast", "-f", "mp4", str(insv))
    assert media.probe(insv, cfg)["video_streams"] == 2
    pair = np.asarray(media.frame_at(insv, 0.5, cfg, size=256), dtype=float)
    assert pair.shape == (128, 256, 3)
    assert pair[:, :128, 0].mean() > 180 and pair[:, 128:, 2].mean() > 180   # [rear | front]
    view = mean_rgb(media.reframe_360_image(insv, 0, 0, 90, 64, 64, cfg, t=0.5))
    assert view[2] > 180

    a = Asset(id="v3", kind="video360", files=[str(insv)], preview=str(insv))
    with Image.open(media.preview_image(a, cfg)) as sheet:
        assert sheet.width == 1024 and sheet.height <= 1024
    frames = media.sample_frames(a, cfg, fps=2.0, size=64)
    assert len(frames) == 2 and frames[0][1].shape == (64, 64)


def test_v360_filter_mentions_lens_fov():
    g = media.v360_filter(30, -5, 80, 1080, 1920)
    assert "dfisheye" in g and f"ih_fov={media.X5_VIDEO_FOV_DEG}" in g and "yaw=30.000" in g
    assert g.startswith("[0:v:1][0:v:0]hstack")          # [rear | front]: yaw 0 is the front lens
