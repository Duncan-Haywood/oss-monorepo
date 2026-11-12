"""Checks of the period-aware mixture driver (experiments/m3_period_mixture/run.py) on synthetic data."""
import importlib.util
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'src'))
_sp = importlib.util.spec_from_file_location('m3_period_mixture', HERE / 'experiments' / 'm3_period_mixture' / 'run.py')
pm = importlib.util.module_from_spec(_sp); sys.modules['m3_period_mixture'] = pm; _sp.loader.exec_module(pm)
from dpmpm import DPMPM  # noqa: E402


def test_period_codes_decade_and_half():
    yrs = [1972, 1978, 1980, 1989, 2021, 2024]
    c, n = pm.period_code(yrs, 'decade')
    assert n == 3 and list(c) == [0, 0, 1, 1, 2, 2]
    c, n = pm.period_code(yrs, 'half')
    assert n == 5 and list(c) == [0, 1, 2, 3, 4, 4]


def test_period_variable_lets_mixture_borrow_from_same_period():
    """The item's level differs by period (0.8 in period 0, 0.2 in period 1). One year of period 1 has the
    item missing; a period-aware mixture imputes near 0.2, a year-free one near the pooled 0.5."""
    rng = np.random.default_rng(0)
    n = 4000
    per = rng.integers(0, 2, n)
    y = (rng.random(n) < np.where(per == 0, 0.8, 0.2)).astype(np.int64)
    noise = rng.integers(0, 3, (n, 3))
    held = (per == 1) & (rng.random(n) < 0.3)
    yy = np.where(held, -1, y)
    rows = np.where(held)[0]
    with_p = DPMPM(np.column_stack([noise, per, yy]), [3, 3, 3, 2, 2], K=10, seed=1)
    without = DPMPM(np.column_stack([noise, yy]), [3, 3, 3, 2], K=10, seed=1)
    for m in (with_p, without):
        for _ in range(150):
            m.step()
    p_with = with_p.posterior_prob(rows, 4)[:, 1].mean()
    p_without = without.posterior_prob(rows, 3)[:, 1].mean()
    assert abs(p_with - 0.2) < 0.06
    assert abs(p_without - 0.5) < 0.08
