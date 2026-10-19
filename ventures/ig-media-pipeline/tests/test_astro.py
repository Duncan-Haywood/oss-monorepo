import math
import shutil
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from igmp import astro
from igmp import astro_core as core
from igmp.config import Config
from igmp.models import Asset, Metrics, Point
from igmp.store import Store

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
EXIFTOOL = shutil.which("exiftool") or "/opt/homebrew/bin/exiftool"
needs_ffmpeg = pytest.mark.skipif(not Path(FFMPEG).exists(), reason="ffmpeg not installed")

T0 = datetime(2026, 10, 3, 22, 0, 0)
W, H = 600, 400
HORIZON_Y = 0.7            # land below 70% of the height
POLE = (W * 0.5, -H * 1.5)  # celestial pole above the frame, as from mid northern latitudes


def star_catalogue(n=180, seed=1):
    rng = np.random.default_rng(seed)
    # spread wide so rotation keeps the frame covered
    xy = np.column_stack([rng.uniform(-W, 2 * W, n * 4), rng.uniform(-H, H * HORIZON_Y, n * 4)])
    flux = rng.uniform(0.15, 1.0, n * 4) ** 2
    return xy, flux


def sky_frame(k, deg_per_frame=0.08, noise=0.02, seed=0, shift=(0.0, 0.0), plane=False):
    """Linear RGB: stars turned k steps about POLE, static land below the horizon, noise."""
    xy, flux = star_catalogue()
    a = math.radians(deg_per_frame * k)
    c, s = math.cos(a), math.sin(a)
    rel = xy - POLE
    pts = np.column_stack([c * rel[:, 0] - s * rel[:, 1], s * rel[:, 0] + c * rel[:, 1]]) + POLE + shift
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.full((H, W), 0.04, np.float32) + 0.03 * (yy / H)          # sky glow gradient
    for (x, y), f in zip(pts, flux):
        if -5 < x < W + 5 and -5 < y < H * HORIZON_Y:
            img += f * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 1.1 ** 2))
    land = yy >= H * HORIZON_Y
    img[land] = 0.02 + 0.03 * ((xx[land] // 25 + yy[land] // 25) % 2)     # textured, static
    if plane:
        img[int(H * 0.3), :] += 0.8
    rng = np.random.default_rng(1000 + seed + k)
    img = img + rng.normal(0, noise, img.shape).astype(np.float32)
    return np.clip(np.repeat(img[..., None], 3, axis=2), 0, 1).astype(np.float32)


def test_find_stars_finds_points_not_edges():
    f = sky_frame(0, noise=0.005)
    sky = core.horizon_mask([(0, HORIZON_Y), (1, HORIZON_Y)], (H, W))
    stars = core.find_stars(core.luminance(f), mask=sky)
    assert len(stars) > 60
    assert (stars[:, 1] < H * HORIZON_Y).all()                 # none on the land's checkerboard edges
    assert stars[0, 2] >= stars[-1, 2]                          # brightest first


def test_transform_recovers_sky_rotation():
    sky = core.horizon_mask([(0, HORIZON_Y), (1, HORIZON_Y)], (H, W))
    ref = core.find_stars(core.luminance(sky_frame(0)), mask=sky)
    cur = core.find_stars(core.luminance(sky_frame(30)), mask=sky)
    fit = core.estimate_transform(ref, cur)
    assert fit is not None
    m, inliers = fit
    assert inliers >= 10
    assert math.degrees(math.atan2(m[1, 0], m[0, 0])) == pytest.approx(-0.08 * 30, abs=0.15)
    assert math.hypot(m[0, 0], m[1, 0]) == pytest.approx(1, abs=0.01)


def test_unrelated_star_fields_do_not_match():
    a = core.find_stars(core.luminance(sky_frame(0)))
    rng = np.random.default_rng(5)
    b = np.column_stack([rng.uniform(0, W, 80), rng.uniform(0, H, 80), rng.uniform(0, 1, 80)]).astype(np.float32)
    assert core.estimate_transform(a, b) is None


def test_stack_cuts_noise_keeps_stars_round_and_rejects_a_plane():
    plan = astro.AstroPlan(is_night_sky=True, outputs=["stack"], horizon=[Point(x=0, y=HORIZON_Y), Point(x=1, y=HORIZON_Y)],
                           vertical_focus=Point(x=.5, y=.5), feed_focus=Point(x=.5, y=.5), reason="")
    frames = [sky_frame(k, plane=(k == 4)) for k in range(9)]
    ref = frames[4 if False else len(frames) // 2]
    mask = core.horizon_mask([(p.x, p.y) for p in plan.horizon], (H, W))
    rs = core.find_stars(core.luminance(ref), mask=mask)
    warped, cover = [], []
    for f in frames:
        fit = core.estimate_transform(rs, core.find_stars(core.luminance(f), mask=mask))
        warped.append(f if f is ref else core.warp(f, fit[0]))
        cover.append(np.ones((H, W), np.float32) if f is ref else core.warp(np.ones((H, W), np.float32), fit[0]))
    stack = core.sigma_clip_mean(warped, weights=cover)
    clean = sky_frame(4, noise=0.0)
    patch = (slice(40, 120), slice(200, 400))
    single_err = np.std(ref[patch] - clean[patch])
    stack_err = np.std(stack[patch] - clean[patch])
    assert stack_err < single_err * 0.6                         # ~1/sqrt(9) for pure noise
    # aligned stars stay where the reference has them, at full peak (a misaligned stack would
    # average them down into faint arcs)
    bright = core.find_stars(core.luminance(clean), mask=mask)[:15]
    for x, y, _ in bright:
        yi, xi = int(round(y)), int(round(x))
        peak_clean = clean[yi - 1:yi + 2, xi - 1:xi + 2, 0].max()
        assert stack[yi - 1:yi + 2, xi - 1:xi + 2, 0].max() == pytest.approx(peak_clean, rel=0.25)
    assert stack[int(H * 0.3), 50:550].mean() < 0.4             # the plane (frame 4 is the reference!) is clipped


def test_horizon_mask_and_composite_keep_land_unaligned():
    m = core.horizon_mask([(0, 0.5), (0.5, 0.3), (1, 0.5)], (100, 200))
    assert m[10, 100] and not m[40, 100] and m[40, 10] is np.True_ or m[40, 10]
    assert core.horizon_mask([], (10, 10)).all()
    plan = astro.AstroPlan(is_night_sky=True, outputs=["stack"], horizon=[Point(x=0, y=.5), Point(x=1, y=.5)],
                           vertical_focus=Point(x=.5, y=.5), feed_focus=Point(x=.5, y=.5), reason="")
    sky, fg = np.ones((50, 50, 3), np.float32), np.zeros((50, 50, 3), np.float32)
    out, alpha = astro.composite(sky, fg, plan)
    assert out[2, 25, 0] > 0.95 and out[47, 25, 0] < 0.05


def test_grade_is_monotone_and_bounded():
    g = astro.AstroGrade()
    lin = np.stack([np.linspace(0, 0.3, 200).reshape(10, 20)] * 3, axis=-1).astype(np.float32)
    out = astro.grade(lin, g.model_copy(update={"gradient_removal": 0}), np.ones((10, 20), np.float32))
    assert out.min() >= 0 and out.max() <= 1
    flat = out[..., 1].ravel()
    assert (np.diff(flat) >= -1e-6).all()


# --- groups ------------------------------------------------------------------------------
def shot(i, t, bright=0.05, dhash="0f0f3c3c5a5aa5a5", labels=(), camera="A7RV"):
    a = Asset(id=f"p{i}", kind="photo", files=[], taken_at=t, date_label=t.strftime("%Y-%m-%d"),
              location="Great-Sand-Dunes", camera=camera)
    m = Metrics(asset_id=a.id, sharpness=50, brightness=bright, clipped_high=0, clipped_low=0.3, dhash=dhash,
                labels=list(labels))
    return a, m


def test_groups_find_stack_runs_and_night_sequences():
    pairs = [shot(i, T0 + timedelta(seconds=40 * i)) for i in range(6)]          # a manual stack
    pairs += [shot(10 + i, T0 + timedelta(hours=1, seconds=40 * i), bright=0.5) for i in range(6)]  # daylight-ish
    pairs += [shot(20 + i, T0 + timedelta(hours=2, seconds=40 * i)) for i in range(2)]  # too short
    pairs += [shot(30 + i, T0 + timedelta(hours=3, minutes=10 * i)) for i in range(4)]  # too far apart
    seq_members = [shot(100 + i, T0 + timedelta(hours=4, seconds=20 * i), bright=0.3, labels=["night_sky"])
                   for i in range(20)]
    seq = Asset(id="seq1", kind="sequence", files=[], taken_at=T0 + timedelta(hours=4), location="Great-Sand-Dunes",
                members=[a.id for a, _ in seq_members], interval_s=20, camera="A7RV",
                date_label="2026-10-03")
    assets = [a for a, _ in pairs + seq_members] + [seq]
    metrics = {m.asset_id: m for _, m in pairs + seq_members}
    groups = astro.find_groups(assets, metrics)
    kinds = sorted((g.kind, len(g.members)) for g in groups)
    assert kinds == [("sequence", 20), ("stack-run", 6)]
    assert next(g for g in groups if g.kind == "stack-run").members == [f"p{i}" for i in range(6)]


def test_moving_camera_breaks_a_stack_run():
    pairs = [shot(i, T0 + timedelta(seconds=30 * i), dhash=("0f0f3c3c5a5aa5a5" if i < 3 else "f0f0c3c3a5a55a5a"))
             for i in range(6)]
    groups = astro.find_groups([a for a, _ in pairs], {m.asset_id: m for _, m in pairs})
    assert [len(g.members) for g in groups] == [3, 3]


def test_astro_gate():
    assert astro.looks_astro({"exposure_s": 15, "stars_on_preview": [3]})
    assert astro.looks_astro({"exposure_s": 0.5, "stars_on_preview": [120, 140, 90]})
    assert astro.looks_astro({"exposure_s": None, "stars_on_preview": [120, 140, 90]})
    # a handheld city night: lights and high-ISO noise look like stars, the shutter speed says no
    assert not astro.looks_astro({"exposure_s": 0.0125, "stars_on_preview": [120, 140, 90]})
    assert not astro.looks_astro({"exposure_s": 0.5, "stars_on_preview": [2, 5, 1]})


def test_plan_schema_is_strict_and_instructions_carry_the_measurements():
    from igmp.models import strict_schema
    s = strict_schema(astro.AstroPlan)
    assert set(s["required"]) == set(s["properties"]) and s["additionalProperties"] is False
    g = astro.AstroGroup(id="g", kind="stack-run", members=["a", "b", "c"], event_key="e")
    text = astro.instructions(g, {"exposure_s": 15, "stars_on_preview": [300]})
    assert '"exposure_s": 15' in text and "horizon" in text and "0..2" in text


# --- end to end --------------------------------------------------------------------------
class FakeJudge:
    def __init__(self, plan, reviews):
        self.plan, self.reviews, self.tasks = plan, list(reviews), []

    def judge(self, task):
        self.tasks.append(task)
        return self.reviews.pop(0)

    def judge_many(self, tasks, on_result=None):
        for t in tasks:
            self.tasks.append(t)
            on_result(t.key, self.plan)


def to_srgb_jpeg(lin, path):
    x = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, 1) ** (1 / 2.4) - 0.055)
    Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).save(path, quality=95)


