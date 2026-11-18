import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import prior_ladder as pl


def test_share_hand_counted():
    assert pl.share(10.0, 8.0, 6.0) == 0.5      # gain 4 of 4 -> (10-8)/(10-6)
    assert pl.share(10.0, 10.0, 6.0) == 0.0     # keeps nothing
    assert pl.share(10.0, 12.0, 6.0) == -0.5    # worse than baseline
    assert pl.share(10.0, 9.0, 11.0) is None    # full model has no gain


def test_ladder_nested_and_full_matches_boosted_features():
    names = list(pl.LADDER)
    for a, b in zip(names, names[1:]):
        assert set(pl.LADDER[a]) <= set(pl.LADDER[b])
    assert set(pl.LADDER["all"]) == {"log_cost", "desc_len", "month", "dow", "permit_type", "work_class", "area"}
