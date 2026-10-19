from dataclasses import replace

from capture_wake.model import Trigger, expected, mean_sim, p_detect, packs_needed, simulate, strategies

T = Trigger()
IND, SLP, SBY, ANY = strategies(4)


def test_one_camera_strategies_agree():
    one = strategies(1)
    es = [expected(s, T, 6, 30)[0] for s in one]
    assert max(es) - min(es) < 1e-9


def test_shared_standby_sentinel_costs_the_same_as_independent_with_no_false_alarms():
    t = replace(T, false_per_h=0.0)
    assert abs(expected(IND, t, 6, 30)[0] - expected(SBY, t, 6, 30)[0]) < 1.0


def test_sleepers_use_less_energy_and_capture_less():
    assert expected(SLP, T, 6, 30)[0] < expected(SBY, T, 6, 30)[0]
    assert expected(SLP, T, 6, 30)[1] < expected(SBY, T, 6, 30)[1]


def test_any_of_n_multiplies_false_alarm_energy():
    t0 = replace(T, false_per_h=0.0)
    t40 = replace(T, false_per_h=40.0)
    d_any = expected(ANY, t40, 6, 30)[0] - expected(ANY, t0, 6, 30)[0]
    d_sby = expected(SBY, t40, 6, 30)[0] - expected(SBY, t0, 6, 30)[0]
    assert d_any > 3 * d_sby


def test_p_detect_limits():
    assert abs(p_detect(T, 1) - 0.9) < 1e-12
    assert abs(p_detect(replace(T, common=0.1), 4) - 0.9) < 1e-12   # fully shared miss: more detectors do not help
    assert p_detect(T, 4) > 0.999


def test_simulation_matches_closed_form_for_energy_and_share():
    for st in (IND, SLP, SBY, ANY):
        wh, mean, _, _ = mean_sim(st, T, 6, 30, range(20))
        ewh, emean, _ = expected(st, T, 6, 30)
        assert abs(wh - ewh) / ewh < 0.06, st.name
        assert abs(mean - emean) < 0.04, st.name


def test_independent_triggers_fragment_the_rig_but_sentinel_does_not():
    _, _, every_ind, any_ind = mean_sim(IND, T, 6, 30, range(20))
    _, _, every_sby, _ = mean_sim(SBY, T, 6, 30, range(20))
    assert every_ind < 0.75 < every_sby and any_ind > 0.99


def test_perfect_trigger_standby_captures_all_and_is_deterministic():
    perfect = Trigger(miss=0.0, false_per_h=0.0)
    assert simulate(SBY, perfect, 6, 30, 3)[2] == 1.0
    assert simulate(IND, T, 6, 30, 5) == simulate(IND, T, 6, 30, 5)


def test_packs():
    assert packs_needed(98.0) == 1 and packs_needed(99.0) == 1 and packs_needed(99.5) == 2
