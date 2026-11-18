"""Milestone 148: a routed-pilot tau-b guard on the clipped ladder at ff, replayed on milestones 144 to 147."""
import importlib.util
import random
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load():
    spec = importlib.util.spec_from_file_location("verified_dse_t148", EXP / "pilot_tau_ff" / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_pool_is_deduplicated_and_complete():
    m = _load()
    P = m.pool()
    designs = [x for _, x, _, _ in P]
    assert len(designs) == len(set(designs)) == 77
    assert all(len(rs) <= 120 for *_, rs in P)


def test_never_fall_back_with_full_budget_equals_top_k():
    """GC(p, -1) never falls back."""
    m = _load()
    rs = [{"status": "ok", "period_ns": 10.0, "synth_netlist_wns": 0.0, "synth_netlist_area": a,
           "final_area_notap": a, "final_wns": 0.0, "r1_cells": 1, "r1_depth": 1, "detail_place_area": 1, "detail_place_wns": 0.0} for a in range(1, 41)]
    reg, fell = m.guard(rs, 12, 3, -1, "t")
    assert fell == 0.0
    assert reg >= 0.0
    # perfectly concordant rung: the best point is either in the pilot or first in the r2c ranking, so regret is 0
    assert reg == 0.0


def test_always_fall_back_matches_random_count():
    m = _load()
    rs = [{"status": "ok", "period_ns": 10.0, "synth_netlist_wns": 0.0, "synth_netlist_area": a,
           "final_area_notap": 41 - a, "final_wns": 0.0, "r1_cells": 1, "r1_depth": 1, "detail_place_area": 1, "detail_place_wns": 0.0} for a in range(1, 41)]
    _, fell = m.guard(rs, 12, 4, 0.0, "t")  # fully discordant rung: tau-b = -1 on every pilot
    assert fell == 1.0


def test_results_report_the_registered_outcome():
    txt = (EXP / "pilot_tau_ff" / "results.txt").read_text()
    assert "(1) PRIMARY: LOMO guard pooled mean regret below SWC's: False (4.21 against 2.98)" in txt
    assert "(5) LOMO guard better than random on more designs than worse: True (56 to 17)" in txt
