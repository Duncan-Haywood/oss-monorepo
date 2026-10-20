"""Tests for igmp.vision and the Vision-aware rules of prefilter.select_candidates.

Feature-print maths, preview regions, the pass's bookkeeping and the candidate rules run
everywhere on synthetic data; tests that call Apple Vision skip unless it is available
(macOS with the `mac` extra installed)."""
from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np
import pytest
from PIL import Image, ImageDraw

from igmp import prefilter as pf
from igmp import vision
from igmp.config import Config
from igmp.models import Asset, Metrics
from igmp.store import Store

needs_vision = pytest.mark.skipif(not vision.available(), reason="Apple Vision not available")
T0 = datetime(2026, 10, 10, 17, 0, 0)


def asset(aid: str, seconds: float | None = 0, kind: str = "photo", event: str = "Party",
          camera: str = "A7RV", **kw) -> Asset:
    taken = None if seconds is None else T0 + timedelta(seconds=seconds)
    kw.setdefault("files", [f"/x/{aid}.JPG"])
    return Asset(id=aid, kind=kind, taken_at=taken, date_label="2026-10-10",
                 location="Harbor", event=event, camera=camera, **kw)


def metric(aid: str, sharpness: float = 300.0, dhash: str = "a5a5a5a5a5a5a5a5", **kw) -> Metrics:
    return Metrics(asset_id=aid, sharpness=sharpness, brightness=0.45, clipped_high=0.01,
                   clipped_low=0.01, dhash=dhash, **kw)


def unit(angle: float, dim: int = 768) -> np.ndarray:
    """A unit vector at `angle` radians from the first axis, in the plane of the first two."""
    v = np.zeros(dim, np.float32)
    v[0], v[1] = math.cos(angle), math.sin(angle)
    return v


def at_distance(d: float, base_angle: float = 0.0) -> np.ndarray:
    """A unit vector at Euclidean distance d from unit(base_angle)."""
    return unit(base_angle + 2 * math.asin(d / 2))


def printed(v: np.ndarray) -> str:
    return vision.encode_print(v)


# --- feature prints ----------------------------------------------------------------------

def test_print_encoding_round_trips_as_float32():
    v = np.random.default_rng(0).normal(size=768).astype(np.float32)
    text = vision.encode_print(v)
    assert isinstance(text, str) and len(text) == 4 * math.ceil(768 * 4 / 3)
    assert np.array_equal(vision.decode_print(text), v)
    assert vision.encode_print(v.tobytes()) == text                  # raw float32 bytes as is
    assert vision.encode_print(v.astype(np.float64)) == text          # doubles are stored as float32
    assert vision.decode_print("").size == 0


def test_distance_is_euclidean_and_inf_when_not_comparable():
    a, b = unit(0.0), unit(math.pi / 2)
    assert vision.distance(printed(a), printed(a)) == 0.0
    assert vision.distance(printed(a), printed(b)) == pytest.approx(math.sqrt(2), abs=1e-6)
    assert vision.distance(printed(a), printed(at_distance(0.25))) == pytest.approx(0.25, abs=1e-5)
    assert vision.distance(a, printed(b)) == vision.distance(printed(a), b)    # arrays or text
    assert vision.distance("", printed(a)) == math.inf
    assert vision.distance(printed(a), printed(unit(0.0, dim=2048))) == math.inf   # other revision


# --- regions -----------------------------------------------------------------------------

def test_photo_and_plain_panorama_are_analysed_whole():
    assert vision.region_for("photo", 1024, 683) is None
    assert vision.region_for("photo360", 1024, 512) is None


def test_photo360_sheet_uses_the_panorama_on_top():
    # media's 360 sheet: 1024x512 equirect, an 18 px yaw scale, then 256 px flat views
    assert vision.region_for("photo360", 1024, 512 + 18 + 256) == (0, 0, 1024, 512)


