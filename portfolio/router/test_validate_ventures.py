#!/usr/bin/env python3
"""
Unit tests for the venture contract validator.

These use synthetic contracts rather than the live `ventures/` tree so the suite
does not turn red every time a real venture's economics legitimately change.
"""

import tempfile
import unittest
from pathlib import Path

try:
    from portfolio.router.validate_ventures import (
        Finding,
        find_backed_hostnames,
        find_dominated_criteria,
        find_repo_root,
        is_deployment_file,
        load_latest_ledger_mrr,
        production_hostname,
        validate_all,
        validate_venture,
    )
except ImportError:
    from validate_ventures import (
        Finding,
        find_backed_hostnames,
        find_dominated_criteria,
        find_repo_root,
        is_deployment_file,
        load_latest_ledger_mrr,
        production_hostname,
        validate_all,
        validate_venture,
    )


def codes(findings):
    return sorted(f.code for f in findings)


def base_contract(**overrides):
    contract = {
        "name": "demo",
        "stage": "prototype",
        "owner": "duncan",
        "hypotheses": [],
        "economics": {"currency": "USD", "mrr": None},
        "budget": {"monthly_cap": 50, "protected": False},
        "kill_criteria": ["No customers in 90 days."],
        "links": {"production": None},
    }
    contract.update(overrides)
    return contract


