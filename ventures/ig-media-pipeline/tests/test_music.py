"""Music: licensed library, beat/tempo analysis on synthetic click tracks, window choice, beat
snapping of reel plans, the ffmpeg mix, and a small real render measured for loudness."""
from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from igmp import music, reels, render
from igmp.config import Config
from igmp.models import Asset, MusicChoice, Point, ReelPlan, Shot
from igmp.render import FPS, AudioMix, SegmentSource, build_audio_args, build_ffmpeg_args

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
HAVE_FFMPEG = Path(FFMPEG).exists() and Path(FFPROBE).exists()
needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg not installed")
try:
    import librosa  # noqa: F401
    HAVE_LIBROSA = True
except ImportError:                                     # pragma: no cover
    HAVE_LIBROSA = False
needs_analysis = pytest.mark.skipif(not (HAVE_FFMPEG and HAVE_LIBROSA), reason="ffmpeg or librosa missing")

T0 = 0.25            # first beat of every synthetic track


def cfg_for(tmp_path, **extra) -> Config:
    extra = {"reel_preset": "ultrafast", "reel_hwaccel": False, **extra}
    return Config(library_roots=[], output_dir=tmp_path, ffmpeg=FFMPEG, ffprobe=FFPROBE,
                  reel_seconds=15.0, extra=extra)


def click_track(path: Path, bpm: float, seconds: float = 40.0, meter: int = 4, intro: float = 0.0,
                level: float = 1.0) -> Path:
    """A synthetic song: a 1.8 kHz click on every beat, a 70 Hz kick on every bar line, an
    A major pad. With `intro`, everything before that time plays at 12%."""
    p = 60.0 / bpm
    tt = f"(t-{T0})"
    beat = f"0.5*sin(2*PI*1800*t)*exp(-90*mod({tt},{p}))"
    kick = f"0.9*sin(2*PI*70*t)*exp(-18*mod({tt},{meter * p}))"
    pad = "0.12*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t))"
    gain = f"if(lt(t,{intro}),0.12,1)*{level}" if intro else f"{level}"
    expr = f"(if(gte(t,{T0}),{beat}+{kick},0)+{pad})*{gain}"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{expr}':s=44100:d={seconds}",
                    "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", str(path)], check=True)
    return path


def licensed(path: Path, license="CC0-1.0", attribution=None, **more) -> Path:
    rec = {"source": "test synth", "license": license, "attribution": attribution,
           "url": "https://example.org/track", **more}
    path.with_name(path.name + ".license.json").write_text(json.dumps(rec))
    return path


def truth(bpm: float, seconds: float = 40.0) -> np.ndarray:
    p = 60.0 / bpm
    return T0 + p * np.arange(int((seconds - T0) / p) + 1)


@pytest.fixture(scope="module")
def tracks(tmp_path_factory):
    """Analysed synthetic tracks, shared by the tests (analysis is the slow part)."""
    if not (HAVE_FFMPEG and HAVE_LIBROSA):
        pytest.skip("ffmpeg or librosa missing")
    d = tmp_path_factory.mktemp("music")
    cfg = cfg_for(d)
    out = {}
    for name, kw in {"c90": dict(bpm=90), "c120": dict(bpm=120), "c128": dict(bpm=128),
                     "c140": dict(bpm=140), "waltz": dict(bpm=132, meter=3),
                     "intro": dict(bpm=120, intro=8.25)}.items():
        path = click_track(d / f"{name}.mp3", **kw)
        out[name] = (kw, music.analyze(path, cfg))
    return out


# --------------------------------------------------------------------------- library and licences


