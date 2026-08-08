"""
Contract for `scripts/ci/deployment_lag.py`.

Every fixture here is a real git repository built in a temp directory, with a
real `gitops-production` branch carrying real annotations. Nothing patches
`subprocess`, and nothing hand-writes a ref: `tests/test_release_lag.py` records
why — the sibling suite once wrote `refs/remotes/origin/main` by hand, which
made the tests agree with the code that a hand-written ref is as good as a
remote, and that was the defect the module existed to catch.

The three states this module must keep apart, and which class covers each:

  * measured and within budget            -> TestMeasurement, TestEvaluation
  * measured and over budget              -> TestEvaluation
  * not measurable on this machine        -> TestUnobservableClone

The third is the one that has repeatedly been reported as the first in this
repository, so it is tested by removing the input rather than by setting a flag.
"""

from __future__ import annotations

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

import deployment_lag
from deployment_lag import (
    DeploymentLagError,
    Measurement,
    Service,
    budget_findings,
    evaluate,
    format_report,
    ingress_hosts,
    load_budget,
    measure,
    recorded_revision,
)
from baseline_trust import STATE_VERIFIED, BaselineTrust

TODAY = date(2026, 8, 5)


def verified_trust(sha="abc1234567890abc1234567890abc1234567890a"):
    """A baseline the remote confirmed.

    Same helper and same reason as `tests/test_release_lag.py` and
    `tests/test_integration_debt.py`. `Measurement.trust` defaults to `None` and
    `None` is a finding, so a test about the lag budget has to state that the
    baseline half was satisfied rather than inherit a silent pass.
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


def budget_doc(**overrides):
    budget = {
        "max_commits_behind": 10,
        "max_unrecorded_deployments": 2,
        "max_deployed_age_days": 7,
        "slack_commits": 5,
    }
    budget.update(overrides.pop("budget", {}))
    doc = {
        "owner": "duncan",
        "issue": "docs/ENGINEERING-ROADMAP.md#x",
        "expires": TODAY + timedelta(days=30),
        "budget": budget,
    }
    doc.update(overrides)
    return doc


DEPLOYMENT_TEMPLATE = """\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {name}
{annotations}\
spec:
  replicas: 1
