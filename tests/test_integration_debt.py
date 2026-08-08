#!/usr/bin/env python3
"""
Unit and contract tests for the integration-debt ratchet.

A gate that cannot fail is not a gate, so most of these assert the failing
direction: a pile that fragmented, a budget that converged out from under
itself, an expired budget, a declared ceiling over its cap, a baseline ref that
does not resolve, and — the one this control exists for — a branch absorbed by
a merge that discarded the files it carried.

The measurement half runs against real temporary git repositories rather than
fixtures. The claim being made is about what `git merge-base --independent`
says, and a policy tested only against hand-built `Measurement` objects is a
policy proven correct about numbers nobody checked came from git. That is the
shape of defect this repository keeps finding in its own controls.

The `merge -s ours` case is the one worth reading. It builds a branch that adds
a file, absorbs it with a merge that keeps none of its content, and asserts the
tip count is 1 — converged, by every topological measure — while the artifact
check still reports the loss. Convergence and correctness are different
questions and this pins that they are measured separately.

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

import json
import os
import subprocess
import tempfile
import unittest
from datetime import date, timedelta

import yaml

import integration_debt
from baseline_trust import (
    STATE_DIVERGED,
    STATE_UNREACHABLE,
    STATE_VERIFIED,
    BaselineTrust,
)
from integration_debt import (
    BUDGET_PATH,
    MAX_DECLARED_SLACK,
    MAX_DECLARED_TIPS,
    MAX_EXPIRY_DAYS,
    IntegrationDebtError,
    Measurement,
    audit,
    evaluate,
    format_report,
    load_budget,
    measure,
)

TODAY = date(2026, 8, 4)


def make_budget(**overrides):
    budget = {"max_unintegrated_tips": 4, "slack_tips": 3}
    budget.update(overrides.pop("budget", {}))
    data = {
        "baseline_ref": "origin/main",
        "owner": "duncan",
        "issue": "docs/ENGINEERING-ROADMAP.md#next-30-days",
        "expires": TODAY + timedelta(days=60),
        "budget": budget,
        "rationale": "why this exists",
    }
    data.update(overrides)
    return data


def verified_trust(sha="abc1234567890abc1234567890abc1234567890a"):
    """A baseline the remote confirmed.

    Mirrors `tests/test_release_lag.py`'s helper of the same name, for the same
    reason. The policy tests below are about the tip budget, not about the
    baseline, so they say plainly that the baseline was checked and agreed.
    Stating it is the point: `Measurement.trust` defaults to `None`, and `None`
    is now a finding, so a test that wants to exercise the budget has to declare
    that the other half was satisfied rather than inherit a silent pass.
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


def make_measurement(**overrides):
    data = {
        "baseline_ref": "origin/main",
        "baseline_sha": "abc123def456",
        "candidate_refs": 42,
        "distinct_commits": 42,
        "tips": ["a" * 40],
        "tip_names": ["agent/integration-full"],
        "absorbed_refs": 41,
        "dropped": [],
        "trust": verified_trust(),
    }
    data.update(overrides)
    return Measurement(**data)


class GitRepo:
    """A real git repository built for one test."""

    def __init__(self, root: Path):
        self.root = root
        self._run("init", "-q", "-b", "main")
        self._run("config", "user.email", "test@example.com")
        self._run("config", "user.name", "Test")

    def _run(self, *args):
        env = dict(os.environ)
        env["GIT_CONFIG_GLOBAL"] = "/dev/null"
        env["GIT_CONFIG_SYSTEM"] = "/dev/null"
        result = subprocess.run(
            ["git", *args],
            cwd=str(self.root),
            capture_output=True,
            text=True,
            env=env,
        )
        if result.returncode != 0:
            raise AssertionError(f"git {' '.join(args)} failed: {result.stderr}")
        return result.stdout.strip()

    def commit(self, path: str, content: str = "x", message: str = "c"):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        self._run("add", "-A")
        self._run("commit", "-q", "-m", message)
        return self._run("rev-parse", "HEAD")

    def branch(self, name: str, at: str = "HEAD"):
        self._run("branch", "-f", name, at)

    def checkout(self, name: str, create: bool = False):
        if create:
            self._run("checkout", "-q", "-b", name)
        else:
            self._run("checkout", "-q", name)

    def merge(self, other: str, strategy: str = None):
        args = ["merge", "-q", "--no-ff", "-m", f"merge {other}"]
        if strategy:
            args += ["-s", strategy]
        args.append(other)
        self._run(*args)

    def set_baseline(self, ref: str = "origin/main", at: str = "HEAD"):
        """Create a remote-tracking ref without needing a remote."""
        self._run("update-ref", f"refs/remotes/{ref}", at)


