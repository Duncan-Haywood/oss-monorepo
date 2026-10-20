from garment_teardown.model import SCENARIOS, TRENCH, replica
from garment_comfortcost.cost import CostModel, benefit
from garment_wearmix.mix import (GATE, SCENS, added_retail, best_for_mix, breakeven_share, expected_benefit,
                                 scen_benefit, simplex, subsets)

PREM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}
R = CostModel(replica(TRENCH), SCENARIOS["mid-wage"], PREM)


def test_single_scenario_mix_matches_comfortcost():
    for i, s in enumerate(SCENS):
        w = tuple(1.0 if k == i else 0.0 for k in range(3))
        assert abs(expected_benefit(("white", "thick"), w) - benefit(("white", "thick"), s)) < 1e-9


def test_fixed_ir_loses_in_a_cool_heavy_mix_and_gate_never_loses():
    w = (0.2, 0.0, 0.8)
    assert expected_benefit(("ir_transparent",), w) < 0
    assert all(scen_benefit((GATE,), s) >= 0 for s in SCENS)


def test_gate_costs_the_assumed_multiple():
    assert abs(added_retail(R, (GATE,), 2.0) - 2 * R.added_retail(("ir_transparent",))) < 1e-9


def test_breakeven_matches_zero_crossing():
    p = breakeven_share(("ir_transparent",), SCENS[0], SCENS[2])
    assert 0 < p < 1
    assert abs(expected_benefit(("ir_transparent",), (p, 0.0, 1 - p))) < 1e-9
    assert breakeven_share(("white",), SCENS[1], SCENS[0]) is None


def test_subsets_exclude_conflicts():
    for s in subsets():
        assert not ("thin" in s and "thick" in s) and not (GATE in s and "ir_transparent" in s)


def test_best_respects_budget_and_is_nonnegative():
    for w in simplex(4):
        sub, b, c = best_for_mix(R, w, 20.0)
        assert c <= 20.0 + 1e-9 and b >= 0
    # at a zero budget only levers that save money by assumption (thin) can be chosen
    sub, b, c = best_for_mix(R, (0.3, 0.3, 0.4), 0.0)
    assert c <= 1e-9 and set(sub) <= {"thin", "white"}


def test_simplex_sums_to_one():
    g = simplex(5)
    assert len(g) == 21 and all(abs(sum(w) - 1) < 1e-12 for w in g)
