import io
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageCms

from igmp import carousels as C
from igmp.config import Config
from igmp.judge import JudgeError
from igmp.models import (Asset, CarouselCritique, CarouselFrame, CarouselPlan, Curation, Point, Score)
from igmp.store import Store

EVENT = "2026-10-10_Harbor_Party"


# --- fixtures ----------------------------------------------------------------------------------------

def jpeg(path, size=(600, 400), colour=(120, 90, 60), stripe=None):
    """A synthetic photo: a colour wash with a gradient, so no two are identical."""
    w, h = size
    x = np.linspace(0, 1, w)[None, :, None]
    y = np.linspace(0, 1, h)[:, None, None]
    arr = np.clip(np.array(colour)[None, None, :] * (0.6 + 0.4 * x) + 40 * y, 0, 255).astype(np.uint8)
    if stripe is not None:
        arr[:, :stripe[0]] = stripe[1]
        arr[:, w - stripe[0]:] = stripe[1]
    Image.fromarray(arr).save(path, quality=95)
    return path


def score(value=6.0, role="moment", focus=(0.5, 0.5), yaw=None, keep=True):
    return Score(score=value, keep=keep, role=role, subject="harbour at dusk", mood="calm",
                 vertical_focus=Point(x=0.5, y=0.5), feed_focus=Point(x=focus[0], y=focus[1]), view_yaw_deg=yaw)


def cfg(tmp_path, **extra):
    return Config(library_roots=[], output_dir=tmp_path / "out", extra=extra)


def asset(i, tmp_path, kind="photo", event="Party", day=10, **kw):
    taken = datetime(2026, 10, day, 18, 0) + timedelta(minutes=i)
    return Asset(id=f"a{i:02d}", kind=kind, files=[], raw=f"/nowhere/a{i}.ARW" if kind == "photo" else None,
                 taken_at=taken, location="Harbor", event=event, **kw)


@pytest.fixture
def library(tmp_path):
    """An event of eight camera JPEGs (one landscape 1.91:1) in a store, no edits yet."""
    st = Store(tmp_path / "out" / "state" / "igmp.sqlite")
    pics = tmp_path / "pics"
    pics.mkdir()
    assets = []
    for i in range(8):
        size = (955, 500) if i == 3 else (600, 400) if i % 2 else (400, 500)
        p = jpeg(pics / f"a{i}.jpg", size, (40 + 25 * i, 200 - 20 * i, 90 + 10 * i))
        a = asset(i, tmp_path, preview=str(p))
        st.put("assets", a.id, a)
        st.put("scores", a.id, score(5.5 + 0.25 * i))
        assets.append(a)
    return st, assets


def plan_of(ids, caption="Last light on the water.", **kw):
    return CarouselPlan(event_key=EVENT, frames=[CarouselFrame(frame_id=i, **kw) for i in ids], caption=caption)


def critique(verdict="ship", ok=True, revised=None, notes="fine"):
    return CarouselCritique(hook_ok=ok, cover_ok=True, scale_varied=True, no_near_duplicates=True,
                            colour_consistent=True, crops_ok=True, closer_ok=True, caption_ok=True, score=8,
                            notes=notes, verdict=verdict, revised=revised)


class FakeJudge:
    """Plan answers for CarouselPlan tasks, critic answers for CarouselCritique tasks; before/after
    tasks (keyed <event>__before-after) draw from their own two queues."""

    def __init__(self, plans, critiques, ba_plans=(), ba_critiques=()):
        self.plans, self.critiques = list(plans), list(critiques)
        self.ba_plans, self.ba_critiques = list(ba_plans), list(ba_critiques)
        self.tasks = []

    def judge(self, task):
        self.tasks.append(task)
        for p in task.images:
            assert p.exists(), p
        ba = task.key.endswith("__before-after")
        if task.output is CarouselPlan:
            queue = self.ba_plans if ba else self.plans
        else:
            queue = self.ba_critiques if ba else self.critiques
        if not queue:
            raise JudgeError("no answer left")
        answer = queue.pop(0)
        return answer(task) if callable(answer) else answer

    def judge_many(self, tasks, on_result=None):
        """Like the real backends: errors come back as values, each answer is reported as it arrives."""
        out = {}
        for t in tasks:
            try:
                out[t.key] = self.judge(t)
            except JudgeError as e:
                out[t.key] = e
            if on_result:
                on_result(t.key, out[t.key])
        return out


def slides_in(folder):
    return sorted(p.name for p in folder.glob("[0-9][0-9].jpg"))


# --- geometry and export -----------------------------------------------------------------------------

def test_fill_crop_is_4x5_and_follows_focus(tmp_path):
    arr = np.zeros((400, 600, 3), np.uint8)
    arr[:, :300] = (220, 30, 30)
    arr[:, 300:] = (30, 30, 220)
    img = Image.fromarray(arr)
    left = np.asarray(C.fill(img, Point(x=0.05, y=0.5)), np.float32)
    right = np.asarray(C.fill(img, Point(x=0.95, y=0.5)), np.float32)
    assert left.shape == right.shape == (1350, 1080, 3)
    assert left[..., 0].mean() > 200 and right[..., 2].mean() > 200