class TestValidateVenture(unittest.TestCase):
    def test_clean_contract_produces_no_findings(self):
        findings = validate_venture(base_contract(), "demo", {})
        self.assertEqual(findings, [])

    def test_unmeasured_mrr_contradicted_by_ledger_is_flagged(self):
        findings = validate_venture(base_contract(), "demo", {"demo": 0})
        self.assertIn("stale-unmeasured-mrr", codes(findings))

    def test_declared_mrr_matching_ledger_is_not_flagged(self):
        contract = base_contract(economics={"currency": "USD", "mrr": 0})
        findings = validate_venture(contract, "demo", {"demo": 0})
        self.assertNotIn("stale-unmeasured-mrr", codes(findings))

    def test_venture_absent_from_ledger_is_not_flagged_as_stale(self):
        findings = validate_venture(base_contract(), "demo", {"other": 100})
        self.assertNotIn("stale-unmeasured-mrr", codes(findings))

    def test_supported_hypothesis_without_revenue_is_flagged(self):
        contract = base_contract(
            hypotheses=[{"claim": "People will pay", "status": "supported", "checked": "2026-07-01"}]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("unearned-hypothesis-support", codes(findings))

    def test_supported_hypothesis_with_declared_revenue_is_accepted(self):
        contract = base_contract(
            economics={"currency": "USD", "mrr": 250},
            hypotheses=[{"claim": "People will pay", "status": "supported", "checked": "2026-07-01"}],
        )
        findings = validate_venture(contract, "demo", {})
        self.assertNotIn("unearned-hypothesis-support", codes(findings))

    def test_supported_hypothesis_with_ledger_revenue_is_accepted(self):
        contract = base_contract(
            hypotheses=[{"claim": "People will pay", "status": "supported", "checked": "2026-07-01"}]
        )
        findings = validate_venture(contract, "demo", {"demo": 400})
        self.assertNotIn("unearned-hypothesis-support", codes(findings))

    def test_supported_hypothesis_with_cited_evidence_is_accepted(self):
        """A technical claim can be settled by a benchmark rather than revenue."""
        contract = base_contract(
            hypotheses=[
                {
                    "claim": "Sandboxes cut provisioning latency by 40%",
                    "status": "supported",
                    "checked": "2026-07-01",
                    "evidence": "bench/provisioning.md — 12.1s to 7.0s median over 50 runs",
                }
            ]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertNotIn("unearned-hypothesis-support", codes(findings))

    def test_blank_evidence_does_not_count_as_evidence(self):
        contract = base_contract(
            hypotheses=[
                {
                    "claim": "People will pay",
                    "status": "supported",
                    "checked": "2026-07-01",
                    "evidence": "   ",
                }
            ]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("unearned-hypothesis-support", codes(findings))

    def test_null_evidence_does_not_count_as_evidence(self):
        contract = base_contract(
            hypotheses=[
                {
                    "claim": "People will pay",
                    "status": "supported",
                    "checked": "2026-07-01",
                    "evidence": None,
                }
            ]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("unearned-hypothesis-support", codes(findings))

    def test_untested_hypothesis_needs_no_check_date(self):
        contract = base_contract(hypotheses=[{"claim": "Unknown", "status": "untested"}])
        findings = validate_venture(contract, "demo", {})
        self.assertEqual(findings, [])

    def test_evaluated_hypothesis_without_check_date_is_flagged(self):
        contract = base_contract(
            economics={"currency": "USD", "mrr": 100},
            hypotheses=[{"claim": "People will pay", "status": "supported"}],
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("missing-hypothesis-check-date", codes(findings))

    def test_unrecognised_hypothesis_status_is_an_error(self):
        contract = base_contract(hypotheses=[{"claim": "x", "status": "probably"}])
        findings = validate_venture(contract, "demo", {})
        self.assertIn("invalid-hypothesis-status", codes(findings))
        self.assertEqual([f.severity for f in findings if f.code == "invalid-hypothesis-status"], ["error"])

    def test_refuted_hypothesis_is_a_valid_status(self):
        contract = base_contract(
            hypotheses=[{"claim": "x", "status": "refuted", "checked": "2026-07-01"}]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertEqual(findings, [])

    def test_launched_without_production_link_is_flagged(self):
        contract = base_contract(stage="launched")
        findings = validate_venture(contract, "demo", {})
        self.assertIn("launched-without-production-link", codes(findings))

    def test_launched_with_production_link_is_accepted(self):
        contract = base_contract(stage="launched", links={"production": "https://example.com"})
        findings = validate_venture(contract, "demo", {})
        self.assertNotIn("launched-without-production-link", codes(findings))

    def test_prototype_without_production_link_is_not_flagged(self):
        findings = validate_venture(base_contract(stage="prototype"), "demo", {})
        self.assertNotIn("launched-without-production-link", codes(findings))

    def test_invalid_stage_is_an_error(self):
        findings = validate_venture(base_contract(stage="vibes"), "demo", {})
        self.assertIn("invalid-stage", codes(findings))

    def test_protected_venture_without_kill_criteria_is_an_error(self):
        contract = base_contract(
            budget={"monthly_cap": 50, "protected": True}, kill_criteria=[]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("protected-without-kill-criteria", codes(findings))
        self.assertEqual(
            [f.severity for f in findings if f.code == "protected-without-kill-criteria"],
            ["error"],
        )

    def test_missing_monthly_cap_is_an_error(self):
        contract = base_contract(budget={"protected": False})
        findings = validate_venture(contract, "demo", {})
        self.assertIn("missing-monthly-cap", codes(findings))


class TestProductionLinkBacking(unittest.TestCase):
    """`links.production` must name a host the repository can actually serve."""

    def contract(self, url, stage="prototype"):
        return base_contract(stage=stage, links={"production": url})

    def test_backed_production_link_is_accepted(self):
        findings = validate_venture(
            self.contract("https://app.example.com"), "demo", {}, {"app.example.com"}
        )
        self.assertNotIn("unbacked-production-link", codes(findings))

    def test_unbacked_production_link_is_flagged(self):
        findings = validate_venture(self.contract("https://app.example.com"), "demo", {}, set())
        self.assertIn("unbacked-production-link", codes(findings))

    def test_unbacked_link_on_a_prototype_is_a_warning(self):
        findings = validate_venture(self.contract("https://app.example.com"), "demo", {}, set())
        severities = [f.severity for f in findings if f.code == "unbacked-production-link"]
        self.assertEqual(severities, ["warn"])

    def test_unbacked_link_once_stage_draws_budget_is_an_error(self):
        """`launched` weights 0.75 against 0.55, so the claim is now moving money."""
        findings = validate_venture(
            self.contract("https://app.example.com", stage="launched"), "demo", {}, set()
        )
        severities = [f.severity for f in findings if f.code == "unbacked-production-link"]
        self.assertEqual(severities, ["error"])

    def test_omitting_the_backed_set_fails_closed(self):
        """A caller that forgets the argument must get the finding, not silence."""
        findings = validate_venture(self.contract("https://app.example.com"), "demo", {})
        self.assertIn("unbacked-production-link", codes(findings))

    def test_null_production_link_is_not_flagged_as_unbacked(self):
        findings = validate_venture(self.contract(None), "demo", {}, set())
        self.assertNotIn("unbacked-production-link", codes(findings))

    def test_hostname_comparison_ignores_case(self):
        findings = validate_venture(
            self.contract("https://APP.Example.COM"), "demo", {}, {"app.example.com"}
        )
        self.assertNotIn("unbacked-production-link", codes(findings))

    def test_port_and_path_do_not_defeat_the_hostname(self):
        findings = validate_venture(
            self.contract("https://app.example.com:8443/docs"), "demo", {}, {"app.example.com"}
        )
        self.assertNotIn("unbacked-production-link", codes(findings))

    def test_url_without_a_scheme_is_an_error(self):
        findings = validate_venture(self.contract("app.example.com"), "demo", {}, set())
        self.assertIn("unparseable-production-link", codes(findings))
        severities = [f.severity for f in findings if f.code == "unparseable-production-link"]
        self.assertEqual(severities, ["error"])

    def test_scheme_without_a_host_is_an_error(self):
        """`file:///srv/app` names a scheme and no host; nobody can reach it."""
        findings = validate_venture(self.contract("file:///srv/app"), "demo", {}, set())
        self.assertIn("unparseable-production-link", codes(findings))

    def test_protocol_relative_url_is_an_error(self):
        """`//host` parses to a hostname but names no scheme; it is not a URL."""
        findings = validate_venture(self.contract("//app.example.com"), "demo", {}, set())
        self.assertIn("unparseable-production-link", codes(findings))
        self.assertNotIn("unbacked-production-link", codes(findings))

    def test_unparseable_link_is_not_also_reported_as_unbacked(self):
        findings = validate_venture(self.contract("not a url"), "demo", {}, set())
        self.assertNotIn("unbacked-production-link", codes(findings))

    def test_production_hostname_extraction(self):
        self.assertEqual(production_hostname("https://Example.COM/a?b=c"), "example.com")
        self.assertIsNone(production_hostname("example.com"))
        self.assertIsNone(production_hostname(""))
        self.assertIsNone(production_hostname(None))
        self.assertIsNone(production_hostname(123))


class TestDeploymentFileClassification(unittest.TestCase):
    """Which files may serve as evidence that a hostname is deployed."""

    def assertBacking(self, path, expected):
        self.assertEqual(is_deployment_file(Path(path)), expected, msg=path)

    def test_deployment_machinery_counts(self):
        for path in (
            ".gitea/workflows/deploy.yml",
            "ventures/x/.github/workflows/deploy-docs.yml",
            "platform/k8s/apps/x/ingress.yaml",
            "platform/ci/promote.sh",
            "scripts/smoke-test.sh",
            "ventures/x/deploy/nginx/docs.conf",
            "ventures/x/vercel.docs.json",
            "ventures/x/wrangler.toml",
            "ventures/x/Dockerfile",
            "ventures/x/docker-compose.yml",
            "platform/terraform/main.tf",
            "ventures/x/public/CNAME",
        ):
            self.assertBacking(path, True)

    def test_prose_does_not_count(self):
        """The README sentence claiming a venture is live is the claim, not evidence."""
        for path in (
            "ventures/x/README.md",
            "ventures/x/AGENTS.md",
            "docs/HOSTING.md",
            "platform/docs/runbook.md",
            "scripts/notes.txt",
        ):
            self.assertBacking(path, False)

    def test_a_venture_contract_cannot_vouch_for_itself(self):
        self.assertBacking("ventures/x/VENTURE.yaml", False)

    def test_tests_and_fixtures_do_not_count(self):
        for path in (
            "platform/ci/test/deploy-gate-contract.test.mjs",
            "scripts/tests/check.sh",
            "platform/ci/__tests__/x.mjs",
            "scripts/test_deploy.py",
            "platform/e2e/journey.ts",
            "ventures/x/deploy/fixtures/ingress.yaml",
        ):
            self.assertBacking(path, False)

    def test_ordinary_source_files_do_not_count(self):
        for path in ("ventures/x/src/app/page.tsx", "ventures/x/package.json"):
            self.assertBacking(path, False)


class TestFindBackedHostnames(unittest.TestCase):
    def walk(self, files, hostnames):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for relative, content in files.items():
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            return find_backed_hostnames(root, hostnames)

    def test_a_workflow_backs_a_hostname(self):
        backed = self.walk(
            {".gitea/workflows/deploy.yml": "url: https://app.example.com\n"},
            ["app.example.com"],
        )
        self.assertEqual(backed, {"app.example.com"})

    def test_a_readme_does_not_back_a_hostname(self):
        """Sited inside `scripts/`, so only the prose rule can exclude it."""
        backed = self.walk(
            {"scripts/README.md": "**Live:** https://app.example.com\n"},
            ["app.example.com"],
        )
        self.assertEqual(backed, set())

    def test_a_ventures_own_contract_does_not_back_it(self):
        backed = self.walk(
            {"ventures/x/VENTURE.yaml": "links:\n  production: https://app.example.com\n"},
            ["app.example.com"],
        )
        self.assertEqual(backed, set())

    def test_node_modules_is_not_searched(self):
        backed = self.walk(
            {"node_modules/pkg/scripts/deploy.sh": "https://app.example.com\n"},
            ["app.example.com"],
        )
        self.assertEqual(backed, set())

    def test_a_longer_hostname_does_not_back_a_shorter_one(self):
        backed = self.walk(
            {"scripts/deploy.sh": "host=notexample.com\n"}, ["example.com"]
        )
        self.assertEqual(backed, set())

    def test_a_hostname_used_as_a_prefix_of_another_does_not_back_it(self):
        backed = self.walk(
            {"scripts/deploy.sh": "host=example.com.attacker.net\n"}, ["example.com"]
        )
        self.assertEqual(backed, set())

    def test_matching_is_case_insensitive(self):
        backed = self.walk({"scripts/deploy.sh": "APP.EXAMPLE.COM\n"}, ["app.example.com"])
        self.assertEqual(backed, {"app.example.com"})

    def test_only_the_hostnames_present_are_returned(self):
        backed = self.walk(
            {"scripts/deploy.sh": "https://a.example.com\n"},
            ["a.example.com", "b.example.com"],
        )
        self.assertEqual(backed, {"a.example.com"})

    def test_no_declared_hostnames_needs_no_walk(self):
        self.assertEqual(find_backed_hostnames(Path("/nonexistent"), []), set())


class TestValidateAllWiresBackingThrough(unittest.TestCase):
    """`validate_all` must compute backing and pass it down.

    Without this, `validate_all` could stop supplying `backed_hostnames`
    entirely: the fail-closed default would flag every venture, but on a tree
    whose ventures are all prototypes those are warnings, and a suite that only
    asserts "no errors" would stay green while the rule reported pure noise.
    """

    def tree(self, extra_files):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / "portfolio").mkdir()
        contract = root / "ventures" / "demo" / "VENTURE.yaml"
        contract.parent.mkdir(parents=True)
        contract.write_text(
            "name: demo\n"
            "stage: prototype\n"
            "economics:\n  mrr: 0\n"
            "budget:\n  monthly_cap: 50\n  protected: false\n"
            "links:\n  production: https://app.example.com\n",
            encoding="utf-8",
        )
        for relative, content in extra_files.items():
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        return root

    def test_a_deployed_hostname_is_accepted_end_to_end(self):
        root = self.tree({".gitea/workflows/deploy.yml": "host: app.example.com\n"})
        self.assertNotIn("unbacked-production-link", codes(validate_all(root)))

    def test_the_same_tree_without_the_deployment_is_flagged(self):
        root = self.tree({})
        self.assertIn("unbacked-production-link", codes(validate_all(root)))


class TestLedgerLoading(unittest.TestCase):
    def test_later_period_overrides_earlier_mrr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ventures").mkdir()
            ledger = root / "portfolio" / "ledger"
            ledger.mkdir(parents=True)

            (ledger / "2026-06.yaml").write_text(
                "period: 2026-06\nentries:\n  - venture: demo\n    mrr_end: 0\n",
                encoding="utf-8",
            )
            (ledger / "2026-07.yaml").write_text(
                "period: 2026-07\nentries:\n  - venture: demo\n    mrr_end: 120\n",
                encoding="utf-8",
            )

            self.assertEqual(load_latest_ledger_mrr(root), {"demo": 120})

    def test_missing_ledger_directory_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(load_latest_ledger_mrr(Path(tmp)), {})


def spend_criterion(threshold, revenue=0):
    return {
        "description": f"${threshold} spent with no revenue.",
        "when": [
            {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": threshold},
            {"metric": "cumulative_revenue_usd", "comparator": "==", "threshold": revenue},
        ],
    }


class TestDominatedKillCriteria(unittest.TestCase):
    """A stopping rule that can never be the one that fires is noise.

    Criteria are ORed and one trigger kills the venture, so a rule reached only
    after another has already fired adds a duplicated line to `kill_reasons` and
    nothing else. Ten of twelve ventures acquired exactly that when parallel
    sessions each added a criterion to ventures that already had one.
    """

    def codes(self, criteria):
        return [f.code for f in find_dominated_criteria("demo", criteria)]

    def test_a_higher_spend_threshold_is_dominated(self):
        findings = find_dominated_criteria("demo", [spend_criterion(120), spend_criterion(150)])
        self.assertEqual([f.code for f in findings], ["dominated-kill-criterion"])
        self.assertIn("kill_criteria[1]", findings[0].message)
        self.assertIn("kill_criteria[0]", findings[0].message)

    def test_order_does_not_matter(self):
        findings = find_dominated_criteria("demo", [spend_criterion(150), spend_criterion(120)])
        self.assertEqual([f.code for f in findings], ["dominated-kill-criterion"])
        self.assertIn("kill_criteria[0]", findings[0].message)

    def test_an_exact_duplicate_reports_once_not_twice(self):
        # Three ventures declared the same `>= 150 / == 0` rule twice. Each
        # dominates the other, so a naive pass would report the pair twice.
        self.assertEqual(
            self.codes([spend_criterion(150), spend_criterion(150)]),
            ["dominated-kill-criterion"],
        )

    def test_distinct_thresholds_on_different_metrics_are_kept(self):
        other = {
            "description": "Three months at zero MRR.",
            "when": [
                {"metric": "consecutive_months_zero_mrr", "comparator": ">=", "threshold": 3},
            ],
        }
        self.assertEqual(self.codes([spend_criterion(120), other]), [])

    def test_a_different_revenue_clause_is_not_dominated(self):
        # The redundancy in the real tree held only because both rules demanded
        # revenue == 0. Change that and the higher-spend rule can fire alone.
        self.assertEqual(self.codes([spend_criterion(120), spend_criterion(150, revenue=500)]), [])

    def test_prose_criteria_are_left_alone(self):
        self.assertEqual(
            self.codes(["Fewer than 50 learners after 60 days.", "CAC exceeds $150."]),
            [],
        )

    def test_a_lone_criterion_is_never_dominated(self):
        self.assertEqual(self.codes([spend_criterion(150)]), [])

    def test_an_unknown_comparator_is_left_alone_rather_than_guessed(self):
        weird = {
            "description": "Something the evaluator does not support.",
            "when": [
                {"metric": "cumulative_agent_spend_usd", "comparator": "~=", "threshold": 120},
                {"metric": "cumulative_revenue_usd", "comparator": "==", "threshold": 0},
            ],
        }
        other = dict(weird)
        other["when"] = [dict(c) for c in weird["when"]]
        other["when"][0]["threshold"] = 150
        self.assertEqual(self.codes([weird, other]), [])

    def test_a_less_than_comparator_dominates_in_the_other_direction(self):
        def runway(threshold):
            return {
                "description": f"Runway below {threshold}.",
                "when": [
                    {"metric": "latest_mrr_usd", "comparator": "<=", "threshold": threshold},
                ],
            }

        # `<= 50` is reached before `<= 10`, so the `<= 10` rule is the dominated one.
        findings = find_dominated_criteria("demo", [runway(10), runway(50)])
        self.assertEqual([f.code for f in findings], ["dominated-kill-criterion"])
        self.assertIn("kill_criteria[0]", findings[0].message)

    def test_a_non_numeric_threshold_is_left_alone(self):
        broken = {
            "description": "Malformed.",
            "when": [
                {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": "lots"},
            ],
        }
        self.assertEqual(self.codes([broken, spend_criterion(150)]), [])

    def test_the_finding_is_a_warning_and_carries_a_remedy(self):
        finding = find_dominated_criteria("demo", [spend_criterion(120), spend_criterion(150)])[0]
        self.assertEqual(finding.severity, "warn")
        self.assertTrue(finding.remedy.strip())


class TestValidateAllAgainstRealTree(unittest.TestCase):
    """The live tree must stay parseable and free of hard errors."""

    def test_real_contracts_have_no_errors(self):
        findings = validate_all(find_repo_root())
        errors = [f for f in findings if f.severity == "error"]
        self.assertEqual(
            errors,
            [],
            msg="Venture contracts have blocking errors:\n"
            + "\n".join(f.format_line() for f in errors),
        )

    def test_every_finding_carries_a_remedy(self):
        for finding in validate_all(find_repo_root()):
            self.assertTrue(finding.remedy.strip(), msg=f"{finding.code} has no remedy")
            self.assertIn(finding.severity, {"error", "warn"})


if __name__ == "__main__":
    unittest.main()