class MeasurementTest(unittest.TestCase):
    """The measurement half, against real git repositories."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = GitRepo(Path(self._tmp.name))
        self.addCleanup(self._tmp.cleanup)

    def test_nothing_ahead_of_the_baseline_is_zero_tips(self):
        self.repo.commit("a.txt")
        self.repo.set_baseline()
        result = measure(self.repo.root, "origin/main")
        self.assertEqual(0, len(result.tips))
        self.assertEqual(0, result.candidate_refs)

    def test_three_divergent_branches_are_three_tips(self):
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        for name in ("one", "two", "three"):
            self.repo.checkout("main")
            self.repo._run("reset", "-q", "--hard", base)
            self.repo.checkout(name, create=True)
            self.repo.commit(f"{name}.txt")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(3, len(result.tips), result.tip_names)
        self.assertEqual(0, result.absorbed_refs)

    def test_branches_absorbed_by_one_tip_are_one_tip(self):
        """The measurement this control exists to make."""
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        for name in ("one", "two", "three"):
            self.repo.checkout("main")
            self.repo._run("reset", "-q", "--hard", base)
            self.repo.checkout(name, create=True)
            self.repo.commit(f"{name}.txt")

        self.repo.checkout("main")
        self.repo._run("reset", "-q", "--hard", base)
        self.repo.checkout("integration", create=True)
        for name in ("one", "two", "three"):
            self.repo.merge(name)

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(1, len(result.tips), result.tip_names)
        self.assertEqual(["integration"], result.tip_names)
        # main, one, two, three are all ahead of the baseline and absorbed.
        self.assertEqual(3, result.absorbed_refs)

    def test_two_refs_at_the_same_commit_are_one_pile(self):
        """Each is an ancestor of the other; naive logic reports zero tips."""
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("work", create=True)
        tip = self.repo.commit("b.txt")
        self.repo.branch("duplicate", at=tip)

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(1, len(result.tips))
        # `work` and `duplicate`. `main` was never moved off the baseline, so
        # it is not ahead of it and is not a candidate.
        self.assertEqual(2, result.candidate_refs)
        self.assertEqual(1, result.distinct_commits)
        self.assertEqual(["duplicate", "work"], result.tip_names)

    def test_symbolic_refs_are_not_counted_as_a_separate_pile(self):
        """`origin/HEAD` is an alias for a ref already counted, not a pile.

        It has to alias something *ahead* of the baseline to test anything: an
        alias for the baseline is filtered out for being the baseline, which
        passes whether or not symbolic refs are skipped.
        """
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("work", create=True)
        tip = self.repo.commit("b.txt")
        self.repo._run("update-ref", "refs/remotes/origin/work", tip)
        self.repo._run("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/work")

        result = measure(self.repo.root, "origin/main")
        self.assertNotIn("origin/HEAD", result.tip_names)
        self.assertEqual(["origin/work", "work"], result.tip_names)
        self.assertEqual(2, result.candidate_refs)
        self.assertEqual(1, len(result.tips))

    def test_an_honest_merge_drops_nothing(self):
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("feature/control.py", "real content")
        self.repo.checkout("main")
        self.repo.merge("feature")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual([], result.dropped)

    def test_a_merge_that_keeps_none_of_the_branch_is_still_one_tip(self):
        """`merge -s ours` converges topologically and discards the work.

        This is the case the tip count alone cannot see, and the reason the
        artifact check exists beside it.
        """
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("feature/control.py", "the whole control")
        self.repo.checkout("main")
        self.repo.commit("unrelated.txt")
        self.repo.merge("feature", strategy="ours")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(1, len(result.tips), "topologically converged")
        self.assertEqual(
            [("feature/control.py", "feature")],
            [(d.path, d.branch) for d in result.dropped],
        )

    def test_a_file_deleted_after_an_honest_merge_is_reported(self):
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("feature/control.py", "the whole control")
        self.repo.checkout("main")
        self.repo.merge("feature")
        (self.repo.root / "feature" / "control.py").unlink()
        self.repo._run("add", "-A")
        self.repo._run("commit", "-q", "-m", "drop it")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(
            [("feature/control.py", "feature")],
            [(d.path, d.branch) for d in result.dropped],
        )

    def test_a_file_the_tip_now_gitignores_is_not_reported_as_dropped(self):
        """Untracking is a decision; losing a control in a merge is an accident.

        Removing the 6200 committed agent-worktree snapshots produced 24780
        reports here — one per file per branch that carried them — which no
        register can absorb and which would have hidden the single real drop
        underneath them.
        """
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("snapshots/copy-of-everything.py", "an agent's snapshot")
        self.repo.commit("feature/control.py", "the whole control")
        self.repo.checkout("main")
        self.repo.merge("feature")
        (self.repo.root / "snapshots" / "copy-of-everything.py").unlink()
        (self.repo.root / "feature" / "control.py").unlink()
        (self.repo.root / ".gitignore").write_text("snapshots/\n")
        self.repo._run("add", "-A")
        self.repo._run("commit", "-q", "-m", "untrack the snapshots, and lose a control")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(
            [("feature/control.py", "feature")],
            [(d.path, d.branch) for d in result.dropped],
            "the ignored path is filtered; the control deleted beside it is not",
        )

    def test_a_renamed_file_is_not_reported_as_dropped(self):
        """A moved control is still a control.

        `portfolio/marisstella-homepage/test/` became `tests/`, with the
        package.json glob updated to match, and this check reported all six
        files as dropped while every one of them was tracked, collected and
        passing. The register is for work that was genuinely discarded; a
        rename recorded there would be a fabricated reason standing in for a
        loss that never happened.
        """
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("test/contract.test.mjs", "the whole control")
        self.repo.checkout("main")
        self.repo.merge("feature")
        (self.repo.root / "test").mkdir(exist_ok=True)
        (self.repo.root / "tests").mkdir(exist_ok=True)
        (self.repo.root / "tests" / "contract.test.mjs").write_text("the whole control")
        (self.repo.root / "test" / "contract.test.mjs").unlink()
        self.repo._run("add", "-A")
        self.repo._run("commit", "-q", "-m", "rename test/ to tests/")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual([], result.dropped)

    def test_a_rename_does_not_mask_a_real_drop_beside_it(self):
        """The content check filters the moved file and only the moved file."""
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("test/contract.test.mjs", "the whole control")
        self.repo.commit("test/second.test.mjs", "a different control")
        self.repo.checkout("main")
        self.repo.merge("feature")
        (self.repo.root / "tests").mkdir(exist_ok=True)
        (self.repo.root / "tests" / "contract.test.mjs").write_text("the whole control")
        (self.repo.root / "test" / "contract.test.mjs").unlink()
        (self.repo.root / "test" / "second.test.mjs").unlink()
        self.repo._run("add", "-A")
        self.repo._run("commit", "-q", "-m", "move one, lose the other")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual(
            [("test/second.test.mjs", "feature")],
            [(d.path, d.branch) for d in result.dropped],
        )

    def test_a_tips_own_files_are_never_reported_as_dropped(self):
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        self.repo.checkout("feature", create=True)
        self.repo.commit("feature/only-here.py")

        result = measure(self.repo.root, "origin/main")
        self.assertEqual([], result.dropped)

    def test_an_unresolvable_baseline_refuses_rather_than_reporting_zero(self):
        self.repo.commit("a.txt")
        with self.assertRaises(IntegrationDebtError) as ctx:
            measure(self.repo.root, "origin/nope")
        self.assertIn("does not resolve", str(ctx.exception))
        self.assertIn("Refusing to report zero debt", str(ctx.exception))

    def test_a_shallow_clone_is_a_third_state_and_never_a_pass(self):
        self.repo.commit("a.txt")
        self.repo.set_baseline()
        (self.repo.root / ".git" / "shallow").write_text("")

        result = measure(self.repo.root, "origin/main")
        self.assertFalse(result.observable)
        report = format_report(result, make_budget(), [])
        self.assertIn("NOT MEASURABLE", report)
        self.assertNotIn("PASS", report)


class BudgetLoadingTest(unittest.TestCase):
    """Fails closed on every missing or over-cap input."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "platform").mkdir(parents=True)
        self.addCleanup(self._tmp.cleanup)

    def write(self, data):
        (self.root / BUDGET_PATH).write_text(yaml.safe_dump(data))

    def test_a_missing_budget_file_fails_rather_than_passing_by_default(self):
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("will not pass by default", str(ctx.exception))

    def test_a_missing_top_level_field_fails(self):
        data = make_budget()
        del data["owner"]
        self.write(data)
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("owner", str(ctx.exception))

    def test_a_missing_budget_field_fails(self):
        data = make_budget()
        del data["budget"]["slack_tips"]
        self.write(data)
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("slack_tips", str(ctx.exception))

    def test_a_declared_tip_ceiling_over_its_cap_fails(self):
        self.write(make_budget(budget={"max_unintegrated_tips": MAX_DECLARED_TIPS + 1}))
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("over the", str(ctx.exception))
        self.assertIn("stopped integration process", str(ctx.exception))

    def test_a_declared_tip_ceiling_at_its_cap_is_allowed(self):
        self.write(
            make_budget(budget={"max_unintegrated_tips": MAX_DECLARED_TIPS, "slack_tips": 1})
        )
        self.assertEqual(MAX_DECLARED_TIPS, load_budget(self.root)["budget"]["max_unintegrated_tips"])

    def test_slack_over_its_cap_fails(self):
        self.write(make_budget(budget={"slack_tips": MAX_DECLARED_SLACK + 1}))
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("hides a fragmented pile", str(ctx.exception))

    def test_an_expiry_beyond_the_horizon_fails(self):
        self.write(make_budget(expires=date.today() + timedelta(days=MAX_EXPIRY_DAYS + 1)))
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("without review", str(ctx.exception))

    def test_a_non_integer_budget_value_fails(self):
        self.write(make_budget(budget={"max_unintegrated_tips": "four"}))
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("non-negative integer", str(ctx.exception))

    def test_a_boolean_budget_value_fails(self):
        """`True` is an int in Python; a budget of True is not a budget."""
        self.write(make_budget(budget={"max_unintegrated_tips": True}))
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("non-negative integer", str(ctx.exception))

    def test_a_dropped_artifact_without_a_reason_fails(self):
        data = make_budget()
        data["dropped_artifacts"] = [
            {"path": "a.py", "branch": "feature", "owner": "duncan"}
        ]
        self.write(data)
        with self.assertRaises(IntegrationDebtError) as ctx:
            load_budget(self.root)
        self.assertIn("reason", str(ctx.exception))
        self.assertIn("work lost in a merge", str(ctx.exception))

    def test_a_fully_specified_dropped_artifact_loads(self):
        data = make_budget()
        data["dropped_artifacts"] = [
            {"path": "a.py", "branch": "feature", "owner": "duncan", "reason": "superseded"}
        ]
        self.write(data)
        self.assertEqual(1, len(load_budget(self.root)["dropped_artifacts"]))


