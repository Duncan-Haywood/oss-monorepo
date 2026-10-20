from itertools import product

from garment_teardown.model import SCENARIOS, TRENCH, replica
from garment_comfortcost.cost import LEVERS, SCEN, CostModel, benefit, best_under_budget, cost_per_degree

S = SCENARIOS["mid-wage"]
PREM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}
M = CostModel(TRENCH, S, PREM)


def test_no_levers_no_benefit_no_cost():
    for sc in SCEN:
        assert abs(benefit((), sc)) < 1e-6
    assert M.added_retail(()) == 0.0


def test_signs_match_physics():
    assert benefit(("ir_transparent",), "warm room 28 C") > 1.0
    assert benefit(("ir_transparent",), "cool room 16 C") < -1.0
    assert benefit(("white",), "sunny outdoors 32 C") > 1.0
    assert benefit(("low_emissivity",), "cool room 16 C") > 1.0


def test_joint_benefit_is_not_the_sum():
    a, b = benefit(("ir_transparent",), "warm room 28 C"), benefit(("thin",), "warm room 28 C")
    assert abs(benefit(("ir_transparent", "thin"), "warm room 28 C") - (a + b)) > 0.1


def test_premium_is_linear_and_replica_is_cheaper():
    m2 = CostModel(TRENCH, S, {k: 2 * v for k, v in PREM.items()})
    assert abs(m2.added_retail(("ir_transparent",)) - 2 * M.added_retail(("ir_transparent",))) < 1e-9
    assert CostModel(replica(TRENCH), S, PREM).added_retail(("ir_transparent",)) < M.added_retail(("ir_transparent",))


def test_thickness_pricing():
    assert M.added_retail(("thin",)) < 0 < M.added_retail(("thick",))
    free = CostModel(TRENCH, S, PREM, thickness_exponent=0.0)
    assert abs(free.added_retail(("thin",))) < 1e-9


def test_cost_per_degree_none_without_benefit():
    assert cost_per_degree(M, ("ir_transparent",), "cool room 16 C") is None
    assert cost_per_degree(M, ("ir_transparent",), "warm room 28 C") > 0


def test_budget_search_matches_brute_force_and_is_monotone():
    names = tuple(LEVERS)
    prev = -1.0
    for bud in [0, 10, 40, 100]:
        sub, b, c = best_under_budget(M, "warm room 28 C", bud)
        brute = max((benefit(s, "warm room 28 C") for mask in product([0, 1], repeat=5)
                     for s in [tuple(n for n, k in zip(names, mask) if k)]
                     if not ("thin" in s and "thick" in s) and M.added_retail(s) <= bud + 1e-12), default=0.0)
        assert abs(b - max(brute, 0.0)) < 1e-9 and c <= bud + 1e-9 and b >= prev
        prev = b