"""

INGRESS_TEMPLATE = """\
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {name}
spec:
{rules}\
"""


class ScratchRepo:
    """A git repository with a `main` and a `gitops-production` branch.

    Built rather than mocked so that `measure` runs the same `git rev-list` it
    runs in production. `origin` is a real bare remote and both refs are
    published to it, because the module reads `origin/main` and
    `origin/gitops-production` specifically.
    """

    def __init__(self):
        self.root = Path(tempfile.mkdtemp())
        self.work = self.root / "work"
        self.bare = self.root / "origin.git"
        self._run(self.root, "init", "--bare", "--initial-branch=main", str(self.bare))
        self._run(self.root, "init", "--initial-branch=main", str(self.work))
        self._run(self.work, "config", "user.email", "t@example.com")
        self._run(self.work, "config", "user.name", "T")
        self._run(self.work, "remote", "add", "origin", str(self.bare))
        self.stamp = 1_754_000_000

    def _run(self, cwd, *args):
        return subprocess.run(
            ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=True
        )

    def write(self, relative, text):
        path = self.work / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def commit(self, message="c"):
        self.stamp += 86_400
        env_date = f"{self.stamp} +0000"
        self._run(self.work, "add", "-A")
        # `--allow-empty` so a GitOps branch that records *nothing* is still a
        # real branch. That is the case under test in the unrecorded-deployment
        # fixtures, and it is also this repository's state for seven of its
        # eight services.
        subprocess.run(
            ["git", "commit", "--allow-empty", "-m", message],
            cwd=str(self.work),
            capture_output=True,
            text=True,
            check=True,
            env={**os.environ, "GIT_AUTHOR_DATE": env_date, "GIT_COMMITTER_DATE": env_date},
        )
        return self._run(self.work, "rev-parse", "HEAD").stdout.strip()

    def service(self, name, hosts=(), revision=None):
        """Declare a service on `main`."""
        if hosts:
            rules = "  rules:\n" + "".join(f"  - host: {host}\n" for host in hosts)
        else:
            rules = "  rules: []\n"
        self.write(
            f"platform/k8s/apps/{name}/ingress.yaml",
            INGRESS_TEMPLATE.format(name=name, rules=rules),
        )
        self.write(
            f"platform/k8s/apps/{name}/deployment.yaml",
            DEPLOYMENT_TEMPLATE.format(name=name, annotations=""),
        )

    def publish_gitops(self, deployed):
        """Write `gitops-production` recording `deployed` = {service: revision}."""
        self._run(self.work, "checkout", "-B", "gitops-production")
        for name, revision in deployed.items():
            annotations = f'  annotations:\n    {name}.example.dev/revision: "{revision}"\n'
            self.write(
                f"platform/k8s/apps/{name}/deployment.yaml",
                DEPLOYMENT_TEMPLATE.format(name=name, annotations=annotations),
            )
        self.commit("gitops")
        self._run(self.work, "push", "-u", "origin", "gitops-production")
        self._run(self.work, "checkout", "main")

    def push_main(self):
        self._run(self.work, "push", "-u", "origin", "main")
        self._run(self.work, "fetch", "origin")

    def cleanup(self):
        subprocess.run(["rm", "-rf", str(self.root)], check=False)


class GitFixture(unittest.TestCase):
    def setUp(self):
        self.scratch = ScratchRepo()
        self.addCleanup(self.scratch.cleanup)
        self.repo = self.scratch.work


class TestIngressParsing(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_absent_manifest_declares_no_hosts(self):
        self.assertEqual([], ingress_hosts(self.tmp / "nope.yaml"))

    def test_every_rule_is_read(self):
        path = self.tmp / "ingress.yaml"
        path.write_text(
            INGRESS_TEMPLATE.format(
                name="x", rules="  rules:\n  - host: a.example\n  - host: b.example\n"
            ),
            encoding="utf-8",
        )
        self.assertEqual(["a.example", "b.example"], ingress_hosts(path))

    def test_a_second_document_is_not_silently_dropped(self):
        # `safe_load` returns only the first document. A second Ingress in the
        # same file would then be a public hostname invisible to this control,
        # which is exactly the class of defect the module is about.
        path = self.tmp / "ingress.yaml"
        first = INGRESS_TEMPLATE.format(name="a", rules="  rules:\n  - host: a.example\n")
        second = INGRESS_TEMPLATE.format(name="b", rules="  rules:\n  - host: b.example\n")
        path.write_text(f"{first}---\n{second}", encoding="utf-8")
        self.assertEqual(["a.example", "b.example"], ingress_hosts(path))

    def test_unreadable_manifest_raises_rather_than_reporting_no_hosts(self):
        path = self.tmp / "ingress.yaml"
        path.write_text("spec: [unclosed\n", encoding="utf-8")
        with self.assertRaises(DeploymentLagError):
            ingress_hosts(path)


class TestRevisionAnnotation(unittest.TestCase):
    def test_revision_is_read_for_any_host_namespace(self):
        # Matched by suffix on purpose: a control that needs a literal key added
        # per service silently omits the service nobody remembered to add.
        blob = DEPLOYMENT_TEMPLATE.format(
            name="x", annotations='  annotations:\n    anything.example.dev/revision: "abc123"\n'
        )
        self.assertEqual("abc123", recorded_revision(blob, "x"))

    def test_no_annotation_is_none_not_empty_string(self):
        blob = DEPLOYMENT_TEMPLATE.format(name="x", annotations="")
        self.assertIsNone(recorded_revision(blob, "x"))

    def test_annotation_on_a_non_deployment_is_ignored(self):
        # A revision recorded on a Service or ConfigMap says nothing about which
        # image is running. Reading it would let a stale rollout claim to be
        # tracked by an annotation on a neighbouring object.
        blob = (
            "apiVersion: v1\nkind: Service\nmetadata:\n  name: x\n"
            '  annotations:\n    a.example.dev/revision: "abc123"\n'
        )
        self.assertIsNone(recorded_revision(blob, "x"))

    def test_empty_revision_value_is_none(self):
        blob = DEPLOYMENT_TEMPLATE.format(
            name="x", annotations='  annotations:\n    a.example.dev/revision: ""\n'
        )
        self.assertIsNone(recorded_revision(blob, "x"))


class TestMeasurement(GitFixture):
    def test_a_recorded_revision_measures_its_true_distance(self):
        self.scratch.service("svc", hosts=["svc.example"])
        deployed = self.scratch.commit("deployed")
        self.scratch.publish_gitops({"svc": deployed})
        self.scratch.write("ventures/svc/a.txt", "1")
        self.scratch.commit("after 1")
        self.scratch.write("ventures/svc/b.txt", "2")
        self.scratch.commit("after 2")
        self.scratch.push_main()

        m = measure(self.repo)
        self.assertTrue(m.observable)
        svc = next(s for s in m.services if s.name == "svc")
        self.assertEqual(deployed, svc.revision)
        self.assertEqual(2, svc.commits_behind)
        self.assertEqual(2, svc.own_commits_behind)

    def test_a_public_service_with_no_annotation_is_unrecorded_not_zero(self):
        # The whole second dimension. "We do not know what is running" must not
        # read as "nothing is behind".
        self.scratch.service("svc", hosts=["svc.example"])
        self.scratch.commit("c")
        self.scratch.publish_gitops({})
        self.scratch.push_main()

        m = measure(self.repo)
        svc = next(s for s in m.services if s.name == "svc")
        self.assertIsNone(svc.revision)
        self.assertFalse(svc.measured)
        self.assertEqual(["svc"], [s.name for s in m.unrecorded])
        self.assertEqual(0, m.worst_commits_behind)
        self.assertFalse(m.measured_any)

    def test_a_service_with_no_ingress_is_not_a_public_surface(self):
        self.scratch.service("internal", hosts=[])
        self.scratch.commit("c")
        self.scratch.publish_gitops({})
        self.scratch.push_main()

        m = measure(self.repo)
        self.assertEqual([], [s.name for s in m.public_services])
        self.assertEqual([], [s.name for s in m.unrecorded])

    def test_the_service_template_is_not_counted_as_a_deployment(self):
        self.scratch.service("service-template", hosts=["app-name.yourdomain.com"])
        self.scratch.service("real", hosts=["real.example"])
        self.scratch.commit("c")
        self.scratch.publish_gitops({})
        self.scratch.push_main()

        m = measure(self.repo)
        self.assertEqual(["real"], [s.name for s in m.services])

    def test_deployed_age_is_measured_from_the_deployed_commit(self):
        self.scratch.service("svc", hosts=["svc.example"])
        deployed = self.scratch.commit("deployed")
        self.scratch.publish_gitops({"svc": deployed})
        self.scratch.push_main()

        m = measure(self.repo)
        svc = next(s for s in m.services if s.name == "svc")
        self.assertIsNotNone(svc.deployed_age_days)
        self.assertGreaterEqual(svc.deployed_age_days, 0)

    def test_missing_apps_directory_raises_rather_than_passing_empty(self):
        self.scratch.write("readme.md", "x")
        self.scratch.commit("c")
        self.scratch.push_main()
        with self.assertRaises(DeploymentLagError) as ctx:
            measure(self.repo)
        self.assertIn("nothing to measure", str(ctx.exception))


class TestUnobservableClone(GitFixture):
    """The third state. Absent inputs must report, never pass."""

    def test_absent_gitops_branch_is_not_measurable_rather_than_compliant(self):
        self.scratch.service("svc", hosts=["svc.example"])
        self.scratch.commit("c")
        self.scratch.push_main()

        m = measure(self.repo)
        self.assertFalse(m.observable)
        self.assertIn("not present in this clone", m.observability_note)

        findings = evaluate(m, budget_doc(), TODAY)
        report = format_report(m, budget_doc(), findings)
        self.assertIn("NOT MEASURABLE HERE", report)
        self.assertNotIn("PASS", report)

    def test_a_revision_this_clone_cannot_resolve_is_a_finding(self):
        # A shallow checkout, or a GitOps branch promoted from a commit that was
        # never pushed. Reporting zero here would be the fail-open.
        self.scratch.service("svc", hosts=["svc.example"])
        self.scratch.commit("c")
        self.scratch.publish_gitops({"svc": "0" * 40})
        self.scratch.push_main()

        m = measure(self.repo)
        svc = next(s for s in m.services if s.name == "svc")
        self.assertTrue(svc.revision_unresolvable)
        self.assertIsNone(svc.commits_behind)
        findings = evaluate(m, budget_doc(), TODAY)
        self.assertIn("revision-unresolvable", [f.check for f in findings])


class TestEvaluation(unittest.TestCase):
    """Pure comparisons, built from `Service` objects rather than from git so the
    boundaries are exercised exactly — including ones this repository does not
    currently sit on."""

    @staticmethod
    def measurement(services, observable=True, trust=...):
        return Measurement(
            services=services,
            observable=observable,
            baseline_sha="abc1234",
            trust=verified_trust() if trust is ... else trust,
        )

    def test_within_budget_yields_no_findings(self):
        m = self.measurement(
            [Service("a", ["a.example"], revision="r", commits_behind=8, deployed_age_days=6)]
        )
        self.assertEqual([], evaluate(m, budget_doc(), TODAY))

    def test_one_commit_over_the_budget_fails(self):
        m = self.measurement(
            [Service("a", ["a.example"], revision="r", commits_behind=11, deployed_age_days=1)]
        )
        self.assertIn("deployment-behind-budget", [f.check for f in evaluate(m, budget_doc(), TODAY)])

    def test_exactly_at_the_budget_passes(self):
        m = self.measurement(
            [Service("a", ["a.example"], revision="r", commits_behind=10, deployed_age_days=1)]
        )
        self.assertEqual([], evaluate(m, budget_doc(), TODAY))

    def test_the_failure_names_which_service_is_behind(self):
        m = self.measurement(
            [
                Service("fine", ["f.example"], revision="r", commits_behind=1, deployed_age_days=1),
                Service("stale", ["s.example"], revision="r", commits_behind=99, deployed_age_days=1),
            ]
        )
        message = next(
            f.message for f in evaluate(m, budget_doc(), TODAY) if f.check == "deployment-behind-budget"
        )
        self.assertIn("stale", message)
        self.assertNotIn("fine (", message)

    def test_an_old_deployed_revision_fails_on_age(self):
        m = self.measurement(
            [Service("a", ["a.example"], revision="r", commits_behind=0, deployed_age_days=8)]
        )
        self.assertIn("deployed-revision-stale", [f.check for f in evaluate(m, budget_doc(), TODAY)])

    def test_too_many_unrecorded_deployments_fails_and_names_the_hostnames(self):
        m = self.measurement(
            [Service("a", ["a.example"]), Service("b", ["b.example"]), Service("c", ["c.example"])]
        )
        finding = next(
            f for f in evaluate(m, budget_doc(), TODAY) if f.check == "unrecorded-deployments"
        )
        for host in ("a.example", "b.example", "c.example"):
            self.assertIn(host, finding.message)

    def test_a_shrunk_unrecorded_count_makes_the_budget_stale(self):
        # The other direction of the ratchet: services became traceable and the
        # budget must be lowered rather than left as headroom.
        m = self.measurement(
            [Service("a", ["a.example"], revision="r", commits_behind=1, deployed_age_days=1)]
        )
        doc = budget_doc(budget={"max_unrecorded_deployments": 20})
        self.assertIn("unrecorded-budget-stale", [f.check for f in evaluate(m, doc, TODAY)])

    def test_nothing_measured_does_not_demand_a_lower_lag_budget(self):
        # With no service measured the worst lag is 0, indistinguishable from a
        # fully promoted portfolio. Demanding the budget be lowered on that basis
        # would ratchet a number nobody measured.
        m = self.measurement([Service("a", ["a.example"])])
        self.assertNotIn("lag-budget-stale", [f.check for f in evaluate(m, budget_doc(), TODAY)])

    def test_a_promoted_service_makes_the_lag_budget_stale(self):
        m = self.measurement(
            [Service("a", ["a.example"], revision="r", commits_behind=0, deployed_age_days=1)]
        )
        self.assertIn("lag-budget-stale", [f.check for f in evaluate(m, budget_doc(), TODAY)])

    def test_budget_checks_run_even_when_nothing_is_measurable(self):
        # The budget document is a property of the repository, so an expired one
        # is a failure on a machine that cannot see the cluster state at all.
        m = self.measurement([Service("a", ["a.example"])], observable=False)
        doc = budget_doc(expires=TODAY - timedelta(days=1))
        self.assertIn("budget-expired", [f.check for f in evaluate(m, doc, TODAY)])


class TestBudgetDocument(unittest.TestCase):
    def test_expired_budget_fails(self):
        doc = budget_doc(expires=TODAY - timedelta(days=1))
        self.assertIn("budget-expired", [f.check for f in budget_findings(doc, TODAY)])

    def test_expiry_parked_far_ahead_fails(self):
        doc = budget_doc(expires=TODAY + timedelta(days=deployment_lag.MAX_EXPIRY_DAYS + 1))
        self.assertIn("expiry-too-far", [f.check for f in budget_findings(doc, TODAY)])

    def test_each_declared_value_is_capped(self):
        # Every key, not a sample. The sibling ratchet exists because eight
        # budget keys drifted unwatched while only some had a contract.
        for key, cap in deployment_lag.DECLARED_CAPS.items():
            with self.subTest(key=key):
                findings = budget_findings(budget_doc(budget={key: cap + 1}), TODAY)
                self.assertIn("declared-over-cap", [f.check for f in findings])
                self.assertTrue(any(key in f.message for f in findings))

    def test_a_missing_budget_file_raises_rather_than_passing(self):
        with self.assertRaises(DeploymentLagError) as ctx:
            load_budget(Path(tempfile.mkdtemp()))
        self.assertIn("budgets nothing", str(ctx.exception))

    def test_each_governance_field_is_required(self):
        for missing in ("owner", "issue", "expires", "budget"):
            with self.subTest(missing=missing):
                tmp = Path(tempfile.mkdtemp())
                doc = budget_doc()
                doc.pop(missing)
                _write_yaml(tmp / deployment_lag.BUDGET_PATH, doc)
                with self.assertRaises(DeploymentLagError):
                    load_budget(tmp)

    def test_a_non_integer_budget_value_raises(self):
        tmp = Path(tempfile.mkdtemp())
        _write_yaml(
            tmp / deployment_lag.BUDGET_PATH, budget_doc(budget={"max_commits_behind": "lots"})
        )
        with self.assertRaises(DeploymentLagError):
            load_budget(tmp)

    def test_a_boolean_is_not_accepted_as_an_integer(self):
        # `isinstance(True, int)` is True in Python, so `max_commits_behind: yes`
        # would otherwise be read as 1 and silently move the gate.
        tmp = Path(tempfile.mkdtemp())
        _write_yaml(tmp / deployment_lag.BUDGET_PATH, budget_doc(budget={"max_commits_behind": True}))
        with self.assertRaises(DeploymentLagError):
            load_budget(tmp)


class TestBaselineTrust(unittest.TestCase):
    """Every distance here is measured *from* `origin/main`, so that ref is checked.

    Until 2026-08-08 this module named `scripts/ci/baseline_trust.py` in a comment
    — as the reason the GitOps ref must be a remote ref — and never imported it.
    So the control that exists to say "production is 436 commits behind" computed
    that number from a `refs/remotes/origin/main` nobody had verified, and a ref
    pointed at the deployed commit would have reported every service exactly up to
    date. A comment citing a control is not the control.

    Found by `tests/test_gate_wiring.py::test_every_baseline_measuring_gate_verifies_its_baseline`,
    which derives the obligation from source rather than from the `imported_by`
    list that had gone stale around it.
    """

    @staticmethod
    def measurement(trust, **kw):
        return Measurement(
            services=[
                Service("a", ["a.example"], revision="r" * 40, commits_behind=0, deployed_age_days=1)
            ],
            observable=True,
            baseline_sha="abc1234",
            trust=trust,
            **kw,
        )

    def test_a_measurement_with_no_baseline_check_is_a_finding(self):
        m = self.measurement(None)
        self.assertIn("baseline-unverified", [f.check for f in evaluate(m, budget_doc(), TODAY)])

    def test_an_unverified_baseline_never_asks_for_a_lower_budget(self):
        # A baseline pointed at the deployed commit makes `commits_behind` 0 for
        # every service, which is the direction that lands in `lag-budget-stale`
        # and asks for the budget to come down. That request must not be reachable
        # from a baseline nobody confirmed.
        m = self.measurement(None)
        findings = evaluate(m, budget_doc(), TODAY)
        checks = [f.check for f in findings]

        self.assertIn("baseline-unverified", checks)
        self.assertNotIn("lag-budget-stale", checks)
        self.assertNotIn("lower the budget", " ".join(f.message for f in findings))

    def test_a_verified_baseline_still_asks_for_a_lower_budget(self):
        # The other direction, so the guard cannot be satisfied by deleting the
        # advice: a genuinely shipped portfolio on a confirmed baseline must still
        # say the budget has gone stale.
        m = self.measurement(verified_trust())
        findings = evaluate(m, budget_doc(), TODAY)
        self.assertIn("lag-budget-stale", [f.check for f in findings])

    def test_the_report_names_the_baseline_it_could_not_verify(self):
        m = self.measurement(None)
        report = format_report(m, budget_doc(), evaluate(m, budget_doc(), TODAY))
        self.assertIn("UNVERIFIED", report)
        self.assertNotIn("PASS", report)

    def test_measure_verifies_by_default(self):
        # `verify=False` is for callers that have already verified, and it cannot
        # buy a clean run: the absent record is itself a finding.
        m = measure(REPO_ROOT, verify=False)
        self.assertIsNone(m.trust)
        self.assertIn("baseline-unverified", [f.check for f in evaluate(m, budget_doc(), TODAY)])
        self.assertIsNotNone(measure(REPO_ROOT).trust)

    def test_the_json_output_states_whether_the_baseline_was_verified(self):
        m = self.measurement(None)
        payload = json.loads(deployment_lag.to_json(m, budget_doc(), evaluate(m, budget_doc(), TODAY)))
        self.assertIn("baseline_verified", payload)
        self.assertFalse(payload["baseline_verified"])


class TestReport(unittest.TestCase):
    def test_a_failing_report_never_says_pass(self):
        m = Measurement(
            services=[
                Service("a", ["a.example"], revision="r" * 40, commits_behind=99, deployed_age_days=99)
            ],
            observable=True,
            baseline_sha="abc1234",
        )
        findings = evaluate(m, budget_doc(), TODAY)
        report = format_report(m, budget_doc(), findings)
        self.assertIn("FAIL", report)
        self.assertNotIn("PASS", report)

    def test_the_report_names_unrecorded_hostnames(self):
        m = Measurement(services=[Service("a", ["a.example"])], observable=True, baseline_sha="abc1234")
        report = format_report(m, budget_doc(), evaluate(m, budget_doc(), TODAY))
        self.assertIn("a.example", report)


class TestRealRepository(unittest.TestCase):
    """The audit as it applies to this repository, at whatever state it is in.

    Both paths execute the full measurement, so neither can rot: on a machine
    without the GitOps branch the assertion is that the run *says so* rather than
    reporting a pass it cannot support.
    """

    def test_this_repository_is_within_its_declared_deployment_budget(self):
        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT)
        findings = evaluate(measurement, data, date.today())
        report = format_report(measurement, data, findings)
        if not measurement.observable:
            self.assertIn("NOT MEASURABLE", report)
            self.assertNotIn("PASS", report)
            return
        self.assertEqual([], findings, "deployment lag is outside the declared budget:\n" + report)

    def test_the_declared_budget_is_within_its_own_caps(self):
        self.assertEqual([], budget_findings(load_budget(REPO_ROOT), date.today()))


def _write_yaml(path, doc):
    import yaml

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(doc), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
