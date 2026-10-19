import pytest
from PIL import Image

from igmp.config import Config
from igmp.judge import JudgeError
from igmp.models import Asset, ReelPlan, Shot
from igmp.reels import sheet, snap


def cfg(tmp_path):
    return Config(library_roots=[], output_dir=tmp_path, reel_seconds=15, beat_seconds=0.5)


def asset(i, kind="photo", duration=None):
    return Asset(id=f"a{i}", kind=kind, files=[], duration_s=duration)


def plan(*shots):
    return ReelPlan(event_key="e", title="t", shots=list(shots), cover_asset_id="nope", caption="c")


def test_snap_drops_unknown_ids_and_fixes_cover(tmp_path):
    valid = {"a1": asset(1)}
    p = snap(plan(Shot(asset_id="ghost", duration_s=2), Shot(asset_id="a1", duration_s=1.2)), cfg(tmp_path), valid)
    assert [s.asset_id for s in p.shots] == ["a1"] and p.cover_asset_id == "a1"
    assert p.shots[0].duration_s == 1.0       # snapped to the 0.5 s grid


def test_snap_caps_total_length(tmp_path):
    valid = {f"a{i}": asset(i) for i in range(10)}
    p = snap(plan(*[Shot(asset_id=f"a{i}", duration_s=3) for i in range(10)]), cfg(tmp_path), valid)
    assert sum(s.duration_s for s in p.shots) <= 15


def test_snap_keeps_video_inside_clip(tmp_path):
    valid = {"v": asset(0, "video", duration=4.0)}
    v = Asset(id="v", kind="video", files=[], duration_s=4.0)
    p = snap(plan(Shot(asset_id="v", start_s=3.5, duration_s=2)), cfg(tmp_path), {"v": v})
    assert p.shots[0].start_s + p.shots[0].duration_s <= 4.0


def test_snap_rejects_empty_plan(tmp_path):
    with pytest.raises(JudgeError):
        snap(plan(Shot(asset_id="ghost", duration_s=2)), cfg(tmp_path), {})


def test_thin_consecutive_days_merge_into_one_trip():
    from igmp.reels import merge_trips
    item = lambda: (asset(0), None)
    groups = {"2026-10-04_Valley_Drive": [item()] * 2, "2026-10-05_Valley_Drive": [item()],
              "2026-10-07_Valley_Drive": [item()] * 2, "2026-10-20_Valley_Drive": [item()],
              "2026-10-10_Harbor_Party": [item()] * 9}
    out = merge_trips(groups)
    assert len(out["2026-10-04..10-07_Valley_Drive"]) == 5
    assert "2026-10-20_Valley_Drive" in out and len(out["2026-10-10_Harbor_Party"]) == 9


def test_sheet_lays_out_grid(tmp_path):
    paths = []
    for i in range(7):
        p = tmp_path / f"{i}.jpg"
        Image.new("RGB", (400, 300), (i * 30, 80, 120)).save(p)
        paths.append(p)
    im = sheet(paths, [f"#{i}" for i in range(7)], cols=3, cell=100)
    assert im.size == (300, 3 * 124)


# --------------------------------------------------------------------------- length classes and the mix

import csv
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from igmp import ready, reels
from igmp.judge import JudgeError as _JudgeError
from igmp.models import Critique, MusicChoice, Point, ReelSet, Score, SlotPlan
from igmp.store import Store


def test_reel_lengths_per_class(tmp_path):
    c = Config(library_roots=[], output_dir=tmp_path)
    assert [c.reel_length(k) for k in ("short", "medium", "long")] == \
        [(7.0, 12.0, 15.0), (30.0, 45.0, 60.0), (60.0, 120.0, 180.0)]
    c.reel_seconds = 15.0                                 # reel_seconds is still the short target
    assert c.reel_length("short") == (7.0, 15.0, 15.0)
    c.reel_caps = {"medium": 50}
    assert c.reel_cap("medium") == 50 and c.reel_target("long") == 120


def test_mix_scales_with_keepers_and_material():
    m = reels.Mix()
    assert [m.count("short", n) for n in (3, 4, 7, 8, 16, 24, 200)] == [0, 0, 0, 1, 2, 3, 4]   # a short needs 8
    assert [m.count("medium", n) for n in (15, 16, 59, 60)] == [0, 1, 1, 2]
    assert [m.count("long", n) for n in (15, 39, 40)] == [0, 0, 1]
    asked = reels.Mix(short=3, medium=1, long=1)
    assert asked.count("long", 15) == 0                   # no long reel from 15 keepers
    assert asked.count("short", 10) == 2                  # one short per 4 keepers at most
    assert asked.count("short", 6) == 0                   # below the short gate: repeats, not a reel
    assert asked.count("medium", 30) == 1 and asked.count("short", 30) == 3
    assert reels.Mix.parse("short=2,medium=0,long=auto") == reels.Mix(short=2, medium=0, long=None)
    assert reels.Mix.parse("3,1,1,variants=0") == reels.Mix(short=3, medium=1, long=1, variants=False)
    with pytest.raises(ValueError):
        reels.Mix.parse("tiny=2")


def test_names_and_trips():
    assert reels.reel_name("2026-10-03_Mesa", "short", 2) == "2026-10-03_Mesa__short-02"
    assert reels.parse_name("2026-10-03_Mesa__short-01b") == ("2026-10-03_Mesa", "short", 1, "b")
    assert reels.parse_name("2026-10-03_Mesa") == ("2026-10-03_Mesa", "short", 1, "")   # from before classes
    trips = reels.trip_groups(["2026-10-01_Mesa", "2026-10-03_Mesa", "2026-10-09_Mesa", "2026-10-02_Harbor",
                               "2026-10-04..10-05_Valley_Drive", "2026-10-07_Valley_Drive"])
    assert trips["2026-10-01..10-03_Mesa"] == ["2026-10-01_Mesa", "2026-10-03_Mesa"]
    assert trips["2026-10-09_Mesa"] == ["2026-10-09_Mesa"] and trips["2026-10-02_Harbor"] == ["2026-10-02_Harbor"]
    assert trips["2026-10-04..10-07_Valley_Drive"] == ["2026-10-04..10-05_Valley_Drive", "2026-10-07_Valley_Drive"]


