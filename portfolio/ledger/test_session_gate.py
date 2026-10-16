"""Tests for session_gate.py.

A gate that tells sessions to stop is only safe if it is hard to make it say
so. These tests concentrate on that: every condition must independently clear
it, the thresholds must be ones the fleet actually crosses, and the reading
must come from the ledger rather than from constants.

    python3 -m pytest portfolio/ledger/test_session_gate.py
"""

from __future__ import annotations

import sys
import time

import pytest
import yaml

import session_gate as sg


def entry(venture="portfolio", mrr=None, outcomes=()):
    return {"venture": venture, "mrr_end": mrr, "outcomes": list(outcomes)}


# --- the verdict routes into a lane; it never stops a session ----------------


TARGET = {
    "slug": "some-candidate",
    "name": "Some candidate",
    "doc": "candidates/some-candidate.md",
    "composite": 7.0,
    "graduate_as": "venture",
}


def test_the_gate_never_returns_a_stop():
    """The saturated case routes to BUILD. NO-OP is gone; nothing may reinstate it."""
    call, _ = sg.verdict(revenue=False, meta=0.9, cadence=2.5, targets=[TARGET])
    assert call == "BUILD"
    calls = {
        sg.verdict(revenue=r, meta=m, cadence=c, cadence_reliable=rel, targets=t)[0]
        for r in (True, False)
        for m in (0.0, sg.META_SHARE_THRESHOLD, 1.0)
        for c in (0.0, 99.0)
        for rel in (True, False)
        for t in ([], [TARGET])
    }
    assert calls <= {"BUILD", "PROCEED"}
    assert "NO-OP" not in calls


def test_recorded_revenue_routes_to_the_earning_venture():
    call, reasons = sg.verdict(revenue=True, meta=1.0, cadence=10.0)
    assert call == "PROCEED"
    assert "earning" in reasons[0]


def test_venture_work_proceeds_as_briefed():
    """Meta-share below threshold means the fleet is spending on ventures."""
    call, reasons = sg.verdict(
        revenue=False, meta=sg.META_SHARE_THRESHOLD - 0.01, cadence=99.0
    )
    assert call == "PROCEED"
    assert "Deploy-first" in " ".join(reasons)


def test_meta_threshold_is_a_boundary_not_a_range():
    """At exactly the threshold the condition still holds — no off-by-one drift."""
    at = sg.verdict(revenue=False, meta=sg.META_SHARE_THRESHOLD, cadence=2.0, targets=[TARGET])
    assert at[0] == "BUILD"


def test_cadence_no_longer_participates_in_the_verdict():
    """The regression this rewrite exists for.

    Cadence was the only input derived from `git log`, so on a shallow clone it
    was unmeasurable, its PROCEED branch was skipped rather than cleared, and
    the session fell through to a stop. Two containers seconds apart returned
    opposite verdicts on identical ledger facts. Whatever cadence says now, and
    whether or not it is trustworthy, the lane must not move.
    """
    lanes = {
        sg.verdict(
            revenue=False, meta=1.0, cadence=c, cadence_reliable=rel, targets=[TARGET]
        )[0]
        for c in (0.0, 0.5, sg.CADENCE_THRESHOLD_PER_HOUR, 99.0)
        for rel in (True, False)
    }
    assert lanes == {"BUILD"}


def test_build_names_the_candidate_to_start():
    _, reasons = sg.verdict(revenue=False, meta=1.0, cadence=2.0, targets=[TARGET])
    joined = " ".join(reasons)
    assert "some-candidate" in joined
    assert "candidates/some-candidate.md" in joined
    assert "Deploy-first" in joined
    assert "deploy-settings" in joined


def test_build_falls_back_to_researching_a_new_candidate():
    """An empty pipeline is a reason to research one, not a reason to stop."""
    call, reasons = sg.verdict(revenue=False, meta=1.0, cadence=2.0, targets=[])
    assert call == "BUILD"
    assert "screened-out.md" in " ".join(reasons)