class EvaluationTest(unittest.TestCase):
    """The ratchet, in both directions."""

    def test_within_the_budget_passes(self):
        findings = evaluate(make_measurement(tips=["a" * 40]), make_budget(), TODAY)
        self.assertEqual([], findings)

    def test_more_tips_than_the_budget_fails(self):
        measurement = make_measurement(tips=[c * 40 for c in "abcde"])
        findings = evaluate(measurement, make_budget(), TODAY)
        self.assertEqual(["tips-above-budget"], [f.check for f in findings])
        self.assertIn("5 reconciliations", findings[0].message)

    def test_exactly_at_the_budget_passes(self):
        measurement = make_measurement(tips=[c * 40 for c in "abcd"])
        self.assertEqual([], evaluate(measurement, make_budget(), TODAY))

    def test_converging_below_the_slack_band_fails_as_stale(self):
        """Work merged and the ceiling did not follow. A budget nobody lowers
        records only the worst the process was ever allowed to be."""
        measurement = make_measurement(tips=[])
        findings = evaluate(measurement, make_budget(), TODAY)
        self.assertEqual(["budget-stale"], [f.check for f in findings])
        self.assertIn("Lower `max_unintegrated_tips` to 0", findings[0].message)

    def test_at_the_bottom_of_the_slack_band_passes(self):
        measurement = make_measurement(tips=["a" * 40])
        self.assertEqual([], evaluate(measurement, make_budget(), TODAY))

    def test_an_expired_budget_fails_even_when_the_measurement_is_clean(self):
        data = make_budget(expires=TODAY - timedelta(days=1))
        findings = evaluate(make_measurement(), data, TODAY)
        self.assertEqual(["budget-expired"], [f.check for f in findings])

    def test_an_expired_budget_fails_in_a_shallow_clone_too(self):
        """The one finding that survives an unobservable measurement."""
        data = make_budget(expires=TODAY - timedelta(days=1))
        measurement = make_measurement(observable=False, observability_note="shallow")
        findings = evaluate(measurement, data, TODAY)
        self.assertEqual(["budget-expired"], [f.check for f in findings])

    def test_an_unregistered_dropped_file_fails(self):
        measurement = make_measurement(
            dropped=[integration_debt.DroppedArtifact(path="lost.py", branch="feature")]
        )
        findings = evaluate(measurement, make_budget(), TODAY)
        self.assertEqual(["unregistered-drop"], [f.check for f in findings])
        self.assertIn("discarded a file", findings[0].message)

    def test_a_registered_dropped_file_passes(self):
        data = make_budget()
        data["dropped_artifacts"] = [
            {"path": "lost.py", "branch": "feature", "owner": "duncan", "reason": "superseded"}
        ]
        measurement = make_measurement(
            dropped=[integration_debt.DroppedArtifact(path="lost.py", branch="feature")]
        )
        self.assertEqual([], evaluate(measurement, data, TODAY))

    def test_a_registration_for_a_file_that_came_back_fails_as_stale(self):
        data = make_budget()
        data["dropped_artifacts"] = [
            {"path": "restored.py", "branch": "feature", "owner": "duncan", "reason": "superseded"}
        ]
        findings = evaluate(make_measurement(dropped=[]), data, TODAY)
        self.assertEqual(["stale-drop-registration"], [f.check for f in findings])

    def test_a_registration_matched_to_the_wrong_branch_still_fails(self):
        """The pair is the key. Same filename from a different branch is a
        different loss and needs its own reason."""
        data = make_budget()
        data["dropped_artifacts"] = [
            {"path": "lost.py", "branch": "other", "owner": "duncan", "reason": "superseded"}
        ]
        measurement = make_measurement(
            dropped=[integration_debt.DroppedArtifact(path="lost.py", branch="feature")]
        )
        checks = sorted(f.check for f in evaluate(measurement, data, TODAY))
        self.assertEqual(["stale-drop-registration", "unregistered-drop"], checks)


