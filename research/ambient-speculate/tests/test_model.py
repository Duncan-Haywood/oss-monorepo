import json
from pathlib import Path
import numpy as np
from ambient_speculate.model import (Pauses, sf, p_any, chains, delta, baseline, hold, eager,
                                     extra_runs_hold, talkover_eager, simulate)

INP = json.loads((Path(__file__).resolve().parents[1] / "experiments" / "inputs.json").read_text())
C, D, P = chains(INP), delta(INP), Pauses()


def test_inputs_are_six_utterances_and_chain_is_sum():
    assert len(C) == 6
    assert C[0] == 308 + 375 + 120


def test_sf_is_half_at_median_and_decreasing():
    assert abs(sf(P, P.median_ms) - 0.5) < 1e-12
    assert sf(P, 100) > sf(P, 400) > sf(P, 1500)


def test_baseline_matches_pipeline_budget_median():
    # ambient-pipeline reported 1034 ms median at the 300 ms hangover (measured offset 51 ms there)
    assert abs(np.median(baseline(C, 51.0, 300)) - 1034) < 1


def test_hold_never_slower_than_baseline_and_never_before_endpoint():
    for S in (50, 150, 250):
        r = hold(C, D, S, 800)
        assert (r <= baseline(C, D, 800) + 1e-9).all()
        assert (r >= 800 + D - 1e-9).all()


def test_hold_with_s_at_least_h_is_baseline():
    assert np.allclose(hold(C, D, 800, 800), baseline(C, D, 800))


def test_hold_reaches_the_floor_when_chain_hides_in_hangover():
    # S + C <= H  => reply is exactly the endpoint time
    assert np.allclose(hold(C, D, 100, 2000), 2000 + D)


def test_eager_is_fastest_and_extra_runs_grow_as_s_shrinks():
    assert (eager(C, D, 200) <= hold(C, D, 200, 800)).all()
    assert extra_runs_hold(P, 100, 800) > extra_runs_hold(P, 300, 800) > extra_runs_hold(P, 700, 800) >= 0


def test_closed_forms_match_monte_carlo():
    cut, ext, tov = simulate(P, C, D, 200, 500, n=60000)
    assert abs(cut - float(p_any(P, 500))) < 0.01
    assert abs(ext - extra_runs_hold(P, 200, 500)) < 0.015
    assert abs(tov - talkover_eager(P, C, D, 200)) < 0.01


def test_just_in_time_start_hides_every_chain():
    H = 1000
    S = H - C.max()
    assert np.allclose(hold(C, D, S, H), H + D)
    assert extra_runs_hold(P, S, H) < extra_runs_hold(P, 100, H)
