"""Transition direction: measured features and the rule shortlist on synthetic cuts, one batched
Claude call per reel (fake judge) and the rules the answer is held to."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from igmp import aitx, direction
from igmp.aitx import TransitionSpec
from igmp.config import Config
from igmp.direction import CutChoice, CutFeatures, PlanCut, TransitionPlan
from igmp.judge import JudgeError
from igmp.models import ReelPlan, Shot, strict_schema

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
needs_ffmpeg = pytest.mark.skipif(not (Path(FFMPEG).exists() and Path(FFPROBE).exists()), reason="no ffmpeg")
W, H = 216, 384
ALL = aitx.SUPPORTED


def cfg_for(tmp: Path) -> Config:
    return Config(library_roots=[], output_dir=tmp, ffmpeg=FFMPEG, ffprobe=FFPROBE,
                  extra={"aitx_interpolator": "minterpolate", "aitx_depth": "heuristic"})


def segment(frames, out: Path, cfg: Config) -> Path:
    w = aitx.ClipWriter(out, cfg, "x264", len(frames), (W, H))
    for f in frames:
        w.write(f)
    return w.close()


def kb(img, n=24, z1=1.06, z0=1.0):
    base = aitx.cut_916(img, (0.5, 0.5), (W, H))
    return [aitx.zoom_about(base, z0 * (z1 / z0) ** (i / (n - 1)), W / 2, H / 2) for i in range(n)]


def pan(img, n=24, speed=3.0):
    s = H / img.shape[0]
    big = aitx._resize(img, int(img.shape[1] * s), H, Image.LANCZOS)
    rng = np.random.default_rng(5)
    return [np.clip(aitx.crop_resize(big, (i * speed, 0, i * speed + W, H), size=(W, H))
                    + rng.normal(0, 0.006, (H, W, 3)).astype(np.float32), 0, 1) for i in range(n)]


@pytest.fixture(scope="module")
def segs(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("dir")
    cfg = cfg_for(tmp)
    land, _ = aitx.demo_landscape(480, 320, seed=1)
    stars, _ = aitx.demo_starfield(480, 320)
    return SimpleNamespace(cfg=cfg, land=segment(kb(land), tmp / "land.mp4", cfg),
                           land_again=segment(kb(land, z1=1.1, z0=1.06), tmp / "land2.mp4", cfg),
                           stars=segment(kb(stars), tmp / "stars.mp4", cfg),
                           pan=segment(pan(land), tmp / "pan.mp4", cfg))


def feat(**kw) -> CutFeatures:
    base = dict(luma_a=0.4, luma_b=0.4, hist_dist=0.5, ssim=0.2, edge_corr=0.1, similarity=0.25,
                motion_a=(0.0, 0.0), motion_b=(0.0, 0.0), zoom_a=0.0, zoom_b=0.0, still_a=True, still_b=True,
                frames_a=60, frames_b=60)
    return CutFeatures(**{**base, **kw})


# --------------------------------------------------------------------------- features


@needs_ffmpeg
def test_features_similar_frames(segs):
    f = direction.boundary_features(segs.land, segs.land_again, segs.cfg)
    assert f.similarity > 0.75 and f.ssim > 0.6 and f.hist_dist < 0.2
    assert f.still_a and f.still_b
    kinds = [s.kind for s, _ in direction.candidates(f)]
    assert kinds[0] == "cut" and "morph" in kinds and "match_dissolve" in kinds


@needs_ffmpeg
def test_features_brightness_jump(segs):
    f = direction.boundary_features(segs.land, segs.stars, segs.cfg)
    assert f.luma_a > 0.3 > 0.1 > f.luma_b and f.similarity < 0.4
    sl = direction.candidates(f)
    assert sl[1][0].kind == "luma_dip" and sl[1][0].color == "dark"
    up = direction.boundary_features(segs.stars, segs.land, segs.cfg)
    back = direction.candidates(up, 1.0)                   # dark to bright on a hit
    assert back[1][0].kind == "flash"
    # no hit (a silent reel, or between beats): the critic reads a flash as a gimmick, so none is offered
    assert "flash" not in [s.kind for s, _ in direction.candidates(up)]
    assert "flash" not in [s.kind for s, _ in direction.candidates(up, 0.6, chapter=True)]


@needs_ffmpeg
def test_features_motion_and_still_detection(segs):
    f = direction.boundary_features(segs.pan, segs.land, segs.cfg)
    dx, dy = f.motion_a
    assert dx < -10 and abs(dy) < 3, "content moves left at 3 px/frame of 216 = ~15 px/frame at 1080"
    assert not f.still_a and f.still_b
    whip = next(s for s, _ in direction.candidates(f) if s.kind == "whip")
    assert whip.direction == "right"
    assert f.zoom_b > 0                             # B is a push-in
    assert direction.boundary_features(segs.pan, segs.land, segs.cfg, a_kind="still").still_a


def test_phase_shift_measures_translation():
    rng = np.random.default_rng(1)
    a = aitx.box_blur(rng.random((120, 90)).astype(np.float32), 2, 1)
    b = np.roll(a, (3, -5), axis=(0, 1))
    dx, dy, peak = aitx.phase_shift(a, b)
    assert abs(dx + 5) < 0.3 and abs(dy - 3) < 0.3 and peak > 0.3


# --------------------------------------------------------------------------- shortlist


def test_snap_duration_beats_and_even_frames():
    for kind in direction.DURATIONS:
        for beat in (None, 0.4, 0.5, 0.6):
            d = direction.snap_duration(kind, beat)
            frames = round(d * 30)
            lo, _, hi = direction.DURATIONS[kind]
            assert frames % 2 == 0 and lo - 0.07 <= d <= hi + 0.07
    assert direction.snap_duration("depth_parallax_through", None, max_frames=10) == 10 / 30


def test_candidates_rules():
    assert [s.kind for s, _ in direction.candidates(feat())] == ["cut"]
    strong = [s.kind for s, _ in direction.candidates(feat(), 1.0)]
    assert strong[0] == "cut" and {"zoom_through", "depth_parallax_through"} <= set(strong)
    assert "speed_ramp_cut" in [s.kind for s, _ in direction.candidates(feat(still_a=False), 1.0)]
    assert "generative" not in strong
    assert "generative" in [s.kind for s, _ in direction.candidates(feat(), 1.0, chapter=True, generative=True)]
    up = direction.candidates(feat(motion_a=(0, 12)))         # content moving down: camera tilts up
    assert [(s.kind, s.direction) for s, _ in up][1] == ("whip", "up")
    against = direction.candidates(feat(motion_a=(-12, 0), motion_b=(12, 0)))
    assert "whip" not in [s.kind for s, _ in against]
    pushing = direction.candidates(feat(zoom_a=0.003))
    assert "zoom_through" in [s.kind for s, _ in pushing]
    focus = direction.candidates(feat(focus_a=(0.3, 0.4), focus_b=(0.6, 0.5)))
    md = next(s for s, _ in focus if s.kind == "match_dissolve")
    assert md.focus_a == (0.3, 0.4) and md.focus_b == (0.6, 0.5)


def test_a_flash_only_on_a_hit():
    # 2026-10-19: the critic failed transitions_ok on "a flash with no hit to motivate it" on silent reels
    # (9 of the 11 flashes it remarked on); dark to dark-bright jumps still get a dip, never a flash
    up = feat(luma_a=0.05, luma_b=0.5)
    assert "flash" not in [s.kind for s, _ in direction.candidates(up)]          # no music
    assert "flash" not in [s.kind for s, _ in direction.candidates(up, 0.6)]     # between beats
    assert "flash" in [s.kind for s, _ in direction.candidates(up, 1.0)]         # on the downbeat
    down = feat(luma_a=0.5, luma_b=0.05)
    assert "luma_dip" in [s.kind for s, _ in direction.candidates(down)]


# --------------------------------------------------------------------------- one call per reel


class FakeJudge:
    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.tasks = answer, error, []

    def judge(self, task):
        self.tasks.append(task)
        if self.error:
            raise self.error
        return self.answer(task) if callable(self.answer) else self.answer

    def judge_many(self, tasks):
        return {t.key: self.judge(t) for t in tasks}


def reel(n=5):
    cuts = [PlanCut(at_s=1.5 * (i + 1), beat_strength=1.0 if i % 2 == 0 else 0.6, a=f"shot {i}", b=f"shot {i + 1}")
            for i in range(n)]
    feats = [feat(similarity=0.7, ssim=0.7, edge_corr=0.6, hist_dist=0.1),      # morph possible
             feat(luma_a=0.6, luma_b=0.05),                                    # dip possible
             feat(motion_a=(-14, 0)),                                          # whip possible
             feat(motion_a=(-14, 0)),                                          # whip again
             feat(similarity=0.7, ssim=0.7, edge_corr=0.6, hist_dist=0.1)][:n]
    return cuts, feats


def test_direct_one_call_for_all_cuts(tmp_path):
    cuts, feats = reel()
    answer = TransitionPlan(notes="punchy", cuts=[
        CutChoice(cut=0, kind="morph", duration_s=0.6, reason="match"),
        CutChoice(cut=1, kind="luma_dip", duration_s=0.7, reason="into the night"),
        CutChoice(cut=2, kind="whip", duration_s=0.33, direction="left", reason="energy"),
        CutChoice(cut=3, kind="whip", duration_s=0.33, direction="right", reason="again"),
        CutChoice(cut=4, kind="depth_parallax_through", duration_s=1.0, reason="hero"),
    ])
    judge = FakeJudge(answer)
    sheet = tmp_path / "pairs.jpg"
    Image.new("RGB", (8, 8)).save(sheet)
    specs = direction.direct(cuts, feats, judge, "GUIDE TEXT\nline", key="2026-10-03_Mesa", beat_s=0.5, sheet=sheet,
                             available=ALL)
    assert len(judge.tasks) == 1, "one call for the whole reel"
    task = judge.tasks[0]
    assert task.output is TransitionPlan and task.images == [sheet] and "GUIDE TEXT" in task.instructions
    for i in range(5):
        assert f"cut {i} at" in task.instructions
    assert "similarity 0.70" in task.instructions and "options:" in task.instructions
    kinds = [s.kind for s in specs]
    assert kinds[0] == "morph" and specs[0].reason == "match"
    assert kinds[1] == "cut", "over the budget of 3 effects: the weakest beat goes"
    assert kinds[2] == "whip" and specs[2].params["direction"] == "right", "the measured direction wins"
    assert kinds[3] == "cut", "never the same effect twice in a row"
    assert kinds[4] == "match_dissolve", "one AI hero per short reel: the second becomes a dissolve"
    assert sum(k != "cut" for k in kinds) <= 3
    for s in specs:
        assert s.kind == "cut" or round(s.duration_s * 30) % 2 == 0


def test_direct_holds_to_shortlist_hero_and_budget():
    cuts = [PlanCut(at_s=i + 1.0, beat_strength=1.0, chapter=(i == 3)) for i in range(6)]
    feats = [feat(similarity=0.7, ssim=0.7, edge_corr=0.6, hist_dist=0.1) for _ in range(6)]
    answer = TransitionPlan(notes="", cuts=[
        CutChoice(cut=0, kind="morph", duration_s=0.6, reason="a"),
        CutChoice(cut=1, kind="whip", duration_s=0.3, reason="not shortlisted"),
        CutChoice(cut=2, kind="match_dissolve", duration_s=2.0, reason="too long"),
        CutChoice(cut=3, kind="generative", duration_s=1.0, reason="off"),
        CutChoice(cut=4, kind="zoom_through", duration_s=0.5, reason="d"),
        CutChoice(cut=5, kind="depth_parallax_through", duration_s=1.0, reason="e"),
    ])
    specs = direction.direct(cuts, feats, FakeJudge(answer), "g", reel_seconds=15, generative=False, available=ALL)
    kinds = [s.kind for s in specs]
    assert kinds[1] == "cut"
    assert specs[2].kind != "match_dissolve" or specs[2].duration_s <= 0.8 + 1e-9
    assert sum(k in aitx.AI_KINDS for k in kinds) <= 1
    assert "generative" not in kinds
    assert sum(k != "cut" for k in kinds) <= 3


def test_direct_falls_back_to_rules_on_judge_error():
    cuts, feats = reel()
    specs = direction.direct(cuts, feats, FakeJudge(error=JudgeError("plan limit")), "g", available=ALL)
    assert len(specs) == 5 and specs[0].kind == "morph"            # matching frames on a downbeat
    assert sum(s.kind in aitx.AI_KINDS for s in specs) <= 1
    assert all(specs[i].kind == "cut" or specs[i].kind != specs[i - 1].kind for i in range(1, 5))


def test_direct_many_batches_reels():
    cuts, feats = reel(3)
    judge = FakeJudge(lambda task: TransitionPlan(notes="", cuts=[CutChoice(cut=0, kind="cut", duration_s=0,
                                                                                reason="calm")]))
    out = direction.direct_many({"a": (cuts, feats), "b": (cuts, feats)}, judge, "g", beat_s={"a": 0.5},
                                available=ALL)
    assert set(out) == {"a", "b"} and len(judge.tasks) == 2
    assert [s.kind for s in out["a"]] == ["cut", "cut", "cut"]


def test_schema_is_strict():
    schema = strict_schema(TransitionPlan)
    text = json.dumps(schema)
    assert "$ref" not in text
    item = schema["properties"]["cuts"]["items"]
    assert item["additionalProperties"] is False and set(item["required"]) == set(item["properties"])
    assert "depth_parallax_through" in item["properties"]["kind"]["enum"]


def test_cuts_from_plan_beats():
    plan = ReelPlan(event_key="e", shots=[Shot(asset_id=a, duration_s=d) for a, d in
                                          (("a", 1.0), ("b", 1.5), ("c", 0.7), ("d", 2.0))],
                    cover_asset_id="a", caption="c", music={"track_id": "t", "start_s": 10.0})
    info = SimpleNamespace(beats=[10 + 0.5 * k for k in range(40)], downbeats=[10 + 2.0 * k for k in range(10)],
                           onset=[0.8] * 1000, hop_s=0.05)
    cuts = direction.cuts_from_plan(plan, info, {"a": "dunes at dusk"})
    assert [round(c.at_s, 3) for c in cuts] == [1.0, 2.5, 3.2]
    assert [c.beat_strength for c in cuts] == [0.6, 0.6, 0.4]
    assert cuts[0].a == "dunes at dusk" and cuts[0].b == "b"
    assert direction.cuts_from_plan(plan)[0].beat_strength is None


@needs_ffmpeg
def test_boundary_sheet_and_reel_features(segs, tmp_path):
    files = [segs.land, segs.stars, segs.pan]
    out = direction.boundary_sheet(files, tmp_path / "pairs.jpg", segs.cfg)
    with Image.open(out) as im:
        assert im.width >= 2 * 2 * 160
    feats = direction.reel_features(files, segs.cfg)
    assert len(feats) == 2 and feats[0].luma_b < feats[0].luma_a


def test_guide_exists_and_names_every_kind():
    text = direction.guide_text()
    for kind in aitx.KINDS:
        assert f"**{kind}**" in text


def test_director_never_offers_a_degraded_kind():
    """Without RIFE (morph not available at full quality) a matching cut gets a match dissolve."""
    cuts, feats = reel(1)
    avail = aitx.SUPPORTED - {"morph", "speed_ramp_cut", "depth_parallax_through", "generative"}
    kinds = [s.kind for s, _ in direction.candidates(feats[0], 1.0, available=avail)]
    assert "morph" not in kinds and "match_dissolve" in kinds and "depth_parallax_through" not in kinds
    answer = TransitionPlan(notes="", cuts=[CutChoice(cut=0, kind="morph", duration_s=0.6, reason="match")])
    out = direction.direct(cuts, feats, FakeJudge(answer), "g", available=avail)
    assert out[0].kind == "cut", "an unavailable choice is not rendered degraded"
    rules = direction.auto_direct(cuts, feats, available=avail)
    assert rules[0].kind == "match_dissolve"


def test_director_output_is_the_wire_shape_and_keeps_builtins():
    cuts = [PlanCut(at_s=1.0, beat_strength=1.0), PlanCut(at_s=2.0, beat_strength=1.0),
            PlanCut(at_s=3.0, beat_strength=1.0)]
    feats = [feat(similarity=0.5, ssim=0.5, edge_corr=0.4), feat(motion_a=(-14, 0)), feat(motion_a=(-14, 0))]
    answer = TransitionPlan(notes="", cuts=[
        CutChoice(cut=0, kind="crossfade", duration_s=0.5, reason="calm"),
        CutChoice(cut=1, kind="whip-left", duration_s=0.33, reason="picture slides left = camera right"),
        CutChoice(cut=2, kind="whip-right", duration_s=0.33, reason="wrong way"),
    ])
    out = direction.direct(cuts, feats, FakeJudge(answer), "g", available=ALL, reel_seconds=30)
    assert [type(t) for t in out] == [aitx.Transition] * 3
    assert set(out[0].model_dump()) == {"kind", "duration_s", "params", "reason"}
    assert out[0].kind == "crossfade" and out[0].reason == "calm"
    assert out[1].kind == "whip-left"
    assert out[2].kind == "cut" or (out[2].kind == "whip" and out[2].params["direction"] == "right")
    # every output goes straight back into the renderer
    for t in out:
        assert aitx.as_spec(t).kind in aitx.KINDS