class ReportingTest(unittest.TestCase):
    def test_one_tip_is_reported_as_one_push(self):
        report = format_report(make_measurement(tips=["a" * 40]), make_budget(), [])
        self.assertIn("converge on one candidate", report)
        self.assertIn("PASS", report)

    def test_a_failing_report_never_says_pass(self):
        measurement = make_measurement(tips=[c * 40 for c in "abcde"])
        findings = evaluate(measurement, make_budget(), TODAY)
        report = format_report(measurement, make_budget(), findings)
        self.assertIn("FAIL", report)
        self.assertNotIn("PASS", report)

    def test_the_json_ok_field_is_false_in_a_shallow_clone(self):
        """A consumer reading only `ok` must not read an absent measurement as
        a clean one. This exact field was wrong in CI for the release-lag
        control before it was caught."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = GitRepo(root)
            repo.commit("a.txt")
            repo.set_baseline()
            (root / "platform").mkdir(parents=True, exist_ok=True)
            (root / BUDGET_PATH).write_text(yaml.safe_dump(make_budget()))
            (root / ".git" / "shallow").write_text("")

            result = subprocess.run(
                [sys.executable, str(CI_DIR / "integration_debt.py"), "--json", "--repo-root", str(root)],
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout)
            self.assertFalse(payload["ok"])
            self.assertFalse(payload["observable"])


class ExitCodeTest(unittest.TestCase):
    """`--report` measures and never fails; the bare invocation is the gate."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.repo = GitRepo(self.root)
        base = self.repo.commit("a.txt")
        self.repo.set_baseline(at=base)
        for name in ("one", "two", "three", "four", "five", "six"):
            self.repo.checkout("main")
            self.repo._run("reset", "-q", "--hard", base)
            self.repo.checkout(name, create=True)
            self.repo.commit(f"{name}.txt")
        (self.root / "platform").mkdir(parents=True, exist_ok=True)
        (self.root / BUDGET_PATH).write_text(yaml.safe_dump(make_budget()))
        self.addCleanup(self._tmp.cleanup)

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, str(CI_DIR / "integration_debt.py"), "--repo-root", str(self.root), *args],
            capture_output=True,
            text=True,
        )

    def test_a_fragmented_pile_exits_nonzero(self):
        result = self._run()
        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn("tips-above-budget", result.stdout)

    def test_report_mode_exits_zero_on_the_same_tree(self):
        result = self._run("--report")
        self.assertEqual(0, result.returncode)
        self.assertIn("FAIL", result.stdout)

    def test_a_missing_budget_file_exits_nonzero(self):
        (self.root / BUDGET_PATH).unlink()
        result = self._run()
        self.assertEqual(1, result.returncode)
        self.assertIn("will not pass by default", result.stderr)


