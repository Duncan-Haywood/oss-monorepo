"""Transitions: every kind renders the right frames in the segment format, joins seamlessly at both
ends and never goes black; the backends' plumbing (RIFE command line, minterpolate, depth,
generative pipeline) and the cache and the reference assembler. Small synthetic segments
(216x384) keep it fast; one join runs at the real 1080x1920."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from igmp import aitx
from igmp.aitx import TransitionSpec
from igmp.config import Config

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
HAVE_FFMPEG = Path(FFMPEG).exists() and Path(FFPROBE).exists()
pytestmark = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg not installed")

W, H = 216, 384


def cfg_for(tmp: Path, **extra) -> Config:
    extra = {"aitx_interpolator": "minterpolate", "aitx_depth": "heuristic", "reel_preset": "veryfast",
             "aitx_workers": 2, "aitx_allow_fallback": True, **extra}
    return Config(library_roots=[], output_dir=tmp, ffmpeg=FFMPEG, ffprobe=FFPROBE, extra=extra)


def write_segment(frames, out: Path, cfg: Config, size=(W, H)) -> Path:
    frames = list(frames)
    w = aitx.ClipWriter(out, cfg, "x264", len(frames), size)
    for f in frames:
        w.write(f)
    return w.close()


def kenburns(img: np.ndarray, n: int, z1: float = 1.06, size=(W, H)) -> list[np.ndarray]:
    base = aitx.cut_916(img, (0.5, 0.5), size)
    return [aitx.zoom_about(base, z1 ** (i / (n - 1)), size[0] / 2, size[1] / 2) for i in range(n)]


def pan(img: np.ndarray, n: int, speed: float = 3.0, size=(W, H)) -> list[np.ndarray]:
    """Content moving left at `speed` px/frame (the camera pans right), with a little noise."""
    s = size[1] / img.shape[0]
    big = aitx._resize(img, int(img.shape[1] * s), size[1], Image.LANCZOS)
    rng = np.random.default_rng(3)
    out = []
    for i in range(n):
        x = i * speed
        fr = aitx.crop_resize(big, (x, 0, x + size[0], size[1]), cubic=True, size=size)
        out.append(np.clip(fr + rng.normal(0, 0.006, fr.shape).astype(np.float32), 0, 1))
    return out


@pytest.fixture(scope="module")
def media(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("aitx")
    cfg = cfg_for(tmp)
    land, land_depth = aitx.demo_landscape(480, 320, seed=1)
    land2, _ = aitx.demo_landscape(480, 320, seed=1, sun=0.66)
    stars, _ = aitx.demo_starfield(480, 320)
    city, _ = aitx.demo_city(480, 320)
    segs = {
        "land": write_segment(kenburns(land, 30), tmp / "land.mp4", cfg),
        "land2": write_segment(kenburns(land2, 30, 1.04), tmp / "land2.mp4", cfg),
        "stars": write_segment(kenburns(stars, 30), tmp / "stars.mp4", cfg),
        "city": write_segment(kenburns(city, 30), tmp / "city.mp4", cfg),
        "pan": write_segment(pan(land, 30), tmp / "pan.mp4", cfg),
    }
    return SimpleNamespace(tmp=tmp, cfg=cfg, segs=segs, land=land, land_depth=land_depth)


def decode(path: Path, cfg: Config) -> np.ndarray:
    info = aitx.probe_segment(path, cfg)
    return aitx._f(aitx.read_frames(path, 0, info.frames, cfg, info))


def mean_luma(frames: np.ndarray) -> np.ndarray:
    return np.array([float(aitx.luma(f).mean()) for f in frames])


# --------------------------------------------------------------------------- I/O


def test_read_frames_seek_is_frame_accurate(media):
    cfg = media.cfg
    allf = aitx.read_frames(media.segs["pan"], 0, 30, cfg)
    for k in (1, 7, 29):
        one = aitx.read_frames(media.segs["pan"], k, 1, cfg)[0]
        assert np.array_equal(one, allf[k])


def test_clip_writer_round_trip_and_refuses_overwrite(media, tmp_path):
    cfg = media.cfg
    frames = aitx._f(aitx.read_frames(media.segs["land"], 0, 4, cfg))
    out = write_segment(frames, tmp_path / "rt.mp4", cfg)
    back = decode(out, cfg)
    assert back.shape == frames.shape
    assert float(np.abs(back - frames).mean()) < 0.01
    info = aitx.probe_segment(out, cfg)
    assert (info.width, info.height, info.frames, info.codec, info.pix_fmt) == (W, H, 4, "h264", "yuv420p")
    with pytest.raises(FileExistsError):
        aitx.ClipWriter(out, cfg, "x264", 1, (W, H))


# --------------------------------------------------------------------------- every transition

CASES = [
    ("morph", "land", "land2", {}),
    ("depth_parallax_through", "land", "stars", {}),
    ("whip", "pan", "city", {"direction": "right"}),
    ("whip", "land", "city", {"direction": "up"}),
    ("zoom_through", "city", "land", {"focus_a": (0.4, 0.5)}),
    ("match_dissolve", "land", "land2", {}),
    ("match_dissolve", "land", "city", {"focus_a": (0.3, 0.4), "focus_b": (0.6, 0.5)}),
    ("luma_dip", "land", "stars", {}),
    ("luma_dip", "stars", "land", {"color": "light"}),
    ("flash", "stars", "land", {"color": "warm"}),
    ("flash", "city", "land", {"color": "white"}),
    ("speed_ramp_cut", "pan", "land", {}),
]


@pytest.mark.parametrize("kind,a,b,kw", CASES, ids=[f"{c[0]}-{c[1]}-{c[2]}" for c in CASES])
@pytest.mark.parametrize("duration", [0.4, 0.5])
def test_transition_frames_format_continuity(media, tmp_path, kind, a, b, kw, duration):
    cfg = media.cfg
    spec = TransitionSpec(kind=kind, duration_s=duration, **kw)
    out = aitx.render_transition(media.segs[a], media.segs[b], spec, tmp_path / "t.mp4", cfg)
    n = round(duration * 30)
    info = aitx.probe_segment(out, cfg)
    assert (info.width, info.height, info.frames, info.fps) == (W, H, n, 30.0)
    assert (info.codec, info.pix_fmt) == ("h264", "yuv420p")
    t = decode(out, cfg)
    ha, hb = spec.halves()
    fa, fb = decode(media.segs[a], cfg), decode(media.segs[b], cfg)
    # seamless at both ends: the first frame is A at the trim point, the last is B before it resumes
    assert float(np.abs(t[0] - fa[len(fa) - ha]).mean()) < 0.01
    assert float(np.abs(t[-1] - fb[hb - 1]).mean()) < 0.01
    # never black, never a hole: no frame darker than half the darker side
    lum = mean_luma(t)
    floor = 0.5 * min(float(aitx.luma(fa[-1]).mean()), float(aitx.luma(fb[0]).mean()))
    assert lum.min() >= floor - 1e-3
    assert all(float(f.max()) > 0.05 for f in t)
    # it actually moves: some middle frame differs from both ends
    mid = t[n // 2]
    assert float(np.abs(mid - t[0]).mean()) > 0.003 or float(np.abs(mid - t[-1]).mean()) > 0.003


def stripes(vertical: bool, n: int, period: int = 8, size=(W, H)) -> np.ndarray:
    yy, xx = np.mgrid[0:size[1], 0:size[0]]
    v = ((xx if vertical else yy) // (period // 2)) % 2
    frame = np.repeat((0.2 + 0.6 * v)[..., None], 3, axis=-1).astype(np.float32)
    return aitx._u16(np.repeat(frame[None], n, axis=0))


@pytest.mark.parametrize("direction", ["right", "left", "up", "down"])
def test_whip_blurs_along_its_direction_only(direction):
    """Mid-whip, stripes across the motion are smeared flat; stripes along it stay sharp."""
    across = direction in ("left", "right")
    bd = aitx.Boundary(stripes(across, 4), stripes(across, 5))
    frames = list(aitx._whip(bd, TransitionSpec(kind="whip", duration_s=0.3, direction=direction), None))
    assert len(frames) == 9
    mid = aitx.luma(frames[4])
    assert float(mid.std()) < 0.03, "stripes across the motion are blurred away"
    bd2 = aitx.Boundary(stripes(not across, 4), stripes(not across, 5))
    mid2 = aitx.luma(list(aitx._whip(bd2, TransitionSpec(kind="whip", duration_s=0.3, direction=direction), None))[4])
    assert float(mid2.std()) > 0.25, "stripes along the motion keep their contrast"


def test_whip_direction_moves_content_the_right_way():
    """Camera right: B enters from the right edge."""
    a = np.zeros((4, H, W, 3), np.float32)
    b = np.ones((5, H, W, 3), np.float32)
    frames = list(aitx._whip(aitx.Boundary(aitx._u16(a), aitx._u16(b)),
                             TransitionSpec(kind="whip", duration_s=0.3, direction="right"), None))
    col = aitx.luma(frames[3]).mean(axis=0)
    assert col[-10:].mean() > col[:10].mean() + 0.3


def test_cut_has_no_clip(media, tmp_path):
    assert aitx.render_transition(media.segs["land"], media.segs["city"], TransitionSpec(), tmp_path / "c.mp4",
                                  media.cfg) is None
    assert not (tmp_path / "c.mp4").exists()


def test_render_refuses_existing_output(media, tmp_path):
    out = tmp_path / "x.mp4"
    out.write_bytes(b"keep")
    with pytest.raises(FileExistsError):
        aitx.render_transition(media.segs["land"], media.segs["city"],
                               TransitionSpec(kind="flash", duration_s=0.3), out, media.cfg)
    assert out.read_bytes() == b"keep"


def test_odd_frame_count_splits_halves():
    s = TransitionSpec(kind="whip", duration_s=0.3)        # 9 frames
    assert s.frames() == 9 and s.halves() == (4, 5)
    assert TransitionSpec(kind="cut", duration_s=1).frames() == 0


# --------------------------------------------------------------------------- AI backends


def test_rife_command_line_and_plumbing(tmp_path):
    seen = []

    def runner(cmd, **kw):
        seen.append(cmd)
        a = np.asarray(Image.open(cmd[cmd.index("-0") + 1]), np.float32)
        b = np.asarray(Image.open(cmd[cmd.index("-1") + 1]), np.float32)
        t = float(cmd[cmd.index("-s") + 1])
        Image.fromarray(((1 - t) * a + t * b).astype(np.uint8)).save(cmd[cmd.index("-o") + 1])
        return subprocess.CompletedProcess(cmd, 0, b"", b"")

    binary = tmp_path / "rife-ncnn-vulkan"
    binary.write_text("")
    (tmp_path / "rife-v4.6").mkdir()
    r = aitx.RifeInterpolator(str(binary), "rife-v4.6", gpu=None, jobs=2, runner=runner)
    assert r.model == str(tmp_path / "rife-v4.6")          # found next to the binary, as in the release zip
    a = np.zeros((8, 6, 3), np.float32)
    b = np.ones((8, 6, 3), np.float32)
    out = r.pairs([(a, b, 0.0), (a, b, 0.25), (a, b, 1.0)])
    assert out[0] is a and out[2] is b
    assert abs(float(out[1].mean()) - 0.25) < 0.01
    assert len(seen) == 1
    cmd = seen[0]
    assert cmd[0] == str(binary) and cmd[cmd.index("-m") + 1] == str(tmp_path / "rife-v4.6")
    assert cmd[cmd.index("-s") + 1] == "0.25000" and "-g" not in cmd
    cpu = aitx.RifeInterpolator(str(binary), "rife-v4.6", gpu=-1, runner=runner)
    assert cpu.command(Path("a"), Path("b"), Path("o"), 0.5)[-2:] == ["-g", "-1"]
    with pytest.raises(ValueError):
        aitx.RifeInterpolator(str(binary), "rife-v2.3")          # no arbitrary time steps


def test_rife_failure_is_an_error(tmp_path):
    def runner(cmd, **kw):
        return subprocess.CompletedProcess(cmd, 255, b"", b"vkCreateInstance failed")
    r = aitx.RifeInterpolator("/x/rife-ncnn-vulkan", "rife-v4.6", runner=runner)
    with pytest.raises(RuntimeError, match="vkCreateInstance"):
        r.pairs([(np.zeros((4, 4, 3), np.float32), np.ones((4, 4, 3), np.float32), 0.5)])


def test_rife_is_found_from_config(tmp_path, media):
    binary = tmp_path / "rife-ncnn-vulkan"
    binary.write_text("#!/bin/sh\n")
    binary.chmod(0o755)
    cfg = cfg_for(tmp_path, aitx_interpolator="auto", aitx_rife=str(binary))
    assert aitx.find_rife(cfg) == str(binary)
    assert isinstance(aitx.interpolator_for(cfg), aitx.RifeInterpolator)
    assert isinstance(aitx.interpolator_for(cfg_for(tmp_path, aitx_rife=str(tmp_path / "nope"))),
                      aitx.MinterpInterpolator)


def test_minterpolate_moves_a_block_between_keyframes():
    a = np.zeros((96, 128, 3), np.float32)
    b = np.zeros((96, 128, 3), np.float32)
    a[30:60, 20:50] = 1
    b[30:60, 30:60] = 1
    mid = aitx.MinterpInterpolator(FFMPEG, factor=4).at([a, b], [0.0, 0.5, 1.0])
    assert len(mid) == 3
    cols = np.where(mid[1][45, :, 0] > 0.5)[0]
    assert 22 <= cols.min() <= 28 and 52 <= cols.max() <= 58          # half way, not a dissolve
    assert np.abs(mid[0] - a).max() < 0.02 and np.abs(mid[2] - b).max() < 0.02


def test_morph_guard_dissolves_when_interpolation_breaks():
    a = np.full((40, 30, 3), 0.6, np.float32)
    b = np.full((40, 30, 3), 0.4, np.float32)
    broken = [a, np.zeros_like(a), b]
    out = aitx._guard_morph(a, b, [0.0, 0.5, 1.0], broken)
    assert abs(float(out[1].mean()) - 0.5) < 1e-4


def test_heuristic_depth_sky_far_ground_near(media):
    img = aitx.cut_916(media.land, (0.5, 0.5))
    d = aitx.heuristic_depth(img)
    assert d.shape == (960, 540)
    assert float(d[:150].mean()) < 0.1 and float(d[-150:].mean()) > 0.7


def test_depth_falls_back_to_heuristic_without_model(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise ImportError("no transformers")
    monkeypatch.setattr(aitx, "DepthAnything", boom)
    aitx._BACKENDS.clear()
    est = aitx.depth_for(cfg_for(tmp_path, aitx_depth="auto", aitx_depth_model="nobody/none"))
    assert est.name == "heuristic"
    assert aitx.depth_for(cfg_for(tmp_path, aitx_depth="flat")).name == "flat"
    aitx._BACKENDS.clear()


def test_push_pull_keeps_known_and_fills_holes():
    v = np.zeros((32, 32, 3), np.float32)
    v[:, :16] = (0.2, 0.4, 0.6)
    w = np.zeros((32, 32), np.float32)
    w[:, :16] = 1
    out = aitx.push_pull(v, w)
    assert np.allclose(out[:, :16], v[:, :16])
    assert np.allclose(out[:, 16:], (0.2, 0.4, 0.6), atol=1e-3)


def test_parallax_scene_identity_and_planes(media):
    img = aitx.cut_916(media.land, (0.5, 0.5), (W, H))
    depth = aitx.cut_916(media.land_depth, (0.5, 0.5), (W // 2, H // 2))
    scene = aitx.parallax_scene(img, depth)
    assert len(scene.planes) >= 2, "the true depth has hard edges: it splits into planes"
    assert np.array_equal(aitx.render_parallax(scene, aitx._Move()), img)
    near_identity = aitx.render_parallax(scene, aitx._Move(s_far=1 + 1e-6, s_near=1 + 1e-6))
    assert float(np.abs(near_identity - img).mean()) < 2e-3
    moved = aitx.render_parallax(scene, aitx._Move(s_far=1.05, s_near=1.3))
    assert moved.shape == img.shape and float(moved.min()) >= 0
    # near things (the bottom) move more than far ones (the sky)
    diff = np.abs(moved - img).mean(axis=(1, 2))
    assert diff[-H // 6:].mean() > diff[: H // 6].mean()


@pytest.mark.parametrize("move", aitx.MOVES)
def test_parallax_still_writes_a_moving_segment(media, tmp_path, move):
    cfg = media.cfg
    depth = aitx.cut_916(media.land_depth, (0.5, 0.5), (W // 2, H // 2))
    img = aitx.cut_916(media.land, (0.5, 0.5), (W, H))
    frames = list(aitx.parallax_frames(img, depth, 0.5, move))
    assert len(frames) == 15 and frames[0].shape == (H, W, 3)
    assert float(np.abs(frames[-1] - frames[0]).mean()) > 0.002
    if move == "dolly_in":
        assert np.array_equal(frames[0], img)


def test_parallax_still_segment_full_size(media, tmp_path):
    out = aitx.parallax_still(media.land, aitx.cut_916(media.land_depth, (0.5, 0.5), (540, 960)), 0.2, "dolly_in",
                              out=tmp_path / "ps.mp4", cfg=media.cfg)
    info = aitx.probe_segment(out, media.cfg)
    assert (info.width, info.height, info.frames) == (1080, 1920, 6)


class FakeCondition:
    def __init__(self, image, frame_index):
        self.image, self.frame_index = image, frame_index


class FakePipe:
    def __init__(self, delay_steps: int = 0):
        self.calls = []

    def __call__(self, **kw):
        self.calls.append(kw)
        for step in range(kw["num_inference_steps"]):
            kw["callback_on_step_end"](self, step, 0, {})
        a, b = kw["conditions"][0].image, kw["conditions"][1].image
        n = kw["num_frames"]
        frames = [Image.blend(a, b, k / (n - 1)) for k in range(n)]
        return SimpleNamespace(frames=[frames])


def test_generative_plumbing_with_fake_pipeline(media, tmp_path):
    cfg = cfg_for(tmp_path, aitx_generative=True, aitx_generative_steps=3, aitx_generative_size=[64, 128])
    pipe = FakePipe()
    gen = aitx.Generative(cfg, factory=lambda: (pipe, FakeCondition))
    spec = TransitionSpec(kind="generative", duration_s=0.8, prompt="through the clouds")
    out = aitx.render_transition(media.segs["land"], media.segs["city"], spec, tmp_path / "g.mp4", cfg, generative=gen)
    kw = pipe.calls[0]
    assert kw["num_frames"] == 25 and (kw["num_frames"] - 1) % 8 == 0
    assert (kw["width"], kw["height"]) == (64, 128) and kw["num_inference_steps"] == 3
    assert [c.frame_index for c in kw["conditions"]] == [0, 24]
    assert kw["prompt"] == "through the clouds" and kw["frame_rate"] == 30
    info = aitx.probe_segment(out, cfg)
    assert (info.frames, info.width, info.height) == (24, W, H)
    t = decode(out, cfg)
    fa, fb = decode(media.segs["land"], cfg), decode(media.segs["city"], cfg)
    assert float(np.abs(t[0] - fa[len(fa) - 12]).mean()) < 0.01
    assert float(np.abs(t[-1] - fb[11]).mean()) < 0.01


def test_generative_over_budget_falls_back(media, tmp_path):
    cfg = cfg_for(tmp_path, aitx_generative=True, aitx_generative_budget_s=0.0, aitx_generative_size=[64, 128])
    gen = aitx.Generative(cfg, factory=lambda: (FakePipe(), FakeCondition))
    spec = TransitionSpec(kind="generative", duration_s=0.8)
    out = aitx.render_transition(media.segs["land"], media.segs["stars"], spec, tmp_path / "g.mp4", cfg, generative=gen)
    assert aitx.probe_segment(out, cfg).frames == 24          # depth_parallax_through stood in


def test_generative_off_and_not_installed(media, tmp_path):
    cfg = cfg_for(tmp_path)                                    # aitx_generative defaults to false
    out = aitx.render_transition(media.segs["land"], media.segs["stars"],
                                 TransitionSpec(kind="generative", duration_s=0.4), tmp_path / "g.mp4", cfg)
    assert aitx.probe_segment(out, cfg).frames == 12
    assert aitx.generative_available(cfg).startswith("off")
    with pytest.raises(ValueError):
        aitx.Generative(cfg_for(tmp_path, aitx_generative=True, aitx_generative_size=[100, 128]),
                        factory=lambda: (FakePipe(), FakeCondition))(np.zeros((8, 8, 3)), np.zeros((8, 8, 3)), 8)


# --------------------------------------------------------------------------- cache and join


def test_cache_key_and_hit(media, tmp_path):
    cfg = media.cfg
    a, b = media.segs["land"], media.segs["city"]
    spec = TransitionSpec(kind="flash", duration_s=0.4, reason="first")
    k1 = aitx.transition_key(a, b, spec, cfg)
    assert k1 == aitx.transition_key(a, b, spec.model_copy(update={"reason": "other words"}), cfg)
    assert k1 != aitx.transition_key(a, b, spec.model_copy(update={"duration_s": 0.5}), cfg)
    assert k1 != aitx.transition_key(a, media.segs["stars"], spec, cfg)
    p1, hit1, _ = aitx.cached_transition(a, b, spec, cfg, tmp_path / "cache")
    p2, hit2, _ = aitx.cached_transition(a, b, spec, cfg, tmp_path / "cache")
    assert not hit1 and hit2 and p1 == p2 and p1.exists()
    assert p1.stem == k1


def test_cache_key_reads_only_the_frames_used(media, monkeypatch):
    """All-intra segments: only the packets of the frames a transition uses are in its key; with
    inter-coded packets the whole stream is."""
    cfg = media.cfg
    a, b = str(media.segs["land"]), str(media.segs["city"])
    spec = TransitionSpec(kind="whip", duration_s=0.3)            # 4 frames of A, 5 of B
    packets = {a: [(f"a{i}", True) for i in range(30)], b: [(f"b{i}", True) for i in range(30)]}
    monkeypatch.setattr(aitx, "_packet_hashes", lambda p, c: list(packets[str(p)]))
    k = aitx.transition_key(a, b, spec, cfg)
    packets[a][0] = ("changed", True)
    packets[b][29] = ("changed", True)
    assert aitx.transition_key(a, b, spec, cfg) == k
    packets[a][27] = ("changed", True)
    assert aitx.transition_key(a, b, spec, cfg) != k
    k2 = aitx.transition_key(a, b, spec, cfg)
    packets[a] = [(h, i % 10 == 0) for i, (h, _) in enumerate(packets[a])]   # long-GOP now
    k3 = aitx.transition_key(a, b, spec, cfg)
    packets[a][0] = ("again", True)
    assert aitx.transition_key(a, b, spec, cfg) != k3 and k3 != k2


def test_fit_specs_shortens_and_cuts():
    specs = [TransitionSpec(kind="whip", duration_s=0.5), TransitionSpec(kind="flash", duration_s=1.0)]
    out = aitx.fit_specs([30, 10, 30], specs)
    assert out[0].halves() == (7, 8)                              # fits as it is
    assert out[0].halves()[1] + out[1].halves()[0] <= 9           # the 10-frame segment keeps a frame
    assert out[1].kind == "flash" and out[1].frames() == 2
    tight = aitx.fit_specs([30, 2, 30], [TransitionSpec(kind="whip", duration_s=0.5)] * 2)
    assert tight[1].kind == "cut"


def test_join_end_to_end_with_audio(media, tmp_path):
    cfg = media.cfg
    segs = [media.segs["pan"], media.segs["city"], media.segs["land"], media.segs["stars"]]
    specs = [TransitionSpec(kind="whip", duration_s=0.3, direction="right"), TransitionSpec(),
             TransitionSpec(kind="luma_dip", duration_s=0.4)]
    music = tmp_path / "mix.m4a"
    subprocess.run([FFMPEG, "-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=6", "-c:a", "aac", "-b:a", "128k",
                    str(music)], check=True)
    rep = aitx.join(segs, specs, tmp_path / "reel.mp4", cfg, audio=music, cache_dir=tmp_path / "cache", workers=2)
    assert rep["frames"] == 120 and abs(rep["seconds"] - 4.0) < 1e-9
    info = aitx.probe_segment(tmp_path / "reel.mp4", cfg)
    assert info.frames == 120 and (info.width, info.height) == (W, H)
    probe = json.loads(subprocess.run([FFPROBE, "-v", "error", "-show_streams", "-show_format", "-of", "json",
                                       str(tmp_path / "reel.mp4")], capture_output=True, check=True).stdout)
    audio = [s for s in probe["streams"] if s["codec_type"] == "audio"]
    assert audio and audio[0]["codec_name"] == "aac"
    assert abs(float(probe["format"]["duration"]) - 4.0) < 0.1
    assert [t["kind"] for t in rep["transitions"]] == ["whip", "luma_dip"]
    # the joined frames are the trimmed segments and the transition clips, in order
    reel = decode(tmp_path / "reel.mp4", cfg)
    first = decode(segs[0], cfg)
    assert float(np.abs(reel[10] - first[10]).mean()) < 0.02
    # a second join reuses every transition from the cache
    rep2 = aitx.join(segs, specs, tmp_path / "reel2.mp4", cfg, cache_dir=tmp_path / "cache", workers=1)
    assert all(t["cached"] for t in rep2["transitions"])
    with pytest.raises(FileExistsError):
        aitx.join(segs, specs, tmp_path / "reel.mp4", cfg, cache_dir=tmp_path / "cache")
    with pytest.raises(ValueError):
        aitx.join(segs, specs[:1], tmp_path / "bad.mp4", cfg)


def test_join_full_size(tmp_path):
    """The contract size: 1080x1920 segments in, a 1080x1920 reel out, length unchanged."""
    cfg = cfg_for(tmp_path)
    a = tmp_path / "a.mp4"
    b = tmp_path / "b.mp4"
    aitx.demo_testsrc(0.5, a, cfg)
    land, _ = aitx.demo_landscape(600, 400)
    write_segment(kenburns(land, 15, size=(1080, 1920)), b, cfg, (1080, 1920))
    rep = aitx.join([a, b], [TransitionSpec(kind="whip", duration_s=0.27, direction="left")], tmp_path / "r.mp4", cfg,
                    cache_dir=tmp_path / "c")
    info = aitx.probe_segment(tmp_path / "r.mp4", cfg)
    assert (info.width, info.height, info.frames) == (1080, 1920, 30) and rep["frames"] == 30


def test_contact_sheet(media, tmp_path):
    cfg = media.cfg
    spec = TransitionSpec(kind="flash", duration_s=0.4)
    clip = aitx.render_transition(media.segs["stars"], media.segs["land"], spec, tmp_path / "f.mp4", cfg)
    png = aitx.contact_sheet(media.segs["stars"], media.segs["land"], clip, spec, tmp_path / "s.png", cfg)
    with Image.open(png) as im:
        assert im.width > 7 * 216 and im.height > 384


def test_backends_report(tmp_path):
    rep = aitx.backends_report(cfg_for(tmp_path))
    assert rep["interpolator"] == "minterpolate" and rep["depth"] == "heuristic"
    assert set(rep["full_quality_kinds"]) == aitx.SUPPORTED - {"generative"}      # fallbacks allowed here


def test_prores_segments_get_prores_transitions(media, tmp_path):
    cfg = media.cfg
    frames = decode(media.segs["land"], cfg)
    w = aitx.ClipWriter(tmp_path / "a.mov", cfg, "prores", len(frames), (W, H))
    for f in frames:
        w.write(f)
    a = w.close()
    spec = TransitionSpec(kind="match_dissolve", duration_s=0.4)
    out = aitx.render_transition(a, media.segs["city"], spec, tmp_path / "t.mov", cfg)
    info = aitx.probe_segment(out, cfg)
    assert (info.codec, info.pix_fmt, info.frames) == ("prores", "yuv422p10le", 12)
    t = decode(out, cfg)
    assert float(np.abs(t[0] - frames[len(frames) - 6]).mean()) < 0.005



# --------------------------------------------------------------------------- the renderer's interface


def tone(path: Path, freq: int, seconds: float) -> Path:
    subprocess.run([FFMPEG, "-v", "error", "-f", "lavfi", "-i", f"sine=f={freq}:d={seconds}:sample_rate=48000",
                    "-ac", "2", "-c:a", "pcm_s16le", str(path)], check=True)
    return path


@pytest.fixture(scope="module")
def stems(media, tmp_path_factory):
    """Segments that carry a natural-sound stem (PCM, as the renderer's intermediates do)."""
    tmp = tmp_path_factory.mktemp("stems")
    cfg = media.cfg
    out = {}
    for name, seg, freq in (("a", media.segs["land"], 440), ("b", media.segs["city"], 1000)):
        frames = decode(seg, cfg)
        wav = tone(tmp / f"{name}.wav", freq, 1.0)
        w = aitx.ClipWriter(tmp / f"{name}.mov", cfg, "x264", len(frames), (W, H),
                            audio=[aitx.AudioPart(str(wav), 0.0, len(frames) / 30)],
                            audio_info=aitx.probe_audio(wav, cfg))
        for f in frames:
            w.write(f)
        out[name] = w.close()
    return out


def audio_of(path: Path, cfg: Config) -> tuple[dict, np.ndarray]:
    info = json.loads(subprocess.run([FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries",
                                      "stream=codec_name,duration,sample_rate", "-of", "json", str(path)],
                                     capture_output=True, check=True).stdout)["streams"][0]
    pcm = np.frombuffer(subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-map", "0:a:0", "-ac", "1",
                                        "-f", "f32le", "-"], capture_output=True, check=True).stdout, np.float32)
    return info, pcm