def test_proceed_also_surfaces_an_empty_pipeline():
    """PROCEED (low meta-work) is the common lane, and until now it never
    looked at the pipeline -- "screen a fresh niche" only reached a session
    through the BUILD branch, which fires on *high* meta-work share. An
    empty build-now queue should reach the common case too, not only the
    rare one -- pointed at consolidation first, since 2026-10-16, rather
    than at one more clone (docs/reports/2026-10-16-calculator-glut.md).
    """
    call, reasons = sg.verdict(
        revenue=False, meta=sg.META_SHARE_THRESHOLD - 0.01, cadence=2.0, targets=[]
    )
    assert call == "PROCEED"
    joined = " ".join(reasons)
    assert "screened-out.md" in joined
    assert "consolidate" in joined.lower()
    assert "new ventures rank first" not in joined.lower()


def test_proceed_stays_quiet_when_the_pipeline_still_has_a_target():
    call, reasons = sg.verdict(
        revenue=False, meta=sg.META_SHARE_THRESHOLD - 0.01, cadence=2.0, targets=[TARGET]
    )
    assert call == "PROCEED"
    assert "screened-out.md" not in " ".join(reasons)


def test_proceed_does_not_treat_an_unreadable_pipeline_as_empty(monkeypatch):
    """Same distinction as the BUILD branch: None (could not read) must not be
    laundered into [] (read it, nothing eligible) here either."""
    monkeypatch.setattr(sg, "build_targets", lambda: None)
    call, reasons = sg.verdict(revenue=False, meta=sg.META_SHARE_THRESHOLD - 0.01, cadence=2.0)
    assert call == "PROCEED"
    assert "screened-out.md" not in " ".join(reasons)


def test_build_targets_skips_what_has_already_graduated(tmp_path, monkeypatch):
    """Graduation is a fact on disk: a VENTURE.yaml, or a product_lines entry."""
    (tmp_path / "portfolio" / "pipeline").mkdir(parents=True)
    (tmp_path / "ventures" / "graduated").mkdir(parents=True)
    (tmp_path / "ventures" / "host").mkdir(parents=True)
    (tmp_path / "ventures" / "graduated" / "VENTURE.yaml").write_text("name: graduated\n")
    (tmp_path / "ventures" / "host" / "VENTURE.yaml").write_text(
        "name: host\nproduct_lines:\n  - slug: shipped\n"
    )
    candidates = tmp_path / "portfolio" / "pipeline" / "candidates.yaml"
    candidates.write_text(
        "candidates:\n"
        "  - {slug: graduated, verdict: build-now, graduate_as: venture, composite: 9,"
        " name: G, doc: g.md}\n"
        "  - {slug: shipped, verdict: build-now, graduate_as: product-line,"
        " host_venture: host, composite: 8, name: S, doc: s.md}\n"
        "  - {slug: pending, verdict: build-now, graduate_as: venture, composite: 7,"
        " name: P, doc: p.md}\n"
        "  - {slug: scored, verdict: probe, graduate_as: venture, composite: 10}\n"
    )
    monkeypatch.setattr(sg, "REPO", tmp_path)
    monkeypatch.setattr(sg, "CANDIDATES", candidates)

    assert [c["slug"] for c in sg.build_targets()] == ["pending"]


# --- the ledger file itself must track the current month, not a fixed one ----


def test_latest_ledger_path_picks_the_newest_month_present(tmp_path):
    """Regression test for the 2026-09-10 finding: `LEDGER` was hardcoded to
    `2026-08.yaml` and stayed pinned there past the month rollover, so this
    gate quietly read a frozen August tail for the first ten days of
    September. Sorting the filenames must pick whichever month is newest,
    not the one this test (or the module) happens to be written against."""
    for name in ("2026-07.yaml", "2026-08.yaml", "2026-09.yaml", "asks.yaml"):
        (tmp_path / name).write_text("entries: []\n")

    assert sg.latest_ledger_path(tmp_path) == tmp_path / "2026-09.yaml"


def test_latest_ledger_path_ignores_non_month_yaml_files(tmp_path):
    """`asks.yaml`, `infra_state.yaml`, `verifications.yaml` and the like sit
    in the same directory and must never be mistaken for a month's ledger."""
    (tmp_path / "asks.yaml").write_text("asks: []\n")
    (tmp_path / "2026-09.yaml").write_text("entries: []\n")

    assert sg.latest_ledger_path(tmp_path) == tmp_path / "2026-09.yaml"


