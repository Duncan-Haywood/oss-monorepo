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
