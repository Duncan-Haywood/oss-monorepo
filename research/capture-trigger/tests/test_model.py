from capture_trigger.model import (MODES, Trigger, breakeven_rate, expected, lost_head_s, mean_sim, packs_needed,
                                   simulate)

CONT, SLEEP, STBY = MODES
T = Trigger()


def test_continuous_captures_everything_at_full_draw():
    e, share, rec = expected(CONT, T, 6, 30)
    assert share == 1.0 and abs(e - 5.0 * 16) < 1e-9 and rec == 16
    e2, s2, _ = simulate(CONT, T, 6, 30, 1)
    assert s2 == 1.0 and abs(e2 - 80.0) < 1e-6


def test_preroll_covers_the_head_but_sleep_does_not():
    assert lost_head_s(STBY, T) == 0.0
    assert lost_head_s(SLEEP, T) == 7.0


def test_perfect_trigger_with_preroll_captures_all():
    perfect = Trigger(miss=0.0, false_per_h=0.0)
    assert expected(STBY, perfect, 6, 30)[1] == 1.0


def test_energy_rises_with_event_rate_and_never_exceeds_continuous_recording_everywhere():
    es = [expected(SLEEP, T, r, 30)[0] for r in (0, 2, 6, 20)]
    assert es == sorted(es)
    assert expected(SLEEP, T, 1000, 30)[0] <= 5.0 * 16 + 1e-9


def test_simulation_matches_closed_form_energy():
    for m in (SLEEP, STBY):
        e, s, _ = mean_sim(m, T, 6, 30, range(12))
        ee, es, _ = expected(m, T, 6, 30)
        assert abs(e - ee) / ee < 0.08
        assert abs(s - es) < 0.05


def test_breakeven_is_where_energies_cross():
    r = breakeven_rate(STBY, T, 30)
    assert r is not None
    assert abs(expected(STBY, T, r, 30)[0] - expected(CONT, T, 0, 30)[0]) < 1e-3


def test_packs_stay_under_the_carry_on_limit():
    assert packs_needed(80.0) == 1 and packs_needed(99.0) == 1 and packs_needed(100.0) == 2
