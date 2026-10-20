import math
import random
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from statistics import median

import numpy as np
import pytest
from PIL import Image

from igmp import media, sequences, taste
from igmp.catalog import asset_id
from igmp.config import Config
from igmp.models import Asset, Metrics, Point, Score
from igmp.prefilter import BLANK_DHASH, broken_metrics
from igmp.reels import source_for
from igmp.store import Store

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
needs_ffmpeg = pytest.mark.skipif(not (Path(FFMPEG).exists() and Path(FFPROBE).exists()),
                                  reason="ffmpeg not installed")

T0 = datetime(2026, 5, 2, 21, 0, 0)
BASE = 0x0F0F_3C3C_5A5A_A5A5


def cfg_for(tmp_path: Path) -> Config:
    return Config(library_roots=[], output_dir=tmp_path / "out", ffmpeg=FFMPEG, ffprobe=FFPROBE)


def hx(v: int) -> str:
    return f"{v & (2 ** 64 - 1):016x}"


def jitter(rng: random.Random, value: int = BASE, bits: int = 3) -> str:
    """The same framing: a few of the 64 hash bits flipped."""
    for b in rng.sample(range(64), bits):
        value ^= 1 << b
    return hx(value)


def photo(i: int, t: datetime, event: str = "Ridge", camera: str = "CamA", kind: str = "photo",
          preview: str | None = None) -> Asset:
    return Asset(id=f"p{i:04d}", kind=kind, files=[preview] if preview else [], preview=preview, taken_at=t,
                 date_label=t.strftime("%Y-%m-%d"), location="Harbor", event=event, camera=camera)


def shoot(offsets: list[float], start: int = 0, hashes: list[str] | None = None, **kw
          ) -> tuple[list[Asset], dict[str, Metrics]]:
    """Photos at T0 + offsets (seconds; truncated to whole seconds like file names are)."""
    rng = random.Random(start)
    assets, metrics = [], {}
    for k, off in enumerate(offsets):
        a = photo(start + k, T0 + timedelta(seconds=math.floor(off)), **kw)
        assets.append(a)
        metrics[a.id] = Metrics(asset_id=a.id, sharpness=100.0 + k, brightness=0.2 + 0.001 * k,
                                clipped_high=0.0, clipped_low=0.01,
                                dhash=hashes[k] if hashes else jitter(rng))
    return assets, metrics


def steady(n: int, interval: float, phase: float = 0.37, at: float = 0.0) -> list[float]:
    return [at + phase + i * interval for i in range(n)]


# --- detection -------------------------------------------------------------------------------

def test_steady_run_becomes_one_sequence():
    assets, metrics = shoot(steady(40, 6.07))
    seqs, out = sequences.detect(assets, metrics)
    assert len(seqs) == 1
    s = seqs[0]
    first = assets[0]
    assert s.kind == "sequence" and s.id == asset_id("sequence", first.id)
    assert s.members == [a.id for a in assets]
    assert s.files == [] and s.preview is None
    assert abs(s.interval_s - 6.07) < 0.05
    assert (s.taken_at, s.date_label, s.location, s.event, s.camera) == (
        first.taken_at, first.date_label, first.location, first.event, first.camera)
    assert s.event_key == first.event_key
    for a in assets:
        assert out[a.id].burst_id == s.id
    # every frame hands over to the clip except the best one, which still competes as a photo
    assert sum(out[a.id].candidate for a in assets) == 1
    m = out[s.id]
    assert m.candidate and m.burst_id == s.id and m.dhash == metrics[first.id].dhash
    assert m.sharpness == median(metrics[a.id].sharpness for a in assets)
    assert m.brightness == pytest.approx(median(metrics[a.id].brightness for a in assets))
    assert metrics[first.id].candidate is True          # the input dict is not modified


def test_fractional_interval_read_through_whole_second_timestamps():
    # 1.75 s leaves gaps of 1 and 2 s in the file names; 3.27 s leaves 3 and 4
    for interval in (1.75, 3.27, 1.0):
        assets, metrics = shoot(steady(60, interval))
        seqs, _ = sequences.detect(assets, metrics)
        assert len(seqs) == 1 and len(seqs[0].members) == 60, interval
        assert seqs[0].interval_s == pytest.approx(interval, abs=0.03)