def test_unlicensed_and_restricted_tracks_are_never_used(tmp_path, caplog):
    cfg = cfg_for(tmp_path)
    lib = music.music_dir(cfg)
    lib.mkdir(parents=True)
    for name in ("free.mp3", "nolicence.mp3", "nc.mp3", "nd.wav", "broken.mp3", "short.flac"):
        (lib / name).write_bytes(name.encode())                  # content only matters for the id
    licensed(lib / "free.mp3")
    licensed(lib / "nc.mp3", "CC-BY-NC-4.0")
    licensed(lib / "nd.wav", "CC BY-ND 4.0")
    (lib / "broken.mp3.license.json").write_text("{not json")
    (lib / "short.license.json").write_text(json.dumps({"source": "s", "license": "Pixabay Content License"}))
    (lib / "notes.txt").write_text("not audio")
    with caplog.at_level(logging.WARNING, logger="igmp.music"):
        found = music.library(cfg)
    assert sorted(t.path.name for t in found) == ["free.mp3", "short.flac"]
    log = caplog.text
    assert "nolicence.mp3 has no" in log and "non-commercial" in log and "no adaptations" in log
    assert "unreadable licence record broken.mp3.license.json" in log
    ids = {t.id for t in found}
    assert len(ids) == 2 and all(re.fullmatch(r"[0-9a-f]{16}", i) for i in ids)
    # the id follows the content, not the name
    (lib / "free.mp3").rename(lib / "renamed.mp3")
    assert music.track_id(lib / "renamed.mp3") in ids


def test_music_dir_setting_and_switch(tmp_path):
    cfg = cfg_for(tmp_path)
    assert music.enabled(cfg) and music.music_dir(cfg) == tmp_path / "music"
    assert music.library(cfg) == []                              # no folder: no music, no error
    cfg = cfg_for(tmp_path, music="none", music_dir=str(tmp_path / "elsewhere"))
    assert not music.enabled(cfg) and music.music_dir(cfg) == tmp_path / "elsewhere"


@pytest.mark.parametrize("lic, attribution, expect", [
    ("CC0-1.0", None, None),
    ("CC0-1.0", "Someone", None),                                # CC0 asks for nothing
    ("Pixabay Content License", None, None),
    ("generated:ACE-Step Apache-2.0", None, None),
    ("CC-BY-4.0", "\"Dawn\" by A. Composer (CC BY 4.0)", "Music: \"Dawn\" by A. Composer (CC BY 4.0)"),
    ("CC BY-SA 4.0", None, "Music: \"Dawn\" (https://example.org/track), CC BY-SA 4.0"),
    ("Some Custom Licence", "Music by B", "Music by B"),
])
def test_attribution_line(tmp_path, lic, attribution, expect):
    t = music.Track("x", tmp_path / "dawn.mp3",
                    music.License(source="s", license=lic, attribution=attribution,
                                  url="https://example.org/track", title="Dawn"))
    assert music.attribution_line(t) == expect


def test_licence_short_names():
    def short(name):
        return music.License(source="s", license=name).short
    assert short("CC0-1.0") == "CC0" and short("Pixabay Content License") == "Pixabay"
    assert short("generated:ACE-Step Apache-2.0") == "generated" and short("CC BY 4.0") == "CC-BY"


# --------------------------------------------------------------------------- analysis


@needs_analysis
@pytest.mark.parametrize("name", ["c90", "c120", "c128", "c140"])
def test_tempo_and_beats_on_click_tracks(tracks, name):
    kw, info = tracks[name]
    assert info.steady_tempo and abs(info.tempo_bpm - kw["bpm"]) < 0.1
    true = truth(kw["bpm"])
    beats = np.array(info.beats)
    err = np.abs(beats[:, None] - true[None, :]).min(axis=1)
    assert err.max() < 0.010                                     # every beat within 10 ms
    assert len(beats) >= len(true) - 1                           # and none missing
    # bar lines: every 4th beat, starting with the first kick
    downs = np.array(info.downbeats)
    assert info.beats_per_bar == 4 and abs(downs[0] - T0) < 0.01
    assert np.abs(np.diff(downs) - 4 * 60 / kw["bpm"]).max() < 0.01
    assert info.duration_s == pytest.approx(40, abs=0.1)
    assert -30 < info.loudness_lufs < -5 and info.true_peak_dbtp < 3
    assert len(info.energy) == len(info.onset) == pytest.approx(400, abs=2)


@needs_analysis
def test_three_four_time(tracks):
    kw, info = tracks["waltz"]
    assert abs(info.tempo_bpm - 132) < 0.1 and info.beats_per_bar == 3
    assert abs(info.downbeats[1] - info.downbeats[0] - 3 * 60 / 132) < 0.01


@needs_analysis
def test_energy_and_mood_words(tracks):
    slow, fast = tracks["c90"][1], tracks["c140"][1]
    assert fast.energy_score > slow.energy_score
    assert fast.energy_level == "high" and slow.energy_level in ("low", "medium")
    for info in (slow, fast):
        assert info.brightness in ("bright", "dark") and len(info.mood) >= 2
        assert re.fullmatch(r"[A-G]#? (major|minor)", info.key)