def test_crop_box_is_largest_4x5_box_clamped_inside():
    x, y, w, h = C.crop_box(600, 400, Point(x=1.0, y=0.0))
    assert (w, h) == (320, 400) and x == 280 and y == 0
    x, y, w, h = C.crop_box(400, 1000, (0.5, 0.0))
    assert (w, h) == (400, 500) and y == 0


def test_fit_shows_whole_picture_over_dark_blurred_background(tmp_path):
    src = jpeg(tmp_path / "wide.jpg", (955, 500), (200, 160, 60), stripe=(12, (0, 255, 0)))
    img = C.load_picture(src, "fit")
    out = np.asarray(C.fit(img), np.float32)
    assert out.shape == (1350, 1080, 3)
    band_h = round(1080 * 500 / 955)
    top = (1350 - band_h) // 2
    mid = out[top + 10:top + band_h - 10]
    # both edge stripes survive: nothing of the composition was cropped
    assert mid[:, :8, 1].mean() > 200 and mid[:, -8:, 1].mean() > 200
    assert mid[:, :8, 0].mean() < 60
    # above and below: a darkened blur of the picture, not black and not the picture itself
    above = out[:top - 4]
    assert 20 < above.mean() < np.asarray(img, np.float32).mean() * 0.9


def test_render_slide_exports_srgb_4x5_jpegs_for_every_shape(tmp_path):
    c = cfg(tmp_path)
    for i, size in enumerate([(600, 400), (500, 500), (360, 640), (955, 500)]):
        p = jpeg(tmp_path / f"s{i}.jpg", size)
        f = C.Frame(f"f{i}", asset(i, tmp_path), score(), "camera", p, Point(x=0.5, y=0.5))
        for layout in ("fill", "fit"):
            out = C.save_jpeg(C.render_slide(f, CarouselFrame(frame_id=f.id, layout=layout), c),
                              tmp_path / "out" / f"{i}{layout}.jpg")
            with Image.open(out) as im:
                assert im.format == "JPEG" and im.size == (1080, 1350) and im.mode == "RGB"
                prof = ImageCms.ImageCmsProfile(io.BytesIO(im.info["icc_profile"]))
                assert "srgb" in ImageCms.getProfileDescription(prof).lower()


def test_edit_focus_moves_into_the_edits_crop():
    s = score(focus=(0.5, 0.25))
    edit = {"frame": "(1000, 800)", "crop": "(200, 0, 800, 800)"}
    p = C.edit_focus(s, edit)
    assert p.x == pytest.approx(0.375) and p.y == pytest.approx(0.25)
    assert C.edit_focus(s, {"frame": None}) == Point(x=0.5, y=0.5)


