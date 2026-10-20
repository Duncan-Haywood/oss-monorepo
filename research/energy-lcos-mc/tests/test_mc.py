import random
from energy_lcos import TECHS
from energy_lcos_mc import RANGES, win_shares, sample_techs, one_at_a_time
from energy_lcos_mc.mc import RATE, CHARGE


def test_ranges_cover_every_tech_and_bracket_base():
    assert set(RANGES) == set(TECHS)
    for r in RANGES.values():
        for lo, hi in r.values():
            assert lo < hi


def test_draw_deterministic():
    a = sample_techs(random.Random(3))
    b = sample_techs(random.Random(3))
    assert a == b


def test_shares_sum_to_one():
    s = win_shares([4, 100], n=50, seed=1)
    for d in s:
        assert abs(sum(s[d].values()) - 1) < 1e-9


def test_short_and_long_duration_winners_stable():
    s = win_shares([1, 500], n=200, seed=2)
    assert s[1]["li-ion (LFP)"] > 0.9
    assert s[500]["li-ion (LFP)"] == 0 and s[500]["vanadium flow"] == 0


def test_degenerate_ranges_reproduce_base_winner(monkeypatch):
    import energy_lcos_mc.mc as m
    monkeypatch.setattr(m, "RANGES", {k: {f: (1.0, 1.0) for f in v} for k, v in RANGES.items()})
    monkeypatch.setattr(m, "RATE", (0.07, 0.07))
    monkeypatch.setattr(m, "CHARGE", (30.0, 30.0))
    s = m.win_shares([2, 24], n=5, seed=0)
    assert s[2]["li-ion (LFP)"] == 1.0 and s[24]["compressed air (cavern)"] == 1.0


def test_one_at_a_time_monotone_in_cost():
    r = one_at_a_time("li-ion (LFP)", 4)
    assert r["energy_cost"][0] < r["energy_cost"][1]
    assert r["rte"][0] > r["rte"][1]
    assert r["rate"][0] < r["rate"][1]
    assert r["charge_price"][0] < r["charge_price"][1]