def zero_crossings_hz(x: np.ndarray, sr: int = 48000) -> float:
    return float(np.sum(np.abs(np.diff(np.signbit(x).astype(np.int8)))) / 2 / (len(x) / sr))


def test_transition_carries_the_natural_sound_stem(stems, media, tmp_path):
    cfg = media.cfg
    spec = TransitionSpec(kind="whip", duration_s=0.4, direction="right")       # 12 frames: 6 of A, 6 of B
    out = aitx.render_transition(stems["a"], stems["b"], spec, tmp_path / "t.mov", cfg)
    info, pcm = audio_of(out, cfg)
    assert info["codec_name"] == "pcm_s16le"
    assert len(pcm) == 12 * 1600, "exactly round(duration * 30) frames of sound"
    first, second = pcm[: 6 * 1600 - 800], pcm[6 * 1600 + 800:]
    assert abs(zero_crossings_hz(first) - 440) < 30 and abs(zero_crossings_hz(second) - 1000) < 60
    assert b"crf=10.0" in out.read_bytes(), "all-intra x264 at crf 10, as the renderer's intermediates"


def test_transition_without_sound_gets_exact_silence(media, tmp_path):
    out = aitx.render_transition(media.segs["land"], media.segs["city"],
                                 TransitionSpec(kind="flash", duration_s=0.4), tmp_path / "t.mp4", media.cfg)
    info, pcm = audio_of(out, media.cfg)
    assert len(pcm) == 12 * 1600 and float(np.abs(pcm).max()) == 0.0