def test_latest_ledger_path_raises_when_none_exist(tmp_path):
    with pytest.raises(FileNotFoundError):
        sg.latest_ledger_path(tmp_path)


def test_module_ledger_resolves_to_a_real_current_month_file():
    """The module-level `LEDGER` this whole test file already relies on via
    `sg.LEDGER.read_text()` must itself be the product of the resolver, not a
    leftover constant sitting next to it unused."""
    assert sg.LEDGER == sg.latest_ledger_path()
    assert sg.LEDGER.exists()


def _pipeline(tmp_path, monkeypatch, body: str):
    (tmp_path / "portfolio" / "pipeline").mkdir(parents=True, exist_ok=True)
    candidates = tmp_path / "portfolio" / "pipeline" / "candidates.yaml"
    candidates.write_text(body)
    monkeypatch.setattr(sg, "REPO", tmp_path)
    monkeypatch.setattr(sg, "CANDIDATES", candidates)
    return candidates


def test_a_not_a_venture_marker_means_the_candidate_has_not_graduated(tmp_path, monkeypatch):
    """The marker wins over a VENTURE.yaml beside it, so the router sees nothing.

    `ventures/ai-first-markets/` carries both in the live repo, and
    `test_allocate.py` pins that allocate.py skips such a directory. Reading
    only for VENTURE.yaml would drop an unbuilt candidate on the strength of a
    graduation that routes no budget.
    """
    for name in ("marked", "marked-host"):
        (tmp_path / "ventures" / name).mkdir(parents=True)
        (tmp_path / "ventures" / name / "VENTURE.yaml").write_text(
            f"name: {name}\nproduct_lines:\n  - slug: line\n"
        )
        (tmp_path / "ventures" / name / "NOT-A-VENTURE").write_text("infra, not a business\n")
    _pipeline(
        tmp_path,
        monkeypatch,
        "candidates:\n"
        "  - {slug: marked, verdict: build-now, graduate_as: venture, composite: 9,"
        " name: M, doc: m.md}\n"
        "  - {slug: line, verdict: build-now, graduate_as: product-line,"
        " host_venture: marked-host, composite: 8, name: L, doc: l.md}\n",
    )

    assert sorted(c["slug"] for c in sg.build_targets()) == ["line", "marked"]


def test_an_unreadable_pipeline_is_not_an_empty_one(tmp_path, monkeypatch):
    """None (could not read) and [] (read it, nothing eligible) are different facts."""
    missing = tmp_path / "portfolio" / "pipeline" / "candidates.yaml"
    missing.parent.mkdir(parents=True)
    monkeypatch.setattr(sg, "REPO", tmp_path)
    monkeypatch.setattr(sg, "CANDIDATES", missing)
    assert sg.build_targets() is None  # file absent

    _pipeline(tmp_path, monkeypatch, "candidates: [oops\n")
    assert sg.build_targets() is None  # malformed YAML

    _pipeline(tmp_path, monkeypatch, "scored: 2026-01-01\n")
    assert sg.build_targets() is None  # no `candidates` key at all

    _pipeline(tmp_path, monkeypatch, "candidates: {oops: true}\n")
    assert sg.build_targets() is None  # iterable, but not the expected sequence

    _pipeline(tmp_path, monkeypatch, "candidates: just-a-string\n")
    assert sg.build_targets() is None  # also iterable, also not a list

    _pipeline(tmp_path, monkeypatch, "candidates: [oops]\n")
    assert sg.build_targets() is None  # a list, but of scalars rather than records

    _pipeline(tmp_path, monkeypatch, "candidates: []\n")
    assert sg.build_targets() == []  # read fine, genuinely nothing eligible


def test_a_quoted_composite_sorts_rather_than_crashing(tmp_path, monkeypatch):
    """validate_candidates.py:73 normalises with float(), so it accepts '7.5'.

    Sorting on the raw value compared str against float and raised. This
    fixture is not a full validator-clean record (it carries no `scores`
    mapping, which the validator requires and reports on first); what it pins
    is only that the gate tolerates the quoted-number shape the validator's
    own coercion lets through.
    """
    _pipeline(
        tmp_path,
        monkeypatch,
        "candidates:\n"
        "  - {slug: numeric, verdict: build-now, graduate_as: venture, composite: 7.0,"
        " name: N, doc: n.md}\n"
        "  - {slug: quoted, verdict: build-now, graduate_as: venture, composite: '7.5',"
        " name: Q, doc: q.md}\n",
    )
    assert [c["slug"] for c in sg.build_targets()] == ["quoted", "numeric"]


