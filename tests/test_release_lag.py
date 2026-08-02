#!/usr/bin/env python3
"""
Unit and contract tests for the release-lag ratchet.

A gate that cannot fail is not a gate, so most of these assert the failing
direction: a pile that grew, a budget that shipped out from under itself, an
expired budget, a declared ceiling over its cap, and — the one that matters
most — a baseline ref that does not resolve. "The ref is missing" and
"everything is shipped" produce the same number unless something refuses to
answer, and that refusal is what these tests pin.

The measurement half runs against real temporary git repositories rather than
fixtures. A policy tested only against hand-built `Measurement` objects is a
policy proven correct about numbers nobody checked came from git; that is the
shape of defect this repository keeps finding in its own controls.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import subprocess
import tempfile
import textwrap
import unittest
from datetime import date, datetime, timedelta

import yaml

import release_lag
from release_lag import (
    BUDGET_PATH,
    MAX_DECLARED_AGE_DAYS,
    MAX_DECLARED_BRANCHES,
    MAX_DECLARED_SLACK,
    MAX_DECLARED_UNSHIPPED_COMMITS,
    MAX_EXPIRY_DAYS,
    LagError,
    Measurement,
    _component_of,
    evaluate,
    load_budget,
    measure,
)

TODAY = date(2026, 8, 2)


def make_budget(**overrides):
    budget = {
        "max_unshipped_commits": 100,
        "slack_commits": 20,
        "max_unshipped_age_days": 7,
        "max_branches_ahead": 30,
    }
    budget.update(overrides.pop("budget", {}))
    data = {
        "baseline_ref": "origin/main",
        "owner": "duncan",
        "issue": "docs/ENGINEERING-ROADMAP.md#next-30-days",
        "expires": TODAY + timedelta(days=60),
        "budget": budget,
        "rationale": "test fixture",
    }
    data.update(overrides)
    return data


def make_measurement(**overrides):
    fields = {
        "baseline_ref": "origin/main",
        "baseline_sha": "abc123456789",
        "baseline_age_days": 1,
        "unshipped_commits": 90,
        "branches_ahead": 10,
        "oldest_unshipped_age_days": 2,
        "components": ["ventures/print-atelier"],
        "branch_names": ["agent/x"],
    }
    fields.update(overrides)
    return Measurement(**fields)


def checks(findings):
    return {f.check for f in findings}


class TestPolicy(unittest.TestCase):
    def test_within_band_passes(self):
        self.assertEqual(evaluate(make_measurement(), make_budget(), TODAY), [])

    def test_pile_above_budget_fails(self):
        findings = evaluate(make_measurement(unshipped_commits=101), make_budget(), TODAY)
        self.assertIn("lag-above-budget", checks(findings))

    def test_at_budget_exactly_passes(self):
        self.assertEqual(evaluate(make_measurement(unshipped_commits=100), make_budget(), TODAY), [])

    def test_pile_far_below_budget_fails_as_stale(self):
        # Work shipped. The budget now records a debt that no longer exists, so
        # it must be lowered rather than left as silent headroom.
        findings = evaluate(make_measurement(unshipped_commits=79), make_budget(), TODAY)
        self.assertIn("budget-stale", checks(findings))

    def test_just_inside_slack_passes(self):
        self.assertEqual(evaluate(make_measurement(unshipped_commits=80), make_budget(), TODAY), [])

    def test_zero_lag_against_a_stale_budget_still_fails(self):
        # The important case: everything shipped, and the gate refuses to stay
        # green on a budget that has stopped describing anything.
        findings = evaluate(make_measurement(unshipped_commits=0), make_budget(), TODAY)
        self.assertIn("budget-stale", checks(findings))

    def test_old_undelivered_change_fails(self):
        findings = evaluate(make_measurement(oldest_unshipped_age_days=8), make_budget(), TODAY)
        self.assertIn("oldest-change-stale", checks(findings))

    def test_age_at_declared_limit_passes(self):
        self.assertEqual(evaluate(make_measurement(oldest_unshipped_age_days=7), make_budget(), TODAY), [])

    def test_too_many_branches_ahead_fails(self):
        findings = evaluate(make_measurement(branches_ahead=31), make_budget(), TODAY)
        self.assertIn("branches-above-budget", checks(findings))

    def test_expired_budget_fails(self):
        data = make_budget(expires=TODAY - timedelta(days=1))
        findings = evaluate(make_measurement(), data, TODAY)
        self.assertIn("budget-expired", checks(findings))

    def test_budget_expiring_today_still_passes(self):
        data = make_budget(expires=TODAY)
        self.assertEqual(evaluate(make_measurement(), data, TODAY), [])

    def test_expiry_beyond_horizon_fails(self):
        data = make_budget(expires=TODAY + timedelta(days=MAX_EXPIRY_DAYS + 1))
        findings = evaluate(make_measurement(), data, TODAY)
        self.assertIn("budget-horizon", checks(findings))

    def test_findings_accumulate(self):
        data = make_budget(expires=TODAY - timedelta(days=1))
        findings = evaluate(
            make_measurement(unshipped_commits=200, oldest_unshipped_age_days=40, branches_ahead=99),
            data,
            TODAY,
        )
        self.assertEqual(
            checks(findings),
            {"budget-expired", "lag-above-budget", "oldest-change-stale", "branches-above-budget"},
        )


class TestBudgetValidation(unittest.TestCase):
    def write(self, data):
        tmp = Path(tempfile.mkdtemp())
        (tmp / "platform").mkdir()
        (tmp / BUDGET_PATH).write_text(yaml.safe_dump(data))
        return tmp

    def test_missing_file_fails_closed(self):
        tmp = Path(tempfile.mkdtemp())
        with self.assertRaises(LagError) as ctx:
            load_budget(tmp)
        self.assertIn("missing", str(ctx.exception))

    def test_missing_required_field_fails(self):
        data = make_budget()
        del data["owner"]
        with self.assertRaises(LagError) as ctx:
            load_budget(self.write(data))
        self.assertIn("owner", str(ctx.exception))

    def test_missing_budget_subfield_fails(self):
        data = make_budget()
        del data["budget"]["slack_commits"]
        with self.assertRaises(LagError) as ctx:
            load_budget(self.write(data))
        self.assertIn("slack_commits", str(ctx.exception))

    def test_declared_age_over_cap_fails(self):
        data = make_budget(budget={"max_unshipped_age_days": MAX_DECLARED_AGE_DAYS + 1})
        with self.assertRaises(LagError) as ctx:
            load_budget(self.write(data))
        self.assertIn("cap", str(ctx.exception))

    def test_declared_slack_over_cap_fails(self):
        data = make_budget(budget={"slack_commits": MAX_DECLARED_SLACK + 1})
        with self.assertRaises(LagError) as ctx:
            load_budget(self.write(data))
        self.assertIn("cap", str(ctx.exception))

    def test_declared_commit_ceiling_over_cap_fails(self):
        # Without this the budget can be argued up forever and a PASS means only
        # that someone widened it last — which happened the day it landed.
        data = make_budget(budget={"max_unshipped_commits": MAX_DECLARED_UNSHIPPED_COMMITS + 1})
        with self.assertRaises(LagError) as ctx:
            load_budget(self.write(data))
        self.assertIn("cap", str(ctx.exception))

    def test_declared_branch_ceiling_over_cap_fails(self):
        data = make_budget(budget={"max_branches_ahead": MAX_DECLARED_BRANCHES + 1})
        with self.assertRaises(LagError) as ctx:
            load_budget(self.write(data))
        self.assertIn("cap", str(ctx.exception))

    def test_declared_ceilings_at_their_cap_are_accepted(self):
        # Prove the pass path: a cap only ever seen to reject is not known to be
        # satisfiable, and it gates every run.
        data = make_budget(
            budget={
                "max_unshipped_commits": MAX_DECLARED_UNSHIPPED_COMMITS,
                "max_branches_ahead": MAX_DECLARED_BRANCHES,
            }
        )
        loaded = load_budget(self.write(data))
        self.assertEqual(loaded["budget"]["max_unshipped_commits"], MAX_DECLARED_UNSHIPPED_COMMITS)

    def test_non_integer_budget_value_fails(self):
        data = make_budget(budget={"max_unshipped_commits": "lots"})
        with self.assertRaises(LagError):
            load_budget(self.write(data))

    def test_negative_budget_value_fails(self):
        data = make_budget(budget={"max_unshipped_commits": -1})
        with self.assertRaises(LagError):
            load_budget(self.write(data))

    def test_boolean_is_not_an_integer(self):
        data = make_budget(budget={"max_branches_ahead": True})
        with self.assertRaises(LagError):
            load_budget(self.write(data))

    def test_empty_file_fails(self):
        tmp = Path(tempfile.mkdtemp())
        (tmp / "platform").mkdir()
        (tmp / BUDGET_PATH).write_text("")
        with self.assertRaises(LagError):
            load_budget(tmp)


class GitRepoTestCase(unittest.TestCase):
    """Builds real repositories, because the measurement is the risky half."""

    def git(self, repo, *args):
        result = subprocess.run(
            ["git", *args],
            cwd=str(repo),
            capture_output=True,
            text=True,
            env={
                "PATH": "/usr/bin:/bin:/usr/local/bin",
                "HOME": str(repo),
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
                "GIT_AUTHOR_NAME": "Test",
                "GIT_AUTHOR_EMAIL": "test@example.invalid",
                "GIT_COMMITTER_NAME": "Test",
                "GIT_COMMITTER_EMAIL": "test@example.invalid",
                "GIT_AUTHOR_DATE": self.stamp,
                "GIT_COMMITTER_DATE": self.stamp,
            },
        )
        if result.returncode != 0:
            raise AssertionError(f"git {' '.join(args)}: {result.stderr}")
        return result.stdout

    def setUp(self):
        self.stamp = "2026-08-01T12:00:00+00:00"
        self.repo = Path(tempfile.mkdtemp())
        self.git(self.repo, "init", "-q", "-b", "main")
        self.commit("README.md", "start")
        # A local ref standing in for the remote-tracking branch. `measure`
        # only ever reads it, so a real remote is not needed.
        self.git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")

    def commit(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        self.git(self.repo, "add", path)
        self.git(self.repo, "commit", "-q", "-m", f"add {path}")


class TestMeasurement(GitRepoTestCase):
    def test_everything_shipped_measures_zero(self):
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.unshipped_commits, 0)
        self.assertEqual(m.branches_ahead, 0)
        self.assertEqual(m.components, [])
        self.assertEqual(m.oldest_unshipped_age_days, 0)

    def test_missing_baseline_ref_raises_instead_of_reporting_zero(self):
        # The whole point. A repository with no origin/main must not read as a
        # repository with nothing left to ship.
        with self.assertRaises(LagError) as ctx:
            measure(self.repo, "origin/nonexistent")
        self.assertIn("does not resolve", str(ctx.exception))
        self.assertIn("Refusing to report zero lag", str(ctx.exception))

    def test_commits_after_baseline_are_counted(self):
        self.commit("ventures/alpha/a.ts", "one")
        self.commit("ventures/alpha/b.ts", "two")
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.unshipped_commits, 2)
        self.assertEqual(m.branches_ahead, 1)
        self.assertEqual(m.components, ["ventures/alpha"])

    def test_oldest_age_uses_the_earliest_unshipped_commit(self):
        self.stamp = "2026-07-20T12:00:00+00:00"
        self.commit("old.txt", "old")
        self.stamp = "2026-08-01T12:00:00+00:00"
        self.commit("new.txt", "new")
        now = int(datetime.fromisoformat("2026-08-02T12:00:00+00:00").timestamp())
        m = measure(self.repo, "origin/main", now_epoch=now)
        self.assertEqual(m.oldest_unshipped_age_days, 13)

    def test_work_on_a_side_branch_is_counted(self):
        self.git(self.repo, "checkout", "-q", "-b", "agent/side")
        self.commit("ventures/beta/x.ts", "x")
        self.git(self.repo, "checkout", "-q", "main")
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.unshipped_commits, 1)
        self.assertEqual(m.branch_names, ["agent/side"])
        self.assertEqual(m.components, ["ventures/beta"])

    def test_a_branch_already_in_the_baseline_is_not_counted(self):
        self.git(self.repo, "checkout", "-q", "-b", "agent/merged")
        self.commit("shipped.txt", "shipped")
        self.git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.unshipped_commits, 0)
        self.assertEqual(m.branches_ahead, 0)

    def test_components_separate_ventures_but_group_the_rest(self):
        self.commit("ventures/alpha/src/a.ts", "a")
        self.commit("ventures/beta/src/b.ts", "b")
        self.commit("platform/ci/x.mjs", "x")
        self.commit("platform/other/y.mjs", "y")
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.components, ["platform", "ventures/alpha", "ventures/beta"])

    def test_root_level_change_is_attributed(self):
        self.commit("pytest.ini", "[pytest]")
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.components, ["(repository root)"])

    def test_baseline_age_is_reported(self):
        m = measure(self.repo, "origin/main")
        self.assertGreaterEqual(m.baseline_age_days, 0)
        self.assertEqual(len(m.baseline_sha), 12)


class TestUnobservableClone(GitRepoTestCase):
    """A shallow clone is a third state, and must never read as a pass."""

    def make_shallow(self):
        (self.repo / ".git" / "shallow").write_text("")

    def test_shallow_clone_is_reported_unobservable(self):
        self.commit("ventures/alpha/a.ts", "one")
        self.make_shallow()
        m = measure(self.repo, "origin/main")
        self.assertFalse(m.observable)
        self.assertIn("shallow clone", m.observability_note)

    def test_shallow_report_does_not_claim_a_pass(self):
        self.make_shallow()
        m = measure(self.repo, "origin/main")
        text = release_lag.format_report(m, make_budget(), evaluate(m, make_budget(), TODAY))
        self.assertIn("NOT MEASURABLE", text)
        self.assertNotIn("PASS", text)

    def test_shallow_clone_does_not_fire_the_stale_budget_check(self):
        # Otherwise every CI run reds the build over a property CI cannot see.
        self.make_shallow()
        m = measure(self.repo, "origin/main")
        self.assertEqual(evaluate(m, make_budget(), TODAY), [])

    def test_an_expired_budget_still_fails_in_a_shallow_clone(self):
        # The document's own freshness is observable anywhere, so it is still
        # enforced. Unobservable lag must not become a general amnesty.
        self.make_shallow()
        m = measure(self.repo, "origin/main")
        data = make_budget(expires=TODAY - timedelta(days=1))
        self.assertIn("budget-expired", checks(evaluate(m, data, TODAY)))

    def test_a_full_clone_with_no_baseline_ref_still_raises(self):
        # The shallow escape hatch must not widen into "any repository where
        # origin/main is missing measures zero".
        with self.assertRaises(LagError):
            measure(self.repo, "origin/nonexistent")


class TestComponentAttribution(unittest.TestCase):
    def test_venture_paths_keep_two_segments(self):
        self.assertEqual(_component_of("ventures/print-atelier/src/lib/checkout.ts"), "ventures/print-atelier")

    def test_bare_ventures_directory_entry(self):
        self.assertEqual(_component_of("ventures"), "(repository root)")

    def test_other_paths_collapse_to_the_top_level(self):
        self.assertEqual(_component_of("platform/ci/test/x.mjs"), "platform")
        self.assertEqual(_component_of("docs/SECURITY_AUDIT_LOG.md"), "docs")

    def test_root_file(self):
        self.assertEqual(_component_of("AGENTS.md"), "(repository root)")


class TestRealRepository(unittest.TestCase):
    """Contract tests against this repository. These are what make it run."""

    def test_declared_budget_is_valid(self):
        data = load_budget(REPO_ROOT)
        self.assertEqual(data["baseline_ref"], "origin/main")
        self.assertTrue(data["rationale"].strip())

    def test_budget_has_an_owner_and_an_issue(self):
        data = load_budget(REPO_ROOT)
        self.assertTrue(str(data["owner"]).strip())
        self.assertTrue(str(data["issue"]).strip())

    def test_this_repository_is_within_its_declared_budget(self):
        # In a shallow CI checkout the branch topology is absent, so the
        # assertion is that the run says so rather than reporting a pass it
        # cannot support. On the machine holding the branches it is the real
        # gate. Both paths execute the full measurement, so neither can rot.
        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT, data["baseline_ref"])
        findings = evaluate(measurement, data, date.today())
        report = release_lag.format_report(measurement, data, findings)
        if not measurement.observable:
            self.assertIn("NOT MEASURABLE", report)
            self.assertNotIn("PASS", report)
        self.assertEqual([], findings, "release lag is outside the declared budget:\n" + report)

    def test_the_gate_can_fail_against_the_real_budget(self):
        # Gate-substance check in miniature: the declared budget, compared
        # against a measurement that exceeds it, must produce findings. This
        # runs everywhere, including shallow clones, because it is the
        # comparison logic being proved rather than the local branch pile.
        data = load_budget(REPO_ROOT)
        over = make_measurement(
            unshipped_commits=data["budget"]["max_unshipped_commits"] + 1,
            oldest_unshipped_age_days=data["budget"]["max_unshipped_age_days"] + 1,
            branches_ahead=data["budget"]["max_branches_ahead"] + 1,
        )
        self.assertEqual(
            checks(evaluate(over, data, date.today())),
            {"lag-above-budget", "oldest-change-stale", "branches-above-budget"},
        )

    def test_the_real_measurement_can_fail_where_it_is_observable(self):
        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT, data["baseline_ref"])
        if not measurement.observable:
            self.assertEqual(evaluate(measurement, data, date.today()), [])
            return
        impossible = load_budget(REPO_ROOT)
        impossible["budget"]["max_unshipped_commits"] = -1
        impossible["budget"]["max_unshipped_age_days"] = -1
        self.assertTrue(evaluate(measurement, impossible, date.today()))

    def test_json_output_distinguishes_not_measurable_from_pass(self):
        import json as _json

        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT, data["baseline_ref"])
        proc = subprocess.run(
            [sys.executable, str(CI_DIR / "release_lag.py"), "--json", "--repo-root", str(REPO_ROOT)],
            capture_output=True,
            text=True,
        )
        payload = _json.loads(proc.stdout)
        self.assertIn(payload["status"], {"pass", "fail", "not-measurable"})
        self.assertEqual(payload["status"] == "not-measurable", not measurement.observable)
        # A run that measured nothing must never report ok.
        if not measurement.observable:
            self.assertFalse(payload["ok"])


if __name__ == "__main__":
    unittest.main()