def library(tmp_path, n=8, deg=0.08):
    lib = tmp_path / "lib"
    lib.mkdir()
    cfg = Config(library_roots=[lib], output_dir=tmp_path / "out", ffmpeg=FFMPEG, ffprobe=FFPROBE, exiftool=EXIFTOOL)
    store = Store(cfg.db_path)
    assets, metrics = [], []
    for k in range(n):
        p = lib / f"f{k:02d}.jpg"
        to_srgb_jpeg(sky_frame(k, deg_per_frame=deg), p)
        a, m = shot(k, T0 + timedelta(seconds=25 * k))
        a = a.model_copy(update={"preview": str(p), "files": [str(p)]})
        assets.append(a)
        metrics.append(m)
        store.put("assets", a.id, a)
        store.put("metrics", a.id, m)
    return cfg, store, assets


def plan_for(**kw):
    base = dict(is_night_sky=True, outputs=["stack"], horizon=[Point(x=0, y=HORIZON_Y), Point(x=1, y=HORIZON_Y)],
                vertical_focus=Point(x=.5, y=.5), feed_focus=Point(x=.5, y=.5), reason="milky way stack")
    return astro.AstroPlan(**{**base, **kw})


def test_run_stacks_reviews_revises_and_feeds_edits(tmp_path, monkeypatch):
    cfg, store, assets = library(tmp_path)
    monkeypatch.setattr(astro, "_exif", lambda paths, cfg: [{"ExposureTime": 15, "ISO": 3200}])
    darker = plan_for(grade=astro.AstroGrade(black_point=0.6))
    judge = FakeJudge(plan_for(), [astro.AstroReview(verdict="revise", notes="sky too grey", revised=darker),
                                   astro.AstroReview(verdict="ship", notes="good")])
    made = astro.run(cfg, store, judge, assets)
    assert made == 1
    rec = store.get("astro", astro.find_groups(assets, dict(store.all("metrics", Metrics)))[0].id)
    out = rec["outputs"]["stack"]
    assert rec["status"] == "done" and out["status"] == "shipped" and out["rounds"] == 2
    assert out["plan"]["grade"]["black_point"] == 0.6
    assert Image.open(out["ig"]).size == (1080, 1350)
    assert Path(out["full"]).parent == cfg.output_dir / "photos" / assets[0].event_key / "astro"
    # Claude saw both views, stretched, and the measurements
    plan_task = judge.tasks[0]
    assert len(plan_task.images) == 2 and "exposure_s" in plan_task.instructions
    # the stack stands in for the run's lead frame wherever edited photos are used
    edits = [store.get("edits", a.id) for a in assets]
    assert sum(1 for e in edits if e and e.get("astro")) == 1
    # a second run does nothing: done is done, and the layers are cached
    assert astro.run(cfg, store, FakeJudge(plan_for(), []), assets) == 0
    assert list((cfg.state_dir / "astro").rglob("*.npz"))


