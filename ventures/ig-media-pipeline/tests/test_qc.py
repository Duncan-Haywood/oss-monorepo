"""Reel QC: the numpy measurements on synthetic frames, then every rule on real ffmpeg encodes
(both the passing and the failing side), check_plan, and the command line."""
from __future__ import annotations

import inspect
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from igmp import qc
from igmp.config import Config
from igmp.models import Point, ReelPlan, Shot

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
HAVE_FFMPEG = Path(FFMPEG).exists() and Path(FFPROBE).exists()
needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg not installed")

X264 = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p"]
# a stand-in for the Mac's draft encode (h264_videotoolbox, maybe a low bitrate): 2 Mb/s at 1080x1920
# with no adaptive quantisation or psy tuning and strong deblocking, so detail is soft and smeared
SOFT = ["-c:v", "libx264", "-preset", "veryfast", "-b:v", "2M", "-maxrate", "2M", "-bufsize", "4M",
        "-x264-params", "aq-mode=0:psy=0:deblock=2,2", "-g", "60", "-pix_fmt", "yuv420p"]
SOFT_4M = ["-c:v", "libx264", "-preset", "veryfast", "-b:v", "4M", "-maxrate", "4M", "-bufsize", "8M",
           "-x264-params", "aq-mode=0:psy=0:deblock=2,2", "-g", "60", "-pix_fmt", "yuv420p"]
TONE = "aevalsrc={a}*sin(2*PI*1000*t)|{a}*sin(2*PI*1000*t):s=48000:d={d}"   # 0.2 -> -14.0 LUFS


# --------------------------------------------------------------------------- synthetic pictures


def pink(h: int, w: int, seed: int, contrast: float = 45.0, mean: float = 110.0) -> np.ndarray:
    """A photo-like RGB texture: 1/f noise has the gradient statistics of natural images."""
    rng = np.random.default_rng(seed)
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.rfftfreq(w)[None, :]
    f = np.hypot(fx, fy)
    f[0, 0] = 1
    spec = (rng.normal(size=f.shape) + 1j * rng.normal(size=f.shape)) / f
    spec[0, 0] = 0
    g = np.fft.irfft2(spec, s=(h, w))
    g = (g - g.mean()) / g.std()
    rgb = np.stack([g * contrast * k + mean + o for k, o in ((1.0, 0), (0.9, -8), (0.8, -20))], -1)
    return np.clip(rgb, 0, 255).astype(np.uint8)


def starfield(h: int, w: int, seed: int) -> np.ndarray:
    """A night sky as it looks in a reel: grainy near-black, 1-3 px stars of peak 50-255."""
    rng = np.random.default_rng(seed)
    img = np.clip(rng.normal(8, 2, (h, w)), 0, 255)
    n = int(h * w * 3e-4)
    ys, xs = rng.integers(2, h - 3, n), rng.integers(2, w - 3, n)
    peak = np.clip(rng.exponential(60, n) + 50, 0, 255)
    radius = rng.choice([0.6, 0.9, 1.4], n, p=[0.6, 0.3, 0.1])
    yy, xx = np.mgrid[-2:3, -2:3]
    for y, x, b, r in zip(ys, xs, peak, radius):
        img[y - 2:y + 3, x - 2:x + 3] = np.maximum(img[y - 2:y + 3, x - 2:x + 3],
                                                   b * np.exp(-(yy ** 2 + xx ** 2) / (2 * r ** 2)))
    g = img.astype(np.uint8)
    return np.stack([g, g, np.clip(g.astype(int) + 4, 0, 255).astype(np.uint8)], -1)


def grey_frames(n: int, h: int = 480, w: int = 270, value: float = 120.0) -> np.ndarray:
    return np.full((n, h, w), value, np.uint8)


# --------------------------------------------------------------------------- pure measurements


def test_analysis_size():
    assert qc.analysis_size(1080, 1920) == (270, 480)
    assert qc.analysis_size(720, 1280) == (270, 480)
    assert qc.analysis_size(1920, 1080) == (480, 270)
    assert qc.analysis_size(90, 160) == (90, 160)             # never upscaled


def _textured(n: int, seed: int = 0) -> np.ndarray:
    tex = pink(480, 270, seed)[..., 0]
    return np.repeat(tex[None], n, 0)


def test_border_bands_finds_letterbox_and_pillarbox_on_arrays():
    f = _textured(10)
    f[:, :40], f[:, -40:] = 0, 0                             # 40/480 = 8%
    b = qc.border_bands(f)
    assert b["top"]["border"] and b["top"]["lines"] == 40 and b["top"]["level"] == 0
    assert b["bottom"]["border"] and b["bottom"]["lines"] == 40
    assert not b["left"]["border"] and not b["right"]["border"]
    f = _textured(10)
    f[:, :, :12] = 255                                        # 12/270 = 4.4%, white
    b = qc.border_bands(f)
    assert b["left"]["border"] and b["left"]["lines"] == 12 and b["left"]["level"] == 255
    assert not b["right"]["border"] and b["right"]["lines"] == 0 and not b["top"]["border"]


