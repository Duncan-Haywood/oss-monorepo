from garment_teardown.model import SCENARIOS, TRENCH, replica
from garment_comfortcost.cost import CostModel
from garment_wearmix.mix import SCENS, best_for_mix, expected_benefit, simplex
from garment_wearpair.pair import best_wardrobe, scen_vec, wardrobe_benefit

PREM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}
R = CostModel(replica(TRENCH), SCENARIOS["mid-wage"], PREM)
FIXED = ("ir_transparent", "low_emissivity", "white", "thin", "thick")


def test_one_garment_wardrobe_equals_wearmix_when_it_never_harms():
    w = (0.2, 0.5, 0.3)
    assert abs(wardrobe_benefit([("white",)], w) - expected_benefit(("white",), w)) < 1e-9


def test_wearer_can_skip_a_harmful_garment():
    w = (0.0, 0.0, 1.0)
    assert expected_benefit(("ir_transparent",), w) < 0
    assert wardrobe_benefit([("ir_transparent",)], w) == 0.0


def test_pair_never_worse_than_one_garment_at_same_budget():
    for w in simplex(4):
        one = best_for_mix(R, w, 30.0, levers=FIXED)[1]
        two = best_wardrobe(R, w, 30.0)[1]
        assert two >= one - 1e-9


def test_pair_respects_total_budget():
    for w in simplex(3):
        g, b, c = best_wardrobe(R, w, 25.0)
        assert c <= 25.0 + 1e-9 and len(g) == 2


def test_scen_vec_has_one_entry_per_scenario():
    assert len(scen_vec(("white",))) == len(SCENS)
