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


# --- stale open-PR-check streak: the same recheck recorded over and over ----
#
# Measured directly on the real ledger on 2026-08-22: a trailing run of 11-21
# consecutive entries included "checked the open PRs, still all correctly
# gated" before the PR set itself next changed. `CLAUDE.md` already says in
# prose not to add a redundant entry; this makes the gate say it too, with
# the count in hand, instead of relying on a session to notice by scrolling
# the ledger tail itself.


def test_stale_pr_check_streak_counts_matching_trailing_entries():
    unchanged = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368) first: all still "
            "correctly human-gated, nothing to consolidate."
        ]
    )
    entries = [unchanged, unchanged, unchanged]
    assert sg.stale_pr_check_streak(entries) == 3


def test_stale_pr_check_streak_stops_at_a_real_finding():
    unchanged = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368) first: all still "
            "correctly human-gated, nothing to consolidate."
        ]
    )
    found_something = entry(outcomes=["Closed a stranded near-duplicate PR, #616."])
    entries = [found_something, unchanged, unchanged]
    assert sg.stale_pr_check_streak(entries) == 2


def test_stale_pr_check_streak_zero_when_latest_entry_found_something():
    found_something = entry(outcomes=["Closed a stranded near-duplicate PR, #616."])
    unchanged = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368) first: all still "
            "correctly human-gated, nothing to consolidate."
        ]
    )
    entries = [unchanged, unchanged, found_something]
    assert sg.stale_pr_check_streak(entries) == 0


def test_stale_pr_check_streak_empty_ledger_is_zero():
    assert sg.stale_pr_check_streak([]) == 0


def test_stale_pr_check_streak_measured_on_the_real_ledger():
    """The real ledger has this pattern *somewhere* in its history -- guard
    against the detector regressing to always-zero on the artifact it exists
    to catch. Checked against every suffix rather than just the current tail,
    because the tail keeps changing entry to entry (this file is append-only
    and several sessions land per hour) -- pinning to "the last entry" or
    "the last N" would make this test flake as soon as the next session's
    entry lands, which is exactly the kind of churn the gate has to tolerate
    rather than assume away.
    """
    entries = yaml.safe_load(sg.LEDGER.read_text())["entries"]
    longest = max(
        (sg.stale_pr_check_streak(entries[: i + 1]) for i in range(len(entries))),
        default=0,
    )
    assert longest >= sg.STALE_PR_STREAK_THRESHOLD


def test_report_adds_a_stale_streak_reason_only_at_or_above_threshold():
    unchanged = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368) first: all still "
            "correctly human-gated, nothing to consolidate."
        ]
    )
    below = sg.report([unchanged] * (sg.STALE_PR_STREAK_THRESHOLD - 1), cadence=0.1)
    at = sg.report([unchanged] * sg.STALE_PR_STREAK_THRESHOLD, cadence=0.1)
    assert not any("in a row included" in reason for reason in below["reasons"])
    assert any("in a row included" in reason for reason in at["reasons"])


def test_report_stale_streak_reason_does_not_flip_the_verdict():
    unchanged = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368) first: all still "
            "correctly human-gated, nothing to consolidate."
        ]
    )
    r = sg.report([unchanged] * sg.STALE_PR_STREAK_THRESHOLD, cadence=0.1)
    assert r["verdict"] == "PROCEED"


def test_render_shows_the_stale_streak_count():
    entries = [entry()] * sg.WINDOW
    r = sg.report(entries, cadence=2.0)
    rendered = sg.render(r)
    assert "stale open-PR-check streak" in rendered


# --- a stale (un-fetched) origin/main must not manufacture a false PROCEED ---
#
# Distinct failure mode from shallow truncation above: a fresh session's
# `origin/main` can point at a commit that is simply old (days or weeks
# stale), not depth-truncated. Its reachable history is deep, so
# `history_span_hours` reads it as reliable, while `--since=24 hours ago`
# against that stale tip correctly finds nothing in *its* last 24 hours and
# reports 0.00 sessions/hour -- a real answer computed against the wrong
# commit. Measured live on 2026-08-22: a fresh checkout's `origin/main` sat at
# a 2026-07-29 commit, 878 commits behind the true tip. Fetching before
# reading is the only fix; these tests cover that fetch and its wiring.


def test_refresh_origin_main_true_on_success(monkeypatch):
    import subprocess

    monkeypatch.setattr(
        sg.subprocess,
        "run",
        lambda *a, **k: subprocess.CompletedProcess([], 0),
    )
    assert sg.refresh_origin_main() is True


def test_refresh_origin_main_false_on_nonzero_exit(monkeypatch):
    import subprocess

    monkeypatch.setattr(
        sg.subprocess,
        "run",
        lambda *a, **k: subprocess.CompletedProcess([], 1),
    )
    assert sg.refresh_origin_main() is False


def test_refresh_origin_main_false_when_offline(monkeypatch):
    import subprocess

    def raises(*a, **k):
        raise subprocess.TimeoutExpired(cmd="git fetch", timeout=20)

    monkeypatch.setattr(sg.subprocess, "run", raises)
    assert sg.refresh_origin_main() is False


def test_report_surfaces_whether_origin_was_fetched():
    entries = [entry("portfolio")] * sg.WINDOW
    fetched = sg.report(entries, cadence=2.0, origin_fetched=True)
    stale = sg.report(entries, cadence=2.0, origin_fetched=False)
    assert fetched["origin_fetched"] is True
    assert stale["origin_fetched"] is False


def test_render_flags_a_failed_fetch_distinctly_from_shallow_truncation():
    entries = [entry("portfolio")] * sg.WINDOW
    r = sg.report(entries, cadence=0.0, cadence_reliable=False, origin_fetched=False)
    rendered = sg.render(r)
    assert "git fetch origin main` failed" in rendered
    assert "stale by days or weeks" in rendered
    # the shallow-truncation note is a different diagnosis; don't show both
    assert "truncate `git log" not in rendered


def test_main_does_not_trust_a_reading_the_fetch_could_not_refresh(monkeypatch, capsys):
    """Reproduces the exact live bug: a stale `origin/main` reads as a reliable
    0.00 sessions/hour (deep-but-old history passes `history_span_hours`), which
    would clear the gate to PROCEED unless the failed fetch overrides it."""
    monkeypatch.setattr(sg, "refresh_origin_main", lambda: False)
    monkeypatch.setattr(sg, "sessions_per_hour", lambda: (0.0, True))
    monkeypatch.setattr(sg, "max_concurrent_sessions", lambda *_a, **_k: 0)
    monkeypatch.setattr(sg, "commits_with_sessions", lambda *_a, **_k: [])
    monkeypatch.setattr(sg, "load_entries", lambda *_a, **_k: [entry("portfolio")] * sg.WINDOW)
    monkeypatch.setattr(sg.sys, "argv", ["session_gate.py"])

    sg.main()

    out = capsys.readouterr().out
    assert "VERDICT: NO-OP" in out
    assert "git fetch origin main` failed" in out
