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
TESTS_DIR = Path(__file__).resolve().parent
for _path in (str(CI_DIR), str(TESTS_DIR)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import dataclasses
import json as _json
import subprocess
import tempfile
import textwrap
import unittest
from datetime import date, datetime, timedelta

import yaml

import baseline_trust
import release_lag
from baseline_trust import (
    STATE_DIVERGED,
    STATE_MISSING_ON_REMOTE,
    STATE_NOT_A_REMOTE_REF,
    STATE_UNREACHABLE,
    STATE_VERIFIED,
    BaselineTrust,
    split_remote_ref,
    trust_findings,
    verify_baseline,
)
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
from scratch_remote import ScratchRemote

TODAY = date(2026, 8, 2)


def verified_trust(sha="abc1234567890abc1234567890abc1234567890a"):
    """A baseline the remote confirmed.

    The policy tests below are about the lag budget, not about the baseline, so
    they say plainly that the baseline was checked and agreed. Stating it is the
    point: `Measurement.trust` defaults to `None`, and `None` is a finding, so a
    test that wants to exercise the budget has to declare that the other half
    was satisfied rather than inherit a silent pass.
    """
    return BaselineTrust(
        ref="origin/main",
        remote="origin",
        branch="main",
        local_sha=sha,
        remote_sha=sha,
        state=STATE_VERIFIED,
        detail="test fixture: remote agreed",
    )


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
        "trust": verified_trust(),
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
    """Builds real repositories, because the measurement is the risky half.

    These used to stand `refs/remotes/origin/main` up with `git update-ref`,
    on the reasoning that `measure` only reads it so a real remote was not
    needed. That reasoning was the defect in miniature: the tests agreed with
    the code that a hand-written tracking ref is as good as a remote. Every
    repository built here now has a real bare `origin`, and the baseline is
    moved by publishing to it and fetching back.
    """

    def git(self, repo, *args):
        return self.scratch._run(Path(repo), *args).stdout

    def setUp(self):
        self.scratch = ScratchRemote()
        self.addCleanup(self.scratch.cleanup)
        self.repo = self.scratch.work

    @property
    def stamp(self):
        return self.scratch.stamp

    @stamp.setter
    def stamp(self, value):
        self.scratch.stamp = value

    def commit(self, path, text):
        self.scratch.commit(path, text)


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
        # Shipped for real: the remote moves, then a fetch brings the tracking
        # ref along. This is the honest version of the `update-ref` this test
        # used to do, and the only version `measure` now believes.
        self.scratch.publish()
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

    def test_components_include_work_reachable_only_from_a_tracking_ref(self):
        # A clone and a CI checkout have exactly one local branch; everything
        # else the fleet has pushed is reachable only through `refs/remotes/`.
        # `unshipped_commits` and `branch_names` both read tracking refs, and
        # `components` did not — so the one line of the report that names *what*
        # is running behind came out empty in exactly the environment the report
        # is read in. The count said "1 commit unshipped" and the list of
        # affected components said nothing.
        self.git(self.repo, "checkout", "-q", "-b", "agent/remote-only")
        self.commit("ventures/gamma/x.ts", "x")
        self.scratch.publish_branch("agent/remote-only")
        self.git(self.repo, "checkout", "-q", "main")
        self.git(self.repo, "branch", "-q", "-D", "agent/remote-only")

        m = measure(self.repo, "origin/main")
        self.assertEqual(m.unshipped_commits, 1)
        self.assertEqual(m.branch_names, ["origin/agent/remote-only"])
        self.assertEqual(m.components, ["ventures/gamma"])

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


class TestBaselineTrust(GitRepoTestCase):
    """The baseline is a local file. These prove it is no longer taken on trust.

    Every one of these drives the real `git` binary against a real bare remote
    in a temp directory. Nothing here patches `verify_baseline`, `subprocess`,
    or anything else inside `release_lag` or `baseline_trust`: a test that stubs
    the module the fix lives in stays green when the fix is reverted, which is
    a defect this repository has shipped before.
    """

    def budget_file(self, **budget):
        (self.repo / "platform").mkdir(parents=True, exist_ok=True)
        data = make_budget(budget=budget)
        data["expires"] = data["expires"].isoformat()
        (self.repo / BUDGET_PATH).write_text(yaml.safe_dump(data))

    def cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CI_DIR / "release_lag.py"), "--repo-root", str(self.repo), *args],
            capture_output=True,
            text=True,
        )

    # -- the honest case --------------------------------------------------

    def test_a_tracking_ref_that_matches_the_remote_is_verified(self):
        trust = verify_baseline(self.repo, "origin/main")
        self.assertEqual(trust.state, STATE_VERIFIED)
        self.assertTrue(trust.verified)
        self.assertEqual(trust.remote_sha, trust.local_sha)
        self.assertEqual(trust_findings(trust), [])

    def test_publishing_and_fetching_keeps_the_baseline_verified(self):
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.publish()
        self.assertEqual(verify_baseline(self.repo, "origin/main").state, STATE_VERIFIED)

    # -- the forgery ------------------------------------------------------

    def test_a_hand_written_tracking_ref_is_detected(self):
        # `git update-ref refs/remotes/origin/main <local commit>`: the command
        # behind the blank-reason entries in this repository's own reflog.
        real = self.scratch.rev("refs/remotes/origin/main")
        self.commit("ventures/alpha/a.ts", "one")
        forged = self.scratch.forge_baseline("HEAD")
        self.assertNotEqual(real, forged)

        trust = verify_baseline(self.repo, "origin/main")
        self.assertEqual(trust.state, STATE_DIVERGED)
        self.assertFalse(trust.verified)
        # Both shas must be named, and neither silently preferred.
        self.assertIn(forged, trust.detail)
        self.assertIn(real, trust.detail)
        self.assertIn("does not reflect the remote", trust.detail)

    # -- the evidence in the message, measured rather than declared -------

    def forged_message(self):
        """The `baseline-forged` finding message for the current repo state."""
        findings = trust_findings(verify_baseline(self.repo, "origin/main"))
        self.assertEqual([c for c, _ in findings], ["baseline-forged"])
        return findings[0][1]

    def test_a_single_hand_written_write_is_reported_as_one_not_as_four(self):
        # The message used to carry the literal `four`, measured once on
        # 2026-08-04. It was 34 by 2026-08-05 and it was never 4 on any
        # repository but this one, on any day but that one.
        self.commit("ventures/alpha/a.ts", "one")
        forged = self.scratch.forge_baseline("HEAD")

        message = self.forged_message()
        self.assertIn("written by hand in this repository once", message)
        self.assertIn(forged[:12], message)
        self.assertNotIn("four", message)

    def test_repeated_hand_written_writes_are_counted(self):
        for i in range(3):
            self.commit(f"ventures/alpha/{i}.ts", str(i))
            self.scratch.forge_baseline("HEAD")

        message = self.forged_message()
        self.assertIn("written by hand in this repository 3 times", message)
        self.assertNotIn("four", message)

    def test_the_latest_hand_written_write_is_dated_so_a_reader_can_tell_now_from_history(self):
        # A count alone reads as a closed incident, and the remedy for a closed
        # incident is `git fetch`. The date is what says the practice is live.
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.forge_baseline("HEAD")

        history = baseline_trust.hand_written_history(self.repo, "origin/main")
        self.assertTrue(history.readable)
        self.assertEqual(history.hand_written, 1)
        # An ISO-8601 date, not a reflog selector like `origin/main@{0}`.
        datetime.fromisoformat(history.latest_date)
        self.assertIn(history.latest_date, self.forged_message())

    def test_an_ordinary_stale_fetch_is_not_reported_as_a_forgery(self):
        # Somebody else shipped and this checkout has not caught up. Diverged,
        # so it must still refuse — but naming a forger here is an accusation
        # the reflog does not support, and it sends the reader after the wrong
        # cause.
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.advance_remote_without_fetching("HEAD")

        trust = verify_baseline(self.repo, "origin/main")
        self.assertEqual(trust.state, STATE_DIVERGED)

        message = self.forged_message()
        self.assertIn("Nothing has written it by hand", message)
        self.assertNotIn("written by hand in this repository", message)
        self.assertNotIn("find what writes the ref", message)
        # Still a refusal, and still the same check id.
        self.assertIn("do not adjust any budget to fit this", message)

    def test_an_unreadable_reflog_is_not_reported_as_a_clean_one(self):
        # A fresh clone has no reflog for a ref it has not seen change. "Nobody
        # forged this" and "we could not tell" are different facts; the second
        # may not be rendered as the first, and neither may assert a count.
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.forge_baseline("HEAD")
        self.scratch.drop_reflog()

        history = baseline_trust.hand_written_history(self.repo, "origin/main")
        self.assertFalse(history.readable)
        self.assertEqual(history.hand_written, 0)

        message = self.forged_message()
        self.assertIn("unmeasured", message)
        self.assertNotIn("Nothing has written it by hand", message)
        self.assertNotIn("written by hand in this repository once", message)

    def test_honest_git_operations_are_never_counted_as_hand_written(self):
        # The whole discriminator is the blank reason. If a fetch or a branch
        # update ever counted, the number would grow on ordinary work and the
        # message would become noise that gets deleted.
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.publish()
        self.commit("ventures/alpha/b.ts", "two")
        self.scratch.publish()

        history = baseline_trust.hand_written_history(self.repo, "origin/main")
        self.assertTrue(history.readable)
        self.assertGreater(history.total, 1)
        self.assertEqual(history.hand_written, 0)

    def test_the_forgery_is_exactly_what_makes_the_lag_vanish(self):
        # This is the measured defect, reproduced end to end: the same
        # repository reports two very different amounts of undelivered work
        # depending only on who last wrote a local file.
        for i in range(4):
            self.commit(f"ventures/alpha/{i}.ts", str(i))

        honest = measure(self.repo, "origin/main")
        self.assertEqual(honest.unshipped_commits, 4)
        self.assertTrue(honest.trust.verified)

        self.scratch.forge_baseline("HEAD")
        forged = measure(self.repo, "origin/main")
        # The count collapses to nothing...
        self.assertEqual(forged.unshipped_commits, 0)
        # ...and the gate refuses anyway, which is the entire fix.
        findings = evaluate(forged, make_budget(), TODAY)
        self.assertIn("baseline-forged", checks(findings))

    def test_a_forged_baseline_never_prints_a_pass(self):
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.forge_baseline("HEAD")
        m = measure(self.repo, "origin/main")
        data = make_budget(budget={"max_unshipped_commits": 0, "slack_commits": 40})
        text = release_lag.format_report(m, data, evaluate(m, data, TODAY))
        self.assertIn("UNVERIFIED", text)
        self.assertNotIn("PASS", text)

    def test_the_cli_refuses_a_forged_baseline(self):
        # The gate as a process: exit status, not just a returned list.
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.forge_baseline("HEAD")
        self.budget_file(max_unshipped_commits=0, slack_commits=40)
        proc = self.cli()
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("baseline-forged", proc.stdout)

    def test_the_json_output_reports_an_unverified_baseline(self):
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.forge_baseline("HEAD")
        self.budget_file(max_unshipped_commits=0, slack_commits=40)
        payload = _json.loads(self.cli("--json").stdout)
        self.assertFalse(payload["ok"])
        self.assertFalse(payload["baseline_verified"])
        self.assertEqual(payload["status"], "fail")
        self.assertEqual(payload["baseline_trust"]["state"], STATE_DIVERGED)

    # -- the outage -------------------------------------------------------

    def test_an_unreachable_remote_is_not_a_pass(self):
        self.scratch.break_remote()
        trust = verify_baseline(self.repo, "origin/main")
        self.assertEqual(trust.state, STATE_UNREACHABLE)
        self.assertFalse(trust.verified)
        self.assertEqual([c for c, _ in trust_findings(trust)], ["baseline-unverified"])

    def test_offline_with_nothing_to_ship_still_refuses(self):
        # The dangerous shape: zero lag and no network. Falling back to the
        # local ref here would print PASS for a delivery nobody confirmed, and
        # would do it on the exact runs where the check matters most.
        self.scratch.break_remote()
        m = measure(self.repo, "origin/main")
        self.assertEqual(m.unshipped_commits, 0)
        data = make_budget(budget={"max_unshipped_commits": 0, "slack_commits": 40})
        findings = evaluate(m, data, TODAY)
        self.assertIn("baseline-unverified", checks(findings))
        text = release_lag.format_report(m, data, findings)
        self.assertNotIn("PASS", text)

    def test_the_cli_exits_non_zero_when_the_remote_is_unreachable(self):
        self.scratch.break_remote()
        self.budget_file(max_unshipped_commits=0, slack_commits=40)
        proc = self.cli()
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("baseline-unverified", proc.stdout)

    def test_a_baseline_naming_no_remote_is_not_a_pass(self):
        self.scratch.drop_remote()
        trust = verify_baseline(self.repo, "origin/main")
        self.assertEqual(trust.state, STATE_NOT_A_REMOTE_REF)
        self.assertTrue(trust_findings(trust))

    def test_a_branch_absent_from_the_remote_is_not_a_pass(self):
        trust = verify_baseline(self.repo, "origin/never-existed")
        self.assertEqual(trust.state, STATE_MISSING_ON_REMOTE)
        self.assertTrue(trust_findings(trust))

    # -- the hole the fix must not leave ----------------------------------

    def test_measuring_without_verifying_is_itself_a_finding(self):
        # `verify=False` exists for callers that have already verified. If it
        # ever becomes the quiet default, this fails.
        m = measure(self.repo, "origin/main", verify=False)
        self.assertIsNone(m.trust)
        self.assertIn("baseline-unverified", checks(evaluate(m, make_budget(), TODAY)))

    def test_only_the_verified_state_produces_no_finding(self):
        # Completeness: no state may be added later that quietly means "fine".
        states = [
            STATE_VERIFIED,
            STATE_DIVERGED,
            STATE_MISSING_ON_REMOTE,
            STATE_NOT_A_REMOTE_REF,
            STATE_UNREACHABLE,
        ]
        silent = [
            s
            for s in states
            if not trust_findings(BaselineTrust("origin/main", "origin", "main", "a" * 40, "b" * 40, s, "d"))
        ]
        self.assertEqual(silent, [STATE_VERIFIED])

    def test_a_forged_baseline_is_still_caught_in_a_shallow_clone(self):
        # The shallow-clone third state must not become an amnesty: whether the
        # ref reflects the remote has nothing to do with branch topology.
        self.commit("ventures/alpha/a.ts", "one")
        self.scratch.forge_baseline("HEAD")
        (self.repo / ".git" / "shallow").write_text("")
        m = measure(self.repo, "origin/main")
        self.assertFalse(m.observable)
        self.assertIn("baseline-forged", checks(evaluate(m, make_budget(), TODAY)))


