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


class RepositoryContractTest(unittest.TestCase):
    """The gate itself, executed against this repository."""

    def test_this_repository_is_within_its_declared_budget(self):
        measurement, budget_data, findings = audit(REPO_ROOT)
        report = format_report(measurement, budget_data, findings)
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
