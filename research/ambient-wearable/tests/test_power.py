import pytest
from ambient_wearable.power import Params, avg_current_ma, battery_hours, radio_duty, with_

P = Params()


def test_idle_is_sleep_over_efficiency():
    assert avg_current_ma(P, "idle") == pytest.approx(P.i_sleep_ma / P.supply_eff)


def test_ordering_of_modes():
    h = {m: battery_hours(P, m) for m in ["idle", "push_to_talk", "vad_gate", "always_stream", "raw_stream"]}
    assert h["idle"] > h["push_to_talk"] > h["vad_gate"] > h["always_stream"] > h["raw_stream"]


def test_vad_gate_equals_always_stream_when_always_speaking():
    a = avg_current_ma(with_(P, vad_load=0.0), "vad_gate", 1.0)
    assert a == pytest.approx(avg_current_ma(P, "always_stream"))


def test_mic_floor_bounds_gated_life():
    # even a free CPU and radio cannot beat battery / mic current
    ceiling = P.battery_mah * P.usable_fraction / (P.i_mic_ma / P.supply_eff)
    assert battery_hours(P, "vad_gate", 0.0) < ceiling


def test_radio_duty_capped_and_raw_exceeds_coded():
    assert radio_duty(P, 1e6) == 1.0
    assert radio_duty(P, P.raw_kbps) > radio_duty(P, P.coded_kbps)


def test_bad_mode_raises():
    with pytest.raises(ValueError):
        avg_current_ma(P, "nope")