def test_minimum_length():
    assert sequences.detect(*shoot(steady(sequences.MIN_FRAMES - 1, 5.0)))[0] == []
    assert len(sequences.detect(*shoot(steady(sequences.MIN_FRAMES, 5.0)))[0]) == 1


def test_interval_bounds():
    assert sequences.detect(*shoot(steady(30, 0.6)))[0] == []          # a burst, not an interval
    assert sequences.detect(*shoot(steady(20, 700.0)))[0] == []        # separate shots
    assert len(sequences.detect(*shoot(steady(20, 300.0)))[0]) == 1


def test_handheld_shooting_near_one_frame_a_second_is_not_a_sequence():
    rng = random.Random(7)
    t, offsets = 0.0, []
    for _ in range(60):                       # continuous-low / quick clicking: 0, 1 or 2 s apart
        offsets.append(t)
        t += rng.choice([0.4, 0.9, 1.3, 1.8, 0.6])
    assert sequences.detect(*shoot(offsets))[0] == []


def test_irregular_gaps_are_not_a_sequence():
    rng = random.Random(3)
    offsets = np.cumsum([rng.uniform(2, 20) for _ in range(50)]).tolist()
    assert sequences.detect(*shoot(offsets))[0] == []


def test_dropped_frames_are_tolerated():
    offsets = steady(40, 5.0)
    del offsets[30]                          # one frame missing (a 2x gap)
    del offsets[10:12]                       # two in a row (a 3x gap)
    assets, metrics = shoot(offsets)
    seqs, _ = sequences.detect(assets, metrics)
    assert len(seqs) == 1 and len(seqs[0].members) == 37
    assert seqs[0].interval_s == pytest.approx(5.0, abs=0.05)   # skipped slots don't stretch it


def test_a_pause_splits_runs_and_is_not_taken_for_a_dropped_frame():
    # 60 s interval, then a 108 s pause (1.8x: off the beat), then the same interval again
    offsets = steady(20, 60.0) + steady(20, 60.0, at=19 * 60.0 + 108.0)
    assets, metrics = shoot(offsets)
    seqs, out = sequences.detect(assets, metrics)
    assert [len(s.members) for s in seqs] == [20, 20]
    assert seqs[0].id != seqs[1].id and seqs[1].members[0] == assets[20].id
    assert out[assets[19].id].burst_id == seqs[0].id and out[assets[20].id].burst_id == seqs[1].id


def test_framing_must_hold_but_stop_motion_passes():
    rng = random.Random(11)
    walkabout = [hx(rng.getrandbits(64)) for _ in range(30)]            # a new view every frame
    assert sequences.detect(*shoot(steady(30, 4.0), hashes=walkabout))[0] == []
    # stop-motion: the subject moves (6-14 bits change from one frame to the next) but the camera
    # does not, so over the run the hash wanders far from where it started
    hashes, v = [], BASE
    for _ in range(30):
        hashes.append(hx(v))
        v = int(jitter(rng, v, rng.randint(6, 14)), 16)
    assert sequences.hamming(hashes[0], hashes[-1]) > 16
    assert len(sequences.detect(*shoot(steady(30, 4.0), hashes=hashes))[0]) == 1


def test_runs_stay_within_one_event_and_camera():
    a1, m1 = shoot(steady(30, 4.0, phase=0.1), start=0, camera="CamA")
    a2, m2 = shoot(steady(30, 4.0, phase=2.1), start=100, camera="CamB")     # interleaved in time
    a3, m3 = shoot(steady(30, 4.0, phase=1.1), start=200, event="Beach")
    seqs, _ = sequences.detect(a1 + a2 + a3, {**m1, **m2, **m3})
    assert sorted(len(s.members) for s in seqs) == [30, 30, 30]
    assert {s.camera for s in seqs} == {"CamA", "CamB"} and {s.event for s in seqs} == {"Ridge", "Beach"}


