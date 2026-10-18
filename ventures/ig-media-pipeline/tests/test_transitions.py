"""The segment pipeline: cached per-shot segments (exact frames, natural-sound stems, speed changes),
transitions between them (built-in xfade clips and aitx delegation) and the reel assembled from
both, on small synthetic media. Flat grey frames carry their frame number in their luma code, so
which source frame (or which blend) lands where can be read back exactly."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from igmp import aitx, render
from igmp.config import Config
from igmp.models import MusicChoice, ReelPlan, Shot
from igmp.render import FPS, OUT_H, OUT_W

sys.path.insert(0, str(Path(__file__).parent))
from test_music import T0, click_onset, click_track  # noqa: E402  (the click-track helpers)

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
HAVE_FFMPEG = Path(FFMPEG).exists() and Path(FFPROBE).exists()
needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg not installed")

SW, SH = 192, 108                        # synthetic sources: small 16:9 frames


def cfg_for(tmp: Path, **extra) -> Config:
    # veryfast: an ultrafast stream is never High profile (no CABAC or 8x8 transforms)
    extra = {"reel_preset": "veryfast", "reel_hwaccel": False, "reel_autolevels": False,
             "reel_work_scale": 1.0, **extra}
    return Config(library_roots=[], output_dir=tmp, ffmpeg=FFMPEG, ffprobe=FFPROBE, extra=extra)


def make_video(path: Path, ys: list[int], fps: int = 30, audio: str | None = None) -> Path:
    """A clip of flat frames, frame k at luma code ys[k] (lossless), with an optional aevalsrc
    expression as its sound (16-bit PCM, 48 kHz)."""
    frame = SW * SH
    raw = b"".join(bytes([y]) * frame + bytes([128]) * (frame // 2) for y in ys)
    args = [FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{SW}x{SH}",
            "-r", str(fps), "-i", "-"]
    if audio:
        args += ["-f", "lavfi", "-i", f"aevalsrc='{audio}':s=48000:c=stereo:d={len(ys) / fps}"]
    args += ["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "pcm_s16le"]
    subprocess.run(args + [str(path)], input=raw, check=True)
    return path


def lumas(path: Path) -> np.ndarray:
    """Mean luma code of every frame (Y plane, no range conversion)."""
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-map", "0:v:0", "-vf",
                          "scale=108:192:flags=area,format=yuv420p", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    per = 108 * 192 * 3 // 2
    return np.array([np.frombuffer(out[i:i + 108 * 192], np.uint8).mean() for i in range(0, len(out), per)])


def stem(path: Path, sr: int = 48000) -> np.ndarray:
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", str(sr),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32)


def probe(path: Path) -> dict:
    out = subprocess.run([FFPROBE, "-v", "error", "-show_streams", "-of", "json", str(path)],
                         capture_output=True, check=True).stdout
    return {s["codec_type"]: s for s in json.loads(out)["streams"]}


def tone(y: np.ndarray, f: float, sr: int = 48000) -> float:
    """dB level of the f Hz component of y (a windowed single-bin DFT)."""
    if len(y) < 16:
        return -200.0
    w = np.hanning(len(y))
    t = np.arange(len(y)) / sr
    return float(20 * np.log10(np.abs(np.sum(y * w * np.exp(-2j * np.pi * f * t))) / (w.sum() / 2) + 1e-12))


def plan_of(*shots: Shot, music: MusicChoice | None = None) -> ReelPlan:
    return ReelPlan(event_key="e", shots=list(shots), cover_asset_id="a", caption="c", music=music)


@pytest.fixture(scope="module")
def media(tmp_path_factory):
    if not HAVE_FFMPEG:
        pytest.skip("ffmpeg not installed")
    d = tmp_path_factory.mktemp("segments")
    return {
        # A: 30 frames, lumas 40..98, a 440 Hz tone; B: 30 frames, 140..198, an 880 Hz tone
        "a": make_video(d / "a.mov", [40 + 2 * k for k in range(30)], audio="0.3*sin(2*PI*440*t)"),
        "b": make_video(d / "b.mov", [140 + 2 * k for k in range(30)], audio="0.3*sin(2*PI*880*t)"),
        # 90 frames counting up: two codes a frame at 30 fps, one at 60 fps
        "ramp30": make_video(d / "ramp30.mov", [20 + 2 * k for k in range(90)]),
        "ramp60": make_video(d / "ramp60.mov", [20 + k for k in range(90)], fps=60),
        # a flash frame and a 3 kHz click every second from 0.2 s (frames 6, 36, ...), over a quiet hum
        "clicks": make_video(d / "clicks.mov", [200 if k % 30 == 6 else 40 for k in range(120)],
                             audio="0.02*sin(2*PI*200*t)+if(between(mod(t,1),0.2,0.204),0.8*sin(2*PI*3000*t),0)"),
        "dir": d,
    }


def segment(media, cfg, shot: Shot, key: str, **entry) -> tuple[Path, render.SegmentSource]:
    src = render.prepare_sources(plan_of(shot), {shot.asset_id: {"kind": "video", "path": str(media[key]), **entry}},
                                 media["dir"], cfg)[0]
    return render.render_segment(shot, src, cfg), src


# --------------------------------------------------------------------------- pure


def test_plan_transitions_and_specs():
    shots = [Shot(asset_id="a", duration_s=1)] + [Shot(asset_id="a", duration_s=1, transition=t) for t in
                                                  ("cut", "crossfade", "whip-left", "wipe", "morph", "zoom-through",
                                                   "flash", "ramp-cut", "dip-black", "zoom-in")]
    specs = render.plan_transitions(plan_of(*shots))
    assert [s.kind for s in specs] == ["cut", "crossfade", "whip-left", "wipe", "morph", "zoom_through", "flash",
                                       "speed_ramp_cut", "dip-black", "zoom-in"]
    frames = [render.as_tspec(s).frames for s in specs]
    assert frames == [0, 16, 8, 28, 16, 14, 10, 18, 18, 10] and all(f % 2 == 0 for f in frames)
    assert all(isinstance(s, aitx.Transition) for s in specs)
    # anything aitx.as_spec takes, plan names, odd lengths rounded to even
    assert render.as_tspec({"kind": "ramp-cut", "duration_s": 0.5}).kind == "speed_ramp_cut"
    assert render.as_tspec(aitx.TransitionSpec(kind="whip", duration_s=0.3, direction="left")).frames == 10
    assert render.as_tspec(aitx.Transition(kind="luma-dip", duration_s=0.5)).frames == 16
    assert render.as_tspec(None).kind == "cut" and render.as_tspec("none").frames == 0
    with pytest.raises(ValueError):
        render.as_tspec("spin")
    # fitted like aitx.fit_specs: each segment keeps a frame of its own, counts stay even
    fit = render.fit_transitions([10, 12, 30], ["crossfade", "wipe"])
    assert [f.frames for f in fit] == [16, 6]                       # the wipe gets what B's segment has left
    assert [f.frames for f in render.fit_transitions([10, 6, 30], ["crossfade", "wipe"])] == [10, 0]
    assert render.fit_transitions([1, 30], ["crossfade"])[0].kind == "cut"


def test_timeline_is_centred_and_exact():
    specs = render.fit_transitions([60, 45, 30], ["crossfade", "cut"])
    pieces = render.timeline(["a", "b", "c"], [60, 45, 30], specs, ["t0", None])
    assert [(p.path, p.first, p.frames) for p in pieces] == [("a", 0, 52), ("t0", 0, 16), ("b", 8, 37), ("c", 0, 30)]
    assert sum(p.frames for p in pieces) == 135
    t = pieces[1]
    assert (t.shot, t.shot_b, t.split) == (0, 1, 8)
    # the clip starts ha frames before the cut at 60 and ends hb after it
    assert 52 == 60 - t.split and 52 + t.frames == 60 + 8
    assert pieces[0].fade_in and not pieces[0].fade_out and pieces[2].fade_out and pieces[3].fade_in


def test_ramp_maps_time_by_the_eased_integral():
    d, s0, s1 = 3.0, 1.0, 0.4
    t = render._ramp_source_time(np.linspace(0, d, 7), d, s0, s1)
    assert t[0] == 0 and t[-1] == pytest.approx(d * (s0 + s1) / 2)
    v = np.gradient(render._ramp_source_time(np.linspace(0, d, 301), d, s0, s1), d / 300)
    assert v[1] == pytest.approx(s0, abs=0.01) and v[-2] == pytest.approx(s1, abs=0.01)
    assert np.all(np.diff(v) <= 1e-9)                                # slows down monotonically
    head = render._ramp_setpts(s0, s1, d)
    assert head.startswith("settb=AVTB,setpts='if(lte(") and head.endswith(f"*{d:.9f}/TB'")


# --------------------------------------------------------------------------- segments


@needs_ffmpeg
def test_segment_cache_hit_and_rerender_on_change(media, tmp_path, monkeypatch):
    cfg = cfg_for(tmp_path)
    shot = Shot(asset_id="v", duration_s=0.5)
    seg, src = segment(media, cfg, shot, "a")
    assert seg.parent == cfg.state_dir / "segments" and seg.name == render.segment_key(shot, src, cfg) + ".mov"
    assert not list(seg.parent.glob(".*"))                           # temp files renamed away
    calls = []
    real_run = render._run
    monkeypatch.setattr(render, "_run", lambda args, **kw: calls.append(args) or real_run(args, **kw))
    assert render.render_segment(shot, src, cfg) == seg and calls == []     # a cache hit runs nothing
    moved = shot.model_copy(update={"start_s": 0.2})
    other = render.render_segment(moved, src, cfg)
    assert other != seg and other.exists() and len(calls) >= 1
    # a different source file (same name, new contents) is a different segment too
    assert render.segment_key(shot, src, cfg) != render.segment_key(shot, src, cfg, draft=True)
    copy = tmp_path / "a.mov"
    shutil.copyfile(media["a"], copy)
    src2 = render.SegmentSource(**{**src.__dict__, "path": str(copy), "origin": str(copy)})
    assert render.segment_key(shot, src2, cfg) != render.segment_key(shot, src, cfg)


@needs_ffmpeg
def test_segment_exact_frames_and_stem(media, tmp_path):
    cfg = cfg_for(tmp_path)
    seg, _ = segment(media, cfg, Shot(asset_id="v", start_s=0.1, duration_s=0.8), "a")   # inside the 1 s clip
    s = probe(seg)
    v, a = s["video"], s["audio"]
    assert (v["width"], v["height"], v["r_frame_rate"], int(v["nb_frames"])) == (OUT_W, OUT_H, "30/1", 24)
    assert v["codec_name"] in ("prores", "h264") and v.get("color_space") == "bt709" and v.get("color_range") == "tv"
    assert (a["codec_name"], a["sample_rate"], a["channels"]) == ("pcm_s16le", "48000", 2)
    y = stem(seg)
    assert len(y) == 24 * 1600                                     # exactly the frames' length
    assert tone(y, 440) > -15
    np.testing.assert_allclose(lumas(seg), [40 + 2 * (3 + k) for k in range(24)], atol=1.0)   # from frame 3
    # a still has a silent stem of the same length
    from PIL import Image
    Image.new("RGB", (300, 200), (90, 120, 150)).save(tmp_path / "p.png")
    shot = Shot(asset_id="p", duration_s=0.4)
    src = render.prepare_sources(plan_of(shot), {"p": {"kind": "photo", "path": str(tmp_path / "p.png")}},
                                 tmp_path, cfg)[0]
    still = render.render_segment(shot, src, cfg)
    assert int(probe(still)["video"]["nb_frames"]) == 12
    y = stem(still)
    assert len(y) == 12 * 1600 and not y.any()


@needs_ffmpeg
def test_speed_up_slow_motion_and_ramp(media, tmp_path):
    cfg = cfg_for(tmp_path)
    # 2x: every other source frame, the sound kept at 2x
    seg, _ = segment(media, cfg, Shot(asset_id="v", duration_s=1.0, speed=2.0), "ramp30")
    np.testing.assert_allclose(lumas(seg), [20 + 4 * k for k in range(30)], atol=1.0)
    # 0.5x of 60 fps: the source's own frames, one each
    seg, src = segment(media, cfg, Shot(asset_id="v", duration_s=1.0, speed=0.5), "ramp60")
    assert src.fps == 60 and render._timing(Shot(asset_id="v", duration_s=1.0, speed=0.5), src, cfg, 30).method == "real"
    np.testing.assert_allclose(lumas(seg), [20 + k for k in range(30)], atol=1.0)
    # 0.5x of 30 fps: source frames on even frames, interpolated (not repeated) in between
    shot = Shot(asset_id="v", duration_s=1.0, speed=0.5)
    seg, src = segment(media, cfg, shot, "ramp30")
    assert render._timing(shot, src, cfg, 30).method == "interpolated"
    got = lumas(seg)[:28]
    np.testing.assert_allclose(got[0::2], [20 + 2 * k for k in range(14)], atol=1.0)
    np.testing.assert_allclose(got[1::2], [21 + 2 * k for k in range(14)], atol=0.6)
    # dup instead: repeated frames
    seg, _ = segment(media, cfg_for(tmp_path, reel_slowmo="dup"), shot, "ramp30")
    assert np.allclose(lumas(seg)[:28:2], lumas(seg)[1:28:2], atol=1.0)
    # a ramp 1.0 -> 0.5 over 2 s of 60 fps: real frames, slowing from 2 to 1 source frames a frame
    shot = Shot(asset_id="v", duration_s=2.0, speed=1.0, speed_to=0.5)
    seg, src = segment(media, cfg, shot, "ramp60")
    assert render._timing(shot, src, cfg, 60).method == "ramp-real"
    idx = lumas(seg) - 20
    assert len(idx) == 60 and idx[0] == pytest.approx(0, abs=1)
    want = render._ramp_source_time(np.arange(60) / FPS, 2.0, 1.0, 0.5) * 60
    assert np.abs(idx - np.minimum(want, 89)).max() <= 1.01                 # the eased time map, to a frame
    assert np.diff(idx)[:5].mean() == pytest.approx(2.0, abs=0.3) and np.diff(idx)[-10:].mean() == pytest.approx(1.0, abs=0.3)
    # a ramp too slow for 30 fps frames is interpolated
    shot = Shot(asset_id="v", duration_s=1.0, speed=1.0, speed_to=0.4)
    seg, src = segment(media, cfg, shot, "ramp30")
    assert render._timing(shot, src, cfg, 30).method == "ramp-interpolated"
    idx = (lumas(seg) - 20) / 2
    want = render._ramp_source_time(np.arange(30) / FPS, 1.0, 1.0, 0.4) * 30
    assert np.abs(idx - want).max() < 0.6 and np.all(np.diff(idx) >= 0)    # in-between frames blend
    assert len(set(np.round(idx * 2))) > 25                                 # hardly a repeated frame


@needs_ffmpeg
def test_natural_sound_stays_in_sync_across_a_speed_change(media, tmp_path):
    cfg = cfg_for(tmp_path)
    for speed in (1.0, 2.0):
        seg, _ = segment(media, cfg, Shot(asset_id="v", duration_s=1.5, speed=speed), "clicks")
        flashes = np.flatnonzero(lumas(seg) > 120)
        want = [int(round((6 + 30 * k) / speed)) for k in range(4) if (6 + 30 * k) / speed < 45]
        assert list(flashes) == want
        y = stem(seg)
        assert len(y) == 45 * 1600
        for f in want:
            # atempo (WSOLA) places each ~42 ms grain to within a few ms: 4 ms at speed 1, 8 sped up
            tol = 0.004 if speed == 1.0 else 0.008
            assert abs(click_onset(y, 48000, f / FPS, f=3000.0) - f / FPS) < tol, (speed, f)
    # slow motion is muted
    seg, _ = segment(media, cfg, Shot(asset_id="v", duration_s=1.0, speed=0.5), "clicks")
    assert not stem(seg).any()


# --------------------------------------------------------------------------- transitions


@pytest.fixture(scope="module")
def pair(media, tmp_path_factory):
    cfg = cfg_for(tmp_path_factory.mktemp("pair"))
    a, _ = segment(media, cfg, Shot(asset_id="v", duration_s=1.0), "a")
    b, _ = segment(media, cfg, Shot(asset_id="v", duration_s=1.0), "b")
    return cfg, a, b


@needs_ffmpeg
@pytest.mark.parametrize("kind", ["crossfade", "whip-left", "whip-right", "zoom-in", "dip-black", "wipe",
                                  "flash-white"])
def test_builtin_transition_clip(pair, kind):
    cfg, a, b = pair
    clip = render.render_transition(a, b, kind, None, cfg)
    n = render.as_tspec(kind).frames
    ha, hb = n // 2, n - n // 2
    assert clip.parent == cfg.state_dir / "transitions"
    s = probe(clip)
    assert int(s["video"]["nb_frames"]) == n and s["video"]["codec_name"] == probe(a)["video"]["codec_name"]
    y = lumas(clip)
    assert len(y) == n
    assert y[0] == pytest.approx(40 + 2 * (30 - ha), abs=1.0)            # A at the trim point
    assert y[-1] == pytest.approx(140 + 2 * (hb - 1), abs=1.0)           # B just before it resumes
    if kind in ("crossfade", "wipe", "whip-left", "whip-right"):         # halfway at the cut
        mid = (40 + 2 * 29 + 140) / 2
        assert y[ha - 1] < mid + 3 and y[ha] > mid - 3
    if kind == "dip-black":
        assert y[ha - 1:ha + 1].min() < 25                               # black at the cut
    if kind == "flash-white":
        assert y[ha - 1:ha + 1].max() > 220
    # sound: A's tone under A's half, B's under B's, exactly n frames long
    st = stem(clip)
    assert len(st) == n * 1600
    cut = ha * 1600
    assert tone(st[:cut - 900], 440) > tone(st[:cut - 900], 880) + 20
    assert tone(st[cut + 900:], 880) > tone(st[cut + 900:], 440) + 20
    # cached: the same clip again
    assert render.render_transition(a, b, kind, None, cfg) == clip


@needs_ffmpeg
def test_whip_is_motion_blurred_in_the_middle(pair, tmp_path):
    cfg, a, b = pair
    # segments with a vertical edge, so a horizontal blur shows; at the fit foreground's own size
    # (1080x608), so the edge is still a hard one in the segment (an upscaled 192 px edge is not)
    ew, eh = OUT_W, 608
    img = np.full((eh, ew), 40, np.uint8)
    img[:, ew // 2:] = 200
    raw = (img.tobytes() + bytes([128]) * (ew * eh // 2)) * 30
    src = tmp_path / "edge.mov"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{ew}x{eh}", "-r", "30",
                    "-i", "-", "-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", str(src)], input=raw, check=True)
    media = {"edge": src, "dir": tmp_path}
    e, _ = segment(media, cfg, Shot(asset_id="v", duration_s=1.0, layout="fit"), "edge")
    clip = render.render_transition(e, e, {"kind": "whip-left", "duration_s": 8 / FPS}, tmp_path / "w.mov", cfg)
    assert clip == tmp_path / "w.mov"
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(clip), "-vf", "format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    fr = np.frombuffer(out, np.uint8).reshape(-1, OUT_H, OUT_W).astype(float)
    sharp = [np.abs(np.diff(f[900:1000], axis=1)).max() for f in fr]
    assert sharp[0] > 100 and sharp[-1] > 100 and min(sharp[3:5]) < 30   # the ends sharp, the middle smeared


@needs_ffmpeg
def test_aitx_delegation_and_fallback(pair, monkeypatch):
    cfg, a, b = pair
    calls = []
    template = render.render_transition(a, b, {"kind": "crossfade", "duration_s": 16 / FPS}, None, cfg)

    def fake(a_seg, b_seg, spec, out, cfg_, **kw):
        calls.append(spec)
        shutil.copyfile(template, out)
        return Path(out)
    monkeypatch.setattr(aitx, "render_transition", fake)
    monkeypatch.setattr(aitx, "supports", lambda spec, cfg=None: True)
    clip = render.render_transition(a, b, aitx.Transition(kind="morph", duration_s=0.5), None, cfg)
    assert len(calls) == 1 and calls[0].kind == "morph" and calls[0].frames() == 16
    assert clip.exists() and clip.parent != cfg.state_dir / "transitions"      # aitx's own cache
    # built-ins never go to aitx (its supports() leaves them to the renderer), whatever it says
    monkeypatch.setattr(aitx, "supports", lambda spec, cfg=None: str(spec["kind"]) in aitx.SUPPORTED)
    calls.clear()
    assert render.render_transition(a, b, "wipe", None, cfg).parent == cfg.state_dir / "transitions"
    assert render.render_transition(a, b, "zoom-through", None, cfg).parent != cfg.state_dir / "transitions"
    assert [c.kind for c in calls] == ["zoom_through"]
    # without full quality: the built-in stand-in, or a cut for a ramp-cut
    monkeypatch.setattr(aitx, "supports", lambda spec, cfg=None: False)
    calls.clear()
    morph = render.render_transition(a, b, "morph", None, cfg)
    assert calls == [] and morph.parent == cfg.state_dir / "transitions"
    assert lumas(morph)[0] == pytest.approx(lumas(template)[0], abs=1.0)        # a crossfade
    assert render.render_transition(a, b, "ramp-cut", None, cfg) is None
    assert render.render_transition(a, b, "cut", None, cfg) is None


# --------------------------------------------------------------------------- the reel


@needs_ffmpeg
def test_render_reel_exact_frames_and_transitions_on_the_cuts(media, tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(Shot(asset_id="a", duration_s=1.0), Shot(asset_id="b", duration_s=1.0, transition="crossfade"),
                   Shot(asset_id="a", duration_s=0.8, transition="dip-black"),
                   Shot(asset_id="b", duration_s=0.6, start_s=0.2))
    srcs = {k: {"kind": "video", "path": str(media[k])} for k in ("a", "b")}
    out = render.render_reel(plan, srcs, tmp_path / "r.mp4", cfg)
    s = probe(out)
    assert int(s["video"]["nb_frames"]) == 30 + 30 + 24 + 18 and s["video"]["profile"] == "High"
    y = lumas(out)
    assert len(y) == 102
    # crossfade 16 frames centred on the cut at 30: the halfway luma falls between frames 29 and 30
    a_end, b_start = 40 + 2 * 29, 140
    mid = (a_end + b_start) / 2
    assert y[29] < mid < y[30] and abs((y[29] + y[30]) / 2 - mid) < 6
    assert y[21] == pytest.approx(40 + 2 * 21, abs=2) and y[38] == pytest.approx(140 + 2 * 8, abs=2)
    # dip-black 18 frames centred on the cut at 60: darkest around it, symmetric
    assert y[59:61].min() < 25 and y[55] < 140 + 2 * 25 - 10
    # the hard cut at 84 is exact
    assert y[83] == pytest.approx(40 + 2 * 23, abs=2) and y[84] == pytest.approx(140 + 2 * 6, abs=2)
    # transitions can be given (any spec shape); a transition that cannot fit becomes shorter
    out2 = render.render_reel(plan, srcs, tmp_path / "r2.mp4", cfg,
                              transitions=[{"kind": "whip-right", "duration_s": 0.3}, None, "wipe"])
    assert int(probe(out2)["video"]["nb_frames"]) == 102
    assert render.LAST_RENDER["transitions"] == {0: "whip-right", 2: "wipe"}


@needs_ffmpeg
def test_beats_and_natural_sound_with_music(media, tmp_path):
    """Cuts on the beats of a click track (120 BPM, beat 0 at T0), with a crossfade and a
    sped-up clip whose own clicks (off the beat) stay on its picture: the music's clicks land within
    3 ms of where they were in the track, the clip's clicks (through atempo at 2x) within 8 ms of its
    flash frames."""
    cfg = cfg_for(tmp_path)
    song = click_track(tmp_path / "song.mp3", 120, seconds=12, level=0.8)
    plan = plan_of(Shot(asset_id="a", duration_s=1.5), Shot(asset_id="c", duration_s=1.5, speed=2.0, transition="crossfade"),
                   Shot(asset_id="b", duration_s=1.0, transition="cut"), music=MusicChoice(track_id="t", start_s=T0))
    srcs = {"a": {"kind": "video", "path": str(media["a"])}, "b": {"kind": "video", "path": str(media["b"])},
            "c": {"kind": "video", "path": str(media["clicks"])}}
    out = render.render_reel(plan, srcs, tmp_path / "m.mp4", cfg, music=song)
    assert int(probe(out)["video"]["nb_frames"]) == 120
    y = stem(out)
    for k in range(1, 7):                                 # the track's beats, relative to the window
        assert abs(click_onset(y, 48000, 0.5 * k) - 0.5 * k) < 0.003, k
    flashes = [45 + f for f in np.flatnonzero(lumas(out)[45:90] > 120)]
    assert flashes == [48, 63, 78]                        # the clip's flash frames at 2x
    for f in (63, 78):
        assert abs(click_onset(y, 48000, f / FPS, f=3000.0) - f / FPS) < 0.008, f


@needs_ffmpeg
def test_draft_and_final(media, tmp_path):
    cfg = cfg_for(tmp_path)
    plan = plan_of(Shot(asset_id="a", duration_s=0.5), Shot(asset_id="b", duration_s=0.5, transition="crossfade"))
    srcs = {k: {"kind": "video", "path": str(media[k])} for k in ("a", "b")}
    final = render.render_reel(plan, srcs, tmp_path / "f.mp4", cfg)
    keys_final = set(p.name for p in (cfg.state_dir / "segments").glob("*.mov"))
    draft = render.render_reel(plan, srcs, tmp_path / "d.mp4", cfg, draft=True)
    keys_all = set(p.name for p in (cfg.state_dir / "segments").glob("*.mov"))
    assert len(keys_all) == 2 * len(keys_final)                  # drafts are cached apart
    for f in (final, draft):
        v = probe(f)["video"]
        assert int(v["nb_frames"]) == 30 and v["codec_name"] == "h264" and (v["width"], v["height"]) == (OUT_W, OUT_H)
    np.testing.assert_allclose(lumas(draft), lumas(final), atol=3)
