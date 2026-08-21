"""Behaviour of the triage engine, with emphasis on what it must never do.

The suppression rules are the only part of this tool that can cause harm, so
the tests below are weighted towards proving that suppression requires positive
evidence and that every uncertain path falls through to ``shipped``.
"""

from triage.advisories import AffectedRange, Advisory
from triage.deployment import DeploymentProfile, SERVER, STATIC_EXPORT, UNKNOWN
from triage.engine import BUILD_TOOLCHAIN_PACKAGES, DEV_ONLY, NOT_DEPLOYED, SHIPPED, triage
from triage.lockfile import InstalledPackage

STATIC = DeploymentProfile(STATIC_EXPORT, "high", ('`output: "export"`',))
SERVER_PROFILE = DeploymentProfile(SERVER, "high", ("server build",))
UNDETERMINED = DeploymentProfile(UNKNOWN, "low", ("not determined",))


def pkg(name, version, path=None, dev=False):
    return InstalledPackage(name, version, path or f"node_modules/{name}", dev, False)


def advisory(package, *, events=None, range_text=None, summary="", ident="ADV-1"):
    entry = AffectedRange(package, events=tuple(events or ()), range_text=range_text)
    return Advisory(id=ident, summary=summary, affected=(entry,))


class TestMatching:
    def test_reports_a_match_on_a_production_path(self):
        findings = triage(
            [pkg("next", "14.2.0")],
            [advisory("next", events=[{"introduced": "14.0.0"}, {"fixed": "14.2.32"}])],
            SERVER_PROFILE,
        )
        assert len(findings) == 1
        assert findings[0].verdict == SHIPPED
        assert findings[0].versions == ("14.2.0",)

    def test_version_outside_the_range_produces_no_finding(self):
        findings = triage(
            [pkg("next", "15.0.0")],
            [advisory("next", events=[{"introduced": "14.0.0"}, {"fixed": "14.2.32"}])],
            SERVER_PROFILE,
        )
        assert findings == []

    def test_advisory_for_an_uninstalled_package_is_ignored(self):
        findings = triage([pkg("next", "14.2.0")], [advisory("react", range_text="*")], SERVER_PROFILE)
        assert findings == []


