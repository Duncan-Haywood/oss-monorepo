import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from cli import classify_branch, markdown, scan


def pr(state="closed", merged=False, moved=False):
    return {"number": 7, "state": state, "merged": merged, "tip_moved_after_close": moved}


def branch(name, tip, commits, **kwargs):
    return {"name": name, "tip": tip, "commits": commits, "protected": False, "shared_by": [], **kwargs}


class BranchHygieneTests(unittest.TestCase):
    def test_classifies_safe_duplicate_only_when_all_evidence_matches(self):
        self.assertEqual(classify_branch(branch("old", "a", ["a"], pull_request=pr(merged=True)), {"a"}), "duplicate")
        self.assertEqual(classify_branch(branch("old", "a", ["a", "b"], pull_request=pr(merged=True)), {"a"}), "unique-work")


    def test_protected_shared_and_moved_refs_are_review_only(self):
        self.assertEqual(classify_branch(branch("main", "a", ["a"], protected=True, pull_request=pr()), set()), "protected")
        self.assertEqual(classify_branch(branch("shared", "a", ["a"], shared_by=["tag"], pull_request=pr()), set()), "shared")
        self.assertEqual(classify_branch(branch("moved", "b", ["b"], pull_request=pr(moved=True)), set()), "moved-tip")


    def test_missing_pr_or_metadata_is_uncertain(self):
        self.assertEqual(classify_branch(branch("unknown", "a", ["a"]), {"a"}), "uncertain")
        self.assertEqual(classify_branch(branch("bad", "a", [], pull_request=pr()), set()), "uncertain")


    def test_scan_records_usage_event_and_recovery_manifest(self):
        report = scan({"repository": "acme/widgets", "default_branch": "main", "default_commits": ["a"], "branches": [branch("old", "a", ["a"], pull_request=pr(merged=True))]})
        self.assertEqual(report["event"], "branch_hygiene_scan_completed")
        self.assertEqual(report["counts"]["duplicate"], 1)
        self.assertEqual(report["queue"][0]["recovery_command"], "git branch recover/old a")
        self.assertIn("does not certify deletion safety", markdown(report))