def test_join_keeps_the_natural_sound(stems, media, tmp_path):
    cfg = media.cfg
    rep = aitx.join([stems["a"], stems["b"]], [{"kind": "luma_dip", "duration_s": 0.4}], tmp_path / "r.mp4", cfg,
                    cache_dir=tmp_path / "c")
    assert rep["sound"] == "natural" and rep["frames"] == 60
    info, pcm = audio_of(tmp_path / "r.mp4", cfg)
    assert info["codec_name"] == "aac" and abs(float(info["duration"]) - 2.0) < 0.05
    assert abs(zero_crossings_hz(pcm[4800:24000]) - 440) < 30
    assert abs(zero_crossings_hz(pcm[-24000:-4800]) - 1000) < 60


class OtherSpec:
    """The renderer's own spec type: only .kind, .duration_s and .params."""
    def __init__(self, kind, duration_s, params=None):
        self.kind, self.duration_s, self.params = kind, duration_s, params


@pytest.mark.parametrize("spec,kind,check", [
    ({"kind": "whip", "duration_s": 0.3, "params": {"direction": "left"}}, "whip", {"direction": "left"}),
    (OtherSpec("flash", 0.4, {"color": "white"}), "flash", {"color": "white"}),
    (SimpleNamespace(kind="match_dissolve", duration_s=0.5, focus_a={"x": 0.3, "y": 0.4}, focus_b=[0.6, 0.5]),
     "match_dissolve", {"focus_a": (0.3, 0.4), "focus_b": (0.6, 0.5)}),
    ({"kind": "whip-left", "duration_s": 0.3}, "whip", {"direction": "right"}),
    ({"kind": "dip-black", "duration_s": 0.6}, "luma_dip", {"color": "dark"}),
    ({"kind": "zoom-through", "duration_s": 0.5, "params": {"strength": 1.2}}, "zoom_through", {"strength": 1.2}),
])
def test_specs_are_duck_typed(spec, kind, check):
    s = aitx.as_spec(spec)
    assert s.kind == kind
    for k, v in check.items():
        assert getattr(s, k) == v


