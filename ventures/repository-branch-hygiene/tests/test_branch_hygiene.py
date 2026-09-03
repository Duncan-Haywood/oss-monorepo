import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from branch_hygiene import has_unresolved_risk, load_pr_export, scan, snapshot_from_repo, write_csv, write_outputs

class BranchHygieneTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads((Path(__file__).parents[1] / "examples/snapshot.json").read_text())
    def test_classifies_safe_and_uncertain_cases(self):
        findings = {item.branch: item for item in scan(self.snapshot)}
        self.assertEqual(findings["main"].classification, "protected")
        self.assertEqual(findings["main"].review_action, "do-not-delete")
        self.assertEqual(findings["feature/merged"].classification, "merged")
        self.assertEqual(findings["feature/merged"].review_action, "review-delete-candidate")
        self.assertEqual(findings["feature/moved"].classification, "moved-tip")
        self.assertEqual(findings["feature/moved"].review_action, "preserve-and-review")
        self.assertEqual(findings["feature/unique"].classification, "active")
    def test_manifest_preserves_opaque_commit_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            report, manifest = Path(directory) / "report.txt", Path(directory) / "manifest.json"
            write_outputs(scan(self.snapshot), report, manifest)
            moved = next(item for item in json.loads(manifest.read_text())["findings"] if item["branch"] == "feature/moved")
            self.assertEqual(moved["commits"], ["x2", "x1", "m1"])
            self.assertEqual(moved["review_action"], "preserve-and-review")
            manifest_data = json.loads(manifest.read_text())
            self.assertTrue(manifest_data["read_only"])
            self.assertTrue(manifest_data["approval_required"])
            self.assertEqual(manifest_data["format"], 2)
            self.assertIn("approval queue", report.read_text().lower())

    def test_csv_is_review_queue_not_delete_script(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.csv"
            write_csv(scan(self.snapshot), path)
            rows = path.read_text().splitlines()
            # Same header as the `--format csv` stdout writer; the two exports
            # are one table with two destinations, not two formats.
            self.assertEqual(rows[0], "branch,tip,classification,review_action,reason,commit_count")
            self.assertIn("review-delete-candidate", path.read_text())
            self.assertNotIn("git delete", path.read_text())
            self.assertEqual(len(rows), 5)

    def test_reused_branch_name_prefers_open_pr_over_stale_closed_record(self):
        snapshot = {
            "default_branch": "main",
            "protected_branches": ["main"],
            "branches": [{"name": "feature/reused", "tip": "n1", "commits": ["n1", "m1"]}],
            "pull_requests": [
                # gh pr list returns newest-first, so the current open PR for
                # a reused branch name comes before an old, unrelated closed
                # record in export order; the open PR must still win the
                # lookup rather than whichever record happens to be last.
                {"head": "feature/reused", "state": "open", "merged": False, "base": "main", "base_commits": ["m1"]},
                {"head": "feature/reused", "state": "closed", "merged": True, "base": "main", "base_commits": ["m1"]},
            ],
        }
        findings = {item.branch: item for item in scan(snapshot)}
        self.assertEqual(findings["feature/reused"].classification, "active")
        self.assertEqual(findings["feature/reused"].review_action, "preserve-active-work")


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

    def test_cli_csv_emits_non_executable_approval_queue(self):
        project = Path(__file__).parents[1]
        result = subprocess.run(
            [sys.executable, str(project / "src/branch_hygiene.py"), str(project / "examples/snapshot.json"), "--format", "csv"],
            capture_output=True,
            text=True,
            check=True,
        )
        rows = result.stdout.splitlines()
        self.assertEqual(rows[0], "branch,tip,classification,review_action,reason,commit_count")
        self.assertTrue(any(row.startswith("feature/merged,m2,merged,review-delete-candidate,") for row in rows[1:]))
        self.assertNotIn("git branch", result.stdout)

    def test_csv_file_and_stdout_are_the_same_table(self):
        """`--csv PATH` and `--format csv` arrived as separate changes (#1250,
        #1176) and drifted apart on column order, so a script written against
        one mis-parsed the other. Pin them together."""
        project = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.csv"
            result = subprocess.run(
                [
                    sys.executable, str(project / "src/branch_hygiene.py"),
                    str(project / "examples/snapshot.json"),
                    "--format", "csv", "--csv", str(path),
                    "--report", str(Path(directory) / "report.txt"),
                    "--manifest", str(Path(directory) / "manifest.json"),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(path.read_text(), result.stdout)

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

    def test_load_pr_export_normalizes_gh_cli_states(self):
        with tempfile.TemporaryDirectory() as directory:
            export = Path(directory) / "prs.json"
            export.write_text(json.dumps([
                {"headRefName": "feature/a", "state": "MERGED", "baseRefName": "main"},
                {"headRefName": "feature/b", "state": "OPEN", "baseRefName": "main"},
                {"headRefName": "feature/c", "state": "CLOSED", "baseRefName": "main"},
            ]))
            records = {record["head"]: record for record in load_pr_export(export)}
            self.assertEqual(records["feature/a"], {"head": "feature/a", "base": "main", "state": "closed", "merged": True})
            self.assertEqual(records["feature/b"]["state"], "open")
            self.assertFalse(records["feature/b"]["merged"])
            self.assertEqual(records["feature/c"]["state"], "closed")
            self.assertFalse(records["feature/c"]["merged"])

    def test_load_pr_export_rejects_malformed_records(self):
        with tempfile.TemporaryDirectory() as directory:
            export = Path(directory) / "prs.json"
            export.write_text(json.dumps({"not": "a list"}))
            with self.assertRaises(ValueError):
                load_pr_export(export)
            export.write_text(json.dumps([{"headRefName": "feature/a"}]))
            with self.assertRaises(ValueError):
                load_pr_export(export)

    def test_local_snapshot_with_pr_export_resolves_uncertain_branches(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
            (repo / "README").write_text("base\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            env = ["-c", "user.name=Test", "-c", "user.email=test@example.com"]
            subprocess.run(["git", "-C", str(repo), *env, "commit", "-qm", "base"], check=True)
            subprocess.run(["git", "-C", str(repo), "branch", "feature/merged"], check=True)
            subprocess.run(["git", "-C", str(repo), "branch", "feature/open"], check=True)
            subprocess.run(["git", "-C", str(repo), "checkout", "-q", "feature/merged"], check=True)
            (repo / "README").write_text("merged work\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), *env, "commit", "-qm", "merged work"], check=True)
            subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)
            subprocess.run(["git", "-C", str(repo), *env, "merge", "-q", "--no-ff", "-m", "merge feature/merged", "feature/merged"], check=True)

            export = repo / "prs.json"
            export.write_text(json.dumps([
                {"headRefName": "feature/merged", "state": "MERGED", "baseRefName": "main"},
                {"headRefName": "feature/open", "state": "OPEN", "baseRefName": "main"},
            ]))
            snapshot = snapshot_from_repo(repo, pr_export=export)
            findings = {item.branch: item for item in scan(snapshot)}
            self.assertEqual(findings["feature/merged"].classification, "merged")
            self.assertEqual(findings["feature/open"].classification, "active")

    def test_reused_head_from_gh_newest_first_export_uses_latest_closed_pr(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
            (repo / "README").write_text("base\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            env = ["-c", "user.name=Test", "-c", "user.email=test@example.com"]
            subprocess.run(["git", "-C", str(repo), *env, "commit", "-qm", "base"], check=True)
            subprocess.run(["git", "-C", str(repo), "branch", "feature/reused"], check=True)
            subprocess.run(["git", "-C", str(repo), "checkout", "-q", "feature/reused"], check=True)
            (repo / "README").write_text("merged work\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), *env, "commit", "-qm", "merged work"], check=True)
            subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)
            subprocess.run(["git", "-C", str(repo), *env, "merge", "-q", "--no-ff", "-m", "merge feature/reused", "feature/reused"], check=True)
            export = repo / "prs.json"
            export.write_text(json.dumps([
                {"headRefName": "feature/reused", "state": "MERGED", "baseRefName": "main"},
                {"headRefName": "feature/reused", "state": "CLOSED", "baseRefName": "main"},
            ]))
            snapshot = snapshot_from_repo(repo, pr_export=export)
            findings = {item.branch: item for item in scan(snapshot)}
            self.assertEqual(findings["feature/reused"].classification, "merged")

    def test_local_snapshot_with_pr_export_does_not_truncate_base_ancestry(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
            (repo / "README").write_text("base\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            env = ["-c", "user.name=Test", "-c", "user.email=test@example.com"]
            subprocess.run(["git", "-C", str(repo), *env, "commit", "-qm", "base"], check=True)
            subprocess.run(["git", "-C", str(repo), "branch", "feature/old-merge"], check=True)
            subprocess.run(["git", "-C", str(repo), "checkout", "-q", "feature/old-merge"], check=True)
            (repo / "README").write_text("old merge\n")
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), *env, "commit", "-qm", "old merge work"], check=True)
            subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)
            subprocess.run(["git", "-C", str(repo), *env, "merge", "-q", "--no-ff", "-m", "merge old", "feature/old-merge"], check=True)
            export = repo / "prs.json"
            export.write_text(json.dumps([{"headRefName": "feature/old-merge", "state": "MERGED", "baseRefName": "main"}]))
            snapshot = snapshot_from_repo(repo, pr_export=export)
            feature_tip = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "feature/old-merge"], text=True).strip()
            main_history = subprocess.check_output(["git", "-C", str(repo), "rev-list", "main"], text=True).splitlines()
            related = next(record for record in snapshot["pull_requests"] if record["head"] == "feature/old-merge")
            self.assertEqual(related["base_commits"], [feature_tip])
            self.assertNotEqual(related["base_commits"], main_history)
            findings = {item.branch: item for item in scan(snapshot)}
            self.assertEqual(findings["feature/old-merge"].classification, "merged")

    def test_cli_rejects_pr_json_without_repo(self):
        project = Path(__file__).parents[1]
        result = subprocess.run(
            [sys.executable, str(project / "src/branch_hygiene.py"), str(project / "examples/snapshot.json"), "--pr-json", "prs.json"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--pr-json requires --repo", result.stderr)

    def test_cli_help_discloses_boundary(self):
        project = Path(__file__).parents[1]
        result = subprocess.run(
            [sys.executable, str(project / "src/branch_hygiene.py"), "--help"],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertIn("not legal, security, or compliance advice", result.stdout)
        self.assertIn("reviewing and verifying its", result.stdout)

    def test_emit_snapshot_prints_a_snapshot_and_writes_nothing_else(self):
        """The browser reviewer needs a portable snapshot, and until this flag
        existed no command produced one: `--report`/`--manifest` write findings,
        not the input they were derived from. Emitting writes no files, so
        redirecting stdout cannot also leave two stale outputs beside it."""
        project = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    str(project / "src/branch_hygiene.py"),
                    str(project / "examples/snapshot.json"),
                    "--emit-snapshot",
                ],
                capture_output=True,
                text=True,
                check=True,
                cwd=directory,
            )
            emitted = json.loads(result.stdout)
            self.assertEqual(len(scan(emitted)), len(self.snapshot["branches"]))
            self.assertFalse((Path(directory) / "branch-report.txt").exists())
            self.assertFalse((Path(directory) / "recovery-manifest.json").exists())

    def test_entry_page_is_discoverable_and_carries_disclaimers(self):
        project = Path(__file__).parents[1]
        page = (project / "index.html").read_text()
        robots = (project / "robots.txt").read_text()
        sitemap = (project / "sitemap.xml").read_text()
        self.assertIn("No warranty", page)
        self.assertIn("Best-effort hosting, no SLA", page)
        self.assertIn("does not replace a qualified professional", page)
        self.assertIn("Allow: /", robots)
        self.assertIn("repository-branch-hygiene", sitemap)

    def test_entry_page_runs_the_scanner_in_the_browser(self):
        # This page shipped as prose with no form controls, so the portfolio's
        # browser sweep classified it `links-only`: a visitor arriving from a
        # search result met a description of a CLI they could not run. The
        # in-browser reviewer is the product on this URL, not a brochure for it.
        page = (Path(__file__).parents[1] / "index.html").read_text()
        self.assertIn("<textarea", page)
        self.assertIn("scan.mjs", page)
        self.assertIn("--emit-snapshot", page)

    def test_entry_page_never_asserts_a_branch_is_safe_to_delete(self):
        # Guarded as the assertive forms only. A blanket ban on the phrase was
        # the previous rule here, and it failed on `main` from the moment this
        # venture added its own SEO link "Is it safe to delete this Git
        # branch?" -- banning the honest question along with the dishonest
        # answer. The claim to prevent is the unqualified assertion; the
        # question and the denial of it are both what the product promises.
        page = (Path(__file__).parents[1] / "index.html").read_text()
        pattern = re.compile(
            r"\b(?:is|are|was|were)\s+(?:safe\s+to\s+delete|cleared\s+(?:for|to)\s+delet\w*)",
            re.IGNORECASE,
        )
        for match in pattern.finditer(page):
            preceding = page[max(0, match.start() - 60):match.start()]
            following = page[match.end():match.end() + 12].lstrip()
            denied = re.search(r"\b(?:never|not|no|cannot|does not|doesn't)\b", preceding, re.IGNORECASE)
            self.assertTrue(
                denied or following.startswith("?"),
                f"unqualified safety claim near: {page[max(0, match.start() - 60):match.end() + 40]!r}",
            )

if __name__ == "__main__":
    unittest.main()
