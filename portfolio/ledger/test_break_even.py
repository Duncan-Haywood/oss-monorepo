"""Tests for break_even.py.

The point of the script is that its conclusion does not rest on a guess, so
the tests check the two things that would make it dishonest: that the figures
really are read from committed repo data rather than hardcoded, and that the
inversion arithmetic is right.

    python3 -m pytest portfolio/ledger/test_break_even.py
"""

from __future__ import annotations

import json

import pytest

import break_even as be


@pytest.fixture(scope="module")
def report():
    """The live measurement. Environment-dependent — see the shallow-clone test."""
    return be.build_report()


@pytest.fixture(scope="module")
def snapshot():
    """The pinned measurement the document actually reports."""
    return be.load_snapshot()


def test_ledger_figures_match_the_ledger_file(report):
    """Counts come from 2026-08.yaml, not from constants in the script."""
    import yaml

    entries = yaml.safe_load(be.LEDGER.read_text())["entries"]
    assert report["ledger"]["entries"] == len(entries)
    assert report["ledger"]["portfolio_meta"] == sum(
        1 for e in entries if e.get("venture") == "portfolio"
    )


def test_spend_and_revenue_are_still_entirely_unmeasured(report):
    """cost-signal.md's premise. If this ever fails, the analysis is obsolete.

    Spend and revenue are asserted differently on purpose, because the premise
    is different for each. Spend is *unmeasured*: cost-signal.md's whole point
    is that no session can see its own token cost, so a non-null figure would
    mean someone found a way and the analysis needs rewriting.

    Revenue is not unmeasured, it is *zero*. The claim break-even.md rests on
    is that nothing has been earned — and a row written `mrr_end: 0`, which is
    the spelling the ledger README's own example uses, says exactly that. This
    asserted `null_mrr == entries` until 2026-08-27, when two rows recorded the
    measured zero and turned a supported premise into a red `Portfolio
    validate` on `main`. Counting what was booked instead says what is meant,
    and matches `session_gate.py`'s long-standing "0 of N entries book any".
    """
    led = report["ledger"]
    assert led["null_spend"] == led["entries"]
    assert led["booked_mrr"] == 0


def test_a_measured_zero_is_not_an_unmeasured_row(report):
    """`mrr_end: 0` books nothing, and is not the same fact as `mrr_end: null`.

    Pins the distinction the test above now rests on, in both directions, so a
    later change cannot quietly fold one count back into the other: every row
    is either unmeasured or a measured figure, and none of the measured ones
    is above zero.
    """
    import yaml

    entries = yaml.safe_load(be.LEDGER.read_text())["entries"]
    led = report["ledger"]

    measured = [e for e in entries if e.get("mrr_end") is not None]
    assert led["null_mrr"] + len(measured) == led["entries"]
    assert led["booked_mrr"] == sum(1 for e in measured if e["mrr_end"] > 0)
    # The rows that exercise this: measured, and measured at zero.
    assert all(e["mrr_end"] == 0 for e in measured)


def test_ceilings_come_from_the_economics_results_file(report):
    data = json.loads(be.ECONOMICS.read_text())
    for key, got in report["ceilings"].items():
        want = data["categories"][key]["scenarios"]["central"][
            "expected_monthly_revenue_cold"
        ]
        assert got["cold_monthly_usd"] == want


def test_today_ceiling_is_zero_because_no_channel_can_take_money(report):
    """Not a rounding — a structural consequence of channel-inventory.md."""
    assert be.CHANNELS_WITH_BILLING_AGENT_LISTABLE == 0
    assert report["regimes"]["today"]["ceiling_usd"] == 0.0


def test_wordpress_regime_matches_the_published_model(report):
    """#219: 1,000 active installs x 2% x $49 = ~$980/month gross."""
    gross, cold = be.wordpress_expected_monthly_usd(0.049)
    assert gross == pytest.approx(980.0)
    assert cold == pytest.approx(980.0 * 0.049)
    assert report["wordpress"]["gross"] == pytest.approx(980.0)


def test_regimes_are_monotonic_in_asks_granted(report):
    r = report["regimes"]
    assert (
        r["today"]["ceiling_usd"]
        < r["publish_and_payout"]["ceiling_usd"]
        < r["plus_wordpress"]["ceiling_usd"]
    )


