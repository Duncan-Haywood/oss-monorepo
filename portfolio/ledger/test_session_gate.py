"""Tests for session_gate.py.

A gate that tells sessions to stop is only safe if it is hard to make it say
so. These tests concentrate on that: every condition must independently clear
it, the thresholds must be ones the fleet actually crosses, and the reading
must come from the ledger rather than from constants.

    python3 -m pytest portfolio/ledger/test_session_gate.py
"""

from __future__ import annotations

import time

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


# --- burst detection: a 24h average hides same-window collisions -------------


def test_max_concurrent_sessions_counts_distinct_sessions_in_the_window():
    """Three sessions inside 15 minutes is the shape the 2026-08-21 collisions had."""
    commits = [(0, "session_a"), (300, "session_b"), (600, "session_c")]
    assert sg.max_concurrent_sessions(commits, window_minutes=15) == 3


def test_max_concurrent_sessions_ignores_repeat_commits_from_one_session():
    """A session that commits twice is still one session, not two."""
    commits = [(0, "session_a"), (60, "session_a"), (120, "session_a")]
    assert sg.max_concurrent_sessions(commits, window_minutes=15) == 1


def test_max_concurrent_sessions_takes_the_earliest_commit_per_session():
    """A session's window position is set by when it started, not its last push."""
    commits = [(0, "session_a"), (2000, "session_a"), (100, "session_b")]
    # session_a's earliest commit is t=0; session_b at t=100 is within 15min of
    # that, so both count together even though session_a's later commit (2000s
    # ~= 33min) would not be.
    assert sg.max_concurrent_sessions(commits, window_minutes=15) == 2


def test_max_concurrent_sessions_does_not_bridge_across_a_wide_gap():
    commits = [(0, "session_a"), (3600, "session_b")]  # one hour apart
    assert sg.max_concurrent_sessions(commits, window_minutes=15) == 1


def test_max_concurrent_sessions_empty_is_zero():
    assert sg.max_concurrent_sessions([]) == 0


def test_report_adds_a_burst_reason_only_at_or_above_threshold():
    entries = [entry()] * sg.WINDOW
    below = sg.report(entries, cadence=0.1, burst=sg.BURST_THRESHOLD_SESSIONS - 1)
    at = sg.report(entries, cadence=0.1, burst=sg.BURST_THRESHOLD_SESSIONS)
    assert not any("within a" in reason for reason in below["reasons"])
    assert any("within a" in reason for reason in at["reasons"])


def test_report_burst_reason_does_not_flip_the_verdict():
    """Burst is a caution added to the reasons, not a new gate condition."""
    entries = [entry()] * sg.WINDOW
    r = sg.report(entries, cadence=0.1, burst=10)
    assert r["verdict"] == "PROCEED"


def test_commits_with_sessions_parses_multiline_bodies():
    """Regression guard: %B bodies contain newlines, so the record delimiter
    must not be one — this is why %x01/%x02 are used instead of whitespace."""
    import subprocess
    from unittest.mock import patch

    fake_stdout = (
        "1700000000\x01Ledger: record #1\n\nsession_abc123 did the work\x02"
        "1700000100\x01Unrelated commit with no session trailer\x02"
    )
    with patch.object(
        subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout=fake_stdout)
    ):
        pairs = sg.commits_with_sessions(hours=6)
    assert pairs == [(1700000000, "session_abc123")]


# --- a shallow clone must not manufacture a false PROCEED ---------------------
#
# `git log --since` on a shallow clone returns whatever commits the shallow
# fetch happened to include, not an error -- so an undercounted cadence looks
# exactly like a genuinely low one. Measured on this session's own as-cloned
# checkout: session_gate.py read 0.00 sessions/hour before the clone was
# deepened, on a period the ledger shows ran at roughly 2.7/hour.


def test_history_span_hours_from_timestamps():
    now = time.time()
    assert abs(sg.history_span_hours([now - 3600 * 5]) - 5) < 0.01


def test_history_span_hours_uses_the_oldest_timestamp():
    now = time.time()
    assert abs(sg.history_span_hours([now - 3600 * 2, now - 3600 * 9]) - 9) < 0.01


def test_history_span_hours_empty_is_zero():
    assert sg.history_span_hours([]) == 0.0


def test_unreliable_cadence_does_not_clear_the_gate():
    """Same (falsely low) cadence reading; only the reliable one may PROCEED on it."""
    entries = [entry("portfolio")] * sg.WINDOW  # meta_share = 1.0, no revenue recorded
    reliable = sg.report(entries, cadence=0.0, cadence_reliable=True)
    unreliable = sg.report(entries, cadence=0.0, cadence_reliable=False)
    assert reliable["verdict"] == "PROCEED"
    assert unreliable["verdict"] == "NO-OP"
    assert unreliable["sessions_per_hour"] == 0.0  # still reported, just not trusted
    assert not unreliable["cadence_reliable"]


def test_render_flags_unreliable_cadence_visibly():
    entries = [entry("portfolio")] * sg.WINDOW
    r = sg.report(entries, cadence=0.0, cadence_reliable=False)
    rendered = sg.render(r)
    assert "undercounted" in rendered
    assert "shallow clone" in rendered


def test_sessions_per_hour_flags_unreliable_on_a_shallow_history(monkeypatch):
    """Local history only reaches back 1h of a requested 24h window -> unreliable."""
    now = time.time()

    def fake_run(cmd, **kwargs):
        class Result:
            pass

        result = Result()
        if "--pretty=%B" in cmd:
            result.stdout = ""  # no session trailers found in the truncated window
        else:
            result.stdout = str(int(now - 3600))  # one commit, 1h old
        return result

    monkeypatch.setattr(sg.subprocess, "run", fake_run)
    cadence, reliable = sg.sessions_per_hour(hours=24)
    assert reliable is False
    assert cadence == 0.0


def test_sessions_per_hour_trusts_history_that_covers_the_window(monkeypatch):
    now = time.time()

    def fake_run(cmd, **kwargs):
        class Result:
            pass

        result = Result()
        if "--pretty=%B" in cmd:
            result.stdout = "Claude-Session: https://claude.ai/code/session_abc123\n"
        else:
            result.stdout = str(int(now - 3600 * 30))  # 30h of real history
        return result

    monkeypatch.setattr(sg.subprocess, "run", fake_run)
    cadence, reliable = sg.sessions_per_hour(hours=24)
    assert reliable is True
    assert cadence == 1 / 24
