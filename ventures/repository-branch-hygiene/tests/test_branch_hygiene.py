import json
import sys
import tempfile
import unittest
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from branch_hygiene import scan, snapshot_from_repo, write_outputs

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

    def test_local_repository_snapshot_is_read_only_and_usable(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
            (repo / "README").write_text("base\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], check=True)
            subprocess.run(["git", "-C", str(repo), "branch", "feature"], check=True)
            before = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
            snapshot = snapshot_from_repo(repo)
            self.assertEqual(snapshot["default_branch"], "main")
            self.assertEqual({branch["name"] for branch in snapshot["branches"]}, {"main", "feature"})
            self.assertEqual(subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip(), before)

if __name__ == "__main__":
    unittest.main()