def test_border_bands_threshold_share_and_minimum():
    f = _textured(10)
    f[:, :8] = 0                                              # 8 rows < 2% of 480 (10)
    assert not qc.border_bands(f)["top"]["border"]
    f = _textured(10)
    f[:7, :30] = 0                                            # bars in 70% of frames only
    assert not qc.border_bands(f)["top"]["border"]
    f[:8, :30] = 0                                            # 80%
    assert qc.border_bands(f)["top"]["border"]


def test_border_bands_ignores_gradients_stars_and_changing_bands():
    ramp = np.linspace(20, 80, 480)[None, :, None]           # 8-bit clean vertical gradient
    grad = np.round(np.broadcast_to(ramp, (10, 480, 270))).astype(np.uint8)
    assert not any(e["border"] for e in qc.border_bands(grad).values())
    diag = (np.linspace(0, 60, 270)[None, None, :] + np.linspace(30, 120, 480)[None, :, None])
    assert not any(e["border"] for e in qc.border_bands(np.repeat(diag.astype(np.uint8), 10, 0)).values())
    sky = np.asarray(Image.fromarray(starfield(1920, 1080, 3)).convert("L").reduce(4))[None]
    assert not any(e["border"] for e in qc.border_bands(np.repeat(sky, 10, 0)).values())
    f = _textured(10)                                         # a flat band whose level changes per frame
    for i in range(10):
        f[i, :40] = 20 * i
    assert not qc.border_bands(f)["top"]["border"]
    # frames flat all over (a fade to black) say nothing either way
    assert not any(e["border"] for e in qc.border_bands(grey_frames(10, value=0)).values())


def _shifted(n: int, dx: float, seed: int = 1) -> np.ndarray:
    """A texture translated by dx analysis px per frame (bilinear, so sub-pixel moves work)."""
    tex = pink(520, 420, seed)[..., 0].astype(np.float32)
    out = []
    for i in range(n):
        x = 30 + dx * i
        x0, a = int(np.floor(x)), x - np.floor(x)
        out.append((1 - a) * tex[20:500, x0:x0 + 270] + a * tex[20:500, x0 + 1:x0 + 271])
    return np.round(np.stack(out)).astype(np.uint8)


def test_hook_motion_on_arrays():
    still = qc.hook_motion(_textured(30))
    assert still["speed"] == 0 and still["mad"] == 0 and not still["hook"] and still["cut"] is None
    assert not qc.hook_motion(_shifted(30, 0.15))["hook"]    # about a default Ken Burns
    moving = qc.hook_motion(_shifted(30, 1.5))
    assert moving["hook"] and moving["speed"] > qc.HOOK_MIN_SPEED and moving["cut"] is None
    cut = np.concatenate([_textured(12, seed=4), _textured(18, seed=5)])
    m = qc.hook_motion(cut)
    assert m["hook"] and m["cut"]["pair"] == 11 and m["cut"]["t"] == pytest.approx(0.4)
    assert m["speed"] == 0                                    # the cut pair is not motion
    assert not qc.hook_motion(_textured(1))["hook"]


