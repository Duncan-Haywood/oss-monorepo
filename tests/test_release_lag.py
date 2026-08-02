#!/usr/bin/env python3
"""
Unit and contract tests for the release lag audit.

A gate that cannot fail is not a gate, so most of these assert the failing
direction: a backlog over the limit, a stale acknowledgement, an expired one, a
deployment ref that does not resolve, a policy that is missing or malformed.
The measurement tests run against real synthetic git repositories built in a
temp directory rather than against mocks, because the thing most likely to be
wrong here is what `git rev-list` actually returns, and a mock cannot be wrong
about that in the same way.

The last tests are contract tests against the real repository. They are what
make the policy file itself reviewable — an acknowledgement that has quietly
expired, or one whose expiry was pushed years out, fails here rather than
waiting for someone to read the YAML.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to: an audit
that quietly does not run on the machine that matters is the exact failure this
file exists to prevent.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import io
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from contextlib import redirect_stdout
from datetime import date, timedelta

import yaml

import release_lag
from release_lag import (
    MAX_EXPIRY_DAYS,
    POLICY_PATH,
    Commit,
    Measurement,
    Policy,
    ReleaseLagError,
    Service,
    ServiceLag,
    attribute,
    audit,
    branch_breakdown,
    discover_services,
    load_policy,
    measure,
    resolve_deployment_ref,
    unshipped_commits,
)

TODAY = date(2026, 8, 2)


# ---------------------------------------------------------------------------
# synthetic repository helpers
# ---------------------------------------------------------------------------


def run_git(repo: Path, *args: str, when: str = "2026-08-01T12:00:00") -> str:
    env = dict(os.environ)
    env.update(
        {
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_SYSTEM": os.devnull,
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.invalid",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.invalid",
            "GIT_AUTHOR_DATE": when,
            "GIT_COMMITTER_DATE": when,
        }
    )
    result = subprocess.run(
        ["git", *args], cwd=str(repo), env=env, capture_output=True, text=True
    )
    if result.returncode != 0:
        raise AssertionError(f"git {' '.join(args)}: {result.stderr}")
    return result.stdout


def commit_file(repo: Path, path: str, body: str, message: str, when: str) -> None:
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body)
    run_git(repo, "add", "--", path, when=when)
    run_git(repo, "commit", "-m", message, when=when)


def make_repo(tmp: Path) -> Path:
    repo = tmp / "repo"
    repo.mkdir()
    run_git(repo, "init", "--initial-branch=main")
    commit_file(repo, "README.md", "base\n", "base", "2026-07-25T12:00:00")
    # A stand-in for `origin/main`: a real ref under refs/remotes, so the audit
    # exercises the same code path it will on a developer machine.
    run_git(repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    return repo


def write_policy(repo: Path, **overrides) -> str:
    ack = overrides.pop("acknowledged", "unset")
    data = {
        "version": 1,
        "deployment_ref": "origin/main",
        "target": {"max_unshipped_commits": 5, "max_unshipped_age_days": 2},
    }
    if ack != "unset":
        data["acknowledged"] = ack
    data.update(overrides)
    path = repo / "policy.yaml"
    path.write_text(yaml.safe_dump(data))
    return "policy.yaml"


def valid_ack(**overrides) -> dict:
    ack = {
        "id": "RL-001",
        "owner": "duncan",
        "issue": "docs/RELEASE-LAG.md#rl-001",
        "reason": "measured backlog",
        "max_unshipped_commits": 50,
        "max_unshipped_age_days": 10,
        "slack_commits": 20,
        "slack_age_days": 5,
        "expires": date(2026, 9, 1),
    }
    ack.update(overrides)
    return ack


def fake_measurement(commits: int, age: int) -> Measurement:
    return Measurement(
        deployment_ref="origin/main",
        deployment_sha="abc1234",
        deployment_age_days=age,
        unshipped_commits=commits,
        oldest_unshipped_age_days=age,
        branches={},
        services=[],
    )


def policy_from(ack=None, target=None) -> Policy:
    return Policy(
        deployment_ref="origin/main",
        target=target or {"max_unshipped_commits": 5, "max_unshipped_age_days": 2},
        acknowledged=ack,
        extra_components=[],
    )


class TempRepoCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.repo = make_repo(self.tmp)
        self.addCleanup(self._tmp.cleanup)


# ---------------------------------------------------------------------------
# measurement against real git
# ---------------------------------------------------------------------------


class MeasurementTests(TempRepoCase):
    def test_no_unshipped_commits_when_branch_matches_deployment_ref(self):
        self.assertEqual(unshipped_commits(self.repo, "origin/main", TODAY), [])

    def test_commits_ahead_of_the_deployment_ref_are_unshipped(self):
        commit_file(self.repo, "a.txt", "a\n", "add a", "2026-07-30T12:00:00")
        commit_file(self.repo, "b.txt", "b\n", "add b", "2026-08-01T12:00:00")
        found = unshipped_commits(self.repo, "origin/main", TODAY)
        self.assertEqual([c.subject for c in found], ["add b", "add a"])

    def test_age_is_measured_from_the_authored_date(self):
        commit_file(self.repo, "a.txt", "a\n", "add a", "2026-07-28T12:00:00")
        found = unshipped_commits(self.repo, "origin/main", TODAY)
        self.assertEqual(found[0].age_days, 5)

    def test_advancing_the_deployment_ref_ships_the_work(self):
        commit_file(self.repo, "a.txt", "a\n", "add a", "2026-08-01T12:00:00")
        self.assertEqual(len(unshipped_commits(self.repo, "origin/main", TODAY)), 1)
        run_git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")
        self.assertEqual(unshipped_commits(self.repo, "origin/main", TODAY), [])

    def test_work_on_a_side_branch_still_counts(self):
        """The failure this exists for: work parked on an `agent/*` branch."""
        run_git(self.repo, "checkout", "-b", "agent/side")
        commit_file(self.repo, "s.txt", "s\n", "side work", "2026-08-01T12:00:00")
        run_git(self.repo, "checkout", "main")
        found = unshipped_commits(self.repo, "origin/main", TODAY)
        self.assertEqual([c.subject for c in found], ["side work"])

    def test_the_same_commit_on_two_branches_is_counted_once(self):
        commit_file(self.repo, "a.txt", "a\n", "add a", "2026-08-01T12:00:00")
        run_git(self.repo, "branch", "agent/copy")
        found = unshipped_commits(self.repo, "origin/main", TODAY)
        self.assertEqual(len(found), 1)

    def test_branch_breakdown_names_each_stalled_branch(self):
        run_git(self.repo, "checkout", "-b", "agent/side")
        commit_file(self.repo, "s.txt", "s\n", "side", "2026-08-01T12:00:00")
        run_git(self.repo, "checkout", "main")
        counts = branch_breakdown(self.repo, "origin/main")
        self.assertEqual(counts, {"agent/side": 1})

    def test_a_missing_deployment_ref_fails_closed(self):
        with self.assertRaises(ReleaseLagError) as ctx:
            resolve_deployment_ref(self.repo, "origin/does-not-exist")
        self.assertIn("does not resolve", str(ctx.exception))

    def test_a_directory_that_is_not_a_repository_fails_closed(self):
        outside = self.tmp / "not-a-repo"
        outside.mkdir()
        with self.assertRaises(ReleaseLagError):
            resolve_deployment_ref(outside, "origin/main")


# ---------------------------------------------------------------------------
# service attribution
# ---------------------------------------------------------------------------


class AttributionTests(TempRepoCase):
    def _venture(self, name: str, production) -> None:
        body = yaml.safe_dump({"name": name, "links": {"production": production}})
        commit_file(
            self.repo,
            f"ventures/{name}/VENTURE.yaml",
            body,
            f"add {name}",
            "2026-07-25T12:00:00",
        )
        run_git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")

    def test_ventures_are_discovered_with_their_production_link(self):
        self._venture("alpha", "https://alpha.example")
        self._venture("beta", None)
        services = {s.id: s for s in discover_services(self.repo, [])}
        self.assertEqual(services["alpha"].production_url, "https://alpha.example")
        self.assertIsNone(services["beta"].production_url)

    def test_a_commit_is_attributed_to_the_venture_it_touches(self):
        self._venture("alpha", "https://alpha.example")
        self._venture("beta", None)
        commit_file(
            self.repo, "ventures/alpha/src/x.ts", "x\n", "fix alpha", "2026-08-01T12:00:00"
        )
        commits = unshipped_commits(self.repo, "origin/main", TODAY)
        lags = {l.service.id: l for l in attribute(self.repo, commits, discover_services(self.repo, []))}
        self.assertEqual(list(lags), ["alpha"])
        self.assertEqual(len(lags["alpha"].commits), 1)

    def test_a_commit_touching_nothing_deployed_is_attributed_to_nobody(self):
        self._venture("alpha", "https://alpha.example")
        commit_file(self.repo, "docs/notes.md", "n\n", "docs", "2026-08-01T12:00:00")
        commits = unshipped_commits(self.repo, "origin/main", TODAY)
        self.assertEqual(attribute(self.repo, commits, discover_services(self.repo, [])), [])

    def test_a_nested_component_claims_its_path_before_its_parent(self):
        parent = Service(id="parent", path="ventures/alpha", production_url=None)
        child = Service(
            id="child", path="ventures/alpha/docs-site", production_url="https://d.example"
        )
        ordered = discover_services(self.repo, [parent, child])
        self.assertLess(ordered.index(child), ordered.index(parent))

    def test_live_services_are_separated_from_undeployed_ones(self):
        live = ServiceLag(
            service=Service("alpha", "ventures/alpha", "https://alpha.example"),
            commits=[Commit("a" * 40, TODAY, "s", 1)],
        )
        dark = ServiceLag(
            service=Service("beta", "ventures/beta", None),
            commits=[Commit("b" * 40, TODAY, "s", 1)],
        )
        m = fake_measurement(2, 1)
        m.services = [live, dark]
        self.assertEqual([l.service.id for l in m.live_services], ["alpha"])

    def test_measure_reports_the_deployment_ref_age(self):
        commit_file(self.repo, "a.txt", "a\n", "add a", "2026-08-01T12:00:00")
        policy = load_policy(self.repo, write_policy(self.repo))
        m = measure(self.repo, policy, TODAY)
        self.assertEqual(m.unshipped_commits, 1)
        self.assertEqual(m.deployment_age_days, 8)  # base commit was 2026-07-25


# ---------------------------------------------------------------------------
# policy loading — every malformed shape fails closed
# ---------------------------------------------------------------------------


class PolicyLoadingTests(TempRepoCase):
    def test_a_missing_policy_file_fails_closed(self):
        with self.assertRaises(ReleaseLagError) as ctx:
            load_policy(self.repo, "nope.yaml")
        self.assertIn("passes everything", str(ctx.exception))

    def test_unparseable_yaml_fails_closed(self):
        (self.repo / "policy.yaml").write_text("target: [unclosed\n")
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, "policy.yaml")

    def test_a_non_mapping_policy_fails_closed(self):
        (self.repo / "policy.yaml").write_text("- a\n- b\n")
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, "policy.yaml")

    def test_a_missing_deployment_ref_key_fails_closed(self):
        (self.repo / "policy.yaml").write_text(
            yaml.safe_dump({"target": {"max_unshipped_commits": 1, "max_unshipped_age_days": 1}})
        )
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, "policy.yaml")

    def test_a_missing_target_fails_closed(self):
        (self.repo / "policy.yaml").write_text(yaml.safe_dump({"deployment_ref": "origin/main"}))
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, "policy.yaml")

    def test_a_negative_target_fails_closed(self):
        path = write_policy(self.repo)
        data = yaml.safe_load((self.repo / path).read_text())
        data["target"]["max_unshipped_commits"] = -1
        (self.repo / path).write_text(yaml.safe_dump(data))
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, path)

    def test_a_boolean_target_is_not_accepted_as_an_integer(self):
        path = write_policy(self.repo)
        data = yaml.safe_load((self.repo / path).read_text())
        data["target"]["max_unshipped_commits"] = True
        (self.repo / path).write_text(yaml.safe_dump(data))
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, path)

    def test_an_acknowledgement_missing_a_field_fails_closed(self):
        """And says *which* field.

        Every required field also has a type check behind it, so dropping the
        completeness check still fails — just with "`owner` must be a non-empty
        string" for a key that is not there at all. Asserting the field is named
        is what makes this test cover the check it is named after rather than
        passing on someone else's guard.
        """
        for field in release_lag.REQUIRED_ACK_FIELDS:
            ack = valid_ack()
            ack.pop(field)
            path = write_policy(self.repo, acknowledged=ack)
            with self.assertRaises(ReleaseLagError, msg=f"missing {field} was accepted") as ctx:
                load_policy(self.repo, path)
            self.assertIn("is missing", str(ctx.exception), f"for dropped {field}")
            self.assertIn(field, str(ctx.exception))

    def test_a_blank_owner_fails_closed(self):
        path = write_policy(self.repo, acknowledged=valid_ack(owner="   "))
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, path)

    def test_a_list_of_acknowledgements_fails_closed(self):
        path = write_policy(self.repo, acknowledged=[valid_ack()])
        with self.assertRaises(ReleaseLagError) as ctx:
            load_policy(self.repo, path)
        self.assertIn("not a list", str(ctx.exception))

    def test_a_non_date_expiry_fails_closed(self):
        path = write_policy(self.repo, acknowledged=valid_ack(expires="soon"))
        with self.assertRaises(ReleaseLagError):
            load_policy(self.repo, path)

    def test_an_extra_component_pointing_at_nothing_fails_closed(self):
        path = write_policy(
            self.repo, extra_components=[{"id": "ghost", "path": "portfolio/ghost"}]
        )
        with self.assertRaises(ReleaseLagError) as ctx:
            load_policy(self.repo, path)
        self.assertIn("does not exist", str(ctx.exception))

    def test_a_valid_policy_loads(self):
        path = write_policy(self.repo, acknowledged=valid_ack())
        policy = load_policy(self.repo, path)
        self.assertEqual(policy.deployment_ref, "origin/main")
        self.assertEqual(policy.acknowledged["id"], "RL-001")
        self.assertEqual(policy.acknowledged["expires"], date(2026, 9, 1))


# ---------------------------------------------------------------------------
# the ratchet itself — both directions
# ---------------------------------------------------------------------------


class AuditTests(unittest.TestCase):
    def test_inside_the_target_with_no_acknowledgement_passes(self):
        self.assertEqual(audit(fake_measurement(3, 1), policy_from(), TODAY), [])

    def test_over_the_target_with_no_acknowledgement_fails(self):
        failures = audit(fake_measurement(40, 1), policy_from(), TODAY)
        self.assertTrue(any("no acknowledged exception" in f for f in failures))

    def test_over_the_age_target_with_no_acknowledgement_fails(self):
        failures = audit(fake_measurement(1, 9), policy_from(), TODAY)
        self.assertTrue(any("days of unshipped age" in f for f in failures))

    def test_inside_the_acknowledged_limit_passes(self):
        failures = audit(fake_measurement(40, 8), policy_from(valid_ack()), TODAY)
        self.assertEqual(failures, [])

    def test_over_the_acknowledged_limit_fails(self):
        failures = audit(fake_measurement(51, 8), policy_from(valid_ack()), TODAY)
        self.assertTrue(any("grew past what was reviewed" in f for f in failures))

    def test_well_under_the_acknowledged_limit_fails_as_stale(self):
        # limit 50, slack 20 -> anything under 30 means the entry is stale.
        failures = audit(fake_measurement(29, 8), policy_from(valid_ack()), TODAY)
        self.assertTrue(any("stale" in f for f in failures))

    def test_the_slack_band_is_not_treated_as_stale(self):
        failures = audit(fake_measurement(30, 8), policy_from(valid_ack()), TODAY)
        self.assertEqual(failures, [])

    def test_a_backlog_back_inside_the_target_demands_the_entry_be_deleted(self):
        failures = audit(fake_measurement(3, 1), policy_from(valid_ack()), TODAY)
        self.assertTrue(any("Delete the acknowledgement" in f for f in failures))

    def test_an_expired_acknowledgement_fails(self):
        ack = valid_ack(expires=date(2026, 7, 1))
        failures = audit(fake_measurement(40, 8), policy_from(ack), TODAY)
        self.assertTrue(any("expired on" in f for f in failures))

    def test_an_expiry_beyond_the_cap_fails(self):
        ack = valid_ack(expires=TODAY + timedelta(days=MAX_EXPIRY_DAYS + 1))
        failures = audit(fake_measurement(40, 8), policy_from(ack), TODAY)
        self.assertTrue(any("days out" in f for f in failures))

    def test_an_expiry_exactly_at_the_cap_is_allowed(self):
        ack = valid_ack(expires=TODAY + timedelta(days=MAX_EXPIRY_DAYS))
        failures = audit(fake_measurement(40, 8), policy_from(ack), TODAY)
        self.assertEqual(failures, [])

    def test_an_acknowledgement_may_not_tighten_a_limit(self):
        """A limit below the target would make the exception the binding floor."""
        ack = valid_ack(max_unshipped_commits=2, slack_commits=0)
        failures = audit(fake_measurement(1, 8), policy_from(ack), TODAY)
        self.assertTrue(any("may only loosen" in f for f in failures))


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------


class MainTests(TempRepoCase):
    def _run(self, *argv) -> tuple:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = release_lag.main(["--repo", str(self.repo), *argv])
        return code, buf.getvalue()

    def test_a_clean_repository_exits_zero(self):
        write_policy(self.repo)
        code, out = self._run("--policy", "policy.yaml")
        self.assertEqual(code, 0)
        self.assertIn("within policy", out)

    def test_a_backlog_over_the_target_exits_one(self):
        for i in range(8):
            commit_file(self.repo, f"f{i}.txt", "x\n", f"c{i}", "2026-08-01T12:00:00")
        write_policy(self.repo)
        code, out = self._run("--policy", "policy.yaml")
        self.assertEqual(code, 1)
        self.assertIn("FAIL", out)

    def test_report_mode_never_fails_the_build(self):
        for i in range(8):
            commit_file(self.repo, f"f{i}.txt", "x\n", f"c{i}", "2026-08-01T12:00:00")
        write_policy(self.repo)
        code, _ = self._run("--policy", "policy.yaml", "--report")
        self.assertEqual(code, 0)

    def test_json_mode_is_machine_readable(self):
        write_policy(self.repo)
        _, out = self._run("--policy", "policy.yaml", "--json")
        payload = json.loads(out)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["deployment_ref"], "origin/main")

    def test_an_unmeasurable_repository_exits_one_rather_than_passing(self):
        code, _ = self._run("--policy", "absent.yaml")
        self.assertEqual(code, 1)

    def test_an_unmeasurable_repository_reports_not_ok_in_json(self):
        _, out = self._run("--policy", "absent.yaml", "--json")
        self.assertFalse(json.loads(out)["ok"])


# ---------------------------------------------------------------------------
# contract tests against the real repository
# ---------------------------------------------------------------------------


class RepositoryContractTests(unittest.TestCase):
    def test_the_policy_file_exists_and_is_valid(self):
        policy = load_policy(REPO_ROOT, POLICY_PATH)
        self.assertTrue(policy.deployment_ref)
        self.assertIn("max_unshipped_commits", policy.target)

    def test_every_declared_extra_component_still_exists(self):
        """A stale path silently stops attributing anything to that service."""
        policy = load_policy(REPO_ROOT, POLICY_PATH)
        for service in policy.extra_components:
            self.assertTrue((REPO_ROOT / service.path).exists(), service.path)

    def test_the_acknowledgement_has_not_expired(self):
        policy = load_policy(REPO_ROOT, POLICY_PATH)
        if policy.acknowledged is None:
            return  # the target binds directly; nothing to review
        today = date.today()
        self.assertGreaterEqual(
            policy.acknowledged["expires"],
            today,
            "the release-backlog acknowledgement has expired; ship the work or "
            "re-review it in docs/RELEASE-LAG.md",
        )
        self.assertLessEqual(
            (policy.acknowledged["expires"] - today).days,
            MAX_EXPIRY_DAYS,
            "an acknowledgement nobody re-reads is a policy change without review",
        )

    def test_the_acknowledgement_names_an_owner_and_a_written_reason(self):
        policy = load_policy(REPO_ROOT, POLICY_PATH)
        if policy.acknowledged is None:
            return
        self.assertTrue(policy.acknowledged["owner"].strip())
        self.assertGreater(
            len(policy.acknowledged["reason"].strip()),
            80,
            "a one-line reason is not a review record",
        )

    def test_every_venture_with_a_production_url_is_discoverable(self):
        """If a venture stops being discovered, its staleness stops being seen."""
        policy = load_policy(REPO_ROOT, POLICY_PATH)
        services = discover_services(REPO_ROOT, policy.extra_components)
        by_id = {s.id: s for s in services}
        for manifest in sorted((REPO_ROOT / "ventures").glob("*/VENTURE.yaml")):
            self.assertIn(manifest.parent.name, by_id)

    def test_the_audit_can_measure_this_repository(self):
        """Fails if `origin/main` is unfetched — which is itself worth failing on."""
        policy = load_policy(REPO_ROOT, POLICY_PATH)
        m = measure(REPO_ROOT, policy, date.today())
        self.assertGreaterEqual(m.unshipped_commits, 0)
        self.assertTrue(m.deployment_sha)


if __name__ == "__main__":
    unittest.main()