def test_plan_jobs_one_creative_unit_per_event():
    pool = {"2026-10-01_Mesa": [None] * 50, "2026-10-02_Mesa": [None] * 20, "2026-10-08_Harbor": [None] * 45}
    units = reels.plan_jobs(pool, reels.Mix())
    names = [[j.name for j in u] for u in units]
    # richest first: the 70-keeper trip, then the 50, 45 and 20 keeper events
    assert [u[0].group for u in units] == ["2026-10-01..10-02_Mesa", "2026-10-01_Mesa", "2026-10-08_Harbor",
                                           "2026-10-02_Mesa"]
    # a single-day event is its own trip: its long reel is the main edit of its unit
    assert names[2] == ["2026-10-08_Harbor__long-01", "2026-10-08_Harbor__medium-01", "2026-10-08_Harbor__short-01",
                        "2026-10-08_Harbor__short-01b", "2026-10-08_Harbor__short-02",
                        "2026-10-08_Harbor__short-03", "2026-10-08_Harbor__short-04"]
    assert names[1][0] == "2026-10-01_Mesa__medium-01"
    # consecutive days at one place: one recap of the trip
    assert names[0] == ["2026-10-01..10-02_Mesa__long-01"]
    assert units[0][0].events == ("2026-10-01_Mesa", "2026-10-02_Mesa")
    assert all(j.name.endswith("b") is bool(j.variant) for u in units for j in u)
    no_b = reels.plan_jobs(pool, reels.Mix(variants=False))
    assert not any(j.variant for u in no_b for j in u)


def test_plan_jobs_gates_thin_events_and_their_b_versions():
    pool = {"2026-03-26_Courtyard": [None] * 6, "2026-03-27_Rome": [None] * 9, "2026-04-02_Dunes": [None] * 12,
            "2026-04-09_Wedding": [None] * 11}
    names = [j.name for u in reels.plan_jobs(pool, reels.Mix()) for j in u]
    assert not any(n.startswith("2026-03-26_Courtyard") for n in names)     # 6 keepers: no short at all
    assert "2026-03-27_Rome__short-01" in names and "2026-03-27_Rome__short-01b" not in names
    assert "2026-04-09_Wedding__short-01b" not in names                      # 11: one short, no B
    assert "2026-04-02_Dunes__short-01b" in names                            # 12: room for a B version
    # richest first, so the thin events wait at the back
    assert list(dict.fromkeys(n.split("__")[0] for n in names)) == ["2026-04-02_Dunes", "2026-04-09_Wedding",
                                                                    "2026-03-27_Rome"]


def _a(i, minute=0, day=3, kind="photo", event="", duration=None):
    return Asset(id=f"a{i}", kind=kind, files=[], taken_at=datetime(2026, 10, day, 12) + timedelta(minutes=minute),
                 location="Mesa", event=event, duration_s=duration)


def _score(v=7.0, role="moment"):
    return Score(score=v, keep=True, role=role, subject="rock", mood="calm", vertical_focus=Point(x=0.5, y=0.5),
                 feed_focus=Point(x=0.5, y=0.5))


def test_pick_options_short_best_first_long_travels_through_the_event():
    items = [(_a(i, minute=i), _score(10 - i / 100)) for i in range(200)]     # best = earliest
    short = reels.pick_options(items, "short")
    assert [a.id for a, _ in short] == [f"a{i}" for i in range(30)]
    long = reels.pick_options(items, "long")
    assert len(long) == reels.OPTIONS["long"]
    minutes = [a.taken_at.minute + 60 * (a.taken_at.hour - 12) for a, _ in long]
    assert minutes == sorted(minutes)                     # in the order they were shot
    assert max(minutes) > 150                             # the end of the event is there too


# --------------------------------------------------------------------------- the hard rules


def _valid(*kinds):
    return {f"a{i}": Asset(id=f"a{i}", kind=k, files=[], duration_s=10.0 if k == "video" else None)
            for i, k in enumerate(kinds)}