@needs_analysis
def test_analysis_is_cached(tmp_path, monkeypatch):
    cfg = cfg_for(tmp_path)
    path = click_track(tmp_path / "t.mp3", 120, seconds=20)
    first = music.analyze(path, cfg)
    assert (cfg.state_dir / "music" / f"{first.id}.json").exists()
    monkeypatch.setattr(music, "_features", lambda y: pytest.fail("analysed twice"))
    assert music.analyze(path, cfg) == first


@needs_analysis
def test_best_window_starts_on_the_entrance(tracks):
    _, info = tracks["intro"]                                    # quiet for 4 bars, full from 8.25 s
    start = music.best_window(info, 15.0)
    assert abs(start - 8.25) < 0.01
    _, steady = tracks["c120"]
    start = music.best_window(steady, 15.0)
    assert any(abs(start - d) < 1e-6 for d in steady.downbeats)  # always a bar line
    assert start + 15.0 <= steady.duration_s


@needs_analysis
def test_beat_grid_is_relative_to_the_window(tracks):
    _, info = tracks["c120"]
    start = music.nearest_downbeat(info, 8.25)
    assert abs(start - 8.25) < 0.005
    grid = music.beat_grid(info, start, 14.9)
    assert grid[0] == 0.0 and grid[-1] <= 14.9
    assert np.allclose(np.diff(grid), 0.5, atol=0.001) and len(grid) == 30
    bars = music.beat_grid(info, start, 14.9, downbeats_only=True)
    assert np.allclose(bars, np.arange(0, 14.9, 2.0), atol=0.001)


@needs_analysis
def test_library_listing(tmp_path):
    cfg = cfg_for(tmp_path)
    lib = music.music_dir(cfg)
    lib.mkdir(parents=True)
    licensed(click_track(lib / "drive.mp3", 128, seconds=30), "CC-BY-4.0", title="Night Drive")
    click_track(lib / "unlicensed.mp3", 100, seconds=30)
    licensed(click_track(lib / "tiny.mp3", 100, seconds=8))      # shorter than a reel: not offered
    text = music.library_listing(cfg, used={})
    lines = text.splitlines()
    assert len(lines) == 1
    tid = music.track_id(lib / "drive.mp3")
    assert lines[0].startswith(f'id={tid} "Night Drive": 128 BPM (beat 0.469s), ')
    assert " energy, " in lines[0] and ", 0:30, start " in lines[0] and lines[0].endswith("CC-BY")
    assert "used 2x" in music.library_listing(cfg, used={tid: 2})


# --------------------------------------------------------------------------- reels: picking and snapping


def fake_info(bpm=126.0, first=0.3, seconds=90.0, per_bar=4) -> music.TrackInfo:
    p = 60.0 / bpm
    beats = [round(first + k * p, 4) for k in range(int((seconds - first) / p))]
    n = int(seconds / music.CURVE_HOP)
    return music.TrackInfo(id="t1", duration_s=seconds, tempo_bpm=bpm, steady_tempo=True, beats=beats,
                           downbeats=beats[::per_bar], beats_per_bar=per_bar, energy=[0.8] * n,
                           onset=[0.5] * n, loudness_lufs=-10, true_peak_dbtp=-0.5, lra=4,
                           energy_score=0.7, energy_level="high", brightness="bright", key="A major",
                           percussive=0.4, mood=["upbeat", "euphoric"])


def library_of(*infos) -> dict[str, music.Track]:
    return {i.id: music.Track(i.id, Path(f"/music/{i.id}.mp3"), music.License(source="s", license="CC0-1.0"), i)
            for i in infos}


def asset(i, kind="photo", duration=None):
    return Asset(id=f"a{i}", kind=kind, files=[], duration_s=duration)


def plan(*shots, music_choice=None):
    return ReelPlan(event_key="2026-10-03_Dunes", title="t", shots=list(shots), cover_asset_id="a0",
                    caption="c", music=music_choice)