def test_only_still_photos_with_readable_metrics():
    assets, metrics = shoot(steady(30, 4.0))
    as360 = [a.model_copy(update={"kind": "photo360"}) for a in assets]
    assert sequences.detect(as360, metrics)[0] == []
    # an unreadable frame in the middle drops out and leaves a 2x gap
    metrics = dict(metrics)
    metrics[assets[15].id] = broken_metrics(assets[15].id)
    seqs, out = sequences.detect(assets, metrics)
    assert len(seqs) == 1 and assets[15].id not in seqs[0].members and len(seqs[0].members) == 29
    assert out[assets[15].id].dhash == BLANK_DHASH and out[assets[15].id].burst_id != seqs[0].id
    # photos without metrics are not considered at all
    assert sequences.detect(assets, {})[0] == []


def test_dark_night_runs_are_still_candidates():
    assets, metrics = shoot(steady(30, 10.0))
    dark = {k: m.model_copy(update={"brightness": 0.01, "candidate": False}) for k, m in metrics.items()}
    seqs, out = sequences.detect(assets, dark)
    assert out[seqs[0].id].candidate is True


def test_detection_is_deterministic_and_safe_to_rerun():
    assets, metrics = shoot(steady(40, 6.0) + steady(30, 2.0, at=1000.0))
    seqs, out = sequences.detect(assets, metrics)
    again, out2 = sequences.detect(list(reversed(assets)), metrics)
    assert [s.id for s in again] == [s.id for s in seqs] and len(seqs) == 2
    assert {k: v.model_dump() for k, v in out2.items()} == {k: v.model_dump() for k, v in out.items()}

    # the stored sequences come back in the next run: nothing new, members not wrapped twice
    rerun, out3 = sequences.detect(assets + seqs, out)
    assert rerun == []
    assert {k: v.model_dump() for k, v in out3.items()} == {k: v.model_dump() for k, v in out.items()}

    # select_candidates runs first on a re-run and resets members and the sequence; detect restores them
    reset = {k: v.model_copy(update={"candidate": k == assets[0].id, "burst_id": k}) for k, v in out.items()}
    rerun, out4 = sequences.detect(assets + seqs, reset)
    assert rerun == []
    assert all(out4[m].burst_id == s.id for s in seqs for m in s.members)
    assert all(sum(out4[m].candidate for m in s.members) == 1 for s in seqs)
    assert all(out4[s.id].candidate for s in seqs)


# --- previews, instructions --------------------------------------------------------------------