def test_enforce_rules_transitions_borders_and_motion():
    valid = _valid("photo", "photo", "photo", "photo", "photo", "video", "photo", "photo")
    shots = [Shot(asset_id="a0", duration_s=1.0, transition="whip-left", zoom_from=1.0, zoom_to=1.0),
             Shot(asset_id="a1", duration_s=1.0, transition="crossfade"),
             Shot(asset_id="a2", duration_s=2.0, transition="flash", layout="fit"),       # fit in the hook
             Shot(asset_id="a3", duration_s=1.0, transition="wipe"),                      # wipe, no pair
             Shot(asset_id="a4", duration_s=2.0, layout="fit"),                           # at 5 s: allowed
             Shot(asset_id="a5", duration_s=2.0, transition="zoom-in", layout="fit"),     # a second fit
             Shot(asset_id="a6", duration_s=1.0, version="camera"),
             Shot(asset_id="a6", duration_s=1.0, transition="cut")]                       # before/after pair
    out = reels.enforce_rules(shots, valid, {f"a{i}": 1.5 for i in range(8)})
    t = [s.transition for s in out]
    assert t[0] == "cut" and t[7] == "wipe" and t[3] == "cut"
    assert not any(a != "cut" and b != "cut" for a, b in zip(t[1:], t[2:]))           # never two in a row
    assert sum(x != "cut" for x in t) <= max(1, -(-(len(t) - 1) // 4))
    assert [s.layout for s in out] == ["fill", "fill", "fill", "fill", "fit", "fill", "fill", "fill"]
    assert out[2].focus_to is not None                    # a border-free pan instead of the fit
    assert all(abs(s.zoom_to - s.zoom_from) >= 0.06 - 1e-9 or s.focus_to for s in out
               if valid[s.asset_id].kind == "photo")      # every still moves
    assert out[0].focus_to is not None and abs(out[0].focus_to.x - out[0].focus.x) >= 0.1   # the hook moves


def test_enforce_rules_keeps_a_moving_opening():
    valid = _valid("video", "photo")
    shots = [Shot(asset_id="a0", duration_s=1.0), Shot(asset_id="a1", duration_s=1.0)]
    assert reels.enforce_rules(shots, valid)[0] == shots[0]
    valid = _valid("photo", "photo")
    whip = [Shot(asset_id="a0", duration_s=0.5), Shot(asset_id="a1", duration_s=1.0, transition="whip-right")]
    assert reels.enforce_rules(whip, valid)[0].focus_to is None      # a whip inside the first second


def test_snap_caps_each_class_and_speed(tmp_path):
    c = cfg(tmp_path)
    valid = {f"a{i}": asset(i) for i in range(40)} | {"v": Asset(id="v", kind="video", files=[], duration_s=3.0)}
    long_plan = ReelPlan(event_key="e", length_class="medium", title="t", cover_asset_id="a0", caption="c",
                         shots=[Shot(asset_id=f"a{i}", duration_s=3) for i in range(30)])
    p = snap(long_plan, c, valid)
    assert 59.5 <= sum(s.duration_s for s in p.shots) <= 60.0 and p.length_class == "medium"
    p = snap(plan(Shot(asset_id="v", duration_s=2, speed=0.25, speed_to=0.27), Shot(asset_id="a1", duration_s=1, speed=3)),
             c, valid)
    assert p.shots[0].speed == reels.MIN_SPEED and p.shots[0].speed_to is None       # gentle, no 10% ramps
    assert p.shots[1].speed == 1.0                                                     # stills ignore speed
    p = snap(plan(Shot(asset_id="v", duration_s=2, speed=4.0)), c, valid)
    assert p.shots[0].speed * 2 <= 3.0 + 1e-6 and p.shots[0].start_s == 0             # inside the clip


def test_snap_drops_a_camera_version_without_an_edit(tmp_path):
    valid = {"a1": asset(1), "a2": asset(2)}
    shots = [Shot(asset_id="a1", duration_s=1, version="camera"), Shot(asset_id="a1", duration_s=1),
             Shot(asset_id="a2", duration_s=1)]
    assert [s.version for s in snap(plan(*shots), cfg(tmp_path), valid, editable=set()).shots] == ["edit", "edit"]
    kept = snap(plan(*shots), cfg(tmp_path), valid, editable={"a1"}).shots
    assert [s.version for s in kept] == ["camera", "edit", "edit"] and kept[1].transition == "wipe"


# --------------------------------------------------------------------------- covers, captions, routing


def test_cover_box_brings_the_subject_into_the_grid_crop():
    x, y, w, h = reels.cover_box(3000, 2000, (0.5, 0.5))
    assert (h, round(w)) == (2000, 1125)                  # nothing to fix: the largest box
    x, y, w, h = reels.cover_box(3000, 2000, (0.5, 0.15))  # a subject near the top
    fy = (0.15 * 2000 - y) / h
    assert 0.225 - 1e-9 <= fy <= 0.775 and h < 2000
    x, y, w, h = reels.cover_box(1080, 1920, (0.92, 0.5))    # near the side: zoom in a little
    assert 0.1 - 1e-9 <= (0.92 * 1080 - x) / w <= 0.9 + 1e-9 and w < 1080


def test_make_cover_is_full_size_with_the_subject_in_the_centre_3_4(tmp_path):
    import numpy as np
    img = np.full((2000, 3000, 3), 40, np.uint8)
    img[260:340, 1460:1540] = (230, 20, 20)               # the subject, at (0.5, 0.15)
    photo = tmp_path / "p.png"
    Image.fromarray(img).save(photo)
    a = Asset(id="p", kind="photo", files=[], preview=str(photo))
    pl = ReelPlan(event_key="e", shots=[Shot(asset_id="p", duration_s=2, focus=Point(x=0.5, y=0.15))],
                  cover_asset_id="p", caption="c")
    out = reels.make_cover(pl, {"p": a}, Store(tmp_path / "s.sqlite"), cfg(tmp_path), tmp_path / "r.mp4",
                           tmp_path / "cover.jpg")
    cover = np.asarray(Image.open(out))
    assert cover.shape == (1920, 1080, 3)
    ys, xs = np.nonzero((cover[..., 0] > 150) & (cover[..., 1] < 90))
    assert 240 <= ys.mean() <= 1680 and 0.4 * 1080 < xs.mean() < 0.6 * 1080


def test_caption_keeps_five_hashtags_and_names_the_track():
    pl = ReelPlan(event_key="e", shots=[Shot(asset_id="a", duration_s=1)], cover_asset_id="a",
                  caption="Dunes at sunrise, October\nWind all morning.\n#a #b #c #d #e #f #g")
    text = reels.caption_text(pl, None)
    post, _, sound = text.partition("\n\n---\n")
    assert post.endswith("#a #b #c #d #e") and "#f" not in post
    assert sound.startswith("Sound: none")


def test_review_events_and_failures_are_routed(tmp_path):
    c = cfg(tmp_path)
    c.extra["review_events"] = ["wedding"]
    base = tmp_path / "reels"
    assert reels.out_folder(c, "2026-10-03_Mesa", "medium", True) == base / "2026-10-03_Mesa"
    assert reels.out_folder(c, "2026-10-03_Mesa_Wedding", "short", True) == base / "_review" / "2026-10-03_Mesa_Wedding"
    assert reels.out_folder(c, "2026-10-03_Mesa_Wedding", "short", False) == \
        base / "_needs-attention" / "2026-10-03_Mesa_Wedding"


# --------------------------------------------------------------------------- prompts


def test_bundle_and_critic_prompts_per_class(tmp_path):
    c = cfg(tmp_path)
    opts = [(_a(i, minute=i), _score()) for i in range(6)]
    slots = [("long-01", "long", "main"), ("short-01", "short", "short"), ("short-01b", "short", "variant:short-01")]
    t = reels.bundle_task("2026-10-03_Mesa", opts, c, [tmp_path / "s.jpg"], slots,
                          earlier=[{"name": "2026-10-03_Mesa__short-02", "opening": "a3", "next": ["a4"]}])
    text = t.instructions
    assert t.output is ReelSet and t.key == "bundle:2026-10-03_Mesa"
    assert "'long-01': long, about 120 s (60-180 s" in text and "MAIN EDIT" in text
    assert "B version of 'short-01'" in text and "opens with #3 (id=a3)" in text
    assert "The first second MOVES" in text and "No borders" in text and "'before-after'" in text
    assert "music is null" in text and "at 12:02" in text
    p = ReelPlan(event_key="e", length_class="long", shots=[Shot(asset_id="a0", duration_s=1)] * 2,
                 cover_asset_id="a0", caption="c")
    crit = reels.critic_task("e", p, tmp_path / "h.jpg", tmp_path / "c.jpg", "", band=(60, 180),
                             measured="- WARN loudness: -16 LUFS", openings=["#3 (id=a3)"],
                             transitions=[{"kind": "whip", "duration_s": 0.3}])
    assert "NO SAG" in crit.instructions and "(60-180 s)" in crit.instructions
    assert "WARN loudness" in crit.instructions and "#3 (id=a3)" in crit.instructions
    assert "cut 1 at 0.03s: whip" not in crit.instructions and ": whip" in crit.instructions


# --------------------------------------------------------------------------- build_all end to end (fakes)


class FakeJudge:
    """Answers every kind of task the reel stage asks, like a quick Claude would: a bundle gets one
    plan per slot (each short opening on a different candidate), a fix or story a plan, the critic
    `verdicts` in turn (then ship)."""

    def __init__(self, verdicts=(), fail_on=None):
        self.verdicts, self.fail_on = list(verdicts), fail_on
        self.keys: list[str] = []

    def _plan(self, ids, cls, offset, key):
        n, d = {"short": (10, 1.0), "medium": (20, 2.0), "long": (35, 2.0)}[cls]
        shots = [Shot(asset_id=ids[(offset + k) % len(ids)], duration_s=d) for k in range(n)]
        return ReelPlan(event_key=key, length_class=cls, format="photo-dump", title=f"{cls} {offset}",
                        shots=shots, cover_asset_id=shots[0].asset_id, caption="Mesa, October.\n#mesa #rocks #sky")

    def judge(self, task):
        self.keys.append(task.key)
        if self.fail_on and self.fail_on(task):
            raise _JudgeError(f"{task.key}: boom")
        ids = re.findall(r"id=([aw]\d+)", task.instructions.split("Candidates")[1]) if "Candidates" in task.instructions else []
        name = task.output.__name__
        if name == "ReelSet":
            slots = re.findall(r"- '([a-z]+-\d+b?)': (short|medium|long)", task.instructions)
            return ReelSet(reels=[SlotPlan(slot=s, plan=self._plan(ids, cls, 3 * k, "x"))
                                  for k, (s, cls) in enumerate(slots)])
        if name == "ReelPlan":
            cls = re.search(r"length_class '(\w+)'|this (short|medium|long) reel", task.instructions)
            cls = next((g for g in cls.groups() if g), "short") if cls else "short"
            return self._plan(ids, cls, 7 if task.key.startswith("fix:") else 1, "x")
        if name == "Critique":
            v = self.verdicts.pop(0) if self.verdicts else "ship"
            return Critique(hook_ok=True, all_sharp=True, no_redundancy=True, crops_safe=True, pacing_ok=v == "ship",
                            ending_ok=True, score=8.0 if v == "ship" else 5.0, notes=f"n{len(self.keys)}",
                            verdict=v, revised=None if v == "ship" else self._plan(ids, "short", 5, "x"))
        if name == "TransitionPlan":     # the director: a whip on the first cut offering one (else 1), cuts elsewhere
            from igmp.direction import CutChoice, TransitionPlan
            m = re.search(r"^cut (\d+) at .*\n.*\n  options: .*\bwhip\b", task.instructions, re.M)
            cut = int(m.group(1)) if m else 1
            return TransitionPlan(cuts=[CutChoice(cut=cut, kind="whip", duration_s=0.33, reason="energy")], notes="n")
        raise AssertionError(name)

    def judge_many(self, tasks, on_result=None):
        out = {}
        for t in tasks:
            try:
                out[t.key] = self.judge(t)
            except _JudgeError as e:
                out[t.key] = e
            if on_result:
                on_result(t.key, out[t.key])
        return out


@pytest.fixture
def stage(tmp_path, monkeypatch):
    """A store with one 45-keeper event and one 8-keeper event (a wedding), fake renders."""
    thumb = tmp_path / "thumb.jpg"
    Image.new("RGB", (96, 64), (90, 120, 150)).save(thumb)
    renders = []

    def fake_render(plan, sources, out, cfg, music=None, draft=False):
        renders.append((plan.event_key, plan.length_class, draft))
        Path(out).write_bytes(b"mp4")
        return Path(out)

    monkeypatch.setattr(reels.media, "preview_image", lambda a, cfg, size=1024: thumb)
    monkeypatch.setattr(reels.render, "render_reel", fake_render)
    monkeypatch.setattr(reels.render, "reel_contact_sheet", lambda v, cfg: Image.new("RGB", (8, 8)))
    monkeypatch.setattr(reels, "shot_sheet", lambda v, plan, cfg: Image.new("RGB", (8, 8)))
    monkeypatch.setattr(reels, "hook_strip", lambda v, cfg, out: thumb)
    monkeypatch.setattr(reels, "_qc", lambda: None)
    c = Config(library_roots=[], output_dir=tmp_path / "out", extra={"music": "none", "review_events": ["Wedding"]})
    store = Store(c.db_path)
    assets = []
    for i in range(45):
        a = Asset(id=f"a{i}", kind="photo", files=[], preview=str(thumb), location="Mesa",
                  taken_at=datetime(2026, 10, 3, 9) + timedelta(minutes=7 * i))
        assets.append(a)
        store.put("scores", a.id, _score(9 - i / 10))
    for i in range(8):
        a = Asset(id=f"w{i}", kind="photo", files=[], preview=str(thumb), location="Harbor", event="Wedding",
                  taken_at=datetime(2026, 10, 5, 15) + timedelta(minutes=i))
        assets.append(a)
        store.put("scores", a.id, _score(8))
    return c, store, assets, renders


def test_build_all_one_story_call_per_event_saves_everything_and_routes(stage):
    c, store, assets, renders = stage
    judge = FakeJudge()
    made = reels.build_all(c, store, judge, assets)
    stories = [k for k in judge.keys if k.startswith(("bundle:", "story:"))]
    # one creative pass each (a one-reel unit's story call runs on a reel worker: order is not fixed)
    assert sorted(stories) == ["bundle:2026-10-03_Mesa", "story:2026-10-05_Harbor_Wedding"]
    names = sorted(k for k, _ in store.all("reels"))
    mesa = [n for n in names if n.startswith("2026-10-03_Mesa__")]
    assert mesa == ["2026-10-03_Mesa__long-01", "2026-10-03_Mesa__medium-01", "2026-10-03_Mesa__short-01",
                    "2026-10-03_Mesa__short-01b", "2026-10-03_Mesa__short-02", "2026-10-03_Mesa__short-03",
                    "2026-10-03_Mesa__short-04"]
    assert made == len(names) == 8
    assert {k for k, _ in store.all("reel_plans")} == set(names)          # every plan saved as it came
    assert all(store.get("reel_rounds", f"{n}#00")["outcome"] == "ship" for n in names)
    out = c.output_dir / "reels"
    for n in mesa:                                       # every reel of an event in its own folder
        ev = out / "2026-10-03_Mesa"
        assert (ev / f"{n}.mp4").exists() and (ev / f"{n}.caption.txt").exists() and (ev / f"{n}.jpg").exists()
    assert sorted(p.name for p in (out / "_review" / "2026-10-05_Harbor_Wedding").glob("*.mp4")) == [
        "2026-10-05_Harbor_Wedding__short-01.mp4"]                       # 8 keepers: no B version
    rec = store.get("reels", "2026-10-03_Mesa__short-01b")
    assert rec["trial_of"] == "2026-10-03_Mesa__short-01" and rec["status"] == "shipped"
    openings = [store.get("reels", f"2026-10-03_Mesa__short-0{i}")["plan"]["shots"][0]["asset_id"] for i in (1, 2, 3)]
    assert len(set(openings)) == 3                       # every short has its own hook
    # drafts for the critic, then a final render of each shipped reel
    assert sum(1 for *_, d in renders if d) == sum(1 for *_, d in renders if not d) == 8
    # ready/: the queue
    rows = list(csv.DictReader((c.output_dir / "ready" / "index.csv").open()))
    assert len(rows) == 8 and (c.output_dir / "ready" / "index.jpg").exists()
    assert {r["status"] for r in rows if "Wedding" in r["event"]} == {"review"}
    # a second run has nothing left to pay for
    judge2 = FakeJudge()
    assert reels.build_all(c, store, judge2, assets) == 0 and judge2.keys == []


def test_build_all_only_and_limit(stage):
    c, store, assets, _ = stage
    judge = FakeJudge()
    assert reels.build_all(c, store, judge, assets, only="Harbor", limit=1) == 1
    assert [k for k, _ in store.all("reels")] == ["2026-10-05_Harbor_Wedding__short-01"]


def test_a_stopped_run_resumes_at_its_round(stage):
    c, store, assets, _ = stage
    mix = reels.Mix(short=1, medium=0, long=0, variants=False)
    crash = {"n": 0}

    def second_critic(task):
        if task.output.__name__ == "Critique":
            crash["n"] += 1
            return crash["n"] == 2
        return False
    judge = FakeJudge(verdicts=["revise"], fail_on=second_critic)
    reels.build_all(c, store, judge, assets, mix=mix, only="Mesa")
    name = "2026-10-03_Mesa__short-01"
    assert store.get("reels", name) is None                 # the run stopped inside round 1
    r0 = store.get("reel_rounds", f"{name}#00")
    assert r0["outcome"] == "revise" and r0["critique"]["verdict"] == "revise" and r0["next_plan"]
    judge2 = FakeJudge()
    reels.build_all(c, store, judge2, assets, mix=mix, only="Mesa")
    assert judge2.keys == [f"{name}"]                        # no story call: straight to round 1's critic
    rec = store.get("reels", name)
    assert rec["status"] == "shipped" and len(rec["critic"]) == 2
    assert rec["plan"]["shots"][0]["asset_id"] == r0["next_plan"]["shots"][0]["asset_id"]


def test_failed_checks_go_back_for_a_fix_without_a_critic_call(stage, monkeypatch):
    c, store, assets, _ = stage

    class Report:
        def __init__(self, ok):
            self.failures = [] if ok else [type("F", (), {"rule": "hook_motion", "detail": "nothing moves"})()]
            self.warnings = []

        def summary_for_llm(self):
            return "Reel QC FAILED\n- FAIL hook_motion: nothing moves"

    reports = [Report(False), Report(True)]

    class QC:
        @staticmethod
        def check_plan(plan, kinds=None):
            return []

        @staticmethod
        def check_reel(path, cfg, band=None, **kw):
            return reports.pop(0)

        @staticmethod
        def findings_for_llm(findings):
            return ""
    monkeypatch.setattr(reels, "_qc", lambda: QC)
    judge = FakeJudge()
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    name = "2026-10-03_Mesa__short-01"
    assert [k.split(":")[0] for k in judge.keys] == ["story", "fix", name]
    r0 = store.get("reel_rounds", f"{name}#00")
    assert r0["stage"] == "render" and r0["qc"] == ["hook_motion: nothing moves"] and "critique" not in r0
    assert store.get("reels", name)["status"] == "shipped"


class OpeningJudge(FakeJudge):
    """The critic's first revision opens on a21 (a shot the story never opened on); the fix pass, like
    the real one did, puts the story's old opener back first."""

    def __init__(self, verdicts):
        super().__init__(verdicts)
        self.critic_prompts: list[str] = []

    def judge(self, task):
        out = super().judge(task)
        if task.output.__name__ == "Critique":
            self.critic_prompts.append(task.instructions)
            if out.revised is not None:
                shots = [Shot(asset_id="a21", duration_s=1.0, start_s=0.0)] + [
                    s for s in out.revised.shots if s.asset_id != "a21"][:7]
                out = out.model_copy(update={"revised": out.revised.model_copy(update={"shots": shots})})
        elif task.key.startswith("fix:"):
            out = out.model_copy(update={"shots": [Shot(asset_id="a1", duration_s=1.0)] + [
                s for s in out.shots if s.asset_id not in ("a1", "a21")][:7]})
        return out


def _opening_stage(stage, monkeypatch, reports):
    c, store, assets, _ = stage
    rendered = []

    def fake_render(plan, sources, out, cfg, music=None, draft=False):
        rendered.append(plan.shots[0])
        Path(out).write_bytes(b"mp4")
        return Path(out)
    monkeypatch.setattr(reels.render, "render_reel", fake_render)

    class Report:
        def __init__(self, ok):
            self.failures = [] if ok else [type("F", (), {"rule": "hook_motion", "detail": "nothing moves"})()]
            self.warnings = []

        def summary_for_llm(self):
            return "Reel QC FAILED\n- FAIL hook_motion: nothing moves"

    class QC:
        @staticmethod
        def check_plan(plan, kinds=None):
            return []

        @staticmethod
        def check_reel(path, cfg, band=None, **kw):
            return Report(reports.pop(0) if reports else True)

        @staticmethod
        def findings_for_llm(findings):
            return ""
    monkeypatch.setattr(reels, "_qc", lambda: QC)
    return c, store, assets, rendered


def test_the_critics_revised_opening_is_what_renders_next(stage, monkeypatch):
    c, store, assets, rendered = _opening_stage(stage, monkeypatch, [True, True])
    judge = OpeningJudge(["revise", "ship"])
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    name = "2026-10-03_Mesa__short-01"
    r0 = store.get("reel_rounds", f"{name}#00")
    assert r0["plan"]["shots"][0]["asset_id"] != "a21" and r0["next_plan"]["shots"][0]["asset_id"] == "a21"
    assert rendered[1].asset_id == "a21"                       # round 1 renders the critic's opener
    assert store.get("reel_rounds", f"{name}#01")["plan"]["shots"][0]["asset_id"] == "a21"
    assert store.get("reels", name)["status"] == "shipped"


def test_a_fix_pass_cannot_undo_the_critics_opening_and_the_critic_is_told(stage, monkeypatch):
    # round 1 renders the critic's opener, the hook check finds it too still, the fix pass reaches for
    # the old opener: the critic's shot stays first, with a move added, and the critic hears why
    c, store, assets, rendered = _opening_stage(stage, monkeypatch, [True, False, True])
    judge = OpeningJudge(["revise", "ship"])
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    name = "2026-10-03_Mesa__short-01"
    r1 = store.get("reel_rounds", f"{name}#01")
    assert r1["stage"] == "render" and r1["outcome"] == "revise"
    assert r1["next_plan"]["shots"][0]["asset_id"] == "a21"
    assert [s.asset_id for s in rendered[:3]] == [rendered[0].asset_id, "a21", "a21"]
    assert reels._moves(rendered[2])                           # it moves now
    assert any("put back first" in t for t in r1["told"]) and any("too still" in t for t in r1["told"])
    assert "Since your last critique" in judge.critic_prompts[1] and "id=a21" in judge.critic_prompts[1]
    assert "Since your last critique" not in judge.critic_prompts[0]


class CropJudge(FakeJudge):
    """The critic's revision sets the opener's crop: a gentle pan 0.37->0.42 (under the generic opening
    rule's threshold), or, with `still`, no move at all."""

    def __init__(self, verdicts, still=False):
        super().__init__(verdicts)
        self.still, self.critic_prompts = still, []

    def judge(self, task):
        out = super().judge(task)
        if task.output.__name__ == "Critique":
            self.critic_prompts.append(task.instructions)
            if out.revised is not None:
                first = Shot(asset_id="a21", duration_s=1.0, focus={"x": 0.37, "y": 0.5},
                             focus_to=None if self.still else {"x": 0.42, "y": 0.5},
                             zoom_from=1.0, zoom_to=1.0 if self.still else 1.06)
                shots = [first] + [s for s in out.revised.shots if s.asset_id != "a21"][:7]
                out = out.model_copy(update={"revised": out.revised.model_copy(update={"shots": shots})})
        return out


def test_the_critics_crop_on_the_opener_renders_as_written(stage, monkeypatch):
    # Istanbul short-01b: the critic asked for focus 0.37->0.42 three rounds running and the opening-move
    # rule rendered its generic 0.29->0.45 pan every time
    c, store, assets, rendered = _opening_stage(stage, monkeypatch, [])
    judge = CropJudge(["revise", "ship"])
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    s = rendered[1]
    assert s.asset_id == "a21"
    assert (s.focus.x, s.focus_to.x, s.zoom_from, s.zoom_to, s.layout) == (0.37, 0.42, 1.0, 1.06, "fill")
    assert "Since your last critique" not in judge.critic_prompts[1]          # nothing was changed


def test_motion_is_added_only_when_the_critic_gave_none_and_the_critic_is_told(stage, monkeypatch):
    c, store, assets, rendered = _opening_stage(stage, monkeypatch, [])
    judge = CropJudge(["revise", "ship"], still=True)
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    s = rendered[1]
    assert s.asset_id == "a21" and reels._moves(s)                            # the first second moves
    assert "shot 1 (id=a21): you asked for focus 0.37,0.5" in judge.critic_prompts[1]


def test_a_critics_gentle_push_on_a_still_is_kept():
    # Istanbul short-02: the critic matched zooms across a before/after (1.0->1.03, 1.03->1.07) and the
    # every-still-moves rule rewrote them to 1.08 and 1.11
    valid = {"a1": asset(1), "a2": asset(2)}
    shots = [Shot(asset_id="a2", duration_s=1, focus={"x": 0.3, "y": 0.5}, focus_to={"x": 0.6, "y": 0.5}),
             Shot(asset_id="a1", duration_s=1, zoom_from=1.0, zoom_to=1.03),
             Shot(asset_id="a1", duration_s=1, zoom_from=1.03, zoom_to=1.07),
             Shot(asset_id="a2", duration_s=1)]
    kept = reels.enforce_rules(shots, valid, keep_opening=True)
    assert [(s.zoom_from, s.zoom_to) for s in kept[1:3]] == [(1.0, 1.03), (1.03, 1.07)]
    assert reels._moves(kept[3])                              # no motion given: the rule still adds one
    story = reels.enforce_rules(shots, valid)                 # a story plan is held to the rule as before
    assert story[1].zoom_to == 1.08


class TakenJudge(FakeJudge):
    """Erie Wedding short-04: every plan and fix opens on a shot another short already opens with,
    alternating between the two (a1, a2); with `critic_taken` the critic's revision does it too."""

    def __init__(self, verdicts=(), critic_taken=False):
        super().__init__(verdicts)
        self.n, self.critic_taken = 0, critic_taken
        self.fix_prompts, self.critic_prompts = [], []

    def _open_on(self, p, aid):
        rest = [s for s in p.shots if s.asset_id not in ("a1", "a2")][:7]
        return p.model_copy(update={"shots": [Shot(asset_id=aid, duration_s=1.0)] + rest})

    def judge(self, task):
        out = super().judge(task)
        if task.output.__name__ == "ReelPlan":
            if task.key.startswith("fix:"):
                self.fix_prompts.append(task.instructions)
            self.n += 1
            return self._open_on(out, "a1" if self.n % 2 else "a2")
        if task.output.__name__ == "Critique":
            self.critic_prompts.append(task.instructions)
            if out.revised is not None and self.critic_taken:
                out = out.model_copy(update={"revised": self._open_on(out.revised, "a2")})
        return out


def _taken_stage(stage, monkeypatch):
    c, store, assets, rendered = _opening_stage(stage, monkeypatch, [])
    monkeypatch.setattr(reels, "_taken", lambda store, group, index, variant: ["a1", "a2"])
    monkeypatch.setattr(reels, "_qc", lambda: None)     # only the opening rule is checked
    return c, store, assets, rendered


def test_a_fix_pass_that_reopens_on_a_taken_shot_is_overruled(stage, monkeypatch):
    c, store, assets, rendered = _taken_stage(stage, monkeypatch)
    judge = TakenJudge()
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    name = "2026-10-03_Mesa__short-01"
    r0 = store.get("reel_rounds", f"{name}#00")
    assert r0["stage"] == "plan" and "taken openers: id=a1, id=a2" in r0["qc"][0]
    # the fix pass is told every taken opener, not only the one shot 1 used
    assert "already open other shorts of this event" in judge.fix_prompts[0]
    assert "id=a1" in judge.fix_prompts[0] and "id=a2" in judge.fix_prompts[0]
    # it opened on a2 anyway: the hard rule moved a free shot first, so round 1 renders and ships
    assert r0["next_plan"]["shots"][0]["asset_id"] not in ("a1", "a2")
    assert rendered and rendered[0].asset_id not in ("a1", "a2")
    assert any("already opens another short" in t for t in r0["told"])
    assert store.get("reels", name)["status"] == "shipped"


def test_a_critic_revision_never_keeps_a_taken_opener_and_is_told(stage, monkeypatch):
    c, store, assets, rendered = _taken_stage(stage, monkeypatch)
    judge = TakenJudge(["revise", "ship"], critic_taken=True)
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    name = "2026-10-03_Mesa__short-01"
    assert "already open with: " in judge.critic_prompts[0] and "id=a2" in judge.critic_prompts[0]
    crit = next(r for r in reels.load_rounds(store, name) if r.get("stage") == "critic")
    assert crit["next_plan"]["shots"][0]["asset_id"] not in ("a1", "a2")
    assert all(s.asset_id not in ("a1", "a2") for s in rendered)
    assert "you asked to open on id=a2, which already opens another short" in judge.critic_prompts[1]
    assert store.get("reels", name)["status"] == "shipped"


def test_a_taken_opener_on_the_last_round_is_fixed_not_stopped(stage, monkeypatch):
    # resumed on its last round with a plan that opens on a taken shot: the hard rule fixes it, no stop
    c, store, assets, rendered = _taken_stage(stage, monkeypatch)
    name = "2026-10-03_Mesa__short-01"
    p = ReelPlan(event_key="2026-10-03_Mesa", length_class="short", title="t", caption="c", cover_asset_id="a1",
                 shots=[Shot(asset_id=f"a{i}", duration_s=1.0) for i in (1, 5, 6, 7, 8, 9, 10, 11)])
    for n in range(reels.CRITIC_ROUNDS):
        reels.save_round(store, name, n, stage="plan", plan=p.model_dump(mode="json"), qc=["opening: x"],
                         outcome="revise", next_plan=p.model_dump(mode="json"))
    reels.save_plan(store, name, p, "story")
    judge = TakenJudge()
    reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False), only="Mesa")
    rec = store.get("reels", name)
    assert rec["status"] == "shipped", rec["reason"]
    assert rec["plan"]["shots"][0]["asset_id"] == "a5" and rendered[0].asset_id == "a5"