class TestDependencyPathRule:
    def test_suppresses_when_every_location_is_dev(self):
        findings = triage(
            [pkg("glob", "10.3.10", "node_modules/rimraf/node_modules/glob", dev=True)],
            [advisory("glob", range_text=">=10.2.0 <10.5.0")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == DEV_ONLY
        assert findings[0].rule == "dependency-path"

    def test_does_not_suppress_when_any_location_is_production(self):
        # The measured glob case: one dev install in range, one prod install
        # also in range. A single production path means it ships.
        findings = triage(
            [
                pkg("glob", "10.3.10", "node_modules/glob"),
                pkg("glob", "10.3.10", "node_modules/rimraf/node_modules/glob", dev=True),
            ],
            [advisory("glob", range_text=">=10.2.0 <10.5.0")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED

    def test_out_of_range_production_install_does_not_block_suppression(self):
        # The full measured case: prod glob@7.2.3 is NOT in the advisory range,
        # so only the dev 10.3.10 install matches and the finding is dev-only.
        findings = triage(
            [
                pkg("glob", "7.2.3", "node_modules/glob"),
                pkg("glob", "10.3.10", "node_modules/rimraf/node_modules/glob", dev=True),
            ],
            [advisory("glob", range_text=">=10.2.0 <10.5.0")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == DEV_ONLY
        assert findings[0].versions == ("10.3.10",)


class TestDeploymentSurfaceRule:
    def test_suppresses_server_surface_on_a_static_export(self):
        findings = triage(
            [pkg("next", "14.2.0")],
            [advisory("next", range_text="*", summary="Authorization bypass in Middleware")],
            STATIC,
        )
        assert findings[0].verdict == NOT_DEPLOYED
        assert findings[0].rule == "server-surface:middleware"

    def test_does_not_suppress_the_same_advisory_on_a_server_build(self):
        findings = triage(
            [pkg("next", "14.2.0")],
            [advisory("next", range_text="*", summary="Authorization bypass in Middleware")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED

    def test_does_not_suppress_when_deployment_mode_is_undetermined(self):
        findings = triage(
            [pkg("next", "14.2.0")],
            [advisory("next", range_text="*", summary="Authorization bypass in Middleware")],
            UNDETERMINED,
        )
        assert findings[0].verdict == SHIPPED

    def test_does_not_suppress_on_low_confidence_static_export(self):
        low = DeploymentProfile(STATIC_EXPORT, "low", ("guessed",))
        findings = triage(
            [pkg("next", "14.2.0")],
            [advisory("next", range_text="*", summary="Bypass in Middleware")],
            low,
        )
        assert findings[0].verdict == SHIPPED

    def test_does_not_suppress_a_non_server_advisory_on_a_static_export(self):
        findings = triage(
            [pkg("lodash", "4.17.20")],
            [advisory("lodash", range_text="*", summary="Prototype pollution")],
            STATIC,
        )
        assert findings[0].verdict == SHIPPED


class TestBuildToolchainRule:
    def test_suppresses_a_known_build_toolchain_package_on_a_static_export(self):
        findings = triage(
            [pkg("postcss", "8.5.5")],
            [advisory("postcss", range_text="*", summary="PostCSS has XSS via Unescaped </style>")],
            STATIC,
        )
        assert findings[0].verdict == NOT_DEPLOYED
        assert findings[0].rule == "build-toolchain"

    def test_does_not_suppress_on_a_server_build(self):
        # Not (yet) validated for server deployments — see BUILD_TOOLCHAIN_PACKAGES.
        findings = triage(
            [pkg("postcss", "8.5.5")],
            [advisory("postcss", range_text="*", summary="PostCSS has XSS via Unescaped </style>")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED

    def test_does_not_suppress_a_package_outside_the_allowlist(self):
        findings = triage(
            [pkg("nanoid", "3.0.0")],
            [advisory("nanoid", range_text="*", summary="nanoid loops indefinitely with negative size")],
            STATIC,
        )
        assert findings[0].verdict == SHIPPED

    def test_uncertain_match_beats_the_build_toolchain_rule(self):
        findings = triage(
            [pkg("postcss", "1.0.0")],
            [advisory("postcss", range_text="~1.0.0", summary="PostCSS XSS")],
            STATIC,
        )
        assert findings[0].verdict == SHIPPED

    def test_allowlist_is_exactly_what_the_readme_measured(self):
        assert BUILD_TOOLCHAIN_PACKAGES == frozenset({"postcss"})


class TestServerComponentsAndFunctionsRule:
    def test_suppresses_server_components_dos_on_a_static_export(self):
        findings = triage(
            [pkg("next", "16.0.0")],
            [advisory("next", range_text="*", summary="Denial of Service with Server Components")],
            STATIC,
        )
        assert findings[0].verdict == NOT_DEPLOYED
        assert findings[0].rule == "server-surface:server-components"

    def test_suppresses_server_function_request_deserialization_on_a_static_export(self):
        findings = triage(
            [pkg("next", "16.0.0")],
            [
                advisory(
                    "next",
                    range_text="*",
                    summary="A crafted request to a Server Function endpoint triggers excessive CPU usage",
                )
            ],
            STATIC,
        )
        assert findings[0].verdict == NOT_DEPLOYED
        assert findings[0].rule == "server-surface:server-functions"

    def test_does_not_suppress_the_same_advisory_on_a_server_build(self):
        findings = triage(
            [pkg("next", "16.0.0")],
            [advisory("next", range_text="*", summary="Denial of Service with Server Components")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED

    def test_csp_nonce_xss_advisory_is_not_suppressed(self):
        # Genuinely arguable (manual review's own "arguable" bucket): the nonce
        # is generated per-request, but the advisory's own text names XSS,
        # which nothing in SERVER_ONLY_RULES matches on this text — it falls
        # through to shipped rather than being force-classified either way.
        findings = triage(
            [pkg("next", "16.0.0")],
            [
                advisory(
                    "next",
                    range_text="*",
                    summary="Next.js vulnerable to cross-site scripting in App Router "
                    "applications using CSP nonces",
                )
            ],
            STATIC,
        )
        assert findings[0].verdict == SHIPPED


class TestDevServerRule:
    def test_suppresses_dev_server_advisory_on_a_server_build(self):
        # Holds regardless of deployment mode: `next dev` is not `next build`.
        findings = triage(
            [pkg("next", "14.2.35")],
            [advisory("next", range_text="*", summary="Information exposure in Next.js dev server")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == DEV_ONLY
        assert findings[0].rule == "dev-server-surface"

    def test_does_not_suppress_when_production_is_also_named(self):
        findings = triage(
            [pkg("next", "14.2.35")],
            [advisory("next", range_text="*", summary="Dev server and production builds affected")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED


class TestUncertaintyNeverSuppresses:
    def test_unparseable_range_is_reported_as_shipped_with_a_caveat(self):
        findings = triage(
            [pkg("left-pad", "1.0.0")],
            [advisory("left-pad", range_text="^1.0.0")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED
        assert findings[0].caveats

    def test_uncertain_match_beats_the_dev_only_rule(self):
        # Even a structurally dev-only install must not be suppressed when the
        # version match itself was unreliable.
        findings = triage(
            [pkg("left-pad", "1.0.0", dev=True)],
            [advisory("left-pad", range_text="^1.0.0")],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED
        assert findings[0].caveats

    def test_uncertain_match_beats_the_deployment_rule(self):
        findings = triage(
            [pkg("next", "1.0.0")],
            [advisory("next", range_text="~1.0.0", summary="Bypass in Middleware")],
            STATIC,
        )
        assert findings[0].verdict == SHIPPED

    def test_unparseable_installed_version_is_assumed_affected(self):
        findings = triage(
            [pkg("weird", "not-a-version")],
            [advisory("weird", events=[{"introduced": "1.0.0"}])],
            SERVER_PROFILE,
        )
        assert findings[0].verdict == SHIPPED
        assert findings[0].caveats


class TestOrdering:
    def test_shipped_findings_sort_before_suppressed_ones(self):
        findings = triage(
            [pkg("a-dev", "1.0.0", dev=True), pkg("z-prod", "1.0.0")],
            [advisory("a-dev", range_text="*", ident="A"), advisory("z-prod", range_text="*", ident="Z")],
            SERVER_PROFILE,
        )
        assert [f.verdict for f in findings] == [SHIPPED, DEV_ONLY]

    def test_suppressed_property_matches_verdict(self):
        findings = triage(
            [pkg("a", "1.0.0", dev=True)], [advisory("a", range_text="*")], SERVER_PROFILE
        )
        assert findings[0].suppressed is True