def test_snap_puts_every_cut_on_the_tracks_beats(tmp_path):
    info = fake_info(bpm=126)
    lib = library_of(info)
    cfg = cfg_for(tmp_path)
    valid = {f"a{i}": asset(i) for i in range(12)}
    valid["a3"] = asset(3, "video", duration=3.0)
    durations = [1.3, 0.2, 2.6, 2.0, 1.1, 0.9, 1.7, 3.0, 1.0, 1.5, 2.0, 2.0]
    start = info.downbeats[5]
    p = reels.snap(plan(*[Shot(asset_id=f"a{i}", duration_s=max(0.3, d), start_s=2.5 if i == 3 else 0)
                          for i, d in enumerate(durations)],
                        music_choice=MusicChoice(track_id="t1", start_s=start + 0.004)), cfg, valid, lib)
    assert p.music == MusicChoice(track_id="t1", start_s=start)          # snapped onto the bar line
    cuts = np.cumsum([s.duration_s for s in p.shots])
    beats = np.array(info.beats) - start
    assert all(np.abs(beats - c).min() <= 0.5 / FPS + 1e-9 for c in cuts)  # within half a frame
    assert all(s.duration_s >= 0.5 - 1e-9 for s in p.shots)
    assert cuts[-1] <= cfg.reel_seconds + 1e-9
    bars = np.array(info.downbeats) - start
    assert np.abs(bars - cuts[-1]).min() <= 0.5 / FPS + 1e-9            # ends on a bar line
    assert all(abs(s.duration_s * FPS - round(s.duration_s * FPS)) < 1e-6 for s in p.shots)
    v = next(s for s in p.shots if s.asset_id == "a3")
    assert v.start_s + v.duration_s <= 3.0 + 1e-9                        # still inside the clip


def test_snap_replaces_an_off_beat_or_unknown_music_choice(tmp_path):
    info = fake_info(bpm=100, seconds=60)
    lib = library_of(info)
    cfg = cfg_for(tmp_path)
    valid = {"a0": asset(0)}
    shots = [Shot(asset_id="a0", duration_s=2)]
    off = reels.snap(plan(*shots, music_choice=MusicChoice(track_id="t1", start_s=info.beats[1])), cfg, valid, lib)
    assert off.music.start_s == music.best_window(info, cfg.reel_seconds)   # not a bar line
    late = reels.snap(plan(*shots, music_choice=MusicChoice(track_id="t1", start_s=info.downbeats[-2])),
                      cfg, valid, lib)
    assert late.music.start_s + cfg.reel_seconds <= info.duration_s         # whole reel fits
    ghost = reels.snap(plan(*shots, music_choice=MusicChoice(track_id="nope", start_s=0)), cfg, valid, lib)
    none = reels.snap(plan(*shots), cfg, valid, lib)
    assert ghost.music.track_id == none.music.track_id == "t1"               # music is never skipped


def test_snap_without_library_keeps_fixed_grid_and_drops_music(tmp_path):
    cfg = cfg_for(tmp_path)
    p = reels.snap(plan(Shot(asset_id="a0", duration_s=1.2), music_choice=MusicChoice(track_id="t1")),
                   cfg, {"a0": asset(0)}, {})
    assert p.music is None and p.shots[0].duration_s == 1.0


def test_story_and_critic_prompts_name_the_music(tmp_path):
    info = fake_info()
    lib = library_of(info)
    cfg = cfg_for(tmp_path)
    task = reels.story_task("k", [], cfg, tmp_path / "s.jpg", lib, {"t1": 3})
    assert "id=t1" in task.instructions and "music.track_id" in task.instructions and "used 3x" in task.instructions
    silent = reels.story_task("k", [], cfg, tmp_path / "s.jpg")
    assert "music is null" in silent.instructions and "id=t1" not in silent.instructions
    p = plan(Shot(asset_id="a0", duration_s=1), music_choice=MusicChoice(track_id="t1", start_s=2.2))
    note = reels.music_note(p, lib, cfg)
    assert note.startswith("id=t1") and "2.20 s into the track" in note
    critic = reels.critic_task("k", p, tmp_path / "h.jpg", tmp_path / "c.jpg", "", note)
    assert "Music: id=t1" in critic.instructions
    assert reels.music_note(plan(Shot(asset_id="a0", duration_s=1)), {}, cfg).startswith("none")


# --------------------------------------------------------------------------- render: the mix


