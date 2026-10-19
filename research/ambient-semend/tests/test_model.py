import json
from pathlib import Path
import numpy as np
from ambient_semend.model import Pauses, sf, phi, rates, p_cutoff, mean_wait, best, best_fixed, simulate

P = Pauses()
GRID = list(range(50, 1501, 50))
TAUS = [x / 2 for x in range(-6, 7)]


def test_inputs_present():
    inp = json.loads((Path(__file__).resolve().parents[1] / "experiments" / "inputs.json").read_text())
    assert len(inp["asr_ms"]) == 6


def test_phi_and_sf_basics():
    assert abs(phi(0) - 0.5) < 1e-12
    assert abs(sf(P, P.median_ms) - 0.5) < 1e-12


def test_uninformative_cue_has_equal_rates():
    tpr, fpr = rates(0.0, 0.3, 0.0)
    assert abs(tpr - fpr) < 1e-12


def test_blind_cue_when_all_pauses_at_complete_points():
    tpr, fpr = rates(3.0, 0.0, 1.0)
    assert abs(tpr - fpr) < 1e-12


def test_equal_hangovers_reduce_to_fixed():
    assert abs(p_cutoff(P, 2.0, 0.0, 0.3, 500, 500) - (1 - np.exp(-2 * sf(P, 500)))) < 1e-12
    assert abs(mean_wait(2.0, 0.0, 0.3, 500, 500) - 500) < 1e-9


def test_informative_cue_never_worse_than_fixed():
    fixed = best_fixed(P, 0.10)
    b = best(P, 0.0, 0.0, 0.10, GRID, GRID, TAUS)
    assert b[0] >= 0.97 * fixed  # no information: no gain beyond grid slack
    b3 = best(P, 3.0, 0.0, 0.10, GRID, GRID, TAUS)
    assert b3[0] < fixed


def test_better_cue_waits_less():
    w = [best(P, d, 0.2, 0.10, GRID, GRID, TAUS)[0] for d in (0.0, 1.0, 2.0, 4.0)]
    assert all(a >= b - 1e-9 for a, b in zip(w, w[1:]))


def test_closed_form_matches_monte_carlo():
    for d, tau, q in [(2.0, 0.0, 0.0), (1.5, 0.5, 0.3), (3.0, -0.5, 0.5)]:
        c, w = simulate(P, d, tau, q, 300, 900, n=120000, seed=1)
        assert abs(c - p_cutoff(P, d, tau, q, 300, 900)) < 0.01
        assert abs(w - mean_wait(d, tau, q, 300, 900)) < 6.0