def test_not_astro_is_never_sent_to_claude(tmp_path, monkeypatch):
    cfg, store, assets = library(tmp_path, n=4)
    monkeypatch.setattr(astro, "_exif", lambda paths, cfg: [{"ExposureTime": 0.01}])
    monkeypatch.setattr(astro, "looks_astro", lambda facts: False)
    judge = FakeJudge(plan_for(), [])
    assert astro.run(cfg, store, judge, assets) == 0
    assert judge.tasks == []


def test_claude_can_say_it_is_not_a_sky(tmp_path, monkeypatch):
    cfg, store, assets = library(tmp_path, n=4)
    monkeypatch.setattr(astro, "_exif", lambda paths, cfg: [{"ExposureTime": 2}])
    judge = FakeJudge(plan_for(is_night_sky=False, outputs=[]), [])
    assert astro.run(cfg, store, judge, assets) == 0
    assert all(r.get("status") == "not-astro" for _, r in store.all("astro"))


@needs_ffmpeg
def test_trail_timelapse_and_reel_source(tmp_path, monkeypatch):
    cfg, store, assets = library(tmp_path, n=12, deg=0.3)
    seq = Asset(id="seq1", kind="sequence", files=[], taken_at=T0, location="Great-Sand-Dunes", camera="A7RV",
                members=[a.id for a in assets], interval_s=25, date_label="2026-10-03")
    store.put("assets", seq.id, seq)
    monkeypatch.setattr(astro, "_exif", lambda paths, cfg: [{"ExposureTime": 20}])
    judge = FakeJudge(plan_for(outputs=["trail-timelapse", "timelapse"], fps=12),
                      [astro.AstroReview(verdict="ship", notes="trails grow, sky steady")])
    assert astro.run(cfg, store, judge, assets + [seq]) == 2
    src = astro.reel_source(seq, store)
    assert src["kind"] == "video" and Path(src["path"]).exists() and src["denoise"]
    assert "four frames" in judge.tasks[-1].instructions and judge.tasks[-1].images[0].name.endswith(".sheet.jpg")