def mixed_plan():
    return ReelPlan(event_key="e", title="t", cover_asset_id="p", caption="c",
                    shots=[Shot(asset_id="p", duration_s=1.5), Shot(asset_id="v", start_s=4.0, duration_s=2.0),
                           Shot(asset_id="q", duration_s=1.0)],
                    music=MusicChoice(track_id="t1", start_s=8.25))


def mixed_srcs():
    return [SegmentSource("photo", "/tmp/still.ppm", 2160, 3840),
            SegmentSource("video", "/clips/a.mp4", 1920, 1080, duration=30, audio=True),
            SegmentSource("video", "/clips/silent.mp4", 1920, 1080, duration=30, audio=False)]


def test_build_args_mix_music_with_natural_sound(tmp_path):
    cfg = cfg_for(tmp_path)
    mix = AudioMix(music="/music/t1.mp3", start_s=8.25, music_db=-18.0, natural_beds=[None, -40.0, -35.0],
                   gain_db=3.456)
    args = build_ffmpeg_args(mixed_plan(), mixed_srcs(), tmp_path / "o.mp4", cfg, audio=mix)
    joined = " ".join(args)
    assert "-ss 8.250 -t 5.500 -i /music/t1.mp3" in joined                 # the window, a little spare
    assert "anullsrc=channel_layout" not in joined                          # no silent input
    graph = args[args.index("-filter_complex") + 1]
    assert "[1:a:0]" in graph and "[2:a:0]" not in graph                    # only the clip with sound
    assert "[3:a:0]" in graph                                               # the music input
    # the clip's steady sound to 12 dB under the music: -18 - 12 - (-40) = +10 dB
    assert "volume=10.00dB" in graph and graph.count("volume=") == 2        # + the make-up gain
    assert "concat=n=3:v=0:a=1" in graph
    # natural sound compressed above -20 dBFS; music ducked when the (high-passed) natural
    # sound goes over -24 dBFS
    assert "acompressor=threshold=0.100000" in graph
    assert "[nsc]highpass=f=150,apad[sc]" in graph
    assert "[mus][sc]sidechaincompress=threshold=0.063096:ratio=4" in graph
    assert "[duck][nmix]amix=inputs=2:normalize=0" in graph
    assert "afade=t=in:st=0:d=0.1" in graph and "afade=t=out:st=3.900:d=0.6" in graph
    # one make-up gain into a -2 dBFS limiter at 4x rate (true peak; no loudnorm), exact length
    assert "afade=t=out:st=3.900:d=0.6,volume=3.46dB,aresample=192000,alimiter=limit=0.794328" in graph
    assert "level=false" in graph and "latency=1" in graph and "loudnorm" not in graph
    assert graph.endswith("atrim=duration=4.500000[aout]")
    for flag, val in [("-c:a", "aac"), ("-b:a", "256k"), ("-ar", "48000"), ("-ac", "2"), ("-map", "[aout]")]:
        assert val in [args[i + 1] for i, a in enumerate(args[:-1]) if a == flag], flag


def test_natural_gains():
    srcs = mixed_srcs() + [SegmentSource("video", "/c.mp4", 1920, 1080, audio=True)] * 2
    mix = AudioMix(music="/m.mp3", music_db=-18.0, natural_beds=[None, -40.0, -35.0, -75.0, -55.0])
    assert mix.natural_gains(srcs) == [None, 10.0, None, None, 12.0]   # silence skipped, boost capped
    mix.natural = False
    assert mix.natural_gains(srcs) == [None] * 5


