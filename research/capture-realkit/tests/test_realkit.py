import math
from capture_realkit import *
from capture_realkit.model import CAMERAS, LENSES, MOUNTS, PACKS


def by(items, prefix):
    return next(i for i in items if i.name.startswith(prefix))


def test_every_device_has_a_source():
    for item in CAMERAS + LENSES + MOUNTS + PACKS:
        assert item.name in SOURCES or item.name in ("selfie pole", "mini tripod", "telescoping mast") \
            or "illustrative" in item.name


def test_sourced_energy_matches_mah_and_voltage():
    assert math.isclose(by(CAMERAS, "Insta360").wh, 2.29 * 3.85, abs_tol=0.1)
    assert math.isclose(by(CAMERAS, "iPhone").wh, 4.441 * 3.87, abs_tol=0.1)
    assert math.isclose(by(CAMERAS, "Sony").wh, 2.28 * 7.2, abs_tol=0.1)


def test_draw_matches_rated_runtime():
    x4 = by(CAMERAS, "Insta360")
    assert math.isclose(x4.wh / x4.watts * 60, 135, rel_tol=0.03)
    dji = by(CAMERAS, "DJI")
    assert math.isclose(dji.wh / dji.watts * 60, 160, rel_tol=0.03)


def test_real_batteries_legal_and_160_never_picked():
    assert all(c.wh <= 100 for c in CAMERAS)
    assert not any(legal(Kit((), (), (), (p,))) for p in PACKS if p.wh > 100)
    for b in (3000, 7000):
        assert all(p.wh <= 100 for p in exact(b).packs)


def test_lens_needs_body():
    lens = LENSES[0]
    assert bands(Kit((by(CAMERAS, "Insta360"),), (lens,), (), ())) == {14, 24}
    assert bands(Kit((by(CAMERAS, "Sony"),), (lens,), (), ())) == {24, 35, 50}


def test_exact_at_least_greedy_and_monotone():
    kits = list(all_kits())
    vs = []
    for b in (500, 1500, 3000, 5000):
        e, g = exact(b, kits), greedy(b)
        assert grams(e) <= b and grams(g) <= b and score(e) >= score(g)
        vs.append(variety(e))
    assert vs == sorted(vs)


def test_hours_floor_respected():
    kits = list(all_kits())
    for b in (1500, 3000, 5000):
        assert hours(exact(b, kits, 4.0)) >= 4.0


def test_full_coverage_needs_body_and_telephoto():
    k = exact(5000, list(all_kits()), 4.0)
    assert variety(k) == 18 and any(c.lens_mount for c in k.cameras)
