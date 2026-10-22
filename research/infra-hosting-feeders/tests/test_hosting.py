import numpy as np
import opendssdirect as dss
from infra_hosting_feeders import (FEEDERS, MEASURES, hosting_capacity, open_circuit, violations, random_placement, feeder_peak_kw,
                                   load_names, with_frozen)
from infra_hosting_feeders.hosting import set_pv, pv_terminal


def test_published_total_loads():
    # IEEE PES test-feeder reports: 123-node spot loads total 3,490 kW; 34-node (Mod 1) 1,769 kW
    assert feeder_peak_kw(FEEDERS["123"]) == 3490.0
    assert feeder_peak_kw(FEEDERS["34"]) == 1769.0


def test_published_cases_converge_and_regulate():
    for key in ("34", "123"):
        open_circuit(FEEDERS[key], MEASURES[0], 1.0)
        v = violations(FEEDERS[key])
        assert v["converged"] == 1.0
        # the published 34-node case loads its 500 kVA XFM1 to 1.05 of rating at peak (so the study stays at 0.3 and 0.6 of peak)
        assert v["xfmr"] < (1.06 if key == "34" else 1.0)
    # the 123-node case at full load holds service voltage within ANSI Range A (0.95 to 1.05)
    open_circuit(FEEDERS["123"], MEASURES[0], 1.0); violations(FEEDERS["123"])
    lo = 9.0
    for b in dss.Circuit.AllBusNames():
        if b != "sourcebus":
            dss.Circuit.SetActiveBus(b)
            lo = min([lo] + [x for x in dss.Bus.puVmagAngle()[0::2] if x > 0.1])
    assert lo > 0.95


def test_34_node_as_published_starts_above_limit():
    # the published case sets the source to 1.05 pu, so a regulated bus sits above 1.05 with no PV: hosting capacity is 0
    f = FEEDERS["34"]
    cap, bind, _ = hosting_capacity(f, MEASURES[0], 0.3, {load_names(f)[0]: 1.0})
    assert cap == 0.0 and bind == "base"
    f = FEEDERS["34@1.00"]
    cap, bind, _ = hosting_capacity(f, MEASURES[0], 0.3, {load_names(f)[0]: 1.0})
    assert cap > 0.0


def test_pv_displaces_source_power():
    f = FEEDERS["123"]
    n = load_names(f)[10]
    names = open_circuit(f, MEASURES[0], 0.3, {n: 1.0})
    violations(f); p0 = -dss.Circuit.TotalPower()[0]
    set_pv(names, [300.0]); violations(f); p1 = -dss.Circuit.TotalPower()[0]
    assert 280 < p0 - p1 < 320


def test_capacity_brackets_a_violation():
    f = FEEDERS["123"]
    pl = random_placement(np.random.default_rng(3), load_names(f))
    cap, bind, _ = hosting_capacity(f, MEASURES[0], 0.3, pl)
    names = open_circuit(f, MEASURES[0], 0.3, {n: 1.0 for n in pl})
    w = np.array(list(pl.values())); w = w / w.sum()
    set_pv(names, (cap + 60.0) * w)
    v = violations(f)
    assert bind in ("voltage", "xfmr") and (v["voltage"] > 1.0 or v["xfmr"] > 1.0 or v["converged"] == 0.0)


def test_frozen_taps_do_not_move():
    f = FEEDERS["123"]
    m = with_frozen(MEASURES[0])
    names = open_circuit(f, m, 0.3, {load_names(f)[5]: 1.0})
    violations(f); t0 = [dss.Transformers.Tap() for _ in [dss.Transformers.Name("reg4a")]]
    set_pv(names, [1500.0]); violations(f)
    dss.Transformers.Name("reg4a")
    assert dss.Transformers.Tap() == t0[0]


def test_pv_terminal_line_to_line_load_uses_first_node():
    assert pv_terminal("830.1.2", 1, 24.9) == ("830.1", 1, 24.9 / 3 ** 0.5)
    assert pv_terminal("860", 3, 24.9) == ("860", 3, 24.9)
    assert pv_terminal("9.1", 1, 2.4) == ("9.1", 1, 2.4)


def test_placements_are_valid_and_deterministic():
    nodes = load_names(FEEDERS["123"])
    a = random_placement(np.random.default_rng(1), nodes); b = random_placement(np.random.default_rng(1), nodes)
    assert a == b and abs(sum(a.values()) - 1) < 1e-9 and set(a) <= set(nodes)
