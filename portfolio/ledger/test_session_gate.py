"""Tests for session_gate.py.

A gate that tells sessions to stop is only safe if it is hard to make it say
so. These tests concentrate on that: every condition must independently clear
it, the thresholds must be ones the fleet actually crosses, and the reading
must come from the ledger rather than from constants.

    python3 -m pytest portfolio/ledger/test_session_gate.py
"""

from __future__ import annotations

import yaml

import session_gate as sg


def entry(venture="portfolio", mrr=None, outcomes=()):
    return {"venture": venture, "mrr_end": mrr, "outcomes": list(outcomes)}


# --- the verdict is a conjunction: any single condition clears it -------------


def test_no_op_only_when_every_condition_holds():
    call, _ = sg.verdict(revenue=False, meta=0.9, cadence=2.5)
    assert call == "NO-OP"


def test_recorded_revenue_clears_the_gate():
    call, reasons = sg.verdict(revenue=True, meta=1.0, cadence=10.0)
    assert call == "PROCEED"
    assert "regime has ended" in reasons[0]


def test_venture_work_clears_the_gate():
    """Meta-share below threshold means the fleet is spending on ventures."""
    call, _ = sg.verdict(revenue=False, meta=sg.META_SHARE_THRESHOLD - 0.01, cadence=99.0)
    assert call == "PROCEED"


def test_maintenance_cadence_clears_the_gate():
    call, _ = sg.verdict(revenue=False, meta=1.0, cadence=sg.CADENCE_THRESHOLD_PER_HOUR - 0.01)
    assert call == "PROCEED"


def test_thresholds_are_boundaries_not_ranges():
    """At exactly the threshold the condition still holds — no off-by-one drift."""
    assert sg.verdict(revenue=False, meta=sg.META_SHARE_THRESHOLD, cadence=2.0)[0] == "NO-OP"
    assert sg.verdict(revenue=False, meta=1.0, cadence=sg.CADENCE_THRESHOLD_PER_HOUR)[0] == "NO-OP"


# --- the reading comes from the ledger, not from constants -------------------


def test_meta_share_reads_the_window_not_the_month():
    entries = [entry("some-venture")] * 100 + [entry("portfolio")] * sg.WINDOW
    assert sg.meta_share(entries) == 1.0


def test_meta_share_counts_only_the_portfolio_slug():
    entries = [entry("portfolio")] * 5 + [entry("local-site-studio")] * 5
    assert sg.meta_share(entries, window=10) == 0.5


def test_revenue_detects_any_booked_month():
    assert not sg.revenue_recorded([entry(), entry()])
    assert sg.revenue_recorded([entry(), entry(mrr=1)])


def test_revenue_ignores_zero_which_is_not_revenue():
    assert not sg.revenue_recorded([entry(mrr=0)])


def test_reverification_share_matches_the_phrasing_the_ledger_uses():
    entries = [
        entry(outcomes=["Independently re-verified #222 against main."]),
        entry(outcomes=["Found this was a duplicate of #300."]),
        entry(outcomes=["Shipped the docs fix."]),
        entry(outcomes=[]),
    ]
    assert sg.reverification_share(entries, window=4) == 0.5


def test_empty_ledger_does_not_divide_by_zero():
    assert sg.meta_share([]) == 0.0
    assert sg.reverification_share([]) == 0.0


# --- the thresholds must be ones the fleet crosses ---------------------------


def test_meta_threshold_is_crossable_by_the_real_ledger():
    """A threshold no observed window clears would be a rubber stamp.

    Measured on 2026-08: 25-entry windows span 56%-100%, and 29 of 140 sit
    below 70%. If a future month never crosses it the gate has stopped being
    a reading and become a constant, and this test is where that shows up.
    """
    entries = yaml.safe_load(sg.LEDGER.read_text())["entries"]
    windows = [
        sg.meta_share(entries[i : i + sg.WINDOW], window=sg.WINDOW)
        for i in range(0, len(entries) - sg.WINDOW + 1)
    ]
    assert min(windows) < sg.META_SHARE_THRESHOLD < max(windows)


def test_live_report_is_well_formed():
    r = sg.report(yaml.safe_load(sg.LEDGER.read_text())["entries"], cadence=2.0)
    assert r["verdict"] in {"NO-OP", "PROCEED"}
    assert r["reasons"]
    assert 0.0 <= r["meta_share_recent"] <= 1.0
    assert 0.0 <= r["reverification_share_recent"] <= 1.0
    assert sg.render(r).startswith("Session gate")


def test_break_even_figure_comes_from_the_pinned_snapshot():
    """The gate reports break-even; it must not re-derive or invent it."""
    import json

    expected = json.loads(sg.SNAPSHOT.read_text())["break_even_per_session_usd"]
    assert sg.break_even_per_session() == expected
