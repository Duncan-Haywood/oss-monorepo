import pytest

from homebot.sysid import PARAMS, fit, nominal, synthetic_log


def test_recovers_parameters_from_synthetic_steps():
    true = {k: v * f for (k, v), f in zip(nominal().items(), [1.5, 0.85, 1.3, 1.6, 0.9])}
    cmd, meas = synthetic_log(true, seed=3)
    est = fit(cmd, meas)
    for k in PARAMS:
        assert est[k] == pytest.approx(true[k], rel=0.08), k
    assert est["rmse_rad"] < 0.005
