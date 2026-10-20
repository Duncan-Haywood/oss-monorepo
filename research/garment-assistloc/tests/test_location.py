import pytest
from garment_assistloc.location import net_change, break_even_ratio, Layout


def test_equal_weights_favour_shank_less_cable_loss():
    # at ratio 1 the waist layout only adds cable loss, so the shank layout is no worse
    assert net_change("shank", 0.3, 4, 1.0) <= net_change("waist", 0.3, 4, 1.0) + 1e-9


def test_high_ratio_favours_waist():
    assert net_change("waist", 0.3, 4, 10.0) < net_change("shank", 0.3, 4, 10.0)


def test_break_even_is_where_they_cross():
    k = break_even_ratio(0.3, 4)
    assert k is not None and k > 1
    assert net_change("shank", 0.3, 4, k) == pytest.approx(net_change("waist", 0.3, 4, k))


def test_worse_cable_raises_break_even():
    assert break_even_ratio(0.3, 4, lay=Layout(bowden_eff=0.6)) > break_even_ratio(0.3, 4, lay=Layout(bowden_eff=0.9))


def test_bad_layout():
    with pytest.raises(ValueError):
        net_change("hip", 0.3, 4, 1.0)