def test_planet_rays_put_nadir_in_the_middle_and_the_look_direction_up():
    w = h = 201
    rays = C.planet_rays(w, h, yaw_deg=30.0, horizon_px=60.0)
    assert np.allclose(rays[h // 2, w // 2], [0, -1, 0], atol=0.02)
    top = rays[h // 2 - 60, w // 2]          # on the horizon circle, straight up from the centre
    assert abs(top[1]) < 0.03
    assert np.degrees(np.arctan2(top[0], top[2])) == pytest.approx(30.0, abs=1.0)
    right = rays[h // 2, w // 2 + 60]        # a quarter turn clockwise: yaw + 90 (not mirrored)
    assert np.degrees(np.arctan2(right[0], right[2])) == pytest.approx(120.0, abs=1.0)
    assert rays[0, 0][1] > 0.3               # the corners are sky


def dual_fisheye(path, side=200):
    """A synthetic X5 still: two fisheyes, sky (blue) above each lens centre, ground (green) below."""
    arr = np.zeros((side, 2 * side, 3), np.uint8)
    arr[: side // 2] = (40, 80, 230)
    arr[side // 2:] = (40, 200, 60)
    Image.fromarray(arr).save(path, "JPEG", quality=95)
    return path


def test_360_view_and_tiny_planet_are_4x5(tmp_path):
    p = dual_fisheye(tmp_path / "x.insp")
    a = asset(0, tmp_path, kind="photo360", preview=str(p))
    c = cfg(tmp_path)
    view = C.Frame(a.id, a, score(yaw=0.0), "360", p, Point(x=0.5, y=0.5), 0.0)
    planet = C.Frame(f"{a.id}-planet", a, score(yaw=0.0), "planet", p, Point(x=0.5, y=0.5), 0.0)
    v = np.asarray(C.render_slide(view, CarouselFrame(frame_id=view.id), c), np.float32)
    t = np.asarray(C.render_slide(planet, CarouselFrame(frame_id=planet.id), c), np.float32)
    assert v.shape == t.shape == (1350, 1080, 3)
    assert v[:200, :, 2].mean() > v[:200, :, 1].mean()          # sky above the flat view
    assert t[600:750, 470:610, 1].mean() > t[600:750, 470:610, 2].mean()   # ground in the planet's middle
    assert t[:100, :100, 2].mean() > t[:100, :100, 1].mean()   # sky in its corners


def test_thumbnail_marks_the_default_crop(tmp_path):
    p = jpeg(tmp_path / "w.jpg", (900, 450), (200, 200, 200))
    f = C.Frame("w", asset(0, tmp_path), score(), "camera", p, Point(x=0.5, y=0.5))
    th = np.asarray(C.thumbnail(f, cfg(tmp_path)), np.float32)
    assert f.aspect == pytest.approx(2.0, abs=0.01)
    assert th[:, :20].mean() < th[:, 140:160].mean() * 0.6     # outside the 4:5 box is dimmed


# --- candidates ------------------------------------------------------------------------------------

def test_candidates_prefer_shipped_edits_and_skip_rejected_and_dropped(tmp_path, library):
    st, assets = library
    full = jpeg(tmp_path / "edit.jpg", (500, 500), (10, 10, 200))
    st.put("edits", "a00", {"status": "shipped", "full": str(full), "params": {"aspect": "1:1"},
                            "frame": "(400, 500)", "crop": "(0, 50, 400, 400)"})
    st.put("edits", "a01", {"status": "rejected", "full": str(full)})
    st.put("edits", "a02", {"status": "held", "full": str(full)})
    st.put("curation", EVENT, Curation(drop=["a04"], notes=""))
    st.put("scores", "a05", score(4.0))                           # under the camera floor
    groups = C.candidates(st, assets)
    frames = {f.id: f for f in groups[EVENT]}
    assert frames["a00"].source == "edit" and frames["a00"].path == full
    assert frames["a02"].source == "camera"                         # held edit: its camera JPEG may still go
    assert not {"a01", "a04", "a05"} & set(frames)
    assert groups[EVENT][0].id == "a00"                             # edits rank first


def test_many_edits_mean_no_camera_jpegs(tmp_path, library):
    st, assets = library
    extra = []
    for i in range(10, 10 + C.ENOUGH_EDITS):
        full = jpeg(tmp_path / f"e{i}.jpg", (400, 500), (i * 9, 100, 100))
        a = asset(i, tmp_path, preview=str(full))
        st.put("assets", a.id, a)
        st.put("scores", a.id, score(7.0))
        st.put("edits", a.id, {"status": "shipped", "full": str(full), "params": {"aspect": "4:5"}})
        extra.append(a)
    frames = C.candidates(st, assets + extra)[EVENT]
    assert {f.source for f in frames} == {"edit"} and len(frames) == C.ENOUGH_EDITS


def test_strong_360_shots_also_offer_a_tiny_planet(tmp_path, library):
    st, assets = library
    p = dual_fisheye(tmp_path / "s.insp")
    weak, strong = (asset(20 + i, tmp_path, kind="photo360", preview=str(p)) for i in range(2))
    st.put("scores", weak.id, score(5.0, yaw=10.0))
    st.put("scores", strong.id, score(7.0, yaw=-40.0))
    frames = {f.id: f for f in C.candidates(st, assets + [weak, strong])[EVENT]}
    assert frames[weak.id].source == "360" and f"{weak.id}-planet" not in frames
    assert frames[f"{strong.id}-planet"].source == "planet" and frames[f"{strong.id}-planet"].yaw == -40.0


def test_events_with_too_few_frames_get_no_carousel(tmp_path, library):
    st, assets = library
    for a in assets[2:]:
        st.put("scores", a.id, score(3.0))
    assert EVENT not in C.candidates(st, assets)


# --- plans -------------------------------------------------------------------------------------------

def frames_for(n, tmp_path):
    return [C.Frame(f"a{i:02d}", asset(i, tmp_path), score(5 + i * 0.1), "camera", tmp_path / "x.jpg",
                    Point(x=0.5, y=0.5), aspect=1.5) for i in range(n)]


def test_snap_drops_unknown_and_repeated_ids_and_pads_before_the_closer(tmp_path):
    frames = frames_for(8, tmp_path)
    p = C.snap(plan_of(["a01", "ghost", "a01", "a02", "a00"]), frames, EVENT)
    ids = [s.frame_id for s in p.frames]
    assert len(ids) == C.MIN_FRAMES and ids[:2] == ["a01", "a02"] and ids[-1] == "a00"
    assert len(set(ids)) == len(ids) and "ghost" not in ids




def test_snap_keeps_360_slides_as_rendered(tmp_path):
    frames = frames_for(6, tmp_path)
    frames[0].source = "planet"
    p = C.snap(plan_of([f.id for f in frames], layout="fit", focus=Point(x=0.1, y=0.1), view_yaw_deg=20.0),
               frames, EVENT)
    by_id = {s.frame_id: s for s in p.frames}
    assert by_id["a00"].layout == "fill" and by_id["a00"].focus is None and by_id["a00"].view_yaw_deg == 20.0
    assert by_id["a01"].layout == "fit" and by_id["a01"].view_yaw_deg is None


def test_snap_rejects_a_plan_with_too_few_candidates(tmp_path):
    with pytest.raises(JudgeError):
        C.snap(plan_of(["a00"]), frames_for(3, tmp_path), EVENT)


# --- build -------------------------------------------------------------------------------------------

ORDER = ["a07", "a03", "a00", "a05", "a01", "a06"]


def test_build_ships_slides_in_plan_order_with_cover_and_caption(tmp_path, library):
    st, assets = library
    c = cfg(tmp_path)
    judge = FakeJudge([plan_of(ORDER[:3], layout="fill") .model_copy(update={"frames": [
        CarouselFrame(frame_id="a07"), CarouselFrame(frame_id="a03", layout="fit"), CarouselFrame(frame_id="a00"),
        CarouselFrame(frame_id="a05"), CarouselFrame(frame_id="a01"), CarouselFrame(frame_id="a06")]})],
        [critique()])
    made = C.build_all(c, st, judge, assets)
    assert made == 1
    out = c.output_dir / "carousels" / EVENT / f"{EVENT}__01"
    assert slides_in(out) == [f"{i:02d}.jpg" for i in range(1, 7)]
    assert (out / "cover.jpg").read_bytes() == (out / "01.jpg").read_bytes()
    assert (out / "caption.txt").read_text() == "Last light on the water.\n"
    for p in out.glob("*.jpg"):
        with Image.open(p) as im:
            assert im.size == (1080, 1350)
    rec = C.record(st, f"{EVENT}__01")
    assert rec["status"] == "shipped" and [f["id"] for f in rec["frames"]] == ORDER
    # the story pass saw a labelled sheet of every candidate, in the order they were shot
    story = judge.tasks[0]
    assert story.output is CarouselPlan and "#7 id=a07" in story.instructions
    assert "a 4:5 crop keeps" in story.instructions
    # the critic saw the hook slide, the carousel and the candidates
    cover, contact, sheet = judge.tasks[1].images
    with Image.open(cover) as im:
        c_arr = np.asarray(im, np.float32)
    with Image.open(out / "01.jpg") as im:
        first = np.asarray(im, np.float32)
    assert c_arr.shape == (1350, 1080, 3)
    assert c_arr[:, :20].mean() < first[:, :20].mean() * 0.5      # outside the grid's centre 3:4: dimmed
    assert abs(c_arr[:, 540].mean() - first[:, 540].mean()) < 3
    # slide 2 was laid out 'fit': its top band is the blurred background, darker than the picture
    with Image.open(out / "02.jpg") as im:
        a = np.asarray(im, np.float32)
    assert a[:150].mean() < a[600:750].mean()


def test_review_events_wait_in_review(tmp_path):
    st = Store(tmp_path / "out" / "state" / "igmp.sqlite")
    assets = []
    for i in range(6):
        pic = jpeg(tmp_path / f"w{i}.jpg", colour=(30 * i, 90, 90))
        a = asset(i, tmp_path, event="Wedding-Party", preview=str(pic))
        st.put("assets", a.id, a)
        st.put("scores", a.id, score(6.0))
        assets.append(a)
    key = assets[0].event_key
    c = cfg(tmp_path, review_events=["wedding"])
    judge = FakeJudge([plan_of([a.id for a in assets])], [critique()])
    assert C.build_all(c, st, judge, assets) == 1
    assert slides_in(c.output_dir / "carousels" / "_review" / key / f"{key}__01")
    assert not (c.output_dir / "carousels" / key / f"{key}__01").exists()
    assert C.record(st, f"{key}__01")["status"] == "review"
    assert C.needs_review("2026-06-01_Town_Wedding", cfg(tmp_path, review_events="Wedding"))
    assert not C.needs_review(EVENT, cfg(tmp_path))


def test_critic_revision_is_rendered_and_shipped(tmp_path, library):
    st, assets = library
    c = cfg(tmp_path)
    revised = plan_of(["a03", "a07", "a00", "a05", "a02"], caption="Revised.")
    judge = FakeJudge([plan_of(ORDER)], [critique("revise", ok=False, revised=revised, notes="weak hook"),
                                         critique()])
    C.build_all(c, st, judge, assets)
    rec = C.record(st, f"{EVENT}__01")
    assert rec["status"] == "shipped" and rec["rounds"] == 2
    assert [f["id"] for f in rec["frames"]] == ["a03", "a07", "a00", "a05", "a02"]
    assert "weak hook" in judge.tasks[2].instructions          # the second critic remembers the first
    assert (c.output_dir / "carousels" / EVENT / f"{EVENT}__01" / "caption.txt").read_text() == "Revised.\n"


def test_failing_critic_sends_it_to_needs_attention_after_two_revisions(tmp_path, library):
    st, assets = library
    c = cfg(tmp_path)
    bad = lambda task: critique("revise", ok=False, revised=plan_of(ORDER[::-1]), notes="colour jumps")
    judge = FakeJudge([plan_of(ORDER)], [bad] * 5)
    C.build_all(c, st, judge, assets)
    assert len(judge.tasks) == 1 + C.REVISIONS + 1
    rec = C.record(st, f"{EVENT}__01")
    assert rec["status"] == "needs-attention" and rec["rounds"] == C.REVISIONS + 1
    assert slides_in(c.output_dir / "carousels" / "_needs-attention" / EVENT / f"{EVENT}__01")
    assert not (c.output_dir / "carousels" / EVENT / f"{EVENT}__01").exists()


def test_ship_verdict_with_a_failed_check_does_not_ship(tmp_path, library):
    st, assets = library
    judge = FakeJudge([plan_of(ORDER)], [critique("ship", ok=False)])
    C.build_all(cfg(tmp_path), st, judge, assets)
    assert C.record(st, f"{EVENT}__01")["status"] == "needs-attention"


def test_build_all_is_resumable_and_retries_failures(tmp_path, library):
    st, assets = library
    c = cfg(tmp_path)
    failing = FakeJudge([], [])
    assert C.build_all(c, st, failing, assets) == 0
    assert "no answer" in st.get("jobs", C.FAILED + f"{EVENT}__01")["error"]
    assert C.record(st, f"{EVENT}__01") is None

    judge = FakeJudge([plan_of(ORDER)], [critique()])
    assert C.build_all(c, st, judge, assets) == 1
    assert not st.has("jobs", C.FAILED + f"{EVENT}__01")

    again = FakeJudge([], [])
    assert C.build_all(c, st, again, assets) == 0 and again.tasks == []


def test_second_carousel_of_an_event_uses_other_frames(tmp_path, library):
    st, assets = library
    for i in range(8, 14):
        a = asset(i, tmp_path, preview=str(jpeg(tmp_path / f"m{i}.jpg", colour=(10 * i, 60, 160))))
        st.put("assets", a.id, a)
        st.put("scores", a.id, score(5.2))
        assets.append(a)
    c = cfg(tmp_path)

    def second(task):
        ids = [line.split("id=")[1].split()[0] for line in task.instructions.splitlines() if " id=" in line]
        return plan_of(ids[:6])

    judge = FakeJudge([plan_of(ORDER), second], [critique(), critique()])
    assert C.build_all(c, st, judge, assets, per_event=2) == 2
    first = {f["asset_id"] for f in C.record(st, f"{EVENT}__01")["frames"]}
    other = {f["asset_id"] for f in C.record(st, f"{EVENT}__02")["frames"]}
    assert first and other and not first & other
    assert slides_in(c.output_dir / "carousels" / EVENT / f"{EVENT}__02")


def test_unreadable_candidates_are_dropped_not_fatal(tmp_path, library):
    st, assets = library
    broken = tmp_path / "pics" / "a6.jpg"
    broken.write_bytes(b"not a jpeg")
    judge = FakeJudge([plan_of(ORDER)], [critique()])
    C.build_all(cfg(tmp_path), st, judge, assets)
    assert "id=a06" not in judge.tasks[0].instructions
    assert "a06" not in [f["id"] for f in C.record(st, f"{EVENT}__01")["frames"]]


# --- scope: story length, one fit, captions, context ----------------------------------------------------

def test_story_caps_at_ten_and_photo_dump_at_twenty(tmp_path):
    frames = frames_for(25, tmp_path)
    ids = [f.id for f in frames]
    story = C.snap(plan_of(ids), frames, EVENT)
    dump = C.snap(plan_of(ids).model_copy(update={"style": "photo-dump"}), frames, EVENT)
    assert len(story.frames) == C.MAX_STORY and story.frames[-1].frame_id == "a24"
    assert len(dump.frames) == C.MAX_FRAMES and dump.style == "photo-dump"
    bad = C.snap(plan_of(ids).model_copy(update={"style": "before-after"}), frames, EVENT)
    assert bad.style == "story"                   # a story plan can't claim the before/after style


def test_at_most_one_blurred_background_slide(tmp_path):
    frames = frames_for(8, tmp_path)
    p = C.snap(plan_of([f.id for f in frames[:7]], layout="fit"), frames, EVENT)
    layouts = [s.layout for s in p.frames]
    assert layouts.count("fit") == 1 and layouts[0] == "fit"
    assert len(p.frames) >= C.MIN_FRAMES                 # the dropped fits were replaced by filled frames


def test_padding_never_adds_a_second_fit(tmp_path):
    frames = frames_for(8, tmp_path)
    for f in frames:
        f.aspect = 2.0                                    # all wide: each would default to fit
    frames[0].aspect = 0.8
    frames[1].aspect = 0.8
    frames[2].aspect = 0.8
    frames[3].aspect = 0.8
    p = C.snap(plan_of(["a07"], layout="fit"), frames, EVENT)
    assert [s.layout for s in p.frames].count("fit") == 1 and len(p.frames) == C.MIN_FRAMES


def test_tidy_caption_keeps_five_relevant_hashtags_on_the_last_line():
    good = "Harbor Town lighthouse at dusk, October 2026\nWaited for the lamp.\n#lighthouse #bluehour"
    assert C.tidy_caption(f"  {good}\n") == good
    many = "Harbor at dusk\nStory line #one\n#a #b #A #c #d #e #f"
    out = C.tidy_caption(many)
    assert out.splitlines()[-1] == "#one #a #b #c #d" and out.startswith("Harbor at dusk\nStory line")


def test_about_names_place_event_and_dates(tmp_path):
    c = Config(library_roots=[], output_dir=tmp_path, places={"Harbor": {"city": "Harbor Town", "state": "Coast",
                                                                         "country": "Testland"}})
    frames = frames_for(3, tmp_path)
    text = C.about(frames, c)
    assert "Harbor, Harbor Town, Coast, Testland" in text and "What: Party" in text and "10 October 2026" in text


# --- before / after -------------------------------------------------------------------------------------

def pattern(path, size=(600, 400), gain=1.0):
    """A camera JPEG with structure (bars and a disc) so framing can be compared."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    arr = np.zeros((h, w, 3), np.float32)
    arr[..., 0] = 60 + 50 * ((xx // 40) % 2)
    arr[..., 1] = 50 + 40 * ((yy // 50) % 2)
    arr[..., 2] = 70
    arr[(xx - 0.62 * w) ** 2 + (yy - 0.45 * h) ** 2 < (0.12 * h) ** 2] = (200, 180, 60)
    Image.fromarray(np.clip(arr * gain, 0, 255).astype(np.uint8)).save(path, quality=95)
    return path


@pytest.fixture
def edited(tmp_path):
    """An event of three photos with shipped edits (a brighter render of the same frame, cut 1:1
    from x=100) and their camera JPEGs."""
    st = Store(tmp_path / "out" / "state" / "igmp.sqlite")
    d = tmp_path / "edited"
    d.mkdir()
    assets = []
    for i in range(3):
        cam = pattern(d / f"c{i}.jpg")
        with Image.open(cam) as im:
            im.crop((100, 0, 500, 400)).point(lambda v: min(255, int(v * 1.5))).save(d / f"e{i}.jpg", quality=95)
        a = asset(i, tmp_path, preview=str(cam))
        st.put("assets", a.id, a)
        st.put("scores", a.id, score(7.0 - i * 0.1, focus=(0.6, 0.45)))
        st.put("edits", a.id, {"status": "shipped", "full": str(d / f"e{i}.jpg"), "params": {"aspect": "1:1"},
                               "frame": "(600, 400)", "crop": "(100, 0, 400, 400)"})
        assets.append(a)
    return st, assets


def test_pair_geometry_cuts_both_slides_to_the_scene_they_share():
    edit = {"frame": "(600, 400)", "crop": "(100, 0, 400, 400)"}
    focus = Point(x=0.5, y=0.5)
    # a 3:2 camera JPEG covers the whole frame: the before is the edit's crop, the after is whole
    before, after, inside = C.pair_geometry(edit, (1200, 800), focus)
    assert before == pytest.approx((1 / 6, 0, 5 / 6, 1)) and after == pytest.approx((0, 0, 1, 1))
    assert (inside.x, inside.y) == pytest.approx((0.5, 0.5))
    # a 16:9 camera JPEG is a centred band of the 3:2 sensor: both slides lose the rows it lacks
    before, after, _ = C.pair_geometry(edit, (1200, 675), focus)
    band = (400 - 600 * 9 / 16) / 2
    assert before == pytest.approx((1 / 6, 0, 5 / 6, 1))
    assert after == pytest.approx((0, band / 400, 1, 1 - band / 400))
    # a JPEG that shows too little of the edit's crop makes no pair
    assert C.pair_geometry(edit, (1200, 300), focus) is None
    assert C.pair_geometry({}, (1200, 800), focus) is None


def test_before_after_shows_camera_jpeg_then_edit_framed_alike(tmp_path, edited):
    st, assets = edited
    c = cfg(tmp_path)
    groups = C.candidates(st, assets)
    assert len(C.pair_frames(groups[EVENT])) == 3                  # too few frames for a story, enough pairs
    judge = FakeJudge([], [], [plan_of(["a01", "a00"], caption="Before and after #rawedit")], [critique()])
    assert C.build_all(c, st, judge, assets) == 1
    out = c.output_dir / "carousels" / EVENT / f"{EVENT}__before-after"
    assert slides_in(out) == ["01.jpg", "02.jpg", "03.jpg", "04.jpg"]
    rec = C.record(st, f"{EVENT}__before-after")
    assert rec["kind"] == "before-after" and rec["status"] == "shipped"
    assert [(f["id"], f["source"]) for f in rec["frames"]] == [
        ("a01", "before"), ("a01", "edit"), ("a00", "before"), ("a00", "edit")]

    def grey(n):
        with Image.open(out / n) as im:
            return np.asarray(im.convert("L").resize((108, 135)), np.float32)

    before, after = grey("01.jpg"), grey("02.jpg")
    assert after.mean() > before.mean() * 1.3                       # the edit is the brighter one
    assert np.corrcoef(before.ravel(), after.ravel())[0, 1] > 0.95   # ...of exactly the same framing
    assert "before/after" in judge.tasks[0].instructions and judge.tasks[0].key.endswith("__before-after")


def test_before_after_needs_two_edits_with_camera_jpegs(tmp_path, edited):
    st, assets = edited
    for a in assets[1:]:
        st.put("assets", a.id, a.model_copy(update={"preview": None}))
    assets = [a if i == 0 else a.model_copy(update={"preview": None}) for i, a in enumerate(assets)]
    judge = FakeJudge([], [])
    assert C.build_all(cfg(tmp_path), st, judge, assets) == 0 and judge.tasks == []


def test_events_get_a_story_and_a_before_after(tmp_path, library, edited):
    st, _ = library
    _, pairs = edited
    assets = [a for _, a in st.all("assets", Asset)]
    judge = FakeJudge([lambda task: plan_of(ORDER)], [critique()], [plan_of(["a00", "a01"])], [critique()])
    assert C.build_all(cfg(tmp_path), st, judge, assets) == 2
    assert C.record(st, f"{EVENT}__01")["kind"] == "story"
    assert C.record(st, f"{EVENT}__before-after")["kind"] == "before-after"
    assert C.build_all(cfg(tmp_path), st, FakeJudge([], []), assets) == 0


def test_before_after_lines_up_when_the_camera_jpeg_is_16x9_of_a_3x2_sensor(tmp_path):
    """A camera in 16:9 mode writes a centred band of the sensor; the RAW edit is cut from the
    whole sensor. Both slides must show exactly the same scene."""
    sensor = pattern(tmp_path / "sensor.jpg", (600, 400))
    band = round((400 - 600 * 9 / 16) / 2)
    with Image.open(sensor) as im:
        im.crop((0, band, 600, 400 - band)).save(tmp_path / "cam.jpg", quality=95)
        im.crop((100, 0, 500, 400)).point(lambda v: min(255, int(v * 1.4))).save(tmp_path / "edit.jpg", quality=95)
    st = Store(tmp_path / "out" / "state" / "igmp.sqlite")
    a = asset(0, tmp_path, preview=str(tmp_path / "cam.jpg"))
    st.put("scores", a.id, score(7.0, focus=(0.6, 0.45)))
    st.put("edits", a.id, {"status": "shipped", "full": str(tmp_path / "edit.jpg"), "params": {"aspect": "1:1"},
                           "frame": "(600, 400)", "crop": "(100, 0, 400, 400)"})
    (f,) = C.pair_frames(C.event_frames([(a, st.get("scores", a.id, Score))], st, set()))
    slide = CarouselFrame(frame_id=f.id)
    before, after = (np.asarray(C.render_slide(x, slide, cfg(tmp_path), (216, 270)).convert("L"), np.float32)
                     for x in f.pair)
    assert after.mean() > before.mean() * 1.2
    assert np.corrcoef(before.ravel(), after.ravel())[0, 1] > 0.97


# --- saved as it goes: a stopped run resumes ------------------------------------------------------------

def no_rendering(*a, **k):
    raise AssertionError("a slide already on the drive was rendered again")


def test_the_plan_is_saved_the_moment_it_arrives_and_a_resumed_run_reuses_it(tmp_path, library, monkeypatch):
    st, assets = library
    c = cfg(tmp_path)
    stopped = FakeJudge([plan_of(ORDER)], [])                      # the critic never answers: the run stops
    assert C.build_all(c, st, stopped, assets) == 0
    wip = st.get(C.TABLE, f"{EVENT}__01")
    assert wip["status"] == "planned" and [s["frame_id"] for s in wip["plan"]["frames"]] == ORDER
    assert wip["history"] == [] and C.record(st, f"{EVENT}__01") is None
    assert st.has("jobs", C.FAILED + f"{EVENT}__01")
    assert list((c.state_dir / "carousels" / f"{EVENT}__01" / "slides").glob("*.jpg"))   # rendered on the drive

    monkeypatch.setattr(C, "render_slide", no_rendering)          # every slide is reused, none redrawn
    resumed = FakeJudge([], [critique()])
    assert C.build_all(c, st, resumed, assets) == 1
    assert [t.output for t in resumed.tasks] == [CarouselCritique]  # no second selection pass
    rec = C.record(st, f"{EVENT}__01")
    assert rec["status"] == "shipped" and [f["id"] for f in rec["frames"]] == ORDER
    assert not st.has("jobs", C.FAILED + f"{EVENT}__01")


def test_each_critic_round_is_saved_and_a_resumed_run_continues_from_it(tmp_path, library):
    st, assets = library
    c = cfg(tmp_path)
    revised = plan_of(["a03", "a07", "a00", "a05", "a02"])
    first = FakeJudge([plan_of(ORDER)], [critique("revise", ok=False, revised=revised, notes="weak hook")])
    assert C.build_all(c, st, first, assets) == 0                 # stops before round 2's critique
    wip = st.get(C.TABLE, f"{EVENT}__01")
    assert len(wip["history"]) == 1 and wip["round"] == 1
    assert wip["history"][0]["critique"]["notes"] == "weak hook"
    assert [s["frame_id"] for s in wip["history"][0]["plan"]["frames"]] == ORDER
    assert [s["frame_id"] for s in wip["plan"]["frames"]] == ["a03", "a07", "a00", "a05", "a02"]

    second = FakeJudge([], [critique()])
    assert C.build_all(c, st, second, assets) == 1
    assert len(second.tasks) == 1 and "weak hook" in second.tasks[0].instructions
    rec = C.record(st, f"{EVENT}__01")
    assert rec["rounds"] == 2 and [h["round"] for h in rec["critic"]] == [1, 2]
    assert [f["id"] for f in rec["frames"]] == ["a03", "a07", "a00", "a05", "a02"]


def test_a_prepared_candidate_sheet_is_reused(tmp_path, library, monkeypatch):
    st, assets = library
    c = cfg(tmp_path)
    C.build_all(c, st, FakeJudge([], []), assets)                  # prepared; the selection pass failed
    wip = st.get(C.TABLE, f"{EVENT}__01")
    assert wip["status"] == "prepared" and Path(wip["sheet"]).exists() and len(wip["candidates"]) == 8
    monkeypatch.setattr(C, "thumbnail", no_rendering)
    judge = FakeJudge([plan_of(ORDER)], [critique()])
    assert C.build_all(c, st, judge, assets) == 1
    assert "#7 id=a07" in judge.tasks[0].instructions and "a 4:5 crop keeps" in judge.tasks[0].instructions


def test_limit_caps_the_carousels_worked_on_per_run(tmp_path, library):
    st, assets = library
    for i in range(30, 36):
        a = asset(i, tmp_path, event="Market", preview=str(jpeg(tmp_path / f"k{i}.jpg", colour=(5 * i, 120, 40))))
        st.put("assets", a.id, a)
        st.put("scores", a.id, score(6.0))
        assets.append(a)
    market = assets[-1].event_key
    c = cfg(tmp_path)
    ids = lambda task: plan_of([line.split("id=")[1].split()[0] for line in task.instructions.splitlines()
                                if " id=" in line][:5])
    names = [f"{EVENT}__01", f"{market}__01"]
    judge = FakeJudge([ids], [critique()])
    assert C.build_all(c, st, judge, assets, limit=1) == 1
    assert sum(C.record(st, n) is not None for n in names) == 1 and len(judge.tasks) == 2
    assert C.build_all(c, st, FakeJudge([ids], [critique()]), assets, limit=1) == 1
    assert all(C.record(st, n) is not None for n in names)


def test_a_4x5_edit_at_its_own_framing_is_the_photo_stages_instagram_export(tmp_path):
    full = jpeg(tmp_path / "full.jpg", (800, 1000), (150, 90, 40))
    ig = jpeg(tmp_path / "ig.jpg", (1080, 1350), (20, 200, 90))          # a different picture, to tell them apart
    f = C.Frame("e", asset(0, tmp_path), score(), "edit", full, Point(x=0.5, y=0.5), ig=ig)
    c = cfg(tmp_path)
    slide = np.asarray(C.render_slide(f, CarouselFrame(frame_id="e"), c), np.int16)
    with Image.open(ig) as im:
        assert np.abs(slide - np.asarray(im.convert("RGB"), np.int16)).max() == 0
    moved = np.asarray(C.render_slide(f, CarouselFrame(frame_id="e", focus=Point(x=0.4, y=0.5)), c), np.float32)
    assert moved[..., 0].mean() > moved[..., 1].mean()                   # a new crop comes from the full render


def texture(size, seed=0):
    rng = np.random.default_rng(seed)
    w, h = size
    small = rng.random((h // 8, w // 8, 3)) * 255
    return Image.fromarray(small.astype(np.uint8)).resize(size, Image.Resampling.BICUBIC)


def test_align_pair_corrects_a_few_percent_of_scale_the_geometry_cannot_know(tmp_path):
    """The camera's JPEG engine and RawTherapee can disagree by a few percent (lens correction):
    registration finds the edit on the camera JPEG and cuts both slides to the same scene."""
    sensor = texture((900, 600))
    zoom = 1.03                                        # the camera JPEG is 3% tighter than the RAW frame
    cw, ch = 900 / zoom, 600 / zoom
    sensor.resize((900, 600), Image.Resampling.LANCZOS,
                  box=((900 - cw) / 2, (600 - ch) / 2, (900 + cw) / 2, (600 + ch) / 2)).save(tmp_path / "cam.jpg",
                                                                                           quality=95)
    sensor.crop((150, 0, 750, 600)).point(lambda v: min(255, int(v * 1.3))).save(tmp_path / "edit.jpg", quality=95)
    rec = {"frame": "(900, 600)", "crop": "(150, 0, 600, 600)"}
    a, s = asset(0, tmp_path), score(focus=(0.5, 0.5))
    before_region, after_region, focus = C.pair_geometry(rec, (900, 600), s.feed_focus)
    f = C.Frame("e", a, s, "edit", tmp_path / "edit.jpg", focus)
    f.pair = (C.Frame("e", a, s, "before", tmp_path / "cam.jpg", focus, region=before_region),
              C.Frame("e", a, s, "edit", tmp_path / "edit.jpg", focus, region=after_region))
    c = cfg(tmp_path)

    def corr():
        b, e = (np.asarray(C.render_slide(x, CarouselFrame(frame_id="e"), c, (216, 270)).convert("L"), np.float32)
                for x in f.pair)
        return np.corrcoef(b.ravel(), e.ravel())[0, 1]

    geometric = corr()
    assert C.align_pair(f)
    assert corr() > max(0.97, geometric + 0.05)


def test_cli_carousels_command_passes_only_and_limit(tmp_path, monkeypatch):
    from igmp import cli, judge as judge_mod
    out = tmp_path / "out"
    settings = tmp_path / "config.toml"
    settings.write_text(f'library_roots = []\noutput_dir = "{out}"\nclaude_cli = "not-run"\n')
    st = Store(out / "state" / "igmp.sqlite")
    for i, event in enumerate(["Party", "Party", "Market"]):
        a = asset(i, tmp_path, event=event)
        st.put("assets", a.id, a)
        st.put("scores", a.id, score())          # --limit keeps every scored asset
    seen = {}

    def fake_build_all(cfg, store, judge, assets, **kw):
        seen.update(events={a.event for a in assets}, judge=judge, **kw)
        return 0

    fake = FakeJudge([], [])
    monkeypatch.setattr(judge_mod, "backend", lambda cfg: fake)
    monkeypatch.setattr(C, "build_all", fake_build_all)
    assert cli.main(["carousels", "--only", "Party", "--limit", "2", "--config", str(settings)]) == 0
    assert seen == {"events": {"Party"}, "judge": fake, "limit": 2}
