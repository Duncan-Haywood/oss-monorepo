"""Rule B, the margin-backoff rule (research/grid-linopf, 2026-11-17): scaling, the shift leaves
vlin.MARGIN untouched, and the rule keeps the frozen margins where the shifted OPF solves."""
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
pytest.importorskip("clarabel")
from pypower.idx_brch import RATE_A  # noqa: E402
from pypower.idx_bus import VMAX, VMIN  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments"))
import run_backoff  # noqa: E402


def test_scaled_halves_every_family():
    for k in range(4):
        m = run_backoff.scaled(k)
        assert set(m) == set(vlin.MARGIN)
        for f, v in vlin.MARGIN.items():
            assert m[f] == pytest.approx(v / 2 ** k)


def test_with_margin_shifts_by_the_given_margin_and_restores_MARGIN():
    before = dict(vlin.MARGIN)
    ppc = load_m(case_path("case14_ieee", "api"))
    m = run_backoff.scaled(1)
    p = run_backoff.with_margin(ppc, m)
    assert vlin.MARGIN == before
    on = ppc["branch"][:, RATE_A] > 0
    assert np.allclose(p["branch"][on, RATE_A], ppc["branch"][on, RATE_A] * (1 - m["load"]))
    assert np.allclose(p["bus"][:, VMAX], ppc["bus"][:, VMAX] - m["v"])
    assert np.allclose(p["bus"][:, VMIN], ppc["bus"][:, VMIN] + m["v"])


def test_rule_keeps_frozen_margins_when_shifted_opf_solves(monkeypatch):
    calls = []

    def fake_solve(ppc, solver):
        calls.append(solver)
        return {"ok": True, "f": 100.0, "secs": 0.0}

    monkeypatch.setattr(run_backoff, "solve", fake_solve)
    k, log = run_backoff.rule_b(load_m(case_path("case14_ieee", "typ")))
    assert k is None and log["decision"] == "frozen"
    assert log["panel"] == ["pips", "ipopt"]


def test_rule_backs_off_to_first_solvable_k(monkeypatch):
    seen = {"n": 0}

    def fake_solve(ppc, solver):
        seen["n"] += 1
        # unshifted: both solve (calls 1, 2); then fail k = 0 on both, solve k = 1 on PIPS
        if seen["n"] <= 2:
            return {"ok": True, "f": 100.0, "secs": 0.0}
        if seen["n"] <= 4:
            return {"ok": False, "f": None, "secs": 0.0}
        return {"ok": True, "f": 101.0, "secs": 0.0}

    monkeypatch.setattr(run_backoff, "solve", fake_solve)
    k, log = run_backoff.rule_b(load_m(case_path("case14_ieee", "typ")))
    assert k == 1 and log["decision"] == "k=1"
    assert log["tries"][-1]["pips"]["gap_pct"] == pytest.approx(1.0)


def test_rule_declines_without_a_panel(monkeypatch):
    monkeypatch.setattr(run_backoff, "solve", lambda ppc, s: {"ok": False, "f": None, "secs": 0.0})
    k, log = run_backoff.rule_b(load_m(case_path("case14_ieee", "typ")))
    assert k is None and log["panel"] == []