def test_build_args_music_only_and_measure_passes(tmp_path):
    cfg = cfg_for(tmp_path)
    mix = AudioMix(music="/music/t1.mp3", start_s=8.25, natural=False)
    graph = build_ffmpeg_args(mixed_plan(), mixed_srcs(), "/o.mp4", cfg, audio=mix)
    graph = graph[graph.index("-filter_complex") + 1]
    assert "sidechaincompress" not in graph and "amix" not in graph and "[1:a:0]" not in graph
    assert "alimiter" not in graph                                          # unmeasured: no gain yet
    stems = build_audio_args(mixed_plan(), mixed_srcs(), AudioMix(music="/m.mp3", start_s=1.0), cfg, "stems",
                             {"mus": "/w/m.f32", "nat": "/w/n.f32"})
    g = stems[stems.index("-filter_complex") + 1]
    assert stems[-10:] == ["-map", "[mus]", "-f", "f32le", "/w/m.f32", "-map", "[nat]", "-f", "f32le", "/w/n.f32"]
    assert "loudnorm" not in g and "volume=0.00dB" in g
    plain = build_audio_args(mixed_plan(), mixed_srcs(), AudioMix(music="/m.mp3", start_s=1.0), cfg, "measure")
    g = plain[plain.index("-filter_complex") + 1]
    assert g.endswith(",ebur128=peak=true[aout]") and "sidechaincompress" in g and "alimiter" not in g
    assert plain[-3:] == ["-f", "null", "-"]
    limited = build_audio_args(mixed_plan(), mixed_srcs(), AudioMix(music="/m.mp3", gain_db=9.0), cfg, "measure")
    assert "volume=9.00dB,aresample=192000,alimiter=" in limited[limited.index("-filter_complex") + 1]


def test_parse_ebur128():
    err = ("[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -14.2 LUFS\n"
           "    Threshold: -24.3 LUFS\n\n  True peak:\n    Peak:       -1.7 dBFS\n")
    assert render.parse_ebur128(err) == (-14.2, -1.7)
    assert render.parse_ebur128(err.replace("-14.2", "-70.0").replace("-1.7", "-inf")) == (-70.0, float("-inf"))


def test_steady_levels():
    sr = 16000
    t = np.arange(sr * 3) / sr
    hum = 0.01 * np.sin(2 * np.pi * 300 * t)                      # -43 dBFS RMS
    horn = np.where((t > 1.0) & (t < 1.6), 0.5 * np.sin(2 * np.pi * 600 * t), 0)
    pcm = np.concatenate([hum + horn, np.zeros(sr)]).astype(np.float32)
    levels = render.steady_levels(pcm, sr, [3.0, 1.0])
    assert levels[0] == pytest.approx(-43.0, abs=0.5)               # the horn does not move it
    assert levels[1] is None


def test_silent_export_is_unchanged_without_music(tmp_path):
    cfg = cfg_for(tmp_path)
    args = build_ffmpeg_args(mixed_plan(), mixed_srcs(), "/o.mp4", cfg)
    assert "anullsrc=channel_layout=stereo:sample_rate=48000" in args and "3:a" in args


# --------------------------------------------------------------------------- render: real encode


