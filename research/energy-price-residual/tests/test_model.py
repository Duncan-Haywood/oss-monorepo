import pytest

from energy_price_residual import (residual_load, isotonic_fit, predict, rmse, cheapest_quarter_mean,
                                   load_year_rows, YEARS)


def test_residual_load_arithmetic():
    assert residual_load(50000, 0.5, 0.25, 40, 20) == pytest.approx(50000 - 20000 - 5000)


def test_isotonic_pools_violations_and_is_monotone():
    fit = isotonic_fit([1, 2, 3, 4], [1.0, 3.0, 2.0, 5.0])
    levels = fit[1]
    assert all(a <= b for a, b in zip(levels, levels[1:]))
    assert predict(fit, 2) == pytest.approx(2.5) and predict(fit, 3) == pytest.approx(2.5)
    assert predict(fit, 0) == pytest.approx(1.0) and predict(fit, 99) == pytest.approx(5.0)


def test_isotonic_exact_on_monotone_data():
    xs = list(range(10))
    ys = [2.0 * v for v in xs]
    fit = isotonic_fit(xs, ys)
    assert [predict(fit, v) for v in xs] == pytest.approx(ys)


def test_rmse_and_cheapest_quarter():
    assert rmse([1, 2, 3], [1, 2, 6]) == pytest.approx(3 ** 0.5)
    assert cheapest_quarter_mean([4, 3, 2, 1, 8, 7, 6, 5]) == pytest.approx(1.5)


def test_every_year_has_8760_rows_and_residual_below_load():
    for y in YEARS:
        rows = load_year_rows(y)
        assert len(rows) == 8760
        assert min(r[0] for r in rows) < max(r[0] for r in rows)