def test_gradient_removal_takes_a_colour_cast_out_of_the_sky_only():
    h, w = 960, 640
    yy = np.mgrid[0:h, 0:w][0] / h
    lin = np.full((h, w, 3), 0.05, np.float32)
    lin[..., 1] += 0.04 * yy            # green glow growing towards the horizon
    alpha = np.zeros((h, w), np.float32)
    alpha[: int(h * 0.75)] = 1
    lin[int(h * 0.75):] = 0.08          # land
    lin += np.random.default_rng(3).normal(0, 0.004, lin.shape).astype(np.float32)
    lin[5, 5] = lin[30, 90] = 0.9       # a couple of stars set the white point
    g = astro.AstroGrade(gradient_removal=1, saturation=1, foreground_lift=0, warmth=0)
    with_removal = astro.grade(lin, g, alpha)
    without = astro.grade(lin, g.model_copy(update={"gradient_removal": 0}), alpha)
    band = slice(int(h * 0.55), int(h * 0.7))
    cast = lambda img: float((img[band, :, 1] - img[band, :, 0]).mean())
    assert cast(with_removal) < cast(without) * 0.5


def test_bright_foreground_leaves_no_halo_in_the_sky():
    h, w = 960, 640
    lin = np.full((h, w, 3), 0.03, np.float32)
    lin[..., 2] += 0.01                                  # a blue night sky
    land = int(h * 0.6)
    lin[land:] = (0.6, 0.55, 0.2)                        # a moonlit yellow rock face
    lin += np.random.default_rng(4).normal(0, 0.002, lin.shape).astype(np.float32)
    lin[20, 20] = 0.9
    alpha = core.feather(core.horizon_mask([(0, 0.6), (1, 0.6)], (h, w)), 4)
    out = astro.grade(lin, astro.AstroGrade(gradient_removal=1, foreground_lift=0, saturation=1, warmth=0), alpha)
    near, far = out[land - 40:land - 15], out[100:300]
    blue = lambda x: float((x[..., 2] - x[..., 0]).mean())
    assert abs(blue(near) - blue(far)) < 0.05            # the sky beside the rock is the same colour as above


