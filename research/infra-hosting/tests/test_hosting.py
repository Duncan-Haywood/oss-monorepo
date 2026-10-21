import numpy as np
import opendssdirect as dss
from infra_hosting import MEASURES, hosting_capacity, open_circuit, violations, random_placement, feeder_peak_kw, with_frozen
from infra_hosting.hosting import _cmd, set_pv


def _pu(bus):
    dss.Circuit.SetActiveBus(bus)
    return np.array(dss.Bus.puVmagAngle()[0::2])


def test_published_ieee13_voltages_with_fixed_taps():
    # Kersting's published case (taps 1.0625 / 1.05 / 1.06875, controls off); values from the IEEE PES test-feeder report, recalled
    open_circuit(MEASURES[0], 1.0)
    _cmd("Transformer.Reg1.Taps=[1.0 1.0625]"); _cmd("Transformer.Reg2.Taps=[1.0 1.0500]"); _cmd("Transformer.Reg3.Taps=[1.0 1.06875]")
    _cmd("Set Controlmode=OFF"); _cmd("Solve")
    for bus, pub in (("632", [1.0210, 1.0420, 1.0174]), ("671", [0.9900, 1.0529, 0.9778]), ("675", [0.9835, 1.0553, 0.9758])):
        assert np.abs(_pu(bus) - pub).max() < 0.003


def test_feeder_peak():
    assert feeder_peak_kw() == 3466.0       # sum of the 15 load kW in the IEEE 13-node case


def test_pv_displaces_source_power():
    names = open_circuit(MEASURES[0], 0.3, {"675a": 1.0})
    violations(); p0 = -dss.Circuit.TotalPower()[0]
    set_pv(names, [400.0]); violations(); p1 = -dss.Circuit.TotalPower()[0]
    assert 380 < p0 - p1 < 420      # 400 kW of PV less the change in losses


def test_pv_raises_voltage_at_light_load():
    names = open_circuit(MEASURES[0], 0.3, {"675a": 1.0, "634a": 1.0})
    v0 = violations()["voltage"]
    set_pv(names, [800.0, 800.0])
    assert violations()["voltage"] > v0


def test_hosting_bracket_is_tight():
    pl = {"671": 0.5, "634a": 0.5}
    h, why = hosting_capacity(MEASURES[0], 0.3, pl)
    names = open_circuit(MEASURES[0], 0.3, {k: 1.0 for k in pl})
    set_pv(names, [h / 2 - 0.0, h / 2]); assert max(violations()[k] for k in ("voltage", "line", "xfmr")) <= 1.0
    set_pv(names, [(h + 40) / 2, (h + 40) / 2]); v = violations(); assert max(v["voltage"], v["line"], v["xfmr"]) > 1.0
    assert why in ("voltage", "xfmr")


def test_volt_var_absorbs_when_voltage_is_high():
    m = [x for x in MEASURES if x.name == "volt-var"][0]
    names = open_circuit(m, 0.3, {"675a": 1.0})
    set_pv(names, [1500.0]); violations()
    dss.Circuit.SetActiveElement(names[0])
    assert dss.CktElement.Powers()[1] > 0       # load convention: positive Q is absorbed


def test_fixed_pf_absorbs_reactive_power():
    m = [x for x in MEASURES if x.name == "fixed pf 0.95"][0]
    names = open_circuit(m, 0.3, {"675a": 1.0})
    set_pv(names, [500.0]); violations(); dss.Circuit.SetActiveElement(names[0])
    P, Q = dss.CktElement.Powers()[:2]
    assert abs(-P / np.hypot(P, Q) - 0.95) < 0.01 and Q > 0


def test_frozen_taps_hold_still():
    m = with_frozen(MEASURES[0])
    names = open_circuit(m, 0.3, {"675a": 1.0})
    taps = []
    for kw in (0.0, 1500.0):
        set_pv(names, [kw]); violations()
        t = []
        for r in ("Reg1", "Reg2", "Reg3"):
            dss.Transformers.Name(r); t.append(dss.Transformers.Tap())
        taps.append(t)
    assert taps[0] == taps[1]


def test_placement_weights_sum_to_one():
    rng = np.random.default_rng(3)
    for _ in range(20):
        pl = random_placement(rng)
        assert 1 <= len(pl) <= 8 and abs(sum(pl.values()) - 1) < 1e-9
