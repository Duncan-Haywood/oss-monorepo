"""Tests for igmp.prefilter, on tiny synthetic images and clips built in tmp_path."""
from __future__ import annotations

import shutil
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageFilter

from igmp import prefilter as pf
from igmp.config import Config
from igmp.models import Asset, Metrics

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not on PATH")
T0 = datetime(2026, 10, 10, 17, 0, 0)


def texture(w: int = 480, h: int = 320, seed: int = 0) -> Image.Image:
    """Multi-scale noise: photo-like detail at every scale, so blur and shifts register."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    for s in (1, 2, 4, 8, 16, 32):
        small = Image.fromarray((rng.random((h // s + 2, w // s + 2)) * 255).astype(np.uint8))
        acc += np.asarray(small.resize((w + 2 * s, h + 2 * s), Image.Resampling.BICUBIC), np.float32)[:h, :w] / s ** 0.5
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    return Image.fromarray((acc * 255).astype(np.uint8))


def checkerboard(w: int = 480, h: int = 320, cell: int = 16) -> Image.Image:
    y, x = np.mgrid[:h, :w]
    return Image.fromarray((((x // cell + y // cell) % 2) * 200 + 28).astype(np.uint8))


def asset(aid: str, seconds: float | None = 0, kind: str = "photo", event: str = "Party",
          camera: str = "A7RV", **kw) -> Asset:
    taken = None if seconds is None else T0 + timedelta(seconds=seconds)
    kw.setdefault("files", [f"/x/{aid}.JPG"])
    return Asset(id=aid, kind=kind, taken_at=taken, date_label="2026-10-10",
                 location="Harbor", event=event, camera=camera, **kw)


def metric(aid: str, sharpness: float = 300.0, dhash: str = "0f0f0f0f0f0f0f0f", brightness: float = 0.45,
           **kw) -> Metrics:
    return Metrics(asset_id=aid, sharpness=sharpness, brightness=brightness, clipped_high=0.01,
                   clipped_low=0.01, dhash=dhash, **kw)


def flip_bits(h: str, n: int) -> str:
    """`h` with its lowest n bits inverted (Hamming distance n)."""
    return f"{int(h, 16) ^ ((1 << n) - 1):016x}"


# --- pixel helpers -----------------------------------------------------------------------

def test_sharp_image_beats_blurred_copy():
    for img in (texture(), checkerboard()):
        sharp = pf.laplacian_variance(pf.grey_array(img, 512))
        soft = pf.laplacian_variance(pf.grey_array(img.filter(ImageFilter.GaussianBlur(2)), 512))
        softer = pf.laplacian_variance(pf.grey_array(img.filter(ImageFilter.GaussianBlur(5)), 512))
        assert sharp > 2 * soft > 0
        assert soft > softer


def test_laplacian_scale_is_8bit_whatever_the_dtype():
    grey = pf.grey_array(texture(), 256)
    as_u8 = np.rint(grey * 255).astype(np.uint8)
    assert pf.laplacian_variance(grey) == pytest.approx(pf.laplacian_variance(as_u8), rel=0.01)
    assert pf.laplacian_variance(np.full((50, 50), 0.5, np.float32)) == 0.0


def test_grey_array_from_jpeg_path_resizes_long_edge(tmp_path):
    path = tmp_path / "big.jpg"
    texture(1500, 1000).convert("RGB").save(path, quality=90)
    grey = pf.grey_array(path, 1024)
    assert grey.shape == (683, 1024) and grey.dtype == np.float32
    assert 0.0 <= grey.min() and grey.max() <= 1.0
    portrait = pf.grey_array(texture(300, 600), 200)
    assert portrait.shape == (200, 100)


def test_exposure_stats():
    grey = np.zeros((10, 10), np.float32)
    grey[:5] = 1.0                       # half white, half black
    mean, high, low = pf.exposure_stats(grey)
    assert mean == pytest.approx(0.5)
    assert high == pytest.approx(0.5) and low == pytest.approx(0.5)
    u8 = np.array([[pf.CLIP_HIGH_LEVEL, pf.CLIP_HIGH_LEVEL - 1, pf.CLIP_LOW_LEVEL, pf.CLIP_LOW_LEVEL + 1]], np.uint8)
    assert pf.exposure_stats(u8)[1:] == (0.25, 0.25)
    assert pf.exposure_stats(u8.astype(np.float32) / 255)[1:] == (0.25, 0.25)


def test_dhash_distances():
    img = texture(seed=1)
    h = pf.dhash(img)
    assert len(h) == 16 and h == h.lower() and int(h, 16) >= 0
    assert pf.hamming(h, pf.dhash(img.copy())) == 0
    assert pf.dhash(np.asarray(img)) == h                          # uint8 array == image
    shifted = img.crop((6, 4, img.width, img.height)).resize(img.size)
    brighter = Image.eval(shifted, lambda v: min(255, int(v * 1.1) + 8))
    assert pf.hamming(h, pf.dhash(brighter)) <= 10
    assert pf.hamming(h, pf.dhash(texture(seed=7))) > 20


def test_hamming():
    assert pf.hamming("0" * 16, "f" * 16) == 64
    assert pf.hamming("0f0f0f0f0f0f0f0f", flip_bits("0f0f0f0f0f0f0f0f", 3)) == 3


# --- bursts and candidates ---------------------------------------------------------------

def test_burst_keeps_only_the_sharpest():
    base = "a5a5a5a5a5a5a5a5"
    assets = [asset("a", 0), asset("b", 1), asset("c", 2), asset("late", 12), asset("other", 3),
              asset("picnic", 1, event="Picnic")]
    metrics = {
        "a": metric("a", 300, base),
        "b": metric("b", 500, flip_bits(base, 4)),         # sharpest of the burst
        "c": metric("c", 280, flip_bits(base, 7)),         # 3 bits from b: chained to b
        "late": metric("late", 200, base),                 # same look but 10 s after c
        "other": metric("other", 100, "5a5a5a5a5a5a5a5a"),  # right time, very different picture
        "picnic": metric("picnic", 50, base),              # same time and look, other event
    }
    out = pf.select_candidates(assets, metrics)
    assert set(out) == set(metrics)
    assert out["a"].burst_id == out["b"].burst_id == out["c"].burst_id == "a"
    assert [k for k in "abc" if out[k].candidate] == ["b"]
    for solo in ("late", "other", "picnic"):
        assert out[solo].burst_id == solo and out[solo].candidate
    # inputs are untouched; outputs are copies
    assert metrics["a"].burst_id == "" and out["a"] is not metrics["a"]


def test_burst_rules_for_missing_times_kinds_and_interleaving():
    base, alt = "a5a5a5a5a5a5a5a5", "5a5a5a5a5a5a5a5a"
    assets = [asset("p1", 0), asset("q1", 0.5), asset("p2", 1), asset("q2", 1.5),
              asset("undated1", None), asset("undated2", None),
              asset("v1", 0.2, kind="video", camera="Pocket3")]
    metrics = {
        "p1": metric("p1", 100, base), "p2": metric("p2", 200, base),
        "q1": metric("q1", 300, alt), "q2": metric("q2", 250, alt),   # shooter alternates subjects
        "undated1": metric("undated1", 100, base), "undated2": metric("undated2", 90, base),
        "v1": metric("v1", 40, base, segments=[(0.0, 5.0)]),
    }
    out = pf.select_candidates(assets, metrics)
    assert out["p2"].burst_id == "p1" and out["q2"].burst_id == "q1"
    assert [k for k in ("p1", "p2", "q1", "q2") if out[k].candidate] == ["p2", "q1"]
    assert out["undated1"].burst_id == "undated1" and out["undated2"].burst_id == "undated2"
    assert out["undated1"].candidate and out["undated2"].candidate
    assert out["v1"].burst_id == "v1" and out["v1"].candidate      # videos never join stills


def test_broken_frames_are_rejected():
    assets = [asset(f"s{i}", 10 * i) for i in range(6)] + [asset("dark", 70), asset("white", 80), asset("soft", 90),
                                                         asset("nosegs", 5, kind="video", camera="Pocket3")]
    hashes = ["0123456789abcdef", "fedcba9876543210", "00ff00ff00ff00ff", "ff00ff00ff00ff00",
              "0f0f0f0f0f0f0f0f", "f0f0f0f0f0f0f0f0", "3c3c3c3c3c3c3c3c", "c3c3c3c3c3c3c3c3", "6666666666666666"]
    metrics = {f"s{i}": metric(f"s{i}", 300 + 20 * i, hashes[i]) for i in range(6)}
    metrics["dark"] = Metrics(asset_id="dark", sharpness=2.0, brightness=0.01, clipped_high=0.0,
                              clipped_low=0.99, dhash=hashes[6])
    metrics["white"] = Metrics(asset_id="white", sharpness=5.0, brightness=0.99, clipped_high=0.98,
                               clipped_low=0.0, dhash=hashes[7])
    metrics["soft"] = metric("soft", 12.0, hashes[8])           # ~4% of the event median
    metrics["nosegs"] = metric("nosegs", 80.0, hashes[0], segments=[])
    out = pf.select_candidates(assets, metrics)
    assert all(out[f"s{i}"].candidate for i in range(6))
    for bad in ("dark", "white", "soft", "nosegs"):
        assert not out[bad].candidate, bad


def test_soft_rule_needs_enough_peers():
    """With only a few shots there is no meaningful median, so a soft one is not rejected."""
    assets = [asset("a", 0), asset("b", 20), asset("soft", 40)]
    metrics = {"a": metric("a", 400, "0123456789abcdef"), "b": metric("b", 500, "fedcba9876543210"),
               "soft": metric("soft", 10, "00ff00ff00ff00ff")}
    assert pf.select_candidates(assets, metrics)["soft"].candidate


def test_only_assets_with_metrics_are_returned():
    out = pf.select_candidates([asset("a"), asset("b", 20)], {"a": metric("a")})
    assert list(out) == ["a"]


# --- video segments ----------------------------------------------------------------------

def _clip(pattern: str, fps: float = 2.0, seed: int = 0) -> tuple[list[float], list[np.ndarray]]:
    """One 2 fps sample per character: '#' good (steady texture), '.' black, '~' soft."""
    base = np.asarray(texture(360, 200, seed))
    blurred = np.asarray(Image.fromarray(base).filter(ImageFilter.GaussianBlur(4)))
    rng = np.random.default_rng(seed)
    frames = []
    for c in pattern:
        if c == ".":
            frames.append(rng.integers(0, 4, (180, 320), dtype=np.uint8))
        else:
            src = blurred if c == "~" else base
            frames.append(np.clip(src[10:190, 20:340] + rng.normal(0, 2, (180, 320)), 0, 255).astype(np.uint8))
    return [i / fps for i in range(len(pattern))], frames


def test_video_segments_split_around_black():
    times, frames = _clip("##########......########")          # 5 s good, 3 s black, 4 s good
    # boundaries sit halfway between the last good and first bad sample (dt = 0.5 s)
    assert pf.video_segments(times, frames) == [(0.0, 4.75), (7.75, 11.75)]
    # a known duration extends the final stretch to the end of the clip, and clamps it
    assert pf.video_segments(times, frames, duration=12.0)[-1] == (7.75, 12.0)
    assert pf.video_segments(times, frames, duration=11.6)[-1] == (7.75, 11.6)


def test_video_segments_drop_short_stretches_and_soft_frames():
    # 0.75 s lead-in dropped; 3 s kept; a 1 s stretch dropped; 2.5 s soft; 1.5 s (minimum) kept
    times, frames = _clip("##....######....##~~~~~###")
    assert pf.video_segments(times, frames) == [(2.75, 5.75), (11.25, 12.75)]
    # a lone soft sample is forgiven, a lone black one is not
    times, frames = _clip("#####~#####.#####")
    assert pf.video_segments(times, frames) == [(0.0, 5.25), (5.75, 8.25)]


def test_video_segments_edge_cases():
    assert pf.video_segments([], []) == []
    times, frames = _clip("#")
    assert pf.video_segments(times, frames) == []
    times, frames = _clip("........")
    assert pf.video_segments(times, frames) == []


def test_shake_flags_jitter_but_not_a_steady_pan():
    big = np.asarray(texture(900, 600, seed=3))

    def view(x: int, y: int) -> np.ndarray:
        return big[100 + y:280 + y, 200 + x:520 + x]

    pan = [view(12 * i, 0) for i in range(16)]                  # 6% of the frame every step
    assert pf.video_segments([i / 2 for i in range(16)], pan) == [(0.0, 7.75)]

    # 3 s steady, 5 s of the camera jolting between offsets, 3 s steady
    jolts = [(50, 30), (10, 60), (70, 10), (30, 70)] * 3
    clip = [view(0, 0)] * 6 + [view(x, y) for x, y in jolts[:10]] + [view(0, 0)] * 6
    times = [i / 2 for i in range(len(clip))]
    assert pf.video_segments(times, clip) == [(0.0, 2.25), (8.25, 10.75)]
    assert pf.video_segments(times, clip, shake_limit=None) == [(0.0, 10.75)]


# --- measuring ---------------------------------------------------------------------------

def test_measure_all_turns_unreadable_files_into_broken_records(tmp_path, monkeypatch):
    calls = []

    def fake_measure(a, cfg):
        calls.append(a.id)
        if a.id == "bad":
            raise OSError("truncated")
        return metric(a.id)

    monkeypatch.setattr(pf, "measure", fake_measure)
    progress = []
    cfg = Config(library_roots=[], output_dir=tmp_path)
    out = pf.measure_all([asset("ok"), asset("bad", 5)], cfg, progress=lambda d, t: progress.append((d, t)))
    assert out["ok"].candidate and out["ok"].sharpness == 300
    assert out["bad"] == pf.broken_metrics("bad") and not out["bad"].candidate and out["bad"].dhash == "0" * 16
    assert progress == [(1, 2), (2, 2)]


def _media_available() -> bool:
    try:
        from igmp import media  # noqa: F401
    except ImportError:
        return False
    return True


needs_media = pytest.mark.skipif(not _media_available(), reason="igmp.media not available")


@needs_media
def test_measure_photo_end_to_end(tmp_path):
    path = tmp_path / "2026-10-10_170000_Harbor_Party_A7RV_DSC00001.JPG"
    texture(1536, 1024).convert("RGB").save(path, quality=92)
    soft_path = tmp_path / "2026-10-10_170001_Harbor_Party_A7RV_DSC00002.JPG"
    texture(1536, 1024).filter(ImageFilter.GaussianBlur(3)).convert("RGB").save(soft_path, quality=92)
    cfg = Config(library_roots=[], output_dir=tmp_path / "out")
    a = asset("p1", 0, files=[str(path)], preview=str(path))
    b = asset("p2", 1, files=[str(soft_path)], preview=str(soft_path))
    ma, mb = pf.measure(a, cfg), pf.measure(b, cfg)
    assert ma.asset_id == "p1" and len(ma.dhash) == 16 and ma.segments == []
    assert ma.sharpness > 2 * mb.sharpness > 0
    assert 0.2 < ma.brightness < 0.8
    assert pf.hamming(ma.dhash, mb.dhash) <= 10
    out = pf.select_candidates([a, b], {"p1": ma, "p2": mb})
    assert out["p1"].candidate and not out["p2"].candidate and out["p2"].burst_id == "p1"


@needs_ffmpeg
@needs_media
def test_measure_video_end_to_end(tmp_path):
    path = tmp_path / "2026-10-10_170000_Harbor_Party_Pocket3_DJI_0001.MP4"
    src = "testsrc2=size=320x240:rate=30:duration={}".format
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "lavfi", "-i", src(3), "-f", "lavfi", "-i", "color=black:size=320x240:rate=30:duration=2",
         "-f", "lavfi", "-i", src(3),
         "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]", "-map", "[v]",
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", str(path)],
        check=True, capture_output=True)
    cfg = Config(library_roots=[], output_dir=tmp_path / "out")
    a = asset("v1", 0, kind="video", camera="Pocket3", files=[str(path)], preview=str(path), duration_s=8.0)
    m = pf.measure(a, cfg)
    assert len(m.segments) == 2, m.segments
    (s1, e1), (s2, e2) = m.segments
    assert s1 <= 0.5 and 2.5 <= e1 <= 3.5
    assert 4.5 <= s2 <= 5.5 and e2 >= 7.0
    assert m.candidate and m.sharpness > 0 and m.brightness > 0.1 and len(m.dhash) == 16


@needs_ffmpeg
@needs_media
def test_measure_all_survives_a_corrupt_video(tmp_path):
    bad = tmp_path / "2026-10-10_170000_Harbor_Party_Pocket3_DJI_0002.MP4"
    bad.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)    # no moov atom
    cfg = Config(library_roots=[], output_dir=tmp_path / "out")
    out = pf.measure_all([asset("bad", kind="video", camera="Pocket3", files=[str(bad)], preview=str(bad))], cfg)
    assert out["bad"] == pf.broken_metrics("bad")


@needs_media
def test_measure_cached_preview_is_fast(tmp_path):
    path = tmp_path / "2026-10-10_170000_Harbor_Party_A7RV_DSC00003.JPG"
    texture(1024, 683).convert("RGB").save(path, quality=90)
    cfg = Config(library_roots=[], output_dir=tmp_path / "out")
    a = asset("p3", 0, files=[str(path)], preview=str(path))
    pf.measure(a, cfg)                                   # warm the preview cache
    start = time.perf_counter()
    for _ in range(5):
        pf.measure(a, cfg)
    assert (time.perf_counter() - start) / 5 < 0.1
