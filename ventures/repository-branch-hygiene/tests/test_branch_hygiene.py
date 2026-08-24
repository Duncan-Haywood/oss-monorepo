import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from branch_hygiene import has_unresolved_risk, scan, write_outputs

class BranchHygieneTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads((Path(__file__).parents[1] / "examples/snapshot.json").read_text())
    def test_classifies_safe_and_uncertain_cases(self):
        findings = {item.branch: item for item in scan(self.snapshot)}
        self.assertEqual(findings["main"].classification, "protected")
        self.assertEqual(findings["feature/merged"].classification, "merged")
        self.assertEqual(findings["feature/moved"].classification, "moved-tip")
        self.assertEqual(findings["feature/unique"].classification, "active")
    def test_manifest_preserves_opaque_commit_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            report, manifest = Path(directory) / "report.txt", Path(directory) / "manifest.json"
            write_outputs(scan(self.snapshot), report, manifest)
            moved = next(item for item in json.loads(manifest.read_text())["findings"] if item["branch"] == "feature/moved")
            self.assertEqual(moved["commits"], ["x2", "x1", "m1"])
            self.assertIn("approval queue", report.read_text().lower())

    def test_risk_gate_requires_review_for_ambiguous_refs(self):
        findings = scan(self.snapshot)
        self.assertTrue(has_unresolved_risk(findings))
        safe = [item for item in findings if item.classification in {"protected", "merged", "active"}]
        self.assertFalse(has_unresolved_risk(safe))

    def test_cli_json_summary_fails_closed_and_logs_aggregate_usage(self):
        project = Path(__file__).parents[1]
        snapshot = project / "examples/snapshot.json"
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            result = subprocess.run(
                [
                    sys.executable,
                    str(project / "src/branch_hygiene.py"),
                    str(snapshot),
                    "--format",
                    "json",
                    "--fail-on-risk",
                    "--report",
                    str(output_dir / "report.txt"),
                    "--manifest",
                    str(output_dir / "manifest.json"),
                    "--usage-log",
                    str(output_dir / "usage.jsonl"),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["finding_count"], 4)
            event = json.loads((output_dir / "usage.jsonl").read_text().strip())
            self.assertEqual(event["event"], "scan_completed")
            self.assertEqual(event["finding_count"], 4)
            self.assertNotIn("feature/", event)

if __name__ == "__main__":
    unittest.main()