def test_freeze_tracker_measures_stretches():
    a, b = _textured(1, seed=6)[0], _textured(1, seed=7)[0]
    frames = [a] * 50 + [b] * 40 + [a] * 20                  # 1.67 s, 1.33 s, 0.67 s
    assert qc.freezes(frames) == [(0.0, pytest.approx(50 / 30, abs=1e-4)), (pytest.approx(50 / 30, abs=1e-4), 3.0)]
    # a slow drift adds up against the first frame of the stretch: no freeze
    assert qc.freezes(_shifted(60, 0.15)) == []
    # stars moving: almost no mean change, but enough pixels change a lot
    sky = np.asarray(Image.fromarray(starfield(960, 540, 8)).convert("L").reduce(2))
    drift = [np.roll(sky, i // 3, axis=1) for i in range(60)]
    assert qc.freezes(drift) == []


def test_frozen_stretch_is_a_lower_bound_at_15_fps():
    """After the first second only every other frame is read: a still held exactly 1.5 s must
    never measure longer, whichever frame it starts on."""
    moving = _shifted(140, 0.5, seed=9)                       # every frame differs from the last
    for start in (40, 41):
        frames = [moving[0] if start <= n < start + 45 else moving[n] for n in range(140)]
        read = [n for n in range(140) if n < 30 or n % 2 == 0]
        tracker = qc.FreezeTracker()
        for k, n in enumerate(read):
            assert qc.frame_time(k) == pytest.approx(n / 30)
            tracker.add(frames[n], qc.frame_time(k))
        (s, e), = tracker.finish()
        assert 1.5 - 2 / 30 - 1e-3 <= e - s <= 1.5 + 1e-3, (start, s, e)    # times are rounded to 0.1 ms


def test_duration_bands():
    band = qc.duration_band
    assert [band(s) for s in (6.5, 6.9, 7, 15, 15.2, 17, 20, 30, 45, 60, 61, 180, 181)] == [
        None, "short", "short", "short", "short", None, "short", "short", "medium", "medium", "long", "long",
        None]                                                   # BAND_TOL: 6.9 and 15.2 still count
    assert qc._duration_finding(4.0, None).severity == "fail" and not qc._duration_finding(4.0, None).ok
    assert not qc._duration_finding(181, None).ok
    f = qc._duration_finding(17.0, None)
    assert f.ok and f.severity == "info" and "between bands" in f.detail
    assert qc._duration_finding(10, "short").ok and not qc._duration_finding(10, "medium").ok
    assert qc._duration_finding(25, "short").ok and not qc._duration_finding(17, "short").ok
    with pytest.raises(ValueError):
        qc.check_reel("x.mp4", band="huge")


def test_format_rule_boundaries():
    base = {"width": 1080, "height": 1920, "fps": 30.0, "codec": "h264", "pix_fmt": "yuv420p",
            "bitrate": 12e6}

    def get(rule, **kw):
        return next(f for f in qc._format_findings({**base, **kw}) if f.rule == rule)
    assert get("format.fps", fps=30000 / 1001).ok and get("format.fps", fps=60).ok
    assert not get("format.fps", fps=25).ok and not get("format.fps", fps=120).ok
    assert get("format.codec", codec="hevc").ok and not get("format.codec", codec="vp9").ok
    soft = get("format.resolution", width=720, height=1280)
    assert not soft.ok and soft.severity == "warn"
    assert get("format.resolution", width=1080, height=1350).severity == "fail"
    assert get("format.bitrate", bitrate=6e6).ok and get("format.bitrate", bitrate=25e6).ok
    assert get("format.bitrate", bitrate=3e6).severity == "warn" and not get("format.bitrate", bitrate=3e6).ok
    assert get("format.bitrate", bitrate=None).ok
    assert [f.rule for f in qc._format_findings(None)] == ["format.video"]


def test_audio_decisions():
    a = {"codec": "aac", "channels": 2, "sample_rate": 48000}
    loud = qc.Decoded(size=(0, 0), lufs=-14.2, true_peak=-2.0, max_volume=-2.1)
    by = {f.rule: f for f in qc._audio_findings(a, loud, False)[0]}
    assert all(f.ok for f in by.values())
    hush = qc.Decoded(size=(0, 0), lufs=-45.0, true_peak=-40.0, max_volume=-62.0)   # max volume decides
    assert not {f.rule: f for f in qc._audio_findings(a, hush, False)[0]}["audio_silent"].ok
    quiet = qc.Decoded(size=(0, 0), lufs=-61.0, true_peak=-20.0, max_volume=-20.0)  # a click in silence
    assert not {f.rule: f for f in qc._audio_findings(a, quiet, False)[0]}["audio_silent"].ok


def test_parse_volumedetect():
    log = ("[Parsed_volumedetect_1 @ 0x1] n_samples: 0\n"
           "[Parsed_volumedetect_1 @ 0x2] mean_volume: -20.5 dB\n[Parsed_volumedetect_1 @ 0x2] max_volume: -3.0 dB\n")
    assert qc.parse_volumedetect(log) == (-3.0, -20.5)
    assert qc.parse_volumedetect("max_volume: -inf dB") == (None, None)
    assert qc.parse_volumedetect("") == (None, None)


# --------------------------------------------------------------------------- plans


def plan_of(*shots: Shot) -> ReelPlan:
    return ReelPlan(event_key="e", shots=list(shots), cover_asset_id=shots[0].asset_id, caption="c")


def _rules(findings):
    return {f.rule: f for f in findings}


def test_check_plan_fit_share_and_start():
    ok = plan_of(Shot(asset_id="v", duration_s=4), Shot(asset_id="w", duration_s=2, layout="fit"),
                 Shot(asset_id="p", duration_s=4, zoom_from=1.0, zoom_to=1.08))
    r = _rules(qc.check_plan(ok, kinds={"v": "video", "w": "photo", "p": "photo"}))
    assert r["plan.fit_share"].ok and r["plan.fit_share"].value == 0.2     # exactly 20% passes
    assert r["plan.fit_start"].ok and r["plan.static_photo"].ok
    too_much = plan_of(Shot(asset_id="v", duration_s=4), Shot(asset_id="w", duration_s=3, layout="fit"),
                       Shot(asset_id="p", duration_s=3))
    assert not _rules(qc.check_plan(too_much))["plan.fit_share"].ok          # 30%
    early = plan_of(Shot(asset_id="v", duration_s=2.5), Shot(asset_id="w", duration_s=1, layout="fit"),
                    Shot(asset_id="p", duration_s=6), Shot(asset_id="q", duration_s=6))
    f = _rules(qc.check_plan(early))["plan.fit_start"]
    assert not f.ok and f.severity == "fail" and f.value == [{"shot": 1, "start_s": 2.5}]
    first = plan_of(Shot(asset_id="w", duration_s=1, layout="fit"), Shot(asset_id="v", duration_s=6))
    assert _rules(qc.check_plan(first))["plan.fit_start"].value[0]["start_s"] == 0


def test_check_plan_static_photos():
    shots = [Shot(asset_id="p", duration_s=2, zoom_from=1.1, zoom_to=1.1),                       # static
             Shot(asset_id="q", duration_s=2, zoom_from=1.0, zoom_to=1.0,
                  focus=Point(x=0.3, y=0.5), focus_to=Point(x=0.7, y=0.5)),                       # a pan
             Shot(asset_id="v", duration_s=2, zoom_from=1.0, zoom_to=1.0),                        # video
             Shot(asset_id="f", duration_s=2, zoom_from=1.0, zoom_to=1.0, layout="fit")]          # not fill
    kinds = {"p": "photo", "q": "photo", "v": "video", "f": "photo"}
    f = _rules(qc.check_plan(plan_of(*shots), kinds=kinds))["plan.static_photo"]
    assert not f.ok and f.severity == "warn" and f.value == [0]
    assets = {k: SimpleNamespace(kind=v) for k, v in kinds.items()}        # Assets work as kinds too
    assert _rules(qc.check_plan(plan_of(*shots), kinds=assets))["plan.static_photo"].value == [0]
    unknown = _rules(qc.check_plan(plan_of(*shots)))["plan.static_photo"]
    assert unknown.ok and unknown.severity == "info" and unknown.value == [0, 2]


def test_check_plan_duck_typed():
    plan = SimpleNamespace(shots=[SimpleNamespace(asset_id="a", duration_s=8, layout="fill", kind="photo",
                                                  zoom_from=1.2, zoom_to=1.2),
                                  {"asset_id": "b", "duration_s": 2, "layout": "fit"}])
    r = _rules(qc.check_plan(plan))
    assert r["plan.fit_share"].ok and r["plan.fit_start"].ok
    assert not r["plan.static_photo"].ok and r["plan.static_photo"].value == [0]


# --------------------------------------------------------------------------- real media


def ff(*args) -> None:
    subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-n", *map(str, args)], check=True)


class Media:
    """Test reels, each made on first use in one temp dir for the whole module."""

    def __init__(self, root: Path, enc: list[str] = X264):
        self.root, self.enc = root, enc

    def image(self, name: str, img: np.ndarray) -> Path:
        p = self.root / f"{name}.bmp"         # BMP: ffmpeg's -loop 1 decodes the file for every frame
        if not p.exists():
            Image.fromarray(img).save(p)
        return p

    def __call__(self, name: str) -> Path:
        out = self.root / f"{name}.mp4"
        if not out.exists():
            getattr(self, "make_" + name)(out)
        return out

    def _testsrc(self, out, size="1080x1920", rate=30, d=8, audio=0.2, vf=None, enc=None):
        enc = enc or self.enc
        args = ["-f", "lavfi", "-i", f"testsrc2=size={size}:rate={rate}:duration={d}"]
        if audio is not None:
            args += ["-f", "lavfi", "-i", TONE.format(a=audio, d=d)]
        if vf:
            args += ["-vf", vf]
        args += list(enc) + (["-c:a", "aac", "-b:a", "192k"] if audio is not None else []) + [out]
        ff(*args)

    def make_good(self, out):            # moving, -14 LUFS, 8 s (short band)
        self._testsrc(out)

    def make_silent(self, out):          # what render_reel makes without music: a silent AAC track
        ff("-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=8", "-f", "lavfi", "-i",
           "anullsrc=r=48000:cl=stereo", "-t", 8, *self.enc, "-c:a", "aac", out)

    def make_quiet(self, out):           # -50 LUFS: not silent, but far off -14
        self._testsrc(out, audio=0.003)

    def make_hot(self, out):             # a full-scale tone: -0.5 LUFS, +0.4 dBTP
        self._testsrc(out, audio=1.0)

    def make_mute(self, out):            # no audio stream at all
        self._testsrc(out, audio=None)

    def make_soft(self, out):            # 720x1280
        self._testsrc(out, size="720x1280", d=6)

    def make_wrong(self, out):           # landscape, 24 fps, yuv444p
        self._testsrc(out, size="1280x720", rate=24, d=2,
                      enc=["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv444p"])

    def make_mpeg4(self, out):
        self._testsrc(out, d=2, enc=["-c:v", "mpeg4", "-q:v", "3", "-pix_fmt", "yuv420p"])

    def make_huge(self, out):            # far over 25 Mb/s
        self._testsrc(out, d=3, enc=["-c:v", "libx264", "-preset", "ultrafast", "-qp", "4", "-pix_fmt", "yuv420p"])

    def make_long(self, out):            # 181 s, small and silent, so it is quick to make and check
        self._testsrc(out, size="90x160", d=181, audio=None)

    def make_letterbox(self, out):       # 16:9 picture padded into 9:16: 656 px bars
        self._testsrc(out, size="1080x608", d=3, vf="pad=1080:1920:0:656:black")

    def make_pillarbox(self, out):       # 180 px bars left and right
        self._testsrc(out, size="720x1920", d=3, vf="pad=1080:1920:180:0:black")

    def make_thinbars(self, out):        # 24 px (1.25%): below the 2% a border needs
        self._testsrc(out, size="1080x1872", d=3, vf="pad=1080:1920:0:24:black")

    def _loop(self, out, still: Path, d: float = 2.0, vf: str | None = None):
        ff("-loop", 1, "-framerate", 30, "-t", d, "-i", still, *(["-vf", vf] if vf else []), *self.enc, out)

    def make_starfield(self, out):       # a still night sky: dark edges everywhere, stars
        self._loop(out, self.image("stars", starfield(1920, 1080, 3)))

    def make_gradient(self, out):        # a clean 8-bit sky gradient, darkest at the top
        ramp = np.round(np.linspace(15, 75, 1920))[:, None, None].astype(np.uint8)
        g = np.broadcast_to(ramp, (1920, 1080, 1))
        self._loop(out, self.image("gradient", np.concatenate([g, g, g + 10], -1)))

    def make_fit(self, out):             # render's fit layout: a 3:2 photo over its blurred, darkened copy
        photo = pink(1200, 1800, 41, contrast=50)
        sky = np.linspace(190, 120, 400)[:, None, None]
        photo[:400] = np.clip(0.3 * photo[:400] + 0.7 * sky, 0, 255).astype(np.uint8)
        ff("-loop", 1, "-framerate", 30, "-t", 2, "-i", self.image("photo32", photo), "-filter_complex",
           "[0]split[a][b];[a]scale=-2:480,crop=270:480,gblur=sigma=8,scale=1080:1920:flags=bicubic,"
           "colorchannelmixer=rr=0.78:gg=0.78:bb=0.78[bg];[b]scale=1080:720[fg];[bg][fg]overlay=0:523",
           *self.enc, out)

    def make_still(self, out):           # a photo held 2 s, no move
        self._loop(out, self.image("tall", pink(1920, 1080, 61)))

    def make_kenburns(self, out):        # render's default push: zoom 1.00 -> 1.08 over 2 s (zoompan at 2x)
        ff("-i", self.image("tall", pink(1920, 1080, 61)), "-vf",
           "scale=2160:3840:flags=bicubic,zoompan=z='pow(1.08,on/59)':d=60:s=1080x1920:fps=30:"
           "x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'", "-frames:v", 60, *self.enc, out)

    def make_night_kenburns(self, out):  # the same push over a night sky
        ff("-i", self.image("stars", starfield(1920, 1080, 3)), "-vf",
           "scale=2160:3840:flags=bicubic,zoompan=z='pow(1.08,on/59)':d=60:s=1080x1920:fps=30:"
           "x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'", "-frames:v", 60, *self.enc, out)

    def make_pan(self, out):             # a slow pan across a wide photo: 4 px/frame at 1080
        self._loop(out, self.image("wide", pink(1920, 2880, 62)), vf="crop=1080:1920:x='120*t':y=0")

    def make_cut(self, out):             # still A for 0.5 s, hard cut, still B for 1.5 s
        a, b = self.image("tall", pink(1920, 1080, 61)), self.image("other", pink(1920, 1080, 63, contrast=30))
        ff("-loop", 1, "-framerate", 30, "-t", 0.5, "-i", a, "-loop", 1, "-framerate", 30, "-t", 1.5, "-i", b,
           "-filter_complex", "[0][1]concat=n=2:v=1:a=0", *self.enc, out)

    def make_hold(self, out):            # a clip that ends early and holds its last frame for 2 s
        ff("-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=1",
           "-vf", "tpad=stop_mode=clone:stop_duration=2", *self.enc, out)


@pytest.fixture(scope="module")
def media(tmp_path_factory) -> Media:
    if not HAVE_FFMPEG:
        pytest.skip("ffmpeg not installed")
    return Media(tmp_path_factory.mktemp("qc-media"))


@pytest.fixture(scope="module")
def soft(tmp_path_factory) -> Media:
    """The same reels encoded like a soft, low-bitrate draft."""
    if not HAVE_FFMPEG:
        pytest.skip("ffmpeg not installed")
    return Media(tmp_path_factory.mktemp("qc-soft"), SOFT)


@pytest.fixture(scope="module")
def soft4(tmp_path_factory) -> Media:
    if not HAVE_FFMPEG:
        pytest.skip("ffmpeg not installed")
    return Media(tmp_path_factory.mktemp("qc-soft4"), SOFT_4M)


@pytest.fixture(scope="module")
def cfg(tmp_path_factory) -> Config:
    return Config(library_roots=[], output_dir=tmp_path_factory.mktemp("qc-out"), ffmpeg=FFMPEG, ffprobe=FFPROBE)


def check(media, name, cfg, **kw) -> tuple[qc.QCReport, dict[str, qc.Finding]]:
    r = qc.check_reel(media(name), cfg, **kw)
    return r, {f.rule: f for f in r.findings}


@needs_ffmpeg
def test_good_reel_passes_everything(media, cfg):
    r, by = check(media, "good", cfg)
    assert r.passed and not r.failures and r.notes() == []
    assert (r.width, r.height, r.fps, r.video_codec) == (1080, 1920, 30.0, "h264")
    assert r.duration_s == pytest.approx(8.0, abs=0.05) and 6000 <= r.bitrate_kbps <= 25000
    assert all(f.ok for f in r.findings), r.summary()
    assert r.audio["integrated_lufs"] == pytest.approx(-14.0, abs=0.5) and r.audio["silent"] is False
    assert by["duration_band"].value == {"seconds": 8.0, "band": "short"}
    assert by["hook_motion"].value["speed"] >= qc.HOOK_MIN_SPEED
    assert by["borders"].value == {} and by["frozen"].value == []
    assert by["loop"].severity == "info" and by["loop"].value > 1          # testsrc2's clock moved on
    assert json.loads(r.model_dump_json())["passed"] is True
    assert r.elapsed_s > 0 and "PASS" in r.summary()


@needs_ffmpeg
def test_silence_fails_unless_allowed(media, cfg):
    r, by = check(media, "silent", cfg)
    assert not r.passed and by["audio_present"].ok and not by["audio_silent"].ok
    assert by["audio_silent"].severity == "fail" and r.audio["integrated_lufs"] == -70.0
    assert by["loudness"].ok and by["loudness"].severity == "info"
    assert [n.split(":")[0] for n in r.notes()] == ["audio_silent"]
    r, by = check(media, "silent", cfg, allow_silent=True)
    assert r.passed and not by["audio_silent"].ok and by["audio_silent"].severity == "warn"
    assert qc.SILENT_NOTE in by["audio_silent"].detail
    assert r.notes(warnings=True) and "Instagram sound" in r.notes(warnings=True)[0]


@needs_ffmpeg
def test_no_audio_stream(media, cfg):
    r, by = check(media, "mute", cfg)
    assert not r.passed and not by["audio_present"].ok and by["audio_present"].severity == "fail"
    assert r.audio == {"present": False}
    r, by = check(media, "mute", cfg, allow_silent=True)
    assert r.passed and by["audio_present"].severity == "warn" and qc.SILENT_NOTE in by["audio_present"].detail


@needs_ffmpeg
def test_loudness_and_true_peak_warn(media, cfg):
    r, by = check(media, "quiet", cfg)
    assert r.passed and by["audio_silent"].ok                           # -50 LUFS is quiet, not silent
    assert not by["loudness"].ok and by["loudness"].severity == "warn" and by["true_peak"].ok
    assert by["loudness"].value == pytest.approx(-50.5, abs=1)
    r, by = check(media, "hot", cfg)
    assert r.passed and not by["loudness"].ok and not by["true_peak"].ok
    assert by["true_peak"].severity == "warn" and by["true_peak"].value > qc.TRUE_PEAK_MAX


@needs_ffmpeg
def test_format_failures_and_warnings(media, cfg):
    r, by = check(media, "soft", cfg)
    assert r.passed and by["format.resolution"].severity == "warn" and not by["format.resolution"].ok
    r, by = check(media, "wrong", cfg)
    assert not r.passed
    assert {f.rule for f in r.failures} >= {"format.resolution", "format.fps", "format.pix_fmt"}
    assert by["format.fps"].value == 24 and by["format.pix_fmt"].value == "yuv444p"
    assert by["format.codec"].ok
    r, by = check(media, "mpeg4", cfg)
    assert not by["format.codec"].ok and by["format.codec"].value == "mpeg4"
    r, by = check(media, "huge", cfg)
    assert not by["format.bitrate"].ok and by["format.bitrate"].severity == "warn" and r.bitrate_kbps > 25000


@needs_ffmpeg
def test_audio_only_file_has_no_video(media, cfg, tmp_path):
    m4a = tmp_path / "tone.m4a"
    ff("-f", "lavfi", "-i", TONE.format(a=0.2, d=6), "-c:a", "aac", m4a)
    r = qc.check_reel(m4a, cfg)
    by = {f.rule: f for f in r.findings}
    assert not r.passed and not by["format.video"].ok and r.width == 0
    assert "borders" not in by and by["audio_silent"].ok and by["duration_band"].ok


@needs_ffmpeg
def test_unreadable_file_raises(cfg, tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(qc.MediaError):
        qc.check_reel(bad, cfg)


@needs_ffmpeg
@pytest.mark.parametrize("name,edges,px", [("letterbox", {"top", "bottom"}, 656),
                                           ("pillarbox", {"left", "right"}, 180)])
def test_borders_found(media, cfg, name, edges, px):
    r, by = check(media, name, cfg)
    f = by["borders"]
    assert not f.ok and f.severity == "fail" and not r.passed
    assert set(f.value) == edges and all(v["px"] == px and v["share"] == 1.0 for v in f.value.values())
    assert ("letterbox" if "top" in edges else "pillarbox") in f.detail


@needs_ffmpeg
@pytest.mark.parametrize("name", ["thinbars", "starfield", "gradient", "fit", "good"])
def test_no_borders(media, cfg, name):
    _, by = check(media, name, cfg)
    assert by["borders"].ok, by["borders"].detail


@needs_ffmpeg
def test_still_photo_has_no_hook_and_is_frozen(media, cfg):
    r, by = check(media, "still", cfg)
    assert not by["hook_motion"].ok and by["hook_motion"].value["speed"] < 0.05
    assert not by["frozen"].ok and by["frozen"].value == [[0.0, 2.0]]
    assert not by["duration_band"].ok                                  # 2 s: under 5
    assert by["loop"].value < 0.5                                      # last frame = first frame
    assert {"hook_motion", "frozen", "duration_band"} <= {f.rule for f in r.failures}


@needs_ffmpeg
@pytest.mark.parametrize("name", ["kenburns", "night_kenburns"])
def test_slow_ken_burns_is_change_but_not_a_hook(media, cfg, name):
    _, by = check(media, name, cfg)
    assert by["frozen"].ok, by["frozen"].detail
    assert not by["hook_motion"].ok, by["hook_motion"].detail
    if name == "kenburns":          # over stars the speed is near the line; MAD and share keep it out
        assert by["hook_motion"].value["speed"] < qc.HOOK_MIN_SPEED


@needs_ffmpeg
def test_pan_and_moving_pattern_are_hooks(media, cfg):
    for name in ("pan", "good"):
        _, by = check(media, name, cfg)
        assert by["hook_motion"].ok and by["hook_motion"].value["cut"] is None, (name, by["hook_motion"].detail)


@needs_ffmpeg
def test_cut_is_a_hook_and_a_held_shot_of_exactly_1_5_s_is_not_frozen(media, cfg):
    _, by = check(media, "cut", cfg)
    m = by["hook_motion"].value
    assert by["hook_motion"].ok and m["cut"]["t"] == pytest.approx(0.5, abs=0.04) and m["cut"]["mad"] > qc.CUT_MIN_MAD
    assert by["frozen"].ok and by["frozen"].value == [[0.5, 2.0]]       # listed, but not longer than 1.5 s


@needs_ffmpeg
def test_held_last_frame_is_frozen(media, cfg):
    _, by = check(media, "hold", cfg)
    assert not by["frozen"].ok and by["hook_motion"].ok
    (start, end), = by["frozen"].value
    assert start == pytest.approx(1.0, abs=0.07) and end == pytest.approx(3.0, abs=0.01)
    assert "-3.00 s" in by["frozen"].detail


@needs_ffmpeg
def test_duration_band_on_real_files(media, cfg):
    _, by = check(media, "good", cfg, band="short")
    assert by["duration_band"].ok and by["duration_band"].severity == "fail"
    r, by = check(media, "good", cfg, band="medium")
    assert not r.passed and not by["duration_band"].ok and "30-60" in by["duration_band"].detail
    r, by = check(media, "long", cfg)
    assert not by["duration_band"].ok and r.duration_s == pytest.approx(181, abs=0.1)
    assert "180" in by["duration_band"].detail


@needs_ffmpeg
def test_plan_findings_join_the_report(media, cfg):
    plan = plan_of(Shot(asset_id="w", duration_s=2, layout="fit"), Shot(asset_id="v", duration_s=6))
    r, _ = check(media, "good", cfg, plan=plan, kinds={"w": "photo", "v": "video"})
    assert not r.passed and [f.rule for f in r.failures] == ["plan.fit_share", "plan.fit_start"]


@needs_ffmpeg
def test_inputs_are_left_alone(media, cfg):
    p = media("good")
    before = (p.stat().st_mtime_ns, p.stat().st_size, sorted(p.parent.iterdir()))
    qc.check_reel(p, cfg)
    assert (p.stat().st_mtime_ns, p.stat().st_size, sorted(p.parent.iterdir())) == before


# --------------------------------------------------------------------------- the renderer's interface


def test_interface_the_renderer_calls():
    """The Mac renderer imports qc lazily and calls check_plan(plan) before rendering and
    check_reel(path, cfg, band=None, *, allow_silent=..., draft=...) on the draft."""
    plan_params = list(inspect.signature(qc.check_plan).parameters.values())
    assert plan_params[0].name == "plan" and all(p.kind is p.KEYWORD_ONLY for p in plan_params[1:])
    reel = inspect.signature(qc.check_reel).parameters
    assert list(reel)[:3] == ["path", "cfg", "band"] and reel["band"].default is None
    assert reel["cfg"].kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
    for name in ("allow_silent", "draft"):
        assert reel[name].kind is inspect.Parameter.KEYWORD_ONLY and reel[name].default is False
    assert all(isinstance(f, qc.Finding) for f in qc.check_plan(plan_of(Shot(asset_id="a", duration_s=6))))
    # importing qc must not import the renderer, which imports qc
    root = Path(__file__).resolve().parents[1]
    out = subprocess.run([sys.executable, "-c", "import sys, igmp.qc; print('igmp.render' in sys.modules)"],
                         capture_output=True, text=True, check=True, cwd=root,
                         env={**os.environ, "PYTHONPATH": str(root / "src")})
    assert out.stdout.strip() == "False"


@needs_ffmpeg
def test_cfg_may_be_none_or_have_no_fields(media):
    p = media("good")
    for cfg in (None, SimpleNamespace(), SimpleNamespace(ffmpeg=FFMPEG, ffprobe=FFPROBE),
                Config(library_roots=[], output_dir=Path("/nonexistent"), ffmpeg=FFMPEG, ffprobe=FFPROBE)):
        assert qc.check_reel(p, cfg, None).passed


@needs_ffmpeg
def test_summary_for_llm(media, cfg):
    good = qc.check_reel(media("good"), cfg)
    assert good.summary_for_llm() == "Reel QC passed: 0 failed, 0 warned (1080x1920, 8.00 s, 30 fps)"
    quiet = qc.check_reel(media("quiet"), cfg).summary_for_llm().splitlines()
    assert quiet[0].startswith("Reel QC passed: 0 failed, 1 warned")
    assert quiet[1:] == ["- WARN loudness: -50.5 LUFS integrated; target -14 +-2"]
    text = qc.check_reel(media("still"), cfg).summary_for_llm()
    head, *bullets = text.splitlines()
    assert head.startswith("Reel QC FAILED: 5 failed")
    severities = [b.split()[1] for b in bullets]
    assert all(b.startswith("- ") for b in bullets) and severities == sorted(severities)   # FAILs first
    rules = {b.split()[2].rstrip(":") for b in bullets}
    assert {"audio_present", "audio_silent", "hook_motion", "frozen", "duration_band"} <= rules
    assert not rules & {"borders", "loop", "format.codec"}                                  # only what is wrong
    assert "speed 0.00 px/frame" in text and "0.00-2.00 s (2.00 s)" in text and "2.0 s: under 5 s" in text
    plan = plan_of(Shot(asset_id="v", duration_s=4), Shot(asset_id="w", duration_s=3, layout="fit"),
                   Shot(asset_id="p", duration_s=3))
    assert qc.findings_for_llm(qc.check_plan(plan)) == (
        "- FAIL plan.fit_share: fit shots 3.00 s of 10.00 s (30%); at most 20%: crop some to fill")
    assert qc.findings_for_llm([]) == ""


@needs_ffmpeg
def test_draft_makes_encoder_findings_info(soft, media, cfg):
    p = soft("good")                                             # 2 Mb/s: under the 6 Mb/s floor
    by = {f.rule: f for f in qc.check_reel(p, cfg).findings}
    assert not by["format.bitrate"].ok and by["format.bitrate"].severity == "warn"
    d = qc.check_reel(p, cfg, draft=True)
    f = d.finding("format.bitrate")
    assert not f.ok and f.severity == "info" and f.detail.endswith("(draft)")
    assert d.passed and d.draft and not d.warnings
    assert d.summary_for_llm() == "Reel QC passed: 0 failed, 0 warned (1080x1920, 8.00 s, 30 fps, draft)"
    wrong = qc.check_reel(media("wrong"), cfg, draft=True)                  # yuv444p, 1280x720, 24 fps
    assert wrong.finding("format.pix_fmt").severity == "info"
    assert {f.rule for f in wrong.failures} >= {"format.resolution", "format.fps"}  # the picture still counts
    assert qc.check_reel(media("mpeg4"), cfg, draft=True).finding("format.codec").severity == "info"


@needs_ffmpeg
@pytest.mark.parametrize("name,border,hook,frozen", [
    ("letterbox", True, True, False), ("starfield", False, False, True), ("fit", False, False, True),
    ("still", False, False, True), ("kenburns", False, False, False), ("night_kenburns", False, False, False),
    ("pan", False, True, False), ("cut", False, True, False)])
def test_soft_low_bitrate_drafts_read_the_same(soft, cfg, name, border, hook, frozen):
    """At 2 Mb/s with soft, smeared detail the encoder refines stills over a few frames and jumps at
    keyframes; none of that may read as motion, and stars must still count as change."""
    r = qc.check_reel(soft(name), cfg, draft=True)
    by = {f.rule: f for f in r.findings}
    assert (not by["borders"].ok, by["hook_motion"].ok, not by["frozen"].ok) == (border, hook, frozen), r.summary()
    if border:
        assert all(abs(v["px"] - 656) <= 8 for v in by["borders"].value.values())


@needs_ffmpeg
def test_soft_draft_held_frame(soft, soft4, cfg):
    """A held frame of sharp detail on black: at 4 Mb/s it reads frozen. At 2 Mb/s the encoder keeps
    refining it in the dark blocks (0.06% of pixels by > 8 levels at the 2 s keyframe, against the
    0.08-0.10% that faint drifting stars measure) and the stretch splits: a miss, which costs a
    critic call, rather than a false fail on a night sky, which would cost a pointless revision."""
    by = {f.rule: f for f in qc.check_reel(soft4("hold"), cfg, draft=True).findings}
    assert not by["frozen"].ok and by["frozen"].value[-1][1] == 3.0
    by = {f.rule: f for f in qc.check_reel(soft("hold"), cfg, draft=True).findings}
    # whether the encoder keeps refining the dark blocks at 2 Mb/s depends on the x264 build (it does
    # with ffmpeg 6 on Linux, not with ffmpeg 8 on macOS): the split is allowed, never required
    assert by["hook_motion"].ok
    assert by["frozen"].ok or by["frozen"].value[-1][1] == 3.0


# --------------------------------------------------------------------------- command line


@needs_ffmpeg
def test_cli(media, tmp_path, capsys):
    good = media("good")
    assert qc.main([str(good)]) == 0
    assert capsys.readouterr().out.startswith("PASS")
    assert qc.main([str(good), "--band", "medium", "--json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert data["passed"] is False and data["path"] == str(good)
    folder = tmp_path / "reels"
    folder.mkdir()
    for name in ("good", "silent"):
        shutil.copy(media(name), folder / f"{name}.mp4")
    (folder / "notes.txt").write_text("not a reel")
    assert qc.main([str(folder), "--json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert [Path(d["path"]).name for d in data] == ["good.mp4", "silent.mp4"]
    assert [d["passed"] for d in data] == [True, False]
    assert qc.main([str(folder), "--allow-silent"]) == 0
    (folder / "bad.mp4").write_bytes(b"junk")
    assert qc.main([str(folder)]) == 2
    assert "ERROR" in capsys.readouterr().err
    empty = tmp_path / "empty"
    empty.mkdir()
    assert qc.main([str(empty)]) == 2


def test_python_dash_m():
    root = Path(__file__).resolve().parents[1]
    env = {**os.environ, "PYTHONPATH": str(root / "src")}
    out = subprocess.run([sys.executable, "-m", "igmp.qc", "--help"], capture_output=True, text=True, check=False,
                         cwd=root, env=env)
    assert out.returncode == 0 and all(f in out.stdout for f in ("--band", "--allow-silent", "--draft", "--json"))
