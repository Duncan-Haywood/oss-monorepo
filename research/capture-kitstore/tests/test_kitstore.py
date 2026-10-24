import math
from capture_kitstore import *
from capture_kitstore.catalogue import exact as exact_kit, CAMERAS, MOUNTS, PACKS

KITS = list(all_kits())


def cam(prefix):
    return next(c for c in CAMERAS if c.name.startswith(prefix))


def test_action_cam_day_matches_arithmetic():
    k = Kit((cam("DJI"),), (), (MOUNTS[0],), ())
    assert math.isclose(day_gb(k, 4.0), 120 * 3600 / 8 / 1000 * 4)   # 216 GB, 120 Mbit/s for 4 h


def test_only_active_cameras_record():
    cams = (cam("DJI"), cam("Insta360"), cam("iPhone"))
    one_mount = Kit(cams, (), (MOUNTS[0],), ())
    three = Kit(cams, (), MOUNTS[:3], ())
    assert len(active(one_mount)) == 1 and len(active(three)) == 3
    assert day_gb(three, 4) > day_gb(one_mount, 4)


def test_storage_meets_offload_limit_and_holds_trip():
    k = Kit((cam("Sony"), cam("iPhone")), (), MOUNTS[:2], ())
    st = storage(k, 4.0, days=7, copies=2, max_offload_h=1.0)
    assert st.offload_h <= 1.0
    assert st.ssds % 2 == 0 and st.ssds >= 2


def test_no_camera_needs_no_storage():
    assert storage(Kit((), (), (), ())).grams == 0


def test_tighter_deadline_never_lighter():
    k = Kit((cam("Sony"), cam("iPhone")), (), MOUNTS[:2], ())
    g = [storage(k, 4.0, max_offload_h=h) for h in (3.0, 1.0, 0.75)]
    g = [s.grams for s in g if s]
    assert g == sorted(g)


def test_infeasible_deadline_returns_none():
    k = Kit(tuple(CAMERAS), (), MOUNTS, ())
    assert storage(k, 8.0, max_offload_h=0.1) is None


def test_counting_storage_never_raises_variety():
    for b in (1000, 2000, 4000):
        ko = exact_kit(b, KITS, 4.0)
        jk = exact_joint(b, KITS, 4.0)[0]
        assert variety(jk) <= variety(ko)


def test_joint_result_fits_total_budget_and_is_legal():
    for b in (1000, 3000, 4000):
        k, st = exact_joint(b, KITS, 4.0)
        assert total_grams(k, st) <= b and legal(k) and hours(k) >= 4.0


def test_four_kilo_loses_shots_when_storage_counted():
    assert variety(exact_kit(4000, KITS, 4.0)) == 18
    assert variety(exact_joint(4000, KITS, 4.0)[0]) < 18


def test_without_storage_joint_equals_kit_only():
    for b in (1500, 5000):
        assert variety(exact_joint(b, KITS, 4.0, with_storage=False)[0]) == variety(exact_kit(b, KITS, 4.0))


def test_storage_weight_grows_with_trip_length_and_hours():
    k = next(k for k in KITS if any(c.name.startswith("Sony") for c in k.cameras) and legal(k) and hours(k) >= 8)
    g = lambda h, d: storage(k, h, days=d).grams
    assert g(4.0, 3) <= g(4.0, 7) <= g(4.0, 28)
    assert g(2.0, 7) <= g(4.0, 7) <= g(8.0, 7)
