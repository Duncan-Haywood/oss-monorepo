from house_energy import CLIMATES, Package, Prices, baseline, evaluate, optimise, options
from house_energy.model import ANNUITY, ua_parts, energy


def test_search_space_is_exhaustive():
    assert len(options()) == 4 * 5 * 4 * 4 * 2 == 640 and len(set(options())) == 640


def test_annuity_factor():
    assert abs(ANNUITY - 19.6004) < 1e-3


def test_no_degree_days_no_energy():
    e = energy(baseline(), (0, 0), "gas furnace + AC")
    assert e["annual_cost"] == 0 and e["heat_mmbtu"] == 0


def test_better_envelope_never_raises_ua():
    b = sum(ua_parts(baseline()).values())
    assert sum(ua_parts(Package(attic_r=60)).values()) < b
    assert sum(ua_parts(Package(window_u=0.20)).values()) < b
    assert sum(ua_parts(Package(ach50=1.5)).values()) < b
    assert sum(ua_parts(Package(slab_r=10)).values()) < b
    assert sum(ua_parts(Package(wall="adv 2x6")).values()) < b


def test_optimum_beats_every_package():
    c, s = "Chicago (5A)", "gas furnace + AC"
    best, e = optimise(c, s)
    assert all(evaluate(p, c, s)["npc"] >= e["npc"] - 1e-9 for p in options())
    assert e["npc"] <= evaluate(baseline(), c, s)["npc"]


def test_free_energy_gives_cheapest_package():
    best, e = optimise("Duluth (7)", "heat pump", Prices(energy_mult=0.0))
    cheapest = min(options(), key=lambda p: evaluate(p, "Duluth (7)", "heat pump")["first_cost"])
    assert evaluate(best, "Duluth (7)", "heat pump")["first_cost"] == evaluate(cheapest, "Duluth (7)", "heat pump")["first_cost"]


def test_expensive_energy_buys_more_envelope():
    lo = optimise("Chicago (5A)", "gas furnace + AC", Prices(energy_mult=1.0))[0]
    hi = optimise("Chicago (5A)", "gas furnace + AC", Prices(energy_mult=4.0))[0]
    assert sum(ua_parts(hi).values()) < sum(ua_parts(lo).values())


def test_slab_edge_adds_no_cooling_load():
    hot = (0, 4000)
    a = energy(Package(slab_r=0), hot, "heat pump")["cool_mmbtu"]
    b = energy(Package(slab_r=10), hot, "heat pump")["cool_mmbtu"]
    assert abs(a - b) < 1e-9


def test_cold_climates_save_more_than_mild_ones_with_a_heat_pump():
    sav = {}
    for c in ("Atlanta (3A)", "Duluth (7)"):
        sav[c] = evaluate(baseline(), c, "heat pump")["npc"] - optimise(c, "heat pump")[1]["npc"]
    assert sav["Duluth (7)"] > sav["Atlanta (3A)"]