def test_star_signal_keeps_stars_and_drops_noise():
    f = sky_frame(0, noise=0.02)
    mask = core.horizon_mask([(0, HORIZON_Y), (1, HORIZON_Y)], (H, W))
    bg, stars = core.star_signal(f, mask)
    assert (stars[mask].max(axis=-1) > 0).mean() < 0.05   # almost all sky pixels carry no signal
    assert stars.max() > 0.3                              # the bright stars do
    # the running max of signal does not lift the sky the way a running max of pixels does
    frames = [sky_frame(k, noise=0.02) for k in range(30)]
    raw_max = core.lighten(frames)
    sig = None
    for fr in frames:
        _, s = core.star_signal(fr, mask)
        sig = s if sig is None else np.maximum(sig, s)
    empty = (slice(5, 60), slice(5, 60))
    lifted_raw = float(np.median(raw_max[empty]) - np.median(frames[0][empty]))
    lifted_sig = float(np.median((bg + sig)[empty]) - np.median(bg[empty]))
    assert lifted_sig < lifted_raw / 4


def test_rough_horizon_snaps_to_the_ridge():
    h, w = 600, 900
    xs = np.arange(w)
    ridge = (0.55 + 0.1 * np.sin(xs / w * math.pi)) * h          # a hill
    yy = np.arange(h)[:, None]
    img = np.where(yy < ridge[None, :], 0.05, 0.5).astype(np.float32)   # dark sky, bright moonlit rock
    rng = np.random.default_rng(2)
    for _ in range(300):                                            # stars right above the ridge too
        x, y = rng.integers(0, w), rng.integers(0, h // 2)
        img[y, x] = 1.0
    img += rng.normal(0, 0.01, img.shape).astype(np.float32)
    rough = [(x, (0.55 + 0.1 * math.sin(x * math.pi)) - 0.025) for x in np.linspace(0, 1, 6)]   # 15 px into the sky
    refined = core.refine_horizon(img, rough)
    got = core.horizon_ys(refined, (h, w))
    assert np.median(np.abs(got - ridge)) <= 2
    assert np.percentile(np.abs(got - ridge), 95) <= 6


def test_colour_pinning_keeps_brightness_and_fixes_balance():
    ref = np.full((50, 50, 3), (0.10, 0.10, 0.20), np.float32)
    drift = np.full((50, 50, 3), (0.24, 0.12, 0.12), np.float32)    # brighter and warmer
    out = core.match_colour(drift, core.colour_ratio(ref))
    assert np.allclose(core.colour_ratio(out), core.colour_ratio(ref), atol=1e-3)
    assert out.mean() == pytest.approx(drift.mean(), rel=0.01)


def test_well_exposed_night_frames_count_daylight_does_not():
    night = [shot(i, T0 + timedelta(seconds=40 * i), bright=0.24) for i in range(5)]       # 22:00, ETTR Milky Way
    day = [shot(10 + i, datetime(2026, 10, 3, 13, 0) + timedelta(seconds=40 * i), bright=0.24) for i in range(5)]
    groups = astro.find_groups([a for a, _ in night + day], {m.asset_id: m for _, m in night + day})
    assert [len(g.members) for g in groups] == [5] and groups[0].members[0] == "p0"
