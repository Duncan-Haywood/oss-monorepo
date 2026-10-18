from house_energy import CLIMATES, SYSTEMS, Prices, optimise
from house_climatesweep import DIMENSIONS, cdd_line, hdd_line, optimum_at, transitions

GAS = "gas furnace + AC"


def test_sweep_matches_exhaustive_search_in_every_city():
    for c, hc in CLIMATES.items():
        for s in SYSTEMS:
            best, e = optimise(c, s)
            p, npc = optimum_at(*hc, s)
            assert p == best and abs(npc - e["npc"]) < 1e-6


def test_no_degree_days_picks_cheapest_package_with_cheap_wall():
    p, _ = optimum_at(0, 0)
    assert p.wall == "adv 2x6" and p.attic_r == 19 and p.ach50 == 7.0 and p.slab_r == 0 and p.window_u == 0.50


def test_transitions_change_the_package_exactly_there():
    for x, d, a, b in transitions(hdd_line(500), 0, 12000, GAS, step=100):
        before, after = optimum_at(x - 1.0, 500)[0], optimum_at(x + 0.01, 500)[0]
        assert getattr(before, d) == a and getattr(after, d) == b


def test_choices_never_get_worse_with_more_heating_degree_days_at_fixed_cooling():
    ts = transitions(hdd_line(500), 0, 12000, GAS)
    for _, d, a, b in ts:
        assert DIMENSIONS[d].index(b) > DIMENSIONS[d].index(a)


def test_slab_edge_switch_scales_inversely_with_energy_price():
    # the slab edge adds no cooling load, so CDD cannot move its threshold and NPC is linear in HDD x price
    def slab_x(m):
        return next(t[0] for t in transitions(hdd_line(500), 0, 12000, GAS, Prices(energy_mult=m), step=50) if t[1] == "slab_r")
    assert abs(slab_x(1.0) / slab_x(2.0) - 2.0) < 0.01 and abs(slab_x(1.0) / slab_x(4.0) - 4.0) < 0.02


def test_cooling_axis_switches_only_attic_and_air():
    dims = {t[1] for t in transitions(cdd_line(500), 0, 6000, GAS)}
    assert dims <= {"attic_r", "ach50"}


def test_dimension_levels_cover_the_search_space():
    assert {d: len(v) for d, v in DIMENSIONS.items()} == {"wall": 4, "attic_r": 5, "window_u": 4, "ach50": 4, "slab_r": 2}