def test_untaken_moves_the_first_free_shot_forward():
    p = plan(Shot(asset_id="a1", duration_s=1), Shot(asset_id="a2", duration_s=1), Shot(asset_id="a3", duration_s=1))
    assert [s.asset_id for s in reels._untaken(p, ["a1", "a2"]).shots] == ["a3", "a1", "a2"]
    assert reels._untaken(p, ["a9"]) is p and reels._untaken(p, ["a1", "a2", "a3"]) is None


def test_a_measured_still_opener_keeps_the_critics_framing():
    valid = {"a1": asset(1)}
    p = plan(Shot(asset_id="a1", duration_s=1, focus={"x": 0.37, "y": 0.5}, focus_to={"x": 0.42, "y": 0.5},
                  zoom_from=1.0, zoom_to=1.06))
    s = reels._push_opening(p, valid).shots[0]
    assert (s.focus.x, s.focus_to.x, s.zoom_from) == (0.37, 0.42, 1.0) and s.zoom_to >= 1.15


def test_no_music_library_never_ships_and_waits_for_music(stage, monkeypatch):
    c, store, assets, _ = stage
    c.extra["music"] = "auto"                                # but no tracks in music_dir
    mix = reels.Mix(short=1, medium=0, long=0, variants=False)
    judge = FakeJudge()
    reels.build_all(c, store, judge, assets, mix=mix, only="Mesa")
    rec = store.get("reels", "2026-10-03_Mesa__short-01")
    assert rec["status"] == "needs-attention" and rec["reason"] == reels.NO_MUSIC
    assert not any(k.endswith("short-01") and ":" not in k for k in judge.keys)   # no critic call spent
    assert (c.output_dir / "reels" / "_needs-attention" / "2026-10-03_Mesa" / "2026-10-03_Mesa__short-01.mp4").exists()
    # once there is music, the reel is made again (from its saved plan: no new story call)
    from igmp import music as music_mod
    from igmp.music import License, Track, TrackInfo
    info = TrackInfo(id="t1", duration_s=60, tempo_bpm=120, steady_tempo=True, beats=[0.5 * k for k in range(120)],
                     downbeats=[2.0 * k for k in range(30)], energy=[0.5] * 600, onset=[0.1] * 600,
                     loudness_lufs=-14, true_peak_dbtp=-1, lra=5, energy_score=0.5, energy_level="medium",
                     brightness="bright", key="A major", percussive=0.3, mood=["calm"])
    lib = {"t1": Track("t1", Path("/music/t1.mp3"), License(source="s", license="CC0-1.0"), info)}
    monkeypatch.setattr(music_mod, "load_library", lambda cfg: lib)
    judge2 = FakeJudge()
    reels.build_all(c, store, judge2, assets, mix=mix, only="Mesa")
    rec = store.get("reels", "2026-10-03_Mesa__short-01")
    assert rec["status"] == "shipped" and rec["music"]["track_id"] == "t1"
    assert not any(k.startswith(("story:", "bundle:")) for k in judge2.keys)
    assert not (c.output_dir / "reels" / "_needs-attention" / "2026-10-03_Mesa" / "2026-10-03_Mesa__short-01.mp4").exists()


