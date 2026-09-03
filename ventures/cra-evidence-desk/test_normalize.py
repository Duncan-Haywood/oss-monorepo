import unittest

from src.cra_evidence_desk.core import report
from src.cra_evidence_desk.normalize import (
    canonical_ecosystem,
    normalize_advisories,
    normalize_sbom,
    parse_purl,
    unmatchable_advisories,
)

CYCLONEDX = {
    "bomFormat": "CycloneDX",
    "specVersion": "1.5",
    "components": [
        {"type": "library", "name": "demo-parser", "version": "1.2.3", "purl": "pkg:npm/demo-parser@1.2.3"},
        {"type": "library", "name": "safe-lib", "version": "4.0.0", "purl": "pkg:npm/safe-lib@4.0.0"},
    ],
}

SPDX = {
    "spdxVersion": "SPDX-2.3",
    "packages": [
        {
            "name": "demo-parser",
            "versionInfo": "1.2.3",
            "externalRefs": [
                {"referenceCategory": "PACKAGE-MANAGER", "referenceType": "purl", "referenceLocator": "pkg:npm/demo-parser@1.2.3"}
            ],
        }
    ],
}

OSV = {
    "vulns": [
        {
            "id": "GHSA-demo-1234",
            "summary": "Example parser issue requiring review",
            "affected": [{"package": {"ecosystem": "npm", "name": "demo-parser"}, "versions": ["1.2.3", "1.2.4"]}],
            "references": [{"type": "ADVISORY", "url": "https://osv.dev/GHSA-demo-1234"}],
        }
    ]
}


class PurlTest(unittest.TestCase):
    def test_plain_purl_splits_into_coordinates(self):
        self.assertEqual(
            parse_purl("pkg:npm/demo-parser@1.2.3"),
            {"ecosystem": "npm", "name": "demo-parser", "version": "1.2.3"},
        )

    def test_npm_scope_is_rejoined_with_a_slash(self):
        self.assertEqual(parse_purl("pkg:npm/%40acme/widget@2.0.0")["name"], "@acme/widget")

    def test_maven_coordinates_rejoin_with_a_colon(self):
        parsed = parse_purl("pkg:maven/org.apache.commons/commons-lang3@3.12.0")
        self.assertEqual(parsed["name"], "org.apache.commons:commons-lang3")

    def test_go_module_paths_keep_their_slashes(self):
        parsed = parse_purl("pkg:golang/github.com/owner/repo@v1.2.3")
        self.assertEqual(parsed["name"], "github.com/owner/repo")
        self.assertEqual(parsed["version"], "v1.2.3")

    def test_qualifiers_and_subpath_are_not_part_of_identity(self):
        parsed = parse_purl("pkg:npm/demo-parser@1.2.3?arch=x86_64#sub/dir")
        self.assertEqual(parsed, {"ecosystem": "npm", "name": "demo-parser", "version": "1.2.3"})

    def test_a_non_purl_is_skipped_rather_than_raising(self):
        self.assertIsNone(parse_purl("not-a-purl"))
        self.assertIsNone(parse_purl(None))


class EcosystemTest(unittest.TestCase):
    def test_osv_and_purl_spellings_fold_together(self):
        # The whole point of the table: a CycloneDX SBOM says "golang" and an
        # OSV advisory says "Go" for the same registry.
        self.assertEqual(canonical_ecosystem("Go"), canonical_ecosystem("golang"))
        self.assertEqual(canonical_ecosystem("crates.io"), canonical_ecosystem("cargo"))
        self.assertEqual(canonical_ecosystem("RubyGems"), canonical_ecosystem("gem"))
        self.assertEqual(canonical_ecosystem("PyPI"), canonical_ecosystem("pypi"))

    def test_osv_distribution_qualifier_is_dropped(self):
        self.assertEqual(canonical_ecosystem("Alpine:v3.19"), "alpine")


