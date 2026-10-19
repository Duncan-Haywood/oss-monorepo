from capture_kit import *
from capture_kit.model import CAMERAS, MOUNTS, PACKS


def test_empty_kit():
    k = Kit((), (), (), ())
    assert variety(k) == 0 and hours(k) == 0 and grams(k) == 0


def test_variety_counts_bands_times_viewpoints():
    k = Kit((CAMERAS[0],), (), (MOUNTS[0], MOUNTS[1]), ())   # 360 cam: bands 14,24; viewpoints pole, stand
    assert variety(k) == 4


def test_lens_needs_body():
    lens = LENSES[0]
    assert bands(Kit((CAMERAS[0],), (lens,), (), ())) == {14, 24}
    assert bands(Kit((CAMERAS[3],), (lens,), (), ())) == {24, 35, 50}


def test_hours():
    k = Kit((CAMERAS[0],), (), (MOUNTS[0],), (PACKS[0],))
    assert hours(k) == (6.9 + 20) / 5.0


def test_illegal_pack_rejected():
    k = Kit((CAMERAS[0],), (), (), (PACKS[3],))
    assert not legal(k)
    assert all(not any(p.wh > 100 for p in exact(b).packs) for b in (3000, 7000))


def test_exact_at_least_greedy_and_within_budget():
    kits = list(all_kits())
    for b in (500, 1500, 3000):
        e, g = exact(b, kits), greedy(b)
        assert grams(e) <= b and grams(g) <= b
        assert score(e) >= score(g)


def test_monotone_in_budget():
    kits = list(all_kits())
    vs = [variety(exact(b, kits)) for b in (500, 1000, 2000, 4000, 7000)]
    assert vs == sorted(vs)


def test_nothing_fits():
    assert exact(50) is None or grams(exact(50)) <= 50


def test_hours_floor_respected():
    kits = list(all_kits())
    for b in (1500, 3000, 5000):
        assert hours(exact(b, kits, 4.0)) >= 4.0


def test_greedy_misses_body_lens_complement():
    kits = list(all_kits())
    assert variety(exact(5000, kits, 4.0)) == 18 > variety(greedy(5000))
