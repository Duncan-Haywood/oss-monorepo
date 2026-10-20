from garment_teardown.model import SCENARIOS, TRENCH, replica
from garment_comfortcost.cost import CostModel
from garment_wearmix.mix import simplex
from garment_wearpair.pair import FIXED, best_wardrobe, scen_vec, wardrobe_benefit
from garment_wearwrong.wrong import best_noisy, breakeven_error, noisy_benefit

PREM = {"ir_transparent": 12.0, "low_emissivity": 6.0, "white": 0.5}
R = CostModel(replica(TRENCH), SCENARIOS["mid-wage"], PREM)
NOTHIN = tuple(l for l in FIXED if l != "thin")


def test_zero_error_matches_wearpair():
    w = (0.3, 0.3, 0.4)
    g = (("white",), ("low_emissivity", "thick"))
    assert abs(noisy_benefit(g, w, 0.0) - wardrobe_benefit(g, w)) < 1e-9
    assert abs(best_noisy(R, w, 50, 0.0, 2)[1] - best_wardrobe(R, w, 50)[1]) < 1e-9


def test_error_never_helps():
    for w in simplex(3):
        g = best_wardrobe(R, w, 50)[0]
        assert noisy_benefit(g, w, 0.3) <= noisy_benefit(g, w, 0.0) + 1e-9


def test_duplicate_garments_cannot_dilute_errors():
    for w in simplex(3):
        one = noisy_benefit([("white", "thick")], w, 0.4)
        two = noisy_benefit([("white", "thick"), ("thick", "white")], w, 0.4)
        assert abs(one - two) < 1e-9


def test_pure_error_picks_a_wrong_option():
    w = (0.0, 0.0, 1.0)
    assert scen_vec(("thick",))[2] > 0
    assert abs(noisy_benefit([("thick",)], w, 1.0) - 0.0) < 1e-9


def test_worst_mode_is_never_better_than_uniform():
    for w in simplex(3):
        g = [("ir_transparent", "white"), ("low_emissivity", "thick")]
        assert noisy_benefit(g, w, 0.3, "worst") <= noisy_benefit(g, w, 0.3) + 1e-9


def test_breakeven_is_a_valid_error_rate():
    for w in [(0.8, 0.1, 0.1), (0.1, 0.1, 0.8)]:
        e = breakeven_error(R, w, 100, levers=NOTHIN)
        assert e is None or 0.0 <= e <= 1.0