def ebur128(path: Path) -> tuple[float, float]:
    err = subprocess.run([FFMPEG, "-hide_banner", "-nostdin", "-i", str(path), "-af", "ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    summary = err[err.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
    return i, tp


def decode(path: Path, sr=48000) -> np.ndarray:
    out = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32)


def click_onset(y: np.ndarray, sr: int, near: float, f: float = 1800.0, win: float = 0.03) -> float:
    """Time of the f Hz click nearest `near`: where its 2 ms envelope first passes half its peak."""
    i0, i1 = int((near - win) * sr), int((near + win) * sr)
    t = np.arange(i0, i1) / sr
    z = y[i0:i1] * np.exp(-2j * np.pi * f * t)
    k = int(0.002 * sr)
    env = np.abs(np.convolve(z, np.ones(k) / k, mode="same"))
    return (i0 + int(np.argmax(env > 0.5 * env.max()))) / sr


def band_level(y: np.ndarray, sr: int, f: float, t0: float, t1: float) -> float:
    """dB level of the f Hz component of y between t0 and t1 (a single-bin DFT, windowed)."""
    seg = y[int(t0 * sr): int(t1 * sr)].astype(np.float64)
    w = np.hanning(len(seg))
    t = np.arange(len(seg)) / sr
    amp = np.abs(np.sum(seg * w * np.exp(-2j * np.pi * f * t))) / (w.sum() / 2)
    return 20 * np.log10(amp + 1e-12)


@needs_analysis
def test_render_with_music_hits_instagram_loudness(tmp_path):
    """A 6-second reel: a still, then a clip whose own sound is a steady hum with a loud 1 s horn
    in the middle. The mix lands at -14 LUFS, true peak under -1 dBTP; the cuts and the music's
    beats line up; the music ducks under the horn and comes back."""
    cfg = cfg_for(tmp_path)
    cfg.reel_seconds = 6.0
    song = licensed(click_track(tmp_path / "song.mp3", 120, seconds=30, level=0.8))
    info = music.analyze(song, cfg)
    photo = tmp_path / "p.png"
    from PIL import Image
    Image.new("RGB", (1080, 1920), (90, 120, 150)).save(photo)
    clip = tmp_path / "clip.mp4"
    # natural sound: 300 Hz hum at a low level, and a horn (600 Hz) 10x louder from 1.5 s to 2.5 s
    natural = "0.02*sin(2*PI*300*t)+if(between(t,1.5,2.5),0.5*sin(2*PI*600*t),0)"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=6",
                    "-f", "lavfi", "-i", f"aevalsrc='{natural}':s=48000:d=6", "-shortest",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", str(clip)],
                   check=True)
    start = music.best_window(info, cfg.reel_seconds)
    p = ReelPlan(event_key="e", title="t", cover_asset_id="p", caption="c",
                 shots=[Shot(asset_id="p", duration_s=1.9), Shot(asset_id="v", start_s=0.0, duration_s=4.1)],
                 music=MusicChoice(track_id=info.id, start_s=start))
    p = reels.snap(p, cfg, {"p": asset(0), "v": Asset(id="v", kind="video", files=[], duration_s=6.0)},
                   {info.id: music.Track(info.id, song, music.License(source="s", license="CC0-1.0"), info)})
    assert [s.duration_s for s in p.shots] == [2.0, 4.0]                    # 120 BPM: cuts on the beat
    out = render.render_reel(p, {"p": {"kind": "photo", "path": str(photo)},
                                 "v": {"kind": "video", "path": str(clip)}}, tmp_path / "r.mp4", cfg,
                             music=song)
    probe = json.loads(subprocess.run([FFPROBE, "-v", "error", "-show_streams", "-show_format", "-of", "json",
                                       str(out)], capture_output=True, check=True).stdout)
    a = next(s for s in probe["streams"] if s["codec_type"] == "audio")
    assert a["codec_name"] == "aac" and a["channels"] == 2 and a["sample_rate"] == "48000"
    assert 150_000 <= int(a["bit_rate"]) <= 280_000                      # 256k target (simple content uses less)
    assert abs(float(probe["format"]["duration"]) - 6.0) < 0.1
    integrated, peak = ebur128(out)
    assert abs(integrated - (-14.0)) <= 0.5, integrated
    assert peak <= -1.0, peak
    y = decode(out)
    sr = 48000
    # the beats: the track's 1.8 kHz clicks land where they were in the track, relative to the
    # window start, and the cut at 2.0 s is on one of them
    for b in truth(120, 30.0):
        if start + 0.3 < b < start + 5.0:
            assert abs(click_onset(y, sr, b - start) - (b - start)) < 0.003, b
    # ducking: the pad's A (220 Hz) is quieter under the horn (clip time 1.5-2.5 = reel 3.5-4.5)
    # than just before it, and comes back after
    before = band_level(y, sr, 220, 2.6, 3.4)
    during = band_level(y, sr, 220, 3.7, 4.4)
    after = band_level(y, sr, 220, 5.0, 5.3)
    assert before - during > 3.0, (before, during)
    assert abs(after - before) < 3.0, (before, after)
    # the clip's own sound is in the mix: its horn is clearly there
    assert band_level(y, sr, 600, 3.7, 4.4) > band_level(y, sr, 600, 2.6, 3.4) + 15


# --------------------------------------------------------------------------- reels.build end to end (fakes)


class FakeJudge:
    def __init__(self, answers):
        self.answers, self.tasks = list(answers), []

    def judge(self, task):
        self.tasks.append(task)
        return self.answers.pop(0)


def critique(verdict="ship", revised=None):
    from igmp.models import Critique
    ok = verdict == "ship"
    return Critique(hook_ok=True, all_sharp=True, no_redundancy=True, crops_safe=True, pacing_ok=ok,
                    ending_ok=True, score=8, notes="n", verdict=verdict, revised=revised)


