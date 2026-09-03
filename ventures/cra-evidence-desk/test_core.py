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


if __name__ == "__main__":
    unittest.main()