def write_frames(folder: Path, n: int, size=(400, 300), orientation: int | None = None,
                 levels: list[int] | None = None) -> list[Path]:
    """Landscape JPEGs with a red stripe down the stored left edge (the top once an EXIF
    orientation of 6 is applied) and a white square moving right."""
    folder.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(n):
        level = levels[i] if levels else 120
        arr = np.full((size[1], size[0], 3), level, np.uint8)
        arr[:, : size[0] // 8] = (220, 20, 20)
        x = size[0] // 4 + i * 8
        arr[size[1] // 2 - 10: size[1] // 2 + 10, x: x + 20] = 255
        img = Image.fromarray(arr)
        p = folder / f"frame_{i:03d}.jpg"
        if orientation:
            exif = Image.Exif()
            exif[0x0112] = orientation
            img.save(p, "JPEG", quality=92, exif=exif.tobytes())
        else:
            img.save(p, "JPEG", quality=92)
        paths.append(p)
    return paths


def catalogued(tmp_path: Path, n: int = 20, interval: float = 5.0, **frames_kw):
    cfg = cfg_for(tmp_path)
    paths = write_frames(tmp_path / "lib", n, **frames_kw)
    assets = [photo(i, T0 + timedelta(seconds=i * interval), preview=str(p)) for i, p in enumerate(paths)]
    rng = random.Random(1)
    metrics = {a.id: Metrics(asset_id=a.id, sharpness=50.0 + (30 if i == 7 else 0), brightness=0.4,
                             clipped_high=0, clipped_low=0, dhash=jitter(rng)) for i, a in enumerate(assets)}
    seqs, out = sequences.detect(assets, metrics)
    store = Store(cfg.db_path)
    for a in assets + seqs:
        store.put("assets", a.id, a)
    for k, m in out.items():
        store.put("metrics", k, m)
    return cfg, store, seqs[0], assets


def test_member_assets_come_from_the_catalog(tmp_path):
    cfg, store, seq, assets = catalogued(tmp_path, n=16)
    assert [a.id for a in sequences.member_assets(seq, cfg)] == [a.id for a in assets]
    store.delete("assets", assets[3].id)
    with pytest.raises(media.MediaError):
        sequences.member_assets(seq, cfg)


def test_preview_is_a_labelled_contact_sheet(tmp_path, monkeypatch):
    cfg, _, seq, assets = catalogued(tmp_path, n=30, interval=5.0)
    labels = []
    real_label = media._label
    monkeypatch.setattr(media, "_label", lambda img, text, *a, **k: (labels.append(text), real_label(img, text, *a, **k)))
    path = media.preview_image(seq, cfg, size=512)
    assert path == cfg.state_dir / "previews" / f"{seq.id}_512.jpg"
    with Image.open(path) as im:
        assert max(im.size) == 512
    assert len(labels) == sequences.SHEET_FRAMES
    assert labels[0] == "#0 t=+0s" and labels[-1] == "#29 t=+145s"
    mtime = path.stat().st_mtime_ns
    assert media.preview_image(seq, cfg, size=512) == path and path.stat().st_mtime_ns == mtime   # cached


def test_short_run_sheet_shows_every_frame(tmp_path):
    cfg, _, seq, assets = catalogued(tmp_path, n=15)
    sheet = sequences.contact_sheet(seq, sequences.member_assets(seq, cfg), size=600)
    assert max(sheet.size) <= 600 + 26


def test_taste_instructions_ask_for_the_sequence_fields():
    seq = Asset(id="s1", kind="sequence", files=[], members=[f"p{i}" for i in range(120)], interval_s=6.5,
                taken_at=T0, location="Harbor", event="Ridge", camera="CamA")
    text = taste.instructions(seq)
    for word in ("120 photos", "every 6.5 s", "contact sheet", "#index", "t=+seconds", "sequence_style",
                 "'timelapse'", "'stop-motion'", "'not-a-sequence'", "sequence_fps", "sequence_from",
                 "sequence_to", "0..119", "best_in_s, best_out_s and view_yaw_deg are null"):
        assert word in text, word


# --- clips -------------------------------------------------------------------------------------

def test_ffmpeg_args_play_frames_deflickered_into_h264(tmp_path):
    args = sequences.ffmpeg_args(tmp_path / "%06d.jpg", 12, tmp_path / "o.mp4", cfg_for(tmp_path))
    joined = " ".join(args)
    assert "-framerate 12" in joined and "%06d.jpg" in joined
    assert "deflicker" in joined and "-c:v libx264" in joined and "-crf 17" in joined
    assert "-profile:v high" in joined and "-pix_fmt yuv420p" in joined and "-an" in args


def test_clip_cache_names(tmp_path):
    cfg = cfg_for(tmp_path)
    seq = Asset(id="abc", kind="sequence", files=[], members=["a", "b"])
    base = cfg.state_dir / "sequences"
    assert sequences.clip_path(seq, cfg, 24, 0, 10) == base / "abc_24_0_10.mp4"
    assert sequences.clip_path(seq, cfg, 24, 0, 10, (180, 320)) == base / "abc_24_0_10_180x320.mp4"
    assert sequences.clip_path(seq, cfg, 24, 0, 10, None) == base / "abc_24_0_10_src.mp4"
    assert sequences.clip_path(seq, cfg, 24, 0, 10, focus=(0.3, 0.5)) == base / "abc_24_0_10_f0.30-0.50.mp4"


def probe_frames(path: Path) -> dict:
    out = subprocess.run([FFPROBE, "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                          "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames",
                          "-of", "default=nw=1", str(path)], capture_output=True, text=True, check=True).stdout
    return dict(line.split("=", 1) for line in out.splitlines())


def grey_means(path: Path, w: int, h: int) -> np.ndarray:
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w)
    return frames[:, h * 3 // 4:, w // 2:].reshape(len(frames), -1).mean(axis=1)   # plain grey corner


@needs_ffmpeg
def test_render_clip_upright_deflickered_and_cached(tmp_path, monkeypatch):
    levels = [100 if i % 2 else 140 for i in range(12)]                 # flicker between frames
    cfg, store, seq, assets = catalogued(tmp_path, n=16, orientation=6, levels=levels + [120] * 4)
    members = list(reversed(sequences.member_assets(seq, cfg)))         # any order
    clip = sequences.render_clip(seq, members, cfg, 12, 2, 11, size=(180, 320))
    assert clip == cfg.state_dir / "sequences" / f"{seq.id}_12_2_11_180x320.mp4"
    info = probe_frames(clip)
    assert (info["codec_name"], info["profile"], info["pix_fmt"]) == ("h264", "High", "yuv420p")
    assert (info["width"], info["height"], info["r_frame_rate"], info["nb_read_frames"]) == ("180", "320", "12/1", "10")

    # EXIF orientation 6: the stored left edge is the top of the picture
    first = subprocess.run([FFMPEG, "-v", "error", "-i", str(clip), "-frames:v", "1", "-f", "rawvideo",
                            "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    rgb = np.frombuffer(first, np.uint8).reshape(320, 180, 3).astype(int)
    top, bottom = rgb[5:30, 20:160].mean(axis=(0, 1)), rgb[290:315, 20:160].mean(axis=(0, 1))
    assert top[0] > 150 and top[1] < 80 and abs(bottom[0] - bottom[1]) < 20

    # deflicker: frame-to-frame brightness swings shrink well below the source's +-20 levels
    means = grey_means(clip, 180, 320)
    assert np.abs(np.diff(means)).mean() < 0.5 * 40 * (235 - 16) / 255

    # cached: no second render
    monkeypatch.setattr(sequences.subprocess, "run", lambda *a, **k: pytest.fail("re-rendered"))
    mtime = clip.stat().st_mtime_ns
    assert sequences.render_clip(seq, members, cfg, 12, 2, 11, size=(180, 320)) == clip
    assert clip.stat().st_mtime_ns == mtime
    copy = sequences.render_clip(seq, members, cfg, 12, 2, 11, tmp_path / "copy.mp4", (180, 320))
    assert copy.read_bytes() == clip.read_bytes()


@needs_ffmpeg
def test_render_clip_source_aspect_and_inline_decoding(tmp_path):
    cfg, store, seq, assets = catalogued(tmp_path, n=16)
    clip = sequences.render_clip(seq, sequences.member_assets(seq, cfg), cfg, 24, 0, 4, size=None, workers=1)
    info = probe_frames(clip)
    assert (info["width"], info["height"], info["nb_read_frames"]) == ("1920", "1440", "5")


@needs_ffmpeg
def test_reels_use_the_clip_or_the_sharpest_frame(tmp_path):
    cfg, store, seq, assets = catalogued(tmp_path, n=16)
    score = Score(score=7, keep=True, role="moment", subject="clouds", mood="calm",
                  vertical_focus=Point(x=0.5, y=0.5), feed_focus=Point(x=0.5, y=0.5),
                  sequence_style="timelapse", sequence_fps=24, sequence_from=0, sequence_to=11)
    store.put("scores", seq.id, score)
    src = source_for(seq, store, cfg)
    assert src["kind"] == "video" and Path(src["path"]).exists()
    assert probe_frames(Path(src["path"]))["nb_read_frames"] == "12"
    assert source_for(seq, store, cfg) == src                           # reused

    store.put("scores", seq.id, score.model_copy(update={"sequence_style": "not-a-sequence"}))
    assert source_for(seq, store, cfg) == {"kind": "photo", "path": assets[7].preview}   # sharpest member
    with pytest.raises(ValueError):
        source_for(seq, store)