def test_director_transitions_reach_the_renderer(stage, monkeypatch):
    c, store, assets, renders = stage
    seen = []

    def fake_render(plan, sources, out, cfg, music=None, draft=False, transitions=None):
        seen.append(transitions)
        Path(out).write_bytes(b"mp4")
        return Path(out)

    monkeypatch.setattr(reels.render, "render_reel", fake_render)
    monkeypatch.setattr(reels.render, "render_segments", lambda plan, sources, cfg, draft=False:
                        [Path(f"/seg/{i}.mov") for i in range(len(plan.shots))], raising=False)
    from igmp import direction
    from igmp.aitx import Transition
    monkeypatch.setattr(direction, "reel_features", lambda segs, cfg, focus=None, kinds=None: [None] * (len(segs) - 1))
    monkeypatch.setattr(direction, "boundary_sheet", lambda segs, out, cfg: out)
    calls = []

    def fake_direct(cuts, feats, judge, style=None, **kw):
        calls.append((len(cuts), kw["key"]))
        return [Transition(kind="whip" if i == 2 else "cut", duration_s=0.33 if i == 2 else 0.0)
                for i in range(len(cuts))]
    monkeypatch.setattr(direction, "direct", fake_direct)
    reels.build_all(c, store, FakeJudge(), assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False),
                    only="Mesa")
    assert calls == [(9, "2026-10-03_Mesa__short-01")]
    assert len(seen) == 2 and seen[0] == seen[1]            # the draft and the final get the same cuts
    assert [t["kind"] for t in seen[0]][:4] == ["cut", "cut", "whip", "cut"]
    rec = store.get("reels", "2026-10-03_Mesa__short-01")
    assert rec["transitions"][2]["kind"] == "whip"