def test_an_incomplete_build_now_record_is_malformed_not_a_target(tmp_path, monkeypatch):
    """Every field here builds a path or the instruction; none may be missing.

    Without this, `{verdict: build-now}` produced a target whose slug was the
    literal string "None", naming `ventures/None/`, and an unset `graduate_as`
    silently took the venture path.
    """
    for record in (
        # Each record is complete except for the one field named, so the case
        # isolates that field rather than passing for some unrelated reason.
        "{verdict: build-now}",
        "{verdict: build-now, graduate_as: venture, composite: 7, name: N, doc: d.md}",  # slug
        "{slug: s, verdict: build-now, composite: 7, name: N, doc: d.md}",  # graduate_as
        "{slug: s, verdict: build-now, graduate_as: nonsense, composite: 7,"
        " name: N, doc: d.md}",
        "{slug: s, verdict: build-now, graduate_as: venture, name: N, doc: d.md}",  # composite
        "{slug: s, verdict: build-now, graduate_as: venture, composite: abc,"
        " name: N, doc: d.md}",
        "{slug: s, verdict: build-now, graduate_as: product-line, composite: 7,"
        " name: N, doc: d.md}",  # host_venture
        # `name` and `doc` are not path components but land in the same
        # instruction; a missing `doc` renders a brief at
        # `portfolio/pipeline/None`, which looks like a pointer and is not one.
        "{slug: s, verdict: build-now, graduate_as: venture, composite: 7, doc: d.md}",  # name
        "{slug: s, verdict: build-now, graduate_as: venture, composite: 7, name: N}",  # doc
    ):
        _pipeline(tmp_path, monkeypatch, f"candidates:\n  - {record}\n")
        assert sg.build_targets() is None, record


def test_a_non_list_product_lines_does_not_crash_the_gate(tmp_path, monkeypatch):
    """`product_lines: true` reached any() and took the whole gate down."""
    (tmp_path / "ventures" / "host").mkdir(parents=True)
    (tmp_path / "ventures" / "host" / "VENTURE.yaml").write_text(
        "name: host\nproduct_lines: true\n"
    )
    _pipeline(
        tmp_path,
        monkeypatch,
        "candidates:\n"
        "  - {slug: line, verdict: build-now, graduate_as: product-line,"
        " host_venture: host, composite: 7, name: L, doc: l.md}\n",
    )
    assert [c["slug"] for c in sg.build_targets()] == ["line"]


def test_a_directory_named_venture_yaml_is_not_routable(tmp_path, monkeypatch):
    """allocate.py:229 and validate.py:114 both use is_file(), so this must too."""
    (tmp_path / "ventures" / "odd" / "VENTURE.yaml").mkdir(parents=True)
    monkeypatch.setattr(sg, "REPO", tmp_path)
    assert sg.routable("odd") is False


def test_the_build_footer_does_not_promise_a_candidate_that_was_not_named(monkeypatch):
    """The footer renders on every BUILD, including the two recovery paths.

    With no target the reasons say "research a new candidate"; with an
    unreadable pipeline they say "repair candidates.yaml". A footer telling the
    session to build "the candidate named above" contradicts both.
    """
    entries = [entry("portfolio")] * sg.WINDOW

    named = sg.render(sg.report(entries, cadence=2.0, targets=[TARGET]))
    assert "some-candidate" in named

    nothing_eligible = sg.render(sg.report(entries, cadence=2.0, targets=[]))
    monkeypatch.setattr(sg, "build_targets", lambda: None)
    unreadable = sg.render(sg.report(entries, cadence=2.0))

    for rendered in (named, nothing_eligible, unreadable):
        assert "VERDICT: BUILD" in rendered
        assert "named above" not in rendered


