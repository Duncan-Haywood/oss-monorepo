from dataclasses import replace

from house_schedule import Params
from house_shellvalue import breakeven_price, premium_dollars, shell_value
from house_offsite import Process


def test_breakeven_is_premium_over_share():
    assert breakeven_price(0.5, 1000) == 200_000
    assert breakeven_price(0.0, 1000) is None
    assert breakeven_price(-0.1, 1000) is None


def test_dollars_scale_with_price():
    a = shell_value(n=200, price=300_000)
    b = shell_value(n=200, price=600_000)
    assert abs(b["interest_saved"] - 2 * a["interest_saved"]) < 1e-6
    assert a["interest_pct_saved"] == b["interest_pct_saved"]


def test_ordering_early_makes_the_shell_save_more():
    late = shell_value(n=300)
    early = shell_value(n=300, order_early=True)
    assert early["days_saved"] > late["days_saved"]


def test_zero_interest_rate_saves_nothing():
    r = shell_value(replace(Params(), rate=0.0), n=100)
    assert r["interest_saved"] == 0.0


def test_free_crane_lowers_premium():
    assert premium_dollars(replace(Process(), crane_day_cost=0.0)) < premium_dollars()