def test_render_transition_takes_a_foreign_spec(media, tmp_path):
    out = aitx.render_transition(media.segs["land"], media.segs["city"], OtherSpec("whip", 0.3, {"direction": "up"}),
                                 tmp_path / "t.mp4", media.cfg)
    assert aitx.probe_segment(out, media.cfg).frames == 9
    with pytest.raises(ValueError):
        aitx.as_spec({"kind": "spin", "duration_s": 0.3})


def test_wire_round_trip():
    s = TransitionSpec(kind="whip", duration_s=0.3, direction="left", focus_a=(0.2, 0.3), reason="go")
    w = s.wire()
    assert w.model_dump() == {"kind": "whip", "duration_s": 0.3, "params": {"direction": "left", "focus_a": [0.2, 0.3]},
                              "reason": "go"}
    assert aitx.as_spec(w) == s and aitx.as_spec(w.model_dump()) == s


def test_quality_gating(tmp_path):
    strict = cfg_for(tmp_path, aitx_allow_fallback=False)
    assert not aitx.supports({"kind": "morph", "duration_s": 0.5}, strict)
    assert aitx.supports({"kind": "morph", "duration_s": 0.5, "params": {"allow_fallback": True}}, strict)
    assert aitx.effective_kind({"kind": "morph", "duration_s": 0.5}, strict) == "match_dissolve"
    assert aitx.effective_kind({"kind": "speed_ramp_cut", "duration_s": 0.5}, strict) == "cut"
    assert aitx.effective_kind({"kind": "depth_parallax_through", "duration_s": 1}, strict) == "zoom_through"
    assert aitx.effective_kind({"kind": "generative", "duration_s": 1}, strict) == "zoom_through"
    assert not aitx.supports({"kind": "generative", "duration_s": 1}, strict)
    for kind in ("whip", "zoom_through", "match_dissolve", "luma_dip", "flash"):
        assert aitx.supports({"kind": kind, "duration_s": 0.5}, strict)
    assert not aitx.supports({"kind": "crossfade", "duration_s": 0.5}, strict)    # the renderer's own
    assert not aitx.supports({"kind": "nonsense"}, strict)
    assert aitx.available_kinds(strict) == frozenset({"whip", "zoom_through", "match_dissolve", "luma_dip", "flash"})
    binary = tmp_path / "rife-ncnn-vulkan"
    binary.write_text("#!/bin/sh\n")
    binary.chmod(0o755)
    with_rife = cfg_for(tmp_path, aitx_allow_fallback=False, aitx_interpolator="auto", aitx_rife=str(binary))
    assert aitx.supports(OtherSpec("morph", 0.5), with_rife) and aitx.supports(OtherSpec("speed_ramp_cut", 0.5), with_rife)


def test_gated_kinds_render_their_clean_stand_in(media, tmp_path):
    cfg = cfg_for(media.tmp, aitx_allow_fallback=False)
    a, b = media.segs["pan"], media.segs["land"]
    ramp = decode(aitx.render_transition(a, b, {"kind": "speed_ramp_cut", "duration_s": 0.4}, tmp_path / "r.mp4", cfg), cfg)
    fa, fb = decode(a, cfg), decode(b, cfg)
    original = np.concatenate([fa[-6:], fb[:6]])
    assert float(np.abs(ramp - original).mean()) < 0.01, "no RIFE: a straight cut, not a juddery ramp"
    morph = decode(aitx.render_transition(media.segs["land"], media.segs["land2"], {"kind": "morph", "duration_s": 0.4},
                                          tmp_path / "m.mp4", cfg), cfg)
    assert morph.shape[0] == 12