@pytest.fixture
def built(tmp_path, monkeypatch):
    from PIL import Image
    from igmp.store import Store
    info = fake_info(bpm=120, first=0.5)
    lib = library_of(info)
    lib["t1"].license = music.License(source="s", license="CC-BY-4.0", attribution='"Dawn" by A. Composer')
    renders = []

    def fake_render(plan, sources, out, cfg, music=None):
        if music is not None and getattr(fake_render, "fail_music", False):
            raise RuntimeError("mix failed")
        renders.append((plan, music))
        Path(out).write_bytes(b"mp4")
        return Path(out)

    thumb = tmp_path / "thumb.jpg"
    Image.new("RGB", (64, 64)).save(thumb)
    monkeypatch.setattr(reels.media, "preview_image", lambda a, cfg, size=1024: thumb)
    monkeypatch.setattr(reels.render, "render_reel", fake_render)
    monkeypatch.setattr(reels.render, "reel_contact_sheet", lambda v, cfg: Image.new("RGB", (8, 8)))
    monkeypatch.setattr(reels, "hook_strip", lambda v, cfg, out: thumb)
    monkeypatch.setattr(reels.music, "load_library", lambda cfg: lib)
    from igmp.models import Score
    score = Score(score=8, keep=True, role="moment", subject="s", mood="m", vertical_focus=Point(x=0.5, y=0.5),
                  feed_focus=Point(x=0.5, y=0.5))
    opts = [(Asset(id=f"a{i}", kind="photo", files=[], preview=str(thumb)), score) for i in range(4)]
    cfg = cfg_for(tmp_path)
    return cfg, Store(cfg.db_path), opts, renders, fake_render


def test_build_mixes_music_credits_it_and_keeps_it_through_revisions(built):
    cfg, store, opts, renders, _ = built
    shots = [Shot(asset_id=f"a{i}", duration_s=2.0) for i in range(4)]
    story = ReelPlan(event_key="k", title="t", shots=shots, cover_asset_id="a0", caption="Morning light.",
                     music=MusicChoice(track_id="t1", start_s=8.5))
    revised = story.model_copy(update={"music": None, "shots": shots[:3]})   # the critic forgot the music
    judge = FakeJudge([story, critique("revise", revised), critique("ship")])
    rec = reels.build("k", opts, cfg, store, judge)
    assert rec["status"] == "shipped" and len(renders) == 2
    assert [m for _, m in renders] == [Path("/music/t1.mp3")] * 2               # the same track both times
    assert renders[1][0].music == MusicChoice(track_id="t1", start_s=8.5)
    assert "id=t1" in judge.tasks[0].instructions and "Music: id=t1" in judge.tasks[1].instructions
    caption = (cfg.output_dir / "reels" / "k" / "k__short-01.caption.txt").read_text()
    post, _, sound = caption.partition("\n\n---\n")
    assert post == 'Morning light.\n\nMusic: "Dawn" by A. Composer'                # the credit is posted
    assert sound.startswith('Sound: "t1" (s, CC-BY-4.0), from 8.50 s.')        # the track, for swapping
    assert rec["music"]["track_id"] == "t1" and rec["music"]["license"] == "CC-BY-4.0"


def test_build_renders_silent_when_the_mix_fails(built):
    cfg, store, opts, renders, fake_render = built
    fake_render.fail_music = True
    story = ReelPlan(event_key="k", title="t", shots=[Shot(asset_id="a0", duration_s=2.0)],
                     cover_asset_id="a0", caption="c", music=MusicChoice(track_id="t1", start_s=8.5))
    rec = reels.build("k", opts, cfg, store, FakeJudge([story, critique("ship")]))
    assert renders[0][1] is None and rec["music"] is None and rec["plan"]["music"] is None
    # never silent: a reel whose mix failed does not ship
    assert rec["status"] == "needs-attention" and "music" in rec["reason"]
    caption = (cfg.output_dir / "reels" / "_needs-attention" / "k" / "k__short-01.caption.txt").read_text()
    assert caption.partition("\n\n---\n")[0] == "c"


def test_build_with_music_off_stays_silent(built, monkeypatch):
    cfg, store, opts, renders, _ = built
    cfg.extra["music"] = "none"
    story = ReelPlan(event_key="k", title="t", shots=[Shot(asset_id="a0", duration_s=2.0)],
                     cover_asset_id="a0", caption="c", music=MusicChoice(track_id="t1", start_s=8.5))
    rec = reels.build("k", opts, cfg, store, FakeJudge([story, critique("ship")]))
    assert renders[0][1] is None and renders[0][0].music is None and rec["music"] is None