class BaselineTrustTest(unittest.TestCase):
    """The baseline this control counts against is verified, or nothing is reported.

    Every number this module produces is "work not in `baseline_ref`", read out of
    `refs/remotes/origin/main` — a local file any process may write. Measured
    2026-08-08: this was the only `origin/main`-baselined control in
    `scripts/ci/` that never verified it, while `release_lag.py`,
    `branch_collisions.py` and `deployment_lag.py` all did.

    The forgery is cheap and it paid. One
    `git update-ref refs/remotes/origin/main <a local merge of every tip>` moved
    the measurement from 2 tips to 0 on this repository. The gate did not merely
    miss it: 0 against a declared budget of 2 lands in the `budget-stale` branch,
    whose message reads "Lower `max_unintegrated_tips` to 0". Comply once and the
    honest state — a real pile of unintegrated branches — is red for good, and the
    ratchet has been permanently weakened by a fabricated input rather than by any
    change to the code it measures.
    """

    def test_a_measurement_with_no_baseline_check_is_a_finding(self):
        m = make_measurement(trust=None)
        checks = [f.check for f in evaluate(m, make_budget(), TODAY)]
        self.assertIn("baseline-unverified", checks)

    def test_a_diverged_baseline_is_reported_as_forged(self):
        m = make_measurement(
            trust=BaselineTrust(
                ref="origin/main",
                remote="origin",
                branch="main",
                local_sha="a" * 40,
                remote_sha="b" * 40,
                state=STATE_DIVERGED,
                detail="local and remote disagree",
            )
        )
        checks = [f.check for f in evaluate(m, make_budget(), TODAY)]
        self.assertIn("baseline-forged", checks)

    def test_a_verified_baseline_within_budget_produces_no_finding(self):
        m = make_measurement(tips=["a" * 40], trust=verified_trust())
        self.assertEqual([], evaluate(m, make_budget(), TODAY))

    def test_an_unverified_baseline_never_asks_for_a_lower_ceiling(self):
        # The point of the whole class. A forged baseline drives the tip count
        # toward zero, which is the direction that lands in `budget-stale` and
        # instructs a ratchet. That instruction must not be reachable from a
        # baseline nobody could confirm, because acting on it is not reversible in
        # practice: this control treats raising the ceiling again as a weakening.
        m = make_measurement(tips=[], tip_names=[], trust=None)
        findings = evaluate(m, make_budget(budget={"max_unintegrated_tips": 4, "slack_tips": 0}), TODAY)
        checks = [f.check for f in findings]

        self.assertIn("budget-stale-unverifiable", checks)
        self.assertNotIn("budget-stale", checks)
        self.assertNotIn(
            "Lower `max_unintegrated_tips`",
            " ".join(f.message for f in findings),
            "a run that could not verify its baseline named a new ceiling anyway",
        )

    def test_a_verified_baseline_still_asks_for_a_lower_ceiling(self):
        # The other direction, so the guard above cannot be satisfied by simply
        # deleting the ratchet advice. A converged pile on a confirmed baseline
        # must still say so — that is the two-directional half of this control.
        m = make_measurement(tips=[], tip_names=[], trust=verified_trust())
        findings = evaluate(m, make_budget(budget={"max_unintegrated_tips": 4, "slack_tips": 0}), TODAY)

        self.assertIn("budget-stale", [f.check for f in findings])
        self.assertIn("Lower `max_unintegrated_tips` to 0", " ".join(f.message for f in findings))

    def test_the_report_names_the_baseline_it_could_not_verify(self):
        m = make_measurement(trust=None)
        report = format_report(m, make_budget(), evaluate(m, make_budget(), TODAY))
        self.assertIn("UNVERIFIED", report)
        self.assertNotIn("PASS", report)

    def test_measure_verifies_by_default_and_records_what_it_found(self):
        # `verify=False` exists for callers that have already verified. Passing it
        # is not a way to obtain a silent pass: the missing record is itself a
        # finding, so the flag cannot be used to buy a clean run.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        repo = GitRepo(Path(tmp.name))
        repo.commit("a.txt", "one")
        repo.set_baseline()

        skipped = measure(repo.root, "origin/main", verify=False)
        self.assertIsNone(skipped.trust)
        self.assertIn(
            "baseline-unverified", [f.check for f in evaluate(skipped, make_budget(), TODAY)]
        )

        checked = measure(repo.root, "origin/main")
        self.assertIsNotNone(checked.trust)

    def test_the_json_output_states_whether_the_baseline_was_verified(self):
        result = subprocess.run(
            [sys.executable, str(CI_DIR / "integration_debt.py"), "--json", "--report"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        payload = json.loads(result.stdout)
        self.assertIn("baseline_verified", payload)
        self.assertIsInstance(payload["baseline_verified"], bool)


class RepositoryContractTest(unittest.TestCase):
    """The gate itself, executed against this repository."""

    def test_this_repository_is_within_its_declared_budget(self):
        measurement, budget_data, findings = audit(REPO_ROOT)
        report = format_report(measurement, budget_data, findings)

        if measurement.trust and measurement.trust.state == STATE_UNREACHABLE:
            # An offline run cannot say whether the pile is still unintegrated,
            # so it asserts the refusal rather than a budget it has no evidence
            # for. Copied deliberately from `tests/test_release_lag.py`, down to
            # which states land here: only `unreachable`. `diverged` means we
            # checked and the local ref disagrees with the remote, and
            # `missing-on-remote`/`not-a-remote-ref` are misconfiguration. All
            # three stay red below, because for this control they are exactly the
            # states a forged baseline produces.
            self.assertIn("baseline-unverified", [f.check for f in findings])
            self.assertNotIn("PASS", report)
            return

        if not measurement.observable:
            self.assertIn("NOT MEASURABLE", report)
            self.assertNotIn("PASS", report)
            return
        self.assertEqual(
            [], findings, "integration debt is outside the declared budget:\n" + report
        )

    def test_the_declared_budget_is_within_its_caps(self):
        budget = load_budget(REPO_ROOT)["budget"]
        self.assertLessEqual(budget["max_unintegrated_tips"], MAX_DECLARED_TIPS)
        self.assertLessEqual(budget["slack_tips"], MAX_DECLARED_SLACK)

    def test_every_registered_drop_states_who_accepted_it_and_why(self):
        for entry in load_budget(REPO_ROOT).get("dropped_artifacts") or []:
            for field in ("path", "branch", "owner", "reason"):
                self.assertTrue(entry.get(field), f"{entry} is missing {field}")
            self.assertGreater(
                len(entry["reason"]), 60, f"{entry['path']}: a one-word reason is not a reason"
            )


if __name__ == "__main__":
    unittest.main()