def test_an_unreadable_pipeline_does_not_send_a_session_off_to_research(tmp_path, monkeypatch):
    """The failure must be reported as a failure, not laundered into a fallback."""
    monkeypatch.setattr(sg, "build_targets", lambda: None)
    call, reasons = sg.verdict(revenue=False, meta=1.0, cadence=2.0)
    joined = " ".join(reasons)
    assert call == "BUILD"
    assert "could not be read or parsed" in joined
    assert "screened-out.md" not in joined  # the research fallback must not fire


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

    Pinned to `2026-08.yaml` explicitly rather than `sg.LEDGER`. Before
    2026-09-10 those were the same path, because `LEDGER` was itself
    hardcoded to August — this test happened to be validated against "the
    live ledger" only by that coincidence. Once `LEDGER` was fixed to track
    whichever month is actually current (see `latest_ledger_path`), the same
    assertion against September's much larger, much lower-meta-work dataset
    failed outright (max observed window there is 68%, never crossing 70%) —
    not because the detector regressed, but because this specific test's job
    is to pin the threshold against the *known* dataset it was calibrated
    from, and that dataset is `2026-08.yaml`, not "whatever `LEDGER` resolves
    to when the test happens to run." Recalibrating `META_SHARE_THRESHOLD`
    itself against September's healthier distribution is a live-gate policy
    call for a session with visibility into current fleet dynamics, not a
    side effect of a ledger-path bugfix.
    """
    fixture = sg.REPO / "portfolio" / "ledger" / "2026-08.yaml"
    entries = yaml.safe_load(fixture.read_text())["entries"]
    windows = [
        sg.meta_share(entries[i : i + sg.WINDOW], window=sg.WINDOW)
        for i in range(0, len(entries) - sg.WINDOW + 1)
    ]
    assert min(windows) < sg.META_SHARE_THRESHOLD < max(windows)


def test_live_report_is_well_formed():
    r = sg.report(yaml.safe_load(sg.LEDGER.read_text())["entries"], cadence=2.0)
    assert r["verdict"] in {"BUILD", "PROCEED"}
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
    """Burst is a caution added to the reasons, not a new routing condition."""
    entries = [entry()] * sg.WINDOW
    without = sg.report(entries, cadence=0.1, burst=0, targets=[TARGET])
    with_burst = sg.report(entries, cadence=0.1, burst=10, targets=[TARGET])
    assert with_burst["verdict"] == without["verdict"]
    assert len(with_burst["reasons"]) > len(without["reasons"])


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


def test_clone_depth_cannot_change_the_lane():
    """Same falsely-low cadence, trusted and not: the verdict must not move.

    This pair used to return PROCEED and NO-OP respectively — the live bug. The
    reading is still reported both ways, because it is a useful collision
    signal; it just no longer decides anything.
    """
    entries = [entry("portfolio")] * sg.WINDOW  # meta_share = 1.0, no revenue recorded
    reliable = sg.report(entries, cadence=0.0, cadence_reliable=True, targets=[TARGET])
    unreliable = sg.report(entries, cadence=0.0, cadence_reliable=False, targets=[TARGET])
    assert reliable["verdict"] == unreliable["verdict"] == "BUILD"
    assert unreliable["sessions_per_hour"] == 0.0  # still reported
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


def test_stale_pr_check_streak_counts_synonyms_of_checked():
    """Sessions write this sentence with whichever verb comes to hand. The
    first draft matched only "checked", so an entry saying "Listed" read as a
    real finding and reset the streak to zero -- both of the ledger's two most
    recent entries at the time were of that shape.
    """
    for verb in ("Listed", "Re-checked", "Rechecked", "Reviewed", "Surveyed"):
        e = entry(
            outcomes=[
                f"{verb} the 4 open PRs (#583, #531, #372, #368) before starting: "
                "all four remain correctly owner-gated, nothing new to add."
            ]
        )
        assert sg.stale_pr_check_streak([e]) == 1, verb


def test_stale_pr_check_streak_survives_filenames_in_the_same_sentence():
    """The gap between "open PRs (...)" and "all still correctly gated" is
    spanned by a sentence-bounded wildcard. A period inside `foo.py` is not a
    sentence boundary, and this ledger's prose is full of them -- treating it
    as one silently dropped the match.
    """
    e = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368), "
            "`verification_status.py` and the `main` tip first: all four still "
            "correctly owner-gated, nothing to consolidate."
        ]
    )
    assert sg.stale_pr_check_streak([e]) == 1


def test_stale_pr_check_streak_still_stops_at_a_sentence_boundary():
    """The widened gap must not run past a real sentence break and staple an
    unrelated later clause onto the opening one -- that would match entries
    that merely mention the PR set and then report actual work.
    """
    e = entry(
        outcomes=[
            "Checked the 4 open PRs (#583, #531, #372, #368) and found #616 "
            "stranded. Closed it, and all of that is now recorded as correctly "
            "owner-gated elsewhere."
        ]
    )
    assert sg.stale_pr_check_streak([e]) == 0


def test_stale_pr_check_streak_measured_on_the_real_ledger():
    """The real ledger has this pattern *somewhere* in its history -- guard
    against the detector regressing to always-zero on the artifact it exists
    to catch. Checked against every suffix rather than just the current tail,
    because the tail keeps changing entry to entry (this file is append-only
    and several sessions land per hour) -- pinning to "the last entry" or
    "the last N" would make this test flake as soon as the next session's
    entry lands, which is exactly the kind of churn the gate has to tolerate
    rather than assume away.

    Pinned to `2026-08.yaml` explicitly, for the same reason as the meta-share
    threshold test above: this is a regression fixture proving the detector
    still finds a known historical streak, not a live assertion about
    whatever month `sg.LEDGER` currently resolves to. September's ledger
    (post the 2026-09-10 ledger-path fix) doesn't happen to carry a streak
    this long yet -- a good sign about current session behavior, not a
    detector regression -- so asserting against it here would conflate "the
    pattern-matcher still works" with "the fleet is still repeating this
    waste," which are two different claims.
    """
    fixture = sg.REPO / "portfolio" / "ledger" / "2026-08.yaml"
    entries = yaml.safe_load(fixture.read_text())["entries"]
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
    entries = [unchanged] * sg.STALE_PR_STREAK_THRESHOLD
    with_streak = sg.report(entries, cadence=0.1, targets=[TARGET])
    without = sg.report([entry()] * sg.WINDOW, cadence=0.1, targets=[TARGET])
    assert with_streak["verdict"] == without["verdict"]
    assert len(with_streak["reasons"]) > len(without["reasons"])


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
    used to clear the gate to PROCEED unless the failed fetch overrode it."""
    captured: dict = {}
    real_report = sg.report

    def spy(*a, **kw):
        r = real_report(*a, **kw)
        captured.update(r)
        return r

    monkeypatch.setattr(sg, "report", spy)
    monkeypatch.setattr(sg, "refresh_origin_main", lambda: False)
    monkeypatch.setattr(sg, "sessions_per_hour", lambda: (0.0, True))
    monkeypatch.setattr(sg, "max_concurrent_sessions", lambda *_a, **_k: 0)
    monkeypatch.setattr(sg, "commits_with_sessions", lambda *_a, **_k: [])
    monkeypatch.setattr(sg, "load_entries", lambda *_a, **_k: [entry("portfolio")] * sg.WINDOW)
    monkeypatch.setattr(sg.sys, "argv", ["session_gate.py"])

    sg.main()

    out = capsys.readouterr().out
    assert "VERDICT: BUILD" in out
    assert "git fetch origin main` failed" in out
    # The wiring this test is named for: a failed fetch must still mark the
    # reading untrusted. Cadence no longer moves the verdict, so asserting the
    # lane alone would pass even if main() stopped propagating `fetched`.
    assert captured["cadence_reliable"] is False
    assert captured["origin_fetched"] is False


