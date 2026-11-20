import json
import unittest
from pathlib import Path

from src.cra_evidence_desk.core import article14_draft, report


class EvidenceDeskTest(unittest.TestCase):
    def test_exact_matches_are_reported_and_draft_is_reviewable(self):
        root = Path(__file__).parent / "examples"
        result = report(json.loads((root / "sbom.json").read_text()), json.loads((root / "advisories.json").read_text()), "Demo", "2026.08")
        self.assertEqual(result["component_count"], 2)
        self.assertEqual(result["matched_findings"][0]["advisory"], "GHSA-demo-1234")
        self.assertIn("not a filing", article14_draft(result))

    def test_version_mismatch_is_not_inferred(self):
        result = report({"components": [{"name": "x", "version": "2"}]}, [{"name": "x", "version": "1", "id": "A"}], "P", "V")
        self.assertEqual(result["matched_findings"], [])

    def test_every_advisory_naming_a_component_is_reported(self):
        # Two real GHSA records both enumerate lodash 4.17.15; a last-wins index
        # used to report only the second.
        def osv(identifier):
            return {"id": identifier, "modified": "2024-01-01T00:00:00Z",
                    "affected": [{"package": {"ecosystem": "npm", "name": "lodash"}, "versions": ["4.17.15"]}]}
        result = report({"components": [{"purl": "pkg:npm/lodash@4.17.15"}]},
                        {"vulns": [osv("GHSA-p6mc-m468-83gw"), osv("GHSA-35jh-r3h4-6jhm")]}, "P", "V")
        self.assertEqual([f["advisory"] for f in result["matched_findings"]],
                         ["GHSA-p6mc-m468-83gw", "GHSA-35jh-r3h4-6jhm"])
        draft = article14_draft(result)
        self.assertIn("GHSA-p6mc-m468-83gw", draft)
        self.assertIn("GHSA-35jh-r3h4-6jhm", draft)

    def test_name_match_ignores_case(self):
        result = report({"components": [{"ecosystem": "npm", "name": "Demo-Parser", "version": "1.0"}]},
                        [{"ecosystem": "npm", "name": "demo-parser", "version": "1.0", "id": "A"}], "P", "V")
        self.assertEqual([f["advisory"] for f in result["matched_findings"]], ["A"])


if __name__ == "__main__":
    unittest.main()