@pytest.mark.parametrize("frame", [(1920, 1080), (1080, 1920), (1440, 1080), (1080, 1080)])
def test_video_region_is_the_middle_frame_of_medias_contact_sheet(frame):
    from igmp import media

    w, h = frame
    s = 512 / max(w, h)                       # media.frame_at(size=size // 2)
    tile = (round(w * s), round(h * s))
    colors = [(30 * i, 255 - 30 * i, (90 * i) % 256) for i in range(vision.CONTACT_FRAMES)]
    sheet, *_ = media._grid([Image.new("RGB", tile, c) for c in colors], 1024)
    sheet = media._fit(sheet, 1024)
    x, y, cw, ch = vision.region_for("video", *sheet.size)
    assert abs(cw / ch - w / h) < 0.02
    middle = sheet.getpixel((x + cw // 2, y + ch // 2))
    assert middle == colors[vision.CONTACT_FRAMES // 2]
    # the whole region is that one tile (allowing a pixel of rounding at the edges)
    crop = np.asarray(sheet.crop((x + 1, y + 1, x + cw - 1, y + ch - 1)))
    assert (crop == np.array(middle, np.uint8)).all()


def test_load_region_crops_the_panorama_off_a_360_sheet(tmp_path):
    sheet = Image.new("RGB", (1024, 512 + 18 + 256), (0, 0, 255))
    sheet.paste(Image.new("RGB", (1024, 512), (200, 50, 10)), (0, 0))
    sheet.save(tmp_path / "sheet.png")
    pano = vision.load_region(tmp_path / "sheet.png", "photo360")
    assert pano.size == (1024, 512) and pano.mode == "RGB"
    assert pano.getpixel((10, 500)) == (200, 50, 10)
    assert vision.load_region(tmp_path / "sheet.png", "photo").size == (1024, 786)
    (tmp_path / "bad.jpg").write_bytes(b"not an image")
    with pytest.raises(vision.VisionError):
        vision.load_region(tmp_path / "bad.jpg", "photo")


def test_video360_region_is_the_middle_cell_of_four_views():
    # media's 360 contact sheet at 1024: 16 px header, 2 columns x 4 rows of cells, each four
    # 128 px views wide and 128 px tall with a 2 px gap under it -> 1024 x 536
    assert vision.region_for("video360", 1024, 16 + 4 * 130) == (0, 16 + 2 * 130, 512, 128)


# --- vision_pass bookkeeping (Vision faked) ----------------------------------------------

@pytest.fixture
def fake_vision(monkeypatch):
    """vision_pass with a canned analyser: 'bad' fails, everything else gets fields by id."""
    calls: list[str] = []

    def fake(a, cfg):
        calls.append(a.id)
        if a.id == "bad":
            return "VisionError: cannot decode bad.jpg"
        return {"aesthetics": 0.25, "utility": False, "faces": 1, "face_quality": 0.6,
                "labels": ["outdoor", a.id], "feature_print": printed(unit(len(a.id)))}

    monkeypatch.setattr(vision, "available", lambda: True)
    monkeypatch.setattr(vision, "_analyze_safe", fake)
    return calls


def test_vision_pass_fills_fields_records_failures_and_resumes(tmp_path, fake_vision):
    store = Store(tmp_path / "state.sqlite")
    cfg = Config(library_roots=[], output_dir=tmp_path)
    assets = [asset("a", 0), asset("bad", 5), asset("broken", 10), asset("nometrics", 15)]
    store.put("metrics", "a", metric("a", 410.0, burst_id="a", candidate=True))
    store.put("metrics", "bad", metric("bad"))
    store.put("metrics", "broken", pf.broken_metrics("broken"))

    assert vision.vision_pass(cfg, store, assets) == 1
    assert fake_vision == ["a", "bad"]                 # unreadable and unmeasured assets skipped
    m = store.get("metrics", "a", Metrics)
    assert m.aesthetics == 0.25 and m.utility is False and m.faces == 1 and m.face_quality == 0.6
    assert m.labels == ["outdoor", "a"] and vision.decode_print(m.feature_print).size == 768
    assert m.sharpness == 410.0 and m.burst_id == "a" and m.candidate      # other fields kept
    assert store.get("jobs", "vision:bad") == {"error": "VisionError: cannot decode bad.jpg"}
    assert store.get("metrics", "bad", Metrics).aesthetics is None

    # resumable: nothing left to do, and the failed file is not retried until its job is deleted
    assert vision.vision_pass(cfg, store, assets) == 0
    assert fake_vision == ["a", "bad"]
    store.delete("jobs", "vision:bad")
    assert vision.vision_pass(cfg, store, assets) == 0
    assert fake_vision == ["a", "bad", "bad"]


def test_sequences_copy_their_middle_members_fields(tmp_path, fake_vision):
    store = Store(tmp_path / "state.sqlite")
    cfg = Config(library_roots=[], output_dir=tmp_path)
    frames = [asset(f"f{i}", 10 * i) for i in range(5)]
    seq = Asset(id="seq", kind="sequence", files=[], taken_at=T0, members=[f.id for f in frames])
    for f in frames:
        store.put("metrics", f.id, metric(f.id))
    store.put("metrics", "seq", metric("seq", burst_id="seq"))

    vision.vision_pass(cfg, store, frames[:2] + [seq])       # only two members analysed yet
    first = store.get("metrics", "seq", Metrics)
    assert first.labels == ["outdoor", "f1"]                  # middle of what is there
    assert "seq" not in fake_vision                           # a sequence is never analysed itself

    store.put("metrics", "seq", metric("seq", burst_id="seq"))   # measure re-derives it each run
    vision.vision_pass(cfg, store, frames + [seq])
    m = store.get("metrics", "seq", Metrics)
    assert m.labels == ["outdoor", "f2"] and m.feature_print == store.get("metrics", "f2", Metrics).feature_print
    assert m.burst_id == "seq"


def test_vision_pass_does_nothing_without_vision(tmp_path, monkeypatch):
    monkeypatch.setattr(vision, "available", lambda: False)
    store = Store(tmp_path / "state.sqlite")
    store.put("metrics", "a", metric("a"))
    assert vision.vision_pass(Config(library_roots=[], output_dir=tmp_path), store, [asset("a")]) == 0
    assert store.get("metrics", "a", Metrics).aesthetics is None


# --- candidate rules ---------------------------------------------------------------------

def pick(metrics: dict[str, Metrics], assets: list[Asset] | None = None) -> list[str]:
    assets = assets or [asset(aid, i) for i, aid in enumerate(metrics)]
    out = pf.select_candidates(assets, metrics)
    return sorted(k for k, m in out.items() if m.candidate)


def test_without_vision_fields_the_sharpest_of_a_burst_wins():
    assert pick({"a": metric("a", 300), "b": metric("b", 500), "c": metric("c", 480)}) == ["b"]


def test_burst_with_faces_picks_the_best_face_among_sharp_enough_frames():
    ms = {"a": metric("a", 500, faces=2, face_quality=0.30),
          "b": metric("b", 450, faces=2, face_quality=0.70),       # best face, sharp enough
          "c": metric("c", 200, faces=2, face_quality=0.90)}       # best face but too soft
    assert pick(ms) == ["b"]


def test_burst_face_quality_ties_go_to_the_sharper_frame():
    ms = {"a": metric("a", 500, faces=1, face_quality=0.60),
          "b": metric("b", 450, faces=1, face_quality=0.60 + pf.FACE_QUALITY_TIE / 2)}
    assert pick(ms) == ["a"]


def test_burst_frame_where_the_face_is_lost_counts_as_worst():
    ms = {"a": metric("a", 500, faces=0, aesthetics=0.6),         # face turned away
          "b": metric("b", 400, faces=1, face_quality=0.4, aesthetics=0.2)}
    assert pick(ms) == ["b"]


def test_burst_without_faces_lets_aesthetics_break_near_ties_in_sharpness():
    ms = {"a": metric("a", 500, aesthetics=0.1),
          "b": metric("b", 500 * (pf.SHARPNESS_TIE_RATIO + 0.02), aesthetics=0.5),
          "c": metric("c", 500 * (pf.SHARPNESS_TIE_RATIO - 0.1), aesthetics=0.9)}   # clearly softer
    assert pick(ms) == ["b"]


def test_burst_without_faces_ignores_aesthetics_differences_within_noise():
    ms = {"a": metric("a", 500, aesthetics=0.40),
          "b": metric("b", 480, aesthetics=0.40 + pf.AESTHETICS_TIE / 2)}
    assert pick(ms) == ["a"]


def test_utility_needs_a_document_label_and_only_rejects_stills():
    assets = [asset("doc", 0), asset("stall", 100), asset("view", 200),
              asset("clip", 300, kind="video", camera="Pocket3")]
    ms = {"doc": metric("doc", dhash="0123456789abcdef", utility=True, labels=["document", "printed_page"]),
          # isUtility also fires on market stalls and signs: without a document label it stays
          "stall": metric("stall", dhash="fedcba9876543210", utility=True, labels=["interior_shop"]),
          "view": metric("view", dhash="00ff00ff00ff00ff", utility=False, labels=["outdoor"]),
          "clip": metric("clip", 40, dhash="ff00ff00ff00ff00", utility=True, labels=["screenshot"],
                         segments=[(0.0, 5.0)])}
    assert pick(ms, assets) == ["clip", "stall", "view"]


def test_a_rejected_frame_hands_its_burst_to_the_next_best():
    ms = {"doc": metric("doc", 900, utility=True, labels=["document"]),     # sharpest, but a document
          "smear": metric("smear", 800, aesthetics=pf.EXTREME_LOW_AESTHETICS - 0.03),
          "ok": metric("ok", 400, aesthetics=0.3)}
    assert pick(ms) == ["ok"]


def test_low_aesthetics_alone_never_rejects():
    # a night sky or a moody frame: generic aesthetics hate it, but it is kept
    ms = {"stars": metric("stars", 40, dhash="0123456789abcdef", aesthetics=-0.99, labels=["night_sky"]),
          "moody": metric("moody", 40, dhash="fedcba9876543210", aesthetics=pf.EXTREME_LOW_AESTHETICS + 0.01)}
    assert pick(ms, [asset("stars", 0), asset("moody", 100)]) == ["moody", "stars"]


def test_extreme_junk_aesthetics_rejects_flat_photos_only():
    junk = dict(aesthetics=pf.EXTREME_LOW_AESTHETICS - 0.02, labels=[])
    assets = [asset("smear", 0), asset("pano", 100, kind="photo360", camera="X5")]
    ms = {"smear": metric("smear", 40, dhash="0123456789abcdef", **junk),
          "pano": metric("pano", 40, dhash="fedcba9876543210", **junk)}
    assert pick(ms, assets) == ["pano"]


# near-duplicates: separate bursts (different dHash) whose feature prints say "same picture"
HASHES = ["0123456789abcdef", "fedcba9876543210", "00ff00ff00ff00ff", "ff00ff00ff00ff00"]


def neardup(aid: str, i: int, vec: np.ndarray, **kw) -> Metrics:
    return metric(aid, kw.pop("sharpness", 300), HASHES[i], feature_print=printed(vec), **kw)


def test_near_duplicate_across_bursts_keeps_the_better_one():
    close = pf.NEAR_DUP_DISTANCE * 0.8
    assets = [asset("a", 0), asset("b", 30, camera="Phone")]          # another camera, 30 s later
    ms = {"a": neardup("a", 0, unit(0), aesthetics=0.2),
          "b": neardup("b", 1, at_distance(close), aesthetics=0.4)}
    assert pick(ms, assets) == ["b"]
    out = pf.select_candidates(assets, ms)
    assert out["a"].burst_id == "a" and out["b"].burst_id == "b"      # bursts are left alone


def test_near_duplicate_needs_closeness_in_time_place_and_content():
    close, far = pf.NEAR_DUP_DISTANCE * 0.8, pf.NEAR_DUP_DISTANCE * 1.2
    ms = {"a": neardup("a", 0, unit(0), aesthetics=0.2),
          "b": neardup("b", 1, at_distance(close), aesthetics=0.4)}
    later = [asset("a", 0), asset("b", pf.NEAR_DUP_WINDOW_S + 5)]
    assert pick(ms, later) == ["a", "b"]
    other_event = [asset("a", 0), asset("b", 30, event="Picnic")]
    assert pick(ms, other_event) == ["a", "b"]
    different = {"a": ms["a"], "b": neardup("b", 1, at_distance(far), aesthetics=0.4)}
    assert pick(different, [asset("a", 0), asset("b", 30)]) == ["a", "b"]


def test_near_duplicates_do_not_chain():
    # a slow pan: a~b and b~c but a and c differ; a is best, so b goes and c stays
    step = pf.NEAR_DUP_DISTANCE * 0.7
    theta = 2 * math.asin(step / 2)
    assets = [asset("a", 0), asset("b", 20), asset("c", 40)]
    ms = {"a": neardup("a", 0, unit(0), aesthetics=0.6),
          "b": neardup("b", 1, unit(theta), aesthetics=0.4),
          "c": neardup("c", 2, unit(2 * theta), aesthetics=0.2)}
    assert vision.distance(ms["a"].feature_print, ms["c"].feature_print) > pf.NEAR_DUP_DISTANCE
    assert pick(ms, assets) == ["a", "c"]


def test_near_duplicate_prefers_a_good_face_over_aesthetics():
    close = pf.NEAR_DUP_DISTANCE * 0.5
    assets = [asset("a", 0), asset("b", 10)]
    ms = {"a": neardup("a", 0, unit(0), aesthetics=0.1, faces=1, face_quality=0.8),
          "b": neardup("b", 1, at_distance(close), aesthetics=0.6)}
    assert pick(ms, assets) == ["a"]


def test_near_duplicate_rule_skips_videos_and_shots_without_time_or_print():
    close = pf.NEAR_DUP_DISTANCE * 0.5
    v = dict(segments=[(0.0, 4.0)])
    videos = [asset("v1", 0, kind="video", camera="Pocket3"), asset("v2", 20, kind="video", camera="Pocket3")]
    ms = {"v1": neardup("v1", 0, unit(0), **v), "v2": neardup("v2", 1, at_distance(close), **v)}
    assert pick(ms, videos) == ["v1", "v2"]
    undated = [asset("a", None), asset("b", None)]
    ms = {"a": neardup("a", 0, unit(0)), "b": neardup("b", 1, at_distance(close))}
    assert pick(ms, undated) == ["a", "b"]
    no_print = {"a": neardup("a", 0, unit(0)), "b": metric("b", dhash=HASHES[1])}
    assert pick(no_print, [asset("a", 0), asset("b", 10)]) == ["a", "b"]


# --- Apple Vision (macOS only) -----------------------------------------------------------

def landscape(seed: int = 0, w: int = 1024, h: int = 683, horizon: int = 400) -> Image.Image:
    """Sky gradient over rolling green ground, with grain."""
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, h)[:, None]
    img = np.stack([90 + 100 * y, 140 + 80 * y, 230 - 60 * y], -1) * np.ones((1, w, 1))
    ground = np.arange(h)[:, None] > horizon + 40 * np.sin(np.arange(w) / (90 + 10 * seed))[None, :]
    img[ground] = [60, 110, 50]
    img += rng.normal(0, 6, img.shape)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def document(w: int = 768, h: int = 1024) -> Image.Image:
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    for i in range(40):
        d.text((40, 30 + i * 24), f"Invoice 2026-10 item {i:02d}   quantity 3   total 12.50   paid " * 2,
               fill="black")
    return img.resize((w, h))


def checker(w: int = 1024, h: int = 683, cell: int = 48) -> Image.Image:
    yy, xx = np.mgrid[:h, :w]
    board = ((xx // cell + yy // cell) % 2).astype(np.uint8)
    return Image.fromarray(np.stack([board * 220, board * 40 + 30, 255 - board * 200], -1).astype(np.uint8))


@needs_vision
def test_analyze_returns_metrics_fields(tmp_path):
    path = tmp_path / "land.jpg"
    landscape().save(path, quality=92)
    out = vision.analyze(path)
    assert set(out) == set(vision.VISION_FIELDS)
    Metrics(asset_id="x", sharpness=1, brightness=0.5, clipped_high=0, clipped_low=0, dhash="0" * 16, **out)
    assert -1.0 <= out["aesthetics"] <= 1.0 and out["utility"] is False
    assert out["faces"] == 0 and out["face_quality"] is None
    assert 0 < len(out["labels"]) <= vision.MAX_LABELS and "sky" in out["labels"]
    v = vision.decode_print(out["feature_print"])
    assert v.shape == (768,) and abs(float(np.linalg.norm(v)) - 1.0) < 1e-2


@needs_vision
def test_document_is_utility_and_never_a_candidate(tmp_path):
    path = tmp_path / "doc.jpg"
    document().save(path, quality=92)
    out = vision.analyze(path)
    assert out["utility"] is True and "document" in out["labels"]
    m = metric("doc", **out)
    assert pick({"doc": m}) == []


@needs_vision
def test_distance_matches_vision_compute_distance(tmp_path):
    import objc
    import Vision

    objc.registerMetaDataForSelector(
        b"VNFeaturePrintObservation", b"computeDistance:toFeaturePrintObservation:error:",
        {"arguments": {2: {"type_modifier": objc._C_OUT}, 4: {"type_modifier": objc._C_OUT}}})
    images = [landscape(0), landscape(1, horizon=300), checker(), document()]
    paths = []
    for i, img in enumerate(images):
        paths.append(tmp_path / f"{i}.jpg")
        img.save(paths[-1], quality=92)

    def observation(path):      # the same pixels analyze() feeds Vision
        image = vision._cgimage(vision.load_region(path, "photo"))
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(image, {})
        request = Vision.VNGenerateImageFeaturePrintRequest.alloc().init()
        request.setRevision_(vision.FEATURE_PRINT_REVISION)
        assert handler.performRequests_error_([request], None)[0]
        return request.results()[0]

    obs = [observation(p) for p in paths]
    prints = [vision.analyze(p)["feature_print"] for p in paths]
    for i in range(len(paths)):
        for j in range(i + 1, len(paths)):
            ok, expected, _ = obs[i].computeDistance_toFeaturePrintObservation_error_(None, obs[j], None)
            assert ok
            assert vision.distance(prints[i], prints[j]) == pytest.approx(expected, abs=1e-5)


@needs_vision
def test_near_copy_is_much_closer_than_another_scene(tmp_path):
    base = landscape(0)
    shifted = base.crop((12, 8, base.width, base.height)).resize(base.size)
    brighter = Image.eval(shifted, lambda v: min(255, int(v * 1.08) + 6))
    paths = {}
    for name, img in (("base", base), ("copy", brighter), ("other", checker())):
        paths[name] = tmp_path / f"{name}.jpg"
        img.save(paths[name], quality=90)
    p = {k: vision.analyze(v)["feature_print"] for k, v in paths.items()}
    assert vision.distance(p["base"], p["copy"]) < pf.NEAR_DUP_DISTANCE
    assert vision.distance(p["base"], p["other"]) > 3 * vision.distance(p["base"], p["copy"])


@needs_vision
def test_photo360_sheet_is_analysed_on_its_panorama(tmp_path):
    pano = landscape(2, 1024, 512, horizon=300)
    sheet = Image.new("RGB", (1024, 512 + 18 + 256), "black")
    sheet.paste(pano, (0, 0))
    sheet.paste(document(1024, 256), (0, 530))           # junk under it must not count
    sheet.save(tmp_path / "sheet.png")
    pano.save(tmp_path / "pano.png")
    on_sheet = vision.analyze(tmp_path / "sheet.png", "photo360")
    alone = vision.analyze(tmp_path / "pano.png", "photo")
    assert vision.distance(on_sheet["feature_print"], alone["feature_print"]) < 1e-3
    assert on_sheet["labels"] == alone["labels"] and not on_sheet["utility"]


@needs_vision
def test_analyze_rejects_unreadable_files(tmp_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"not a jpeg at all")
    with pytest.raises(vision.VisionError):
        vision.analyze(bad)
    with pytest.raises(vision.VisionError):
        vision.analyze(tmp_path / "missing.jpg")


@needs_vision
def test_vision_pass_end_to_end_in_worker_processes(tmp_path):
    lib = tmp_path / "lib"
    lib.mkdir()
    cfg = Config(library_roots=[lib], output_dir=tmp_path / "out")
    store = Store(cfg.db_path)
    assets = []
    for i in range(6):
        path = lib / f"2026-10-10_17000{i}_Harbor_Party_A7RV_DSC0000{i}.JPG"
        (landscape(i % 3) if i != 5 else checker()).save(path, quality=90)
        assets.append(asset(f"p{i}", 10 * i, files=[str(path)], preview=str(path)))
        store.put("metrics", f"p{i}", metric(f"p{i}"))
    bad = lib / "2026-10-10_170100_Harbor_Party_A7RV_DSC00099.JPG"
    bad.write_bytes(b"\xff\xd8\xff garbage")
    assets.append(asset("bad", 60, files=[str(bad)], preview=str(bad)))
    store.put("metrics", "bad", metric("bad"))

    assert vision.vision_pass(cfg, store, assets, workers=2) == 6        # > INLINE_MAX: a process pool
    for i in range(6):
        m = store.get("metrics", f"p{i}", Metrics)
        assert m.aesthetics is not None and vision.decode_print(m.feature_print).size == 768
        assert m.labels if i != 5 else True          # a bare checkerboard may get no label over 0.3
    assert "error" in store.get("jobs", "vision:bad")
    assert vision.vision_pass(cfg, store, assets, workers=2) == 0