# --- the published snapshot ---------------------------------------------------
#
# DIRECTION.md's North star ranks refreshing a stale snapshot above all new
# work. Until 2026-09-07 the gate never read it, so a session could follow a
# complete PROCEED verdict while the live site sat behind `main`. These tests
# pin the two directions that matter: a stale reading must be impossible to
# miss, and an unreadable one must never be laundered into a healthy one.


def _entries():
    return [entry("some-venture") for _ in range(sg.WINDOW)]


def test_a_stale_snapshot_leads_the_reasons_ahead_of_the_verdicts_own():
    r = sg.report(_entries(), 1.0, snapshot=("stale", "built from abc1234"))
    assert r["published_snapshot"] == "stale"
    assert "THE LIVE SITE IS BEHIND" in r["reasons"][0]
    assert "publish-branch.sh" in r["reasons"][0]
    assert "built from abc1234" in r["reasons"][0]


def test_a_current_snapshot_adds_no_reason_and_no_warning_marker():
    r = sg.report(_entries(), 1.0, snapshot=("current", "built from the tip"))
    assert r["published_snapshot"] == "current"
    assert not any("LIVE SITE IS BEHIND" in reason for reason in r["reasons"])
    assert not any("Published-snapshot state" in reason for reason in r["reasons"])
    assert "the live site is not known to match" not in sg.render(r)


