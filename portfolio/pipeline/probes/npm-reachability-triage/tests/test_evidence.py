"""The evidence record's honesty properties.

These are product requirements, not cosmetics: the record must never assert
compliance, and it must always show what it suppressed.
"""

import json

from triage.deployment import DeploymentProfile, STATIC_EXPORT
from triage.engine import DEV_ONLY, NOT_DEPLOYED, SHIPPED, Finding
from triage.evidence import COVERAGE_LIMITS, Report, to_json, to_markdown
from triage.lockfile import InstalledPackage

PROFILE = DeploymentProfile(STATIC_EXPORT, "high", ('`output: "export"`',), "next.config.js")


def _finding(verdict, package="next", ident="ADV-1"):
    return Finding(
        advisory_id=ident,
        package=package,
        summary="Authorization bypass in Middleware",
        severity="high",
        verdict=verdict,
        reason="because the surface is not deployed",
        locations=(InstalledPackage(package, "14.2.0", f"node_modules/{package}", False, False),),
        rule="server-surface:middleware",
    )


def _report(*findings):
    return Report(
        generated_at="2026-08-20T10:00:00Z",
        project="demo",
        feed="test-feed",
        component_count=42,
        profile=PROFILE,
        findings=findings,
    )


class TestCounts:
    def test_counts_each_verdict(self):
        report = _report(
            _finding(SHIPPED, "a", "A"),
            _finding(DEV_ONLY, "b", "B"),
            _finding(NOT_DEPLOYED, "c", "C"),
        )
        counts = report.counts()
        assert counts == {"total": 3, SHIPPED: 1, DEV_ONLY: 1, NOT_DEPLOYED: 1}


class TestJson:
    def test_round_trips_and_carries_every_finding(self):
        report = _report(_finding(SHIPPED, "a", "A"), _finding(DEV_ONLY, "b", "B"))
        payload = json.loads(to_json(report))
        assert payload["schema"] == "npm-reachability-triage/v1"
        assert len(payload["findings"]) == 2
        assert payload["components_analysed"] == 42
        assert payload["deployment"]["mode"] == STATIC_EXPORT

    def test_includes_coverage_limits(self):
        payload = json.loads(to_json(_report()))
        assert payload["coverage_limits"] == list(COVERAGE_LIMITS)

    def test_states_it_is_not_an_attestation(self):
        payload = json.loads(to_json(_report()))
        assert "not an attestation" in payload["not_an_attestation"].lower()


class TestMarkdown:
    def test_lists_suppressed_findings_with_their_reasons(self):
        rendered = to_markdown(_report(_finding(NOT_DEPLOYED)))
        assert "Suppressed findings" in rendered
        assert "because the surface is not deployed" in rendered

    def test_shows_shipped_findings(self):
        rendered = to_markdown(_report(_finding(SHIPPED)))
        assert "1 findings describe code this project deploys" in rendered

    def test_reports_an_empty_run_without_claiming_safety(self):
        rendered = to_markdown(_report()).lower()
        assert "no advisory matched a package on a deployed path" in rendered
        assert "compliant" not in rendered
        assert "secure" not in rendered

    def test_never_claims_compliance(self):
        rendered = to_markdown(
            _report(_finding(SHIPPED, "a", "A"), _finding(DEV_ONLY, "b", "B"))
        ).lower()
        assert "compliant" not in rendered
        assert "compliance" not in rendered

    def test_renders_coverage_limits_in_the_body(self):
        rendered = to_markdown(_report())
        assert "What this record does not cover" in rendered
        for limit in COVERAGE_LIMITS:
            assert limit.split(".")[0] in rendered

    def test_shows_deployment_evidence(self):
        rendered = to_markdown(_report())
        assert 'output: "export"' in rendered

    def test_escapes_pipes_so_tables_survive(self):
        finding = Finding(
            advisory_id="A",
            package="p",
            summary="a | b",
            severity=None,
            verdict=SHIPPED,
            reason="r",
            locations=(),
        )
        rendered = to_markdown(_report(finding))
        # The summary's pipe must not create a phantom column.
        row = next(line for line in rendered.splitlines() if line.startswith("| `p`"))
        assert row.count("|") == 6