def test_best_ceiling_is_the_sum_of_its_stated_parts(report):
    best_listing = max(c["cold_monthly_usd"] for c in report["ceilings"].values())
    assert report["best_ceiling_usd"] == pytest.approx(
        best_listing + report["wordpress"]["cold_weighted"]
    )


def test_break_even_per_session_inverts_the_monthly_ceiling(snapshot):
    """The headline number: ceiling / sessions-per-month.

    Asserted against the snapshot, not the live report: cadence is read from
    git history, and CI checks out shallow (`actions/checkout` defaults to
    depth 1), so the live figure is environment-dependent by design. The
    document's number is the snapshot's number.
    """
    expected = snapshot["best_ceiling_usd"] / snapshot["sessions_per_month"]
    assert snapshot["break_even_per_session_usd"] == pytest.approx(expected)


def test_break_even_threshold_is_below_any_plausible_session_cost(snapshot):
    """The conclusion the document draws, asserted as a test.

    If a future measurement moves the ceiling enough that a session could
    plausibly cost less than this, the document's recommendation should be
    revisited and this test is where that surfaces.
    """
    assert snapshot["break_even_per_session_usd"] < 1.00


def test_cadence_is_unmeasurable_in_a_shallow_clone(report):
    """The contract that keeps this suite runnable in CI.

    A shallow checkout has no session trailers to count, so the live cadence
    is 0.0 — meaning "unmeasured", not "idle" — and the derived threshold is
    None rather than a divide-by-zero. Both are legitimate states for the live
    report and neither may crash it. This is the failure that turned the first
    CI run on this PR red.
    """
    live_rate = report["observed"]["mean_per_hour"]
    if live_rate == 0.0:
        assert report["sessions_per_month"] == 0.0
        assert report["break_even_per_session_usd"] is None
    else:
        assert report["break_even_per_session_usd"] > 0


def test_spend_table_rows_are_classified_against_the_best_ceiling(report):
    for row in report["spend_table"]:
        monthly = row["per_session_usd"] * row["sessions_per_hour"] * 24 * 30
        assert row["monthly_usd"] == pytest.approx(monthly)
        assert row["clears_best_ceiling"] == (monthly <= report["best_ceiling_usd"])


def test_observed_rate_is_a_lower_bound_not_a_claim_of_idleness():
    """A checkout with no session trailers reports 0.0, meaning unmeasured."""
    empty = be.observed_session_rate(days=("1999-01-01",))
    assert empty == {"hours": 0, "mean_per_hour": 0.0, "max_per_hour": 0}


def test_doc_check_passes_against_the_pinned_snapshot():
    assert be.check_doc(be.load_snapshot()) == 0


def test_snapshot_matches_the_document_not_the_live_ledger():
    """The ledger grows hourly; the document is a dated measurement.

    `--check` must read the snapshot, so an appended ledger entry cannot turn
    `main` red. This is the property that keeps the CI step stable.
    """
    snap = be.load_snapshot()
    live = be.build_report()
    # Both are well-formed reports over the same schema...
    assert set(snap) == set(live)
    # ...and the check is a pure function of the snapshot, never of `live`.
    assert be.check_doc(snap) == 0


def test_refresh_roundtrips(tmp_path, monkeypatch):
    """--refresh writes a snapshot that --check then accepts."""
    target = tmp_path / "snap.json"
    monkeypatch.setattr(be, "SNAPSHOT", target)
    report = be.build_report()
    be.write_snapshot(report)
    assert be.load_snapshot()["best_ceiling_usd"] == report["best_ceiling_usd"]


def test_check_reports_a_missing_document(monkeypatch, tmp_path):
    monkeypatch.setattr(be, "DOC", tmp_path / "absent.md")
    assert be.check_doc(be.load_snapshot()) == 1


def test_check_catches_a_single_drifted_occurrence(monkeypatch, tmp_path):
    """A headline figure restated 7 times must fail if only one drifts.

    This is the exact bug validate_doc_consistency.py exists to catch for
    candidate scores, and the first version of this checker did not catch it.
    """
    snap = be.load_snapshot()
    ceiling = f"${snap['best_ceiling_usd']:,.0f}"
    corrupted = be.DOC.read_text().replace(f"is {ceiling}/month", "is $999/month", 1)
    doc = tmp_path / "break-even.md"
    doc.write_text(corrupted)
    monkeypatch.setattr(be, "DOC", doc)
    assert be.check_doc(snap) == 1
