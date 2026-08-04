"""Contract tests for `scripts/ci/stopping_rule_review.py`.

The audit exists so a fired stopping rule reaches a human. These tests are
therefore mostly about the ways it could quietly stop doing that: an absent
register, a register that parses but decides nothing, a `continue` that never
expires, a `wind-down` recorded and not carried out, and a decision left behind
after the criterion stopped firing.

Every fixture is a real temporary repository — `ventures/*/VENTURE.yaml` plus
`portfolio/ledger/*.yaml` — so the audit reads the same shapes it reads in CI
rather than a hand-built object graph.
"""

from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.ci.stopping_rule_review import (
    MAX_CONTINUE_OVERRIDES,
    MAX_REVIEW_DAYS,
    MIN_REASON_CHARS,
    ReviewError,
    audit,
    load_register,
    main,
    measure,
    normalise,
)

TODAY = date(2026, 8, 3)

TRIGGERING_CRITERION = (
    "$150 of recorded agent spend accumulated with no revenue ever recorded "
    "against this venture in portfolio/ledger/."
)

GOOD_REASON = (
    "Two signed pilots close this month and the threshold was set before either "
    "existed; revisiting after they land."
)


def write_venture(
    root: Path,
    name: str,
    *,
    stage: str = "prototype",
    structured: bool = True,
    threshold: int = 150,
) -> None:
    directory = root / "ventures" / name
    directory.mkdir(parents=True, exist_ok=True)
    criteria = (
        textwrap.dedent(
            f"""\
            kill_criteria:
              - description: >-
                  {TRIGGERING_CRITERION}
                when:
                  - metric: cumulative_agent_spend_usd
                    comparator: ">="
                    threshold: {threshold}
                  - metric: cumulative_revenue_usd
                    comparator: "=="
                    threshold: 0
            """
        )
        if structured
        else "kill_criteria:\n  - Fewer than 50 active learners after 60 days.\n"
    )
    (directory / "VENTURE.yaml").write_text(
        f"name: {name}\nstage: {stage}\nowner: tester\n"
        "economics:\n  mrr: 0\nbudget:\n  monthly_cap: 60\n" + criteria,
        encoding="utf-8",
    )


def write_ledger(root: Path, name: str, spend: float, mrr: float = 0.0) -> None:
    directory = root / "portfolio" / "ledger"
    directory.mkdir(parents=True, exist_ok=True)
    existing = directory / "2026-07.yaml"
    if not existing.exists():
        existing.write_text("period: 2026-07\nentries:\n", encoding="utf-8")
    with existing.open("a", encoding="utf-8") as handle:
        handle.write(
            f"  - venture: {name}\n    agent_spend_usd: {spend}\n    mrr_end: {mrr}\n"
        )


def write_register(root: Path, body: str) -> None:
    (root / "portfolio").mkdir(parents=True, exist_ok=True)
    (root / "portfolio" / "stopping-decisions.yaml").write_text(body, encoding="utf-8")


def register_with(entries: str = "decisions: []\n") -> str:
    return "owner: duncan\nissue: docs/ENGINEERING-ROADMAP.md\n" + entries


def decision_block(
    venture: str = "burner",
    *,
    decision: str = "continue",
    review_by: str = "2026-09-30",
    decided_on: str = "2026-08-03",
    reason: str = GOOD_REASON,
    criterion: str = TRIGGERING_CRITERION,
    criterion_style: str = ">-",
) -> str:
    review = f"    review_by: {review_by}\n" if decision == "continue" else ""
    return (
        "decisions:\n"
        f"  - venture: {venture}\n"
        f"    criterion: {criterion_style}\n      {criterion}\n"
        "    decided_by: duncan\n"
        f"    decided_on: {decided_on}\n"
        f"    decision: {decision}\n"
        f"    reason: >-\n      {reason}\n" + review
    )


class StoppingRuleReviewTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def checks(self, register_body: str) -> list:
        write_register(self.root, register_body)
        register = load_register(self.root)
        measurement = measure(self.root)
        return [f.check for f in audit(measurement, register, TODAY)]

    # --- the measurement itself ------------------------------------------

    def test_criterion_below_threshold_does_not_trigger(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 18.18)
        self.assertEqual(measure(self.root).triggered, [])
        self.assertEqual(self.checks(register_with()), [])

    def test_criterion_at_threshold_triggers_and_is_undecided(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        measurement = measure(self.root)
        self.assertEqual(len(measurement.triggered), 1)
        self.assertEqual(measurement.triggered[0].venture, "burner")
        self.assertIn("cumulative_agent_spend_usd=150", measurement.triggered[0].detail)
        self.assertEqual(self.checks(register_with()), ["undecided"])

    def test_recorded_revenue_keeps_the_criterion_from_firing(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 400.0, mrr=25.0)
        self.assertEqual(measure(self.root).triggered, [])

    def test_prose_criterion_never_triggers(self):
        write_venture(self.root, "prosaic", structured=False)
        write_ledger(self.root, "prosaic", 900.0)
        self.assertEqual(measure(self.root).triggered, [])

    def test_no_ventures_is_reported_as_not_measurable_not_as_a_pass(self):
        write_register(self.root, register_with())
        register = load_register(self.root)
        findings = audit(measure(self.root), register, TODAY)
        self.assertEqual([f.check for f in findings], ["not-measurable"])

    # --- the register ----------------------------------------------------

    def test_missing_register_fails_closed(self):
        write_venture(self.root, "burner")
        with self.assertRaises(ReviewError) as ctx:
            load_register(self.root)
        self.assertIn("stopping-decisions.yaml is missing", str(ctx.exception))

    def test_unparseable_register_fails_closed(self):
        write_register(self.root, "owner: duncan\n  issue: [unclosed\n")
        with self.assertRaises(ReviewError):
            load_register(self.root)

    def test_missing_top_field_fails_closed(self):
        write_register(self.root, "owner: duncan\ndecisions: []\n")
        with self.assertRaises(ReviewError) as ctx:
            load_register(self.root)
        self.assertIn("issue", str(ctx.exception))

    def test_decision_missing_a_required_field_fails_closed(self):
        body = register_with(decision_block()).replace("    decided_by: duncan\n", "")
        write_register(self.root, body)
        with self.assertRaises(ReviewError) as ctx:
            load_register(self.root)
        self.assertIn("decided_by", str(ctx.exception))

    def test_unknown_decision_verb_fails_closed(self):
        write_register(self.root, register_with(decision_block(decision="monitor")))
        with self.assertRaises(ReviewError) as ctx:
            load_register(self.root)
        self.assertIn("monitor", str(ctx.exception))

    def test_continue_without_review_by_fails_closed(self):
        body = register_with(decision_block()).replace("    review_by: 2026-09-30\n", "")
        write_register(self.root, body)
        with self.assertRaises(ReviewError) as ctx:
            load_register(self.root)
        self.assertIn("review_by", str(ctx.exception))

    def test_unparseable_date_fails_closed(self):
        write_register(self.root, register_with(decision_block(decided_on="soon")))
        with self.assertRaises(ReviewError):
            load_register(self.root)

    # --- the audit -------------------------------------------------------

    def test_current_continue_decision_passes(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        self.assertEqual(self.checks(register_with(decision_block())), [])

    def test_criterion_matches_across_different_line_wrapping(self):
        """VENTURE.yaml folds its criterion; the register may not.

        A folded scalar (`>-`) turns its line breaks into spaces, so two folded
        copies match whatever column they wrap at. A literal block (`|-`) keeps
        the breaks, and a register written that way must still match the
        criterion it names — otherwise a decision silently becomes an orphan and
        the trigger it covers reads as undecided.
        """
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        rewrapped = TRIGGERING_CRITERION.replace(" no revenue", "\n      no revenue")
        self.assertEqual(
            self.checks(
                register_with(decision_block(criterion=rewrapped, criterion_style="|-"))
            ),
            [],
        )

    def test_expired_continue_fails(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        self.assertEqual(
            self.checks(register_with(decision_block(review_by="2026-08-02"))),
            ["decision-stale"],
        )

    def test_review_horizon_beyond_the_cap_fails(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        far = (TODAY + timedelta(days=MAX_REVIEW_DAYS + 1)).isoformat()
        self.assertEqual(
            self.checks(register_with(decision_block(review_by=far))),
            ["review-horizon-too-far"],
        )

    def test_review_horizon_exactly_at_the_cap_passes(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        edge = (TODAY + timedelta(days=MAX_REVIEW_DAYS)).isoformat()
        self.assertEqual(self.checks(register_with(decision_block(review_by=edge))), [])

    def test_future_dated_decision_fails(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        self.assertEqual(
            self.checks(register_with(decision_block(decided_on="2026-08-04"))),
            ["decision-future-dated"],
        )

    def test_thin_reason_fails(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        self.assertLess(len("Still worth it."), MIN_REASON_CHARS)
        self.assertEqual(
            self.checks(register_with(decision_block(reason="Still worth it."))),
            ["reason-too-thin"],
        )

    def test_wind_down_not_carried_out_fails(self):
        write_venture(self.root, "burner", stage="prototype")
        write_ledger(self.root, "burner", 150.0)
        self.assertEqual(
            self.checks(register_with(decision_block(decision="wind-down"))),
            ["wind-down-not-carried-out"],
        )

    def test_wind_down_carried_out_passes(self):
        write_venture(self.root, "burner", stage="winding-down")
        write_ledger(self.root, "burner", 150.0)
        self.assertEqual(self.checks(register_with(decision_block(decision="wind-down"))), [])

    def test_decision_for_an_untriggered_criterion_is_orphaned(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 18.18)
        self.assertEqual(
            self.checks(register_with(decision_block())),
            ["decision-orphaned"],
        )

    def test_orphaned_decision_does_not_also_report_undecided(self):
        """A stale entry must not be reported as a missing one, or as covering it."""
        write_venture(self.root, "burner")
        write_venture(self.root, "other")
        write_ledger(self.root, "burner", 150.0)
        checks = self.checks(register_with(decision_block(venture="other")))
        self.assertEqual(sorted(checks), ["decision-orphaned", "undecided"])

    def test_override_cap(self):
        entries = ["decisions:"]
        for index in range(MAX_CONTINUE_OVERRIDES + 1):
            name = f"burner{index}"
            write_venture(self.root, name)
            write_ledger(self.root, name, 150.0)
            entries.append(
                decision_block(venture=name).replace("decisions:\n", "").rstrip("\n")
            )
        checks = self.checks(register_with("\n".join(entries) + "\n"))
        self.assertEqual(checks, ["too-many-overrides"])

    def test_override_cap_counts_only_live_decisions(self):
        """An orphaned `continue` must not push a compliant register over the cap."""
        entries = ["decisions:"]
        for index in range(MAX_CONTINUE_OVERRIDES):
            name = f"burner{index}"
            write_venture(self.root, name)
            write_ledger(self.root, name, 150.0)
            entries.append(decision_block(venture=name).replace("decisions:\n", "").rstrip("\n"))
        write_venture(self.root, "quiet")
        write_ledger(self.root, "quiet", 1.0)
        entries.append(decision_block(venture="quiet").replace("decisions:\n", "").rstrip("\n"))
        checks = self.checks(register_with("\n".join(entries) + "\n"))
        self.assertEqual(checks, ["decision-orphaned"])

    # --- the command -----------------------------------------------------

    def test_main_exits_nonzero_on_an_undecided_trigger(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        write_register(self.root, register_with())
        self.assertEqual(main(["--repo-root", str(self.root)]), 1)

    def test_main_report_mode_never_fails_the_build(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 150.0)
        write_register(self.root, register_with())
        self.assertEqual(main(["--repo-root", str(self.root), "--report"]), 0)

    def test_main_exits_zero_when_nothing_has_fired(self):
        write_venture(self.root, "burner")
        write_ledger(self.root, "burner", 18.18)
        write_register(self.root, register_with())
        self.assertEqual(main(["--repo-root", str(self.root)]), 0)

    def test_main_fails_when_the_register_is_absent(self):
        write_venture(self.root, "burner")
        self.assertEqual(main(["--repo-root", str(self.root)]), 1)

    # --- the repository's own register ------------------------------------

    def test_repository_register_is_valid_and_current(self):
        register = load_register(REPO_ROOT)
        measurement = measure(REPO_ROOT)
        self.assertGreater(
            measurement.ventures_measured,
            0,
            "the audit read no ventures in this repository, so a pass means nothing",
        )
        self.assertEqual(audit(measurement, register, date.today()), [])

    def test_normalise_collapses_folded_scalars(self):
        self.assertEqual(normalise("a\n  b\tc "), "a b c")
        self.assertEqual(normalise(None), "")


if __name__ == "__main__":
    unittest.main()