# --------------------------------------------------------------------------- ready/


def _piece(name, event, cls="short", score=8.0, fmt="story", trial_of="", status="ready"):
    return ready.Piece(kind="reel", name=name, event=event, length_class=cls, format=fmt, status=status,
                       caption=f"{name} caption", score=score, trial_of=trial_of)


def test_ready_queue_mixes_events_and_keeps_trials_with_their_a(tmp_path):
    pieces = [_piece(f"m{i}", "2026-10-03_Mesa", score=9 - i / 10) for i in range(5)]
    pieces += [_piece("h1", "2026-10-05_Harbor", cls="medium", score=6), _piece("m0b", "2026-10-03_Mesa",
                                                                              trial_of="m0", score=9.5)]
    queue = ready.order(pieces)
    names = [p.name for p in queue]
    assert names == ["m0", "m0b", "h1", "m1", "m2", "m3", "m4"]   # the B version goes out with its A
    many = [_piece(f"{e}{i}", f"2026-10-0{k}_{e}", cls=("short", "medium")[i % 2], score=9 - i - k / 10)
            for k, e in enumerate(("Mesa", "Harbor", "Ridge"), 1) for i in range(4 - k // 2)]
    events = [p.event for p in ready.order(many)]
    assert not any(a == b == c for a, b, c in zip(events, events[1:], events[2:]))   # never three in a row
    sched = ready.schedule(pieces, date(2026, 10, 12))      # a Monday
    days = [d for d, p in sched if not p.trial_of]
    assert [d.weekday() for d in days[:4]] == [0, 2, 4, 0]  # three a week
    assert sched[0][0] == sched[1][0]                       # A and its trial on the same day
    c = Config(library_roots=[], output_dir=tmp_path)
    files = ready.write(c, pieces, start=date(2026, 10, 12))
    rows = list(csv.DictReader(files["csv"].open()))
    assert [r["name"] for r in rows] == names and rows[0]["post_date"] == "2026-10-12"
    assert Image.open(files["pages"][0]).size[1] == len(pieces) * ready.ROW_H


def test_real_render_end_to_end(tmp_path, monkeypatch):
    """The whole stage on tiny synthetic stills with the real segment renderer: draft for the critic,
    final when shipped, the director's choice honoured, covers and the queue written."""
    import shutil as _sh
    from igmp import render
    if not hasattr(render, "render_segments") or not _sh.which("ffmpeg"):
        pytest.skip("segment renderer or ffmpeg not available")
    import numpy as np
    rng = np.random.default_rng(1)
    c = Config(library_roots=[], output_dir=tmp_path / "out", ffmpeg=_sh.which("ffmpeg"), ffprobe=_sh.which("ffprobe"),
               extra={"music": "none", "reel_preset": "ultrafast", "reel_hwaccel": False, "reel_work_scale": 1.0})
    store = Store(c.db_path)
    assets = []
    for i in range(8):                                   # a short needs 8 keepers
        img = (rng.random((360, 540, 3)) * 60 + np.array([40 * i, 120, 200 - 30 * i])).clip(0, 255).astype(np.uint8)
        p = tmp_path / f"p{i}.jpg"
        Image.fromarray(img).save(p, quality=90)
        a = Asset(id=f"a{i}", kind="photo", files=[str(p)], preview=str(p), location="Mesa",
                  taken_at=datetime(2026, 10, 3, 9) + timedelta(minutes=5 * i))
        assets.append(a)
        store.put("scores", a.id, _score(8 - i / 10))
    monkeypatch.setattr(reels.media, "preview_image", lambda a, cfg, size=1024: Path(a.preview))
    judge = FakeJudge()
    made = reels.build_all(c, store, judge, assets, mix=reels.Mix(short=1, medium=0, long=0, variants=False))
    assert made == 1
    rec = store.get("reels", "2026-10-03_Mesa__short-01")
    assert rec["status"] == "shipped", rec.get("reason")
    out = Path(rec["video"])
    assert out.parent.name == "2026-10-03_Mesa" and out.exists() and Path(rec["cover"]).exists()
    assert Image.open(rec["cover"]).size == (1080, 1920)
    assert any(k.startswith("transitions:") for k in judge.keys)          # the director was asked
    assert any(t["kind"] != "cut" for t in rec["transitions"])
    frames = round(sum(s["duration_s"] for s in rec["plan"]["shots"]) * 30)
    probe = json.loads(__import__("subprocess").run(
        [c.ffprobe, "-v", "error", "-count_frames", "-show_streams", "-of", "json", str(out)],
        capture_output=True, check=True).stdout)
    v = next(s for s in probe["streams"] if s["codec_type"] == "video")
    assert (v["width"], v["height"]) == (1080, 1920) and int(v["nb_read_frames"]) == frames
    assert (c.output_dir / "ready" / "index.csv").exists()


def test_insta360_stills_reach_ffmpeg_as_jpg(tmp_path):
    from igmp.models import Asset
    c = Config(library_roots=[], output_dir=tmp_path / "out")
    src = tmp_path / "IMG_20260516_002404_00_198.insp"
    src.write_bytes(b"\xff\xd8jpeg")
    a = Asset(id="i", kind="photo360", files=[str(src)], preview=str(src))
    path = Path(reels.source_for(a, Store(c.db_path), c)["path"])
    assert path.suffix == ".jpg" and path.resolve() == src.resolve()


def test_finished_reel_moves_across_drives(tmp_path, monkeypatch):
    import errno as _errno
    src, dst = tmp_path / "work" / "final.mp4", tmp_path / "out" / "x.mp4"
    src.parent.mkdir(); dst.parent.mkdir(); src.write_bytes(b"video")
    real = reels.os.replace
    def no_cross(a, b):                      # the first rename is the cross-drive one
        if Path(a) == src:
            raise OSError(_errno.EXDEV, "Cross-device link")
        return real(a, b)
    monkeypatch.setattr(reels.os, "replace", no_cross)
    reels._move_across(src, dst)
    assert dst.read_bytes() == b"video" and not src.exists() and not list(dst.parent.glob(".*"))