class NormalizeTest(unittest.TestCase):
    def test_native_shape_still_reads_unchanged(self):
        native = {"components": [{"ecosystem": "npm", "name": "demo-parser", "version": "1.2.3"}]}
        self.assertEqual(normalize_sbom(native), [{"ecosystem": "npm", "name": "demo-parser", "version": "1.2.3"}])

    def test_cyclonedx_and_spdx_produce_the_same_coordinate(self):
        self.assertEqual(normalize_sbom(CYCLONEDX)[0], normalize_sbom(SPDX)[0])

    def test_nested_cyclonedx_subcomponents_are_walked(self):
        nested = {
            "components": [
                {
                    "name": "outer",
                    "version": "1.0.0",
                    "purl": "pkg:npm/outer@1.0.0",
                    "components": [{"name": "inner", "version": "2.0.0", "purl": "pkg:npm/inner@2.0.0"}],
                }
            ]
        }
        self.assertEqual([c["name"] for c in normalize_sbom(nested)], ["outer", "inner"])

    def test_a_component_missing_half_its_coordinate_is_dropped(self):
        self.assertEqual(normalize_sbom({"components": [{"name": "x"}, {"version": "1"}]}), [])

    def test_osv_export_yields_one_entry_per_enumerated_version(self):
        advisories = normalize_advisories(OSV)
        self.assertEqual([a["version"] for a in advisories], ["1.2.3", "1.2.4"])
        self.assertEqual(advisories[0]["source"], "https://osv.dev/GHSA-demo-1234")

    def test_osv_ranges_are_never_resolved(self):
        ranged = {
            "vulns": [
                {
                    "id": "GHSA-range-only",
                    "affected": [
                        {
                            "package": {"ecosystem": "npm", "name": "demo-parser"},
                            "ranges": [{"type": "SEMVER", "events": [{"introduced": "0"}, {"fixed": "9.9.9"}]}],
                        }
                    ],
                }
            ]
        }
        self.assertEqual(normalize_advisories(ranged), [])
        self.assertEqual(unmatchable_advisories(ranged)[0]["advisory"], "GHSA-range-only")

    def test_an_advisory_with_both_exact_and_range_is_not_reported_as_skipped(self):
        both = {
            "vulns": [
                {
                    "id": "GHSA-both",
                    "affected": [
                        {
                            "package": {"ecosystem": "npm", "name": "demo-parser"},
                            "versions": ["1.2.3"],
                            "ranges": [{"type": "SEMVER", "events": [{"introduced": "0"}]}],
                        }
                    ],
                }
            ]
        }
        self.assertEqual(unmatchable_advisories(both), [])


class EndToEndTest(unittest.TestCase):
    def test_a_cyclonedx_sbom_matches_an_osv_export(self):
        # The combination a real vendor actually has on disk, and the one that
        # was impossible before this module existed.
        result = report(CYCLONEDX, OSV, "Demo service", "2026.09")
        self.assertEqual(result["component_count"], 2)
        self.assertEqual(len(result["matched_findings"]), 1)
        self.assertEqual(result["matched_findings"][0]["component"], "demo-parser@1.2.3")
        self.assertEqual(result["matched_findings"][0]["advisory"], "GHSA-demo-1234")

    def test_cross_format_ecosystem_spellings_still_meet(self):
        sbom = {"components": [{"name": "x", "version": "1.0.0", "purl": "pkg:golang/example.com/x@1.0.0"}]}
        osv = {"vulns": [{"id": "GO-1", "affected": [{"package": {"ecosystem": "Go", "name": "example.com/x"}, "versions": ["1.0.0"]}]}]}
        self.assertEqual(len(report(sbom, osv, "P", "V")["matched_findings"]), 1)

    def test_a_range_only_export_says_so_in_the_draft(self):
        from src.cra_evidence_desk.core import article14_draft

        ranged = {
            "vulns": [
                {
                    "id": "GHSA-range-only",
                    "affected": [{"package": {"ecosystem": "npm", "name": "demo-parser"}, "ranges": [{"type": "SEMVER"}]}],
                }
            ]
        }
        draft = article14_draft(report(CYCLONEDX, ranged, "P", "V"))
        self.assertIn("Not evaluated by this tool", draft)
        self.assertIn("GHSA-range-only", draft)


if __name__ == "__main__":
    unittest.main()