def test_an_unreadable_snapshot_is_flagged_rather_than_read_as_healthy():
    """The direction this must never be wrong in: `unknown` is not `current`."""
    r = sg.report(_entries(), 1.0, snapshot=("unknown", "no GH_TOKEN"))
    assert r["published_snapshot"] == "unknown"
    flagged = [x for x in r["reasons"] if "Published-snapshot state" in x]
    assert len(flagged) == 1
    assert "never as fine" in flagged[0]
    assert "the live site is not known to match" in sg.render(r)


def test_an_absent_gh_pages_branch_is_not_silently_fine():
    r = sg.report(_entries(), 1.0, snapshot=("absent", "no `gh-pages` branch"))
    assert any("Published-snapshot state is `absent`" in x for x in r["reasons"])


def test_report_without_a_snapshot_argument_defaults_to_unknown_not_current():
    """A caller that forgets to pass the reading must not get a green line."""
    r = sg.report(_entries(), 1.0)
    assert r["published_snapshot"] == "unknown"
    assert "the live site is not known to match" in sg.render(r)


def test_render_shows_the_snapshot_row_in_every_state():
    for state in ("current", "stale", "unknown", "absent"):
        out = sg.render(sg.report(_entries(), 1.0, snapshot=(state, "why")))
        assert f"published snapshot ............. {state}" in out


def _pages_state():
    """Import `pages_state` the way `published_snapshot` does.

    A bare `import pages_state` here passes only when some earlier test in the
    session has already called `sg.published_snapshot()` and left that path on
    `sys.path` — so the test would go green in a full run and fail on its own,
    which is the least useful way for a test to be wrong.
    """
    sys.path.insert(0, str(sg.REPO / "platform" / "ci"))
    import pages_state

    return pages_state


def test_published_snapshot_returns_unknown_when_no_token_is_available(monkeypatch):
    pages_state = _pages_state()

    monkeypatch.setattr(pages_state, "api_token", lambda *_a, **_k: None)
    state, reason = sg.published_snapshot()
    assert state == "unknown"
    assert "GH_TOKEN" in reason


def test_published_snapshot_swallows_a_failure_rather_than_crashing_the_gate(monkeypatch):
    """A network hiccup in a reporting helper must not take the gate down."""
    pages_state = _pages_state()

    monkeypatch.setattr(pages_state, "api_token", lambda *_a, **_k: "t")

    def boom(*_a, **_k):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(pages_state, "collect", boom)
    state, reason = sg.published_snapshot()
    assert state == "unknown"
    assert "connection reset" in reason


def test_main_propagates_the_snapshot_reading(monkeypatch, capsys):
    monkeypatch.setattr(sg, "refresh_origin_main", lambda: True)
    monkeypatch.setattr(sg, "sessions_per_hour", lambda: (1.0, True))
    monkeypatch.setattr(sg, "max_concurrent_sessions", lambda *_a, **_k: 0)
    monkeypatch.setattr(sg, "commits_with_sessions", lambda *_a, **_k: [])
    monkeypatch.setattr(sg, "load_entries", lambda *_a, **_k: _entries())
    monkeypatch.setattr(sg, "published_snapshot", lambda *_a, **_k: ("stale", "one merge behind"))
    monkeypatch.setattr(sg.sys, "argv", ["session_gate.py"])

    sg.main()

    out = capsys.readouterr().out
    assert "published snapshot ............. stale" in out
    assert "THE LIVE SITE IS BEHIND `main`" in out