class TestRemoteRefSplitting(unittest.TestCase):
    def test_plain_remote_and_branch(self):
        self.assertEqual(split_remote_ref("origin/main", {"origin"}), ("origin", "main"))

    def test_a_branch_containing_slashes(self):
        self.assertEqual(split_remote_ref("origin/release/1.0", {"origin"}), ("origin", "release/1.0"))

    def test_the_longest_matching_remote_wins(self):
        self.assertEqual(split_remote_ref("origin/backup/main", {"origin", "origin/backup"}), ("origin/backup", "main"))

    def test_an_unknown_remote_does_not_split(self):
        self.assertIsNone(split_remote_ref("origin/main", {"upstream"}))

    def test_a_bare_local_ref_does_not_split(self):
        self.assertIsNone(split_remote_ref("main", {"origin"}))


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

        if measurement.trust and measurement.trust.state == STATE_UNREACHABLE:
            # This branch used to read:
            #
            #     findings = [f for f in findings if f.check != "baseline-unverified"]
            #
            # i.e. delete the finding, then assert the list is empty. That is
            # the exact fall-through `baseline_trust`'s docstring forbids — "the
            # one thing neither may do is fall through to the local ref in
            # silence" — and it applied on every offline run, which is when a
            # delivery claim is least supportable. Since pytest is this
            # control's only execution path (`release_lag.py`'s CLI is not the
            # gate), the module's stated policy was enforced nowhere.
            #
            # An offline run cannot say whether the pile shipped, so it asserts
            # the refusal rather than a budget it has no evidence for. Only
            # `unreachable` lands here: `diverged` means we checked and it is
            # wrong, and `missing-on-remote`/`not-a-remote-ref` are
            # misconfiguration. All three stay red below.
            self.assertIn("baseline-unverified", [f.check for f in findings])
            self.assertNotIn("PASS", report)
            return

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

    def test_the_real_measurement_verifies_its_baseline(self):
        # The gate for this control is pytest, not the CLI, so the verification
        # has to be on the path pytest takes. If `measure` ever stops asking the
        # remote, `trust` is None and this fails.
        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT, data["baseline_ref"])
        self.assertIsNotNone(
            measurement.trust,
            "the real measurement did not check its baseline against the remote",
        )
        self.assertEqual(measurement.trust.ref, data["baseline_ref"])

    def test_a_forged_baseline_would_be_caught_here(self):
        # Gate-substance: prove the refusal fires on this repository's own
        # configuration rather than only in a scratch fixture. The local ref is
        # not touched — only a hypothetical trust result is evaluated.
        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT, data["baseline_ref"])
        forged = dataclasses.replace(
            measurement,
            trust=BaselineTrust(
                ref=data["baseline_ref"],
                remote="origin",
                branch="main",
                local_sha="0" * 40,
                remote_sha="1" * 40,
                state=STATE_DIVERGED,
                detail="hypothetical divergence",
            ),
        )
        self.assertIn("baseline-forged", checks(evaluate(forged, data, date.today())))

    def test_json_output_distinguishes_not_measurable_from_pass(self):
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
