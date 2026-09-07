#!/usr/bin/env python3
"""Tests for check.py.

Most of these pin the boundary the tool exists to draw: a 40-character commit
SHA is pinned, anything else after an `@` is mutable, and local/Docker
references are not this tool's concern at all because they are not a
third-party supply-chain risk in the same sense.
"""

import io
import json
import os
import tempfile
import unittest
import unittest.mock

import check as pac

SHA = "a" * 40


class ClassifyUses(unittest.TestCase):
    def test_full_sha_is_pinned(self):
        classification, action, ref = pac.classify_uses(f"actions/checkout@{SHA}")
        self.assertEqual(classification, pac.PINNED)
        self.assertEqual(action, "actions/checkout")
        self.assertEqual(ref, SHA)

    def test_uppercase_sha_is_still_pinned(self):
        classification, _, _ = pac.classify_uses(f"actions/checkout@{SHA.upper()}")
        self.assertEqual(classification, pac.PINNED)

    def test_version_tag_is_mutable(self):
        classification, action, ref = pac.classify_uses("actions/checkout@v4")
        self.assertEqual(classification, pac.MUTABLE)
        self.assertEqual(action, "actions/checkout")
        self.assertEqual(ref, "v4")

    def test_branch_name_is_mutable(self):
        classification, _, ref = pac.classify_uses("some-org/some-action@main")
        self.assertEqual(classification, pac.MUTABLE)
        self.assertEqual(ref, "main")

    def test_short_sha_is_not_pinned(self):
        """A 7-char abbreviated SHA is not what this tool rewards -- it can
        collide and is not what GitHub's own hardening guidance recommends."""
        classification, _, ref = pac.classify_uses("actions/checkout@a1b2c3d")
        self.assertEqual(classification, pac.MUTABLE)
        self.assertEqual(ref, "a1b2c3d")

    def test_local_action_is_skipped_classification(self):
        classification, action, ref = pac.classify_uses("./local-action")
        self.assertEqual(classification, pac.LOCAL)
        self.assertEqual(action, "./local-action")
        self.assertIsNone(ref)

    def test_parent_relative_local_action(self):
        classification, _, _ = pac.classify_uses("../shared/local-action")
        self.assertEqual(classification, pac.LOCAL)

    def test_docker_action_is_skipped_classification(self):
        classification, action, ref = pac.classify_uses("docker://alpine:3.19")
        self.assertEqual(classification, pac.DOCKER)
        self.assertEqual(action, "docker://alpine:3.19")
        self.assertIsNone(ref)

    def test_missing_ref_is_mutable_with_no_ref(self):
        """No @ref at all resolves to the action's default branch -- the most
        mutable case there is."""
        classification, action, ref = pac.classify_uses("some-org/some-action")
        self.assertEqual(classification, pac.MUTABLE)
        self.assertIsNone(ref)

    def test_quoted_value_is_unquoted_first(self):
        classification, action, ref = pac.classify_uses(f'"actions/checkout@{SHA}"')
        self.assertEqual(classification, pac.PINNED)
        self.assertEqual(action, "actions/checkout")


class LooksLikeVersionTag(unittest.TestCase):
    def test_v_prefixed_major(self):
        self.assertTrue(pac.looks_like_version_tag("v4"))

    def test_v_prefixed_semver(self):
        self.assertTrue(pac.looks_like_version_tag("v4.1.0"))

    def test_bare_number(self):
        self.assertTrue(pac.looks_like_version_tag("4"))

    def test_branch_name_is_not_a_version_tag(self):
        self.assertFalse(pac.looks_like_version_tag("main"))
        self.assertFalse(pac.looks_like_version_tag("develop"))
        self.assertFalse(pac.looks_like_version_tag("release-branch"))


class RemediationCommand(unittest.TestCase):
    def test_version_tag_suggests_refs_tags(self):
        cmd = pac.remediation_command("actions/checkout", "v4")
        self.assertEqual(cmd, "git ls-remote https://github.com/actions/checkout refs/tags/v4")

    def test_branch_name_suggests_refs_heads(self):
        cmd = pac.remediation_command("some-org/some-action", "main")
        self.assertEqual(cmd, "git ls-remote https://github.com/some-org/some-action refs/heads/main")

    def test_subdirectory_action_resolves_to_repo_root(self):
        cmd = pac.remediation_command("some-org/some-repo/subpath", "v1")
        self.assertEqual(cmd, "git ls-remote https://github.com/some-org/some-repo refs/tags/v1")

    def test_no_ref_still_gives_a_bare_ls_remote(self):
        cmd = pac.remediation_command("some-org/some-action", None)
        self.assertEqual(cmd, "git ls-remote https://github.com/some-org/some-action")

    def test_malformed_action_with_no_slash_returns_none(self):
        self.assertIsNone(pac.remediation_command("bare-name", "v1"))


class ScanText(unittest.TestCase):
    def test_pinned_action_produces_a_clean_pinned_finding(self):
        text = f"""
jobs:
  build:
    steps:
      - uses: actions/checkout@{SHA}
"""
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], pac.PINNED)
        self.assertEqual(findings[0]["line"], 5)
        self.assertNotIn("remediation", findings[0])

    def test_mutable_tag_is_flagged_with_remediation(self):
        text = """
jobs:
  build:
    steps:
      - uses: actions/setup-node@v4
"""
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 1)
        finding = findings[0]
        self.assertEqual(finding["classification"], pac.MUTABLE)
        self.assertEqual(finding["action"], "actions/setup-node")
        self.assertEqual(finding["ref"], "v4")
        self.assertEqual(finding["file"], "wf.yml")
        self.assertEqual(finding["line"], 5)
        self.assertEqual(
            finding["remediation"],
            "git ls-remote https://github.com/actions/setup-node refs/tags/v4",
        )

    def test_local_action_is_skipped_entirely(self):
        text = """
jobs:
  build:
    steps:
      - uses: ./.github/actions/my-local-action
"""
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(findings, [])

    def test_docker_action_is_skipped_entirely(self):
        text = """
jobs:
  build:
    steps:
      - uses: docker://alpine:3.19
"""
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(findings, [])

    def test_commented_out_uses_line_is_ignored(self):
        text = """
jobs:
  build:
    steps:
      # - uses: actions/setup-node@v4
      - uses: actions/checkout@{sha}
""".format(sha=SHA)
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], pac.PINNED)

    def test_inline_comment_after_uses_line_is_tolerated(self):
        text = f"      - uses: actions/checkout@v4  # pin me later\n"
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["ref"], "v4")

    def test_multiple_jobs_and_steps_are_all_scanned(self):
        text = f"""
jobs:
  build:
    steps:
      - uses: actions/checkout@{SHA}
      - uses: actions/setup-node@v4
      - run: npm test
  deploy:
    needs: build
    steps:
      - uses: actions/checkout@{SHA}
      - uses: some-org/deploy-action@main
      - uses: ./.github/actions/notify
"""
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 4)  # 2 pinned checkouts + setup-node + deploy-action
        classifications = [f["classification"] for f in findings]
        self.assertEqual(classifications.count(pac.PINNED), 2)
        self.assertEqual(classifications.count(pac.MUTABLE), 2)

    def test_line_numbers_are_one_indexed_and_correct(self):
        text = "line1\nline2\n  - uses: actions/checkout@v4\n"
        findings = pac.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["line"], 3)


class DiscoverWorkflowFiles(unittest.TestCase):
    def test_finds_yml_and_yaml_under_dot_github_workflows(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = os.path.join(tmp, ".github", "workflows")
            os.makedirs(workflows)
            open(os.path.join(workflows, "a.yml"), "w").close()
            open(os.path.join(workflows, "b.yaml"), "w").close()
            open(os.path.join(workflows, "notes.txt"), "w").close()
            files = pac.discover_workflow_files(tmp)
            names = sorted(os.path.basename(f) for f in files)
            self.assertEqual(names, ["a.yml", "b.yaml"])

    def test_missing_workflows_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(pac.discover_workflow_files(tmp), [])


class ScanPath(unittest.TestCase):
    def make_repo(self, tmp, contents):
        workflows = os.path.join(tmp, ".github", "workflows")
        os.makedirs(workflows)
        for name, text in contents.items():
            with open(os.path.join(workflows, name), "w", encoding="utf-8") as handle:
                handle.write(text)

    def test_scans_every_workflow_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(
                tmp,
                {
                    "ci.yml": "steps:\n  - uses: actions/checkout@v4\n",
                    "deploy.yaml": f"steps:\n  - uses: actions/checkout@{SHA}\n",
                },
            )
            findings = pac.scan_path(tmp)
            self.assertEqual(len(findings), 2)


class HasUnresolvedRisk(unittest.TestCase):
    def test_true_when_any_mutable_finding(self):
        findings = [
            {"classification": pac.PINNED},
            {"classification": pac.MUTABLE},
        ]
        self.assertTrue(pac.has_unresolved_risk(findings))

    def test_false_when_all_pinned(self):
        findings = [{"classification": pac.PINNED}]
        self.assertFalse(pac.has_unresolved_risk(findings))

    def test_false_on_empty(self):
        self.assertFalse(pac.has_unresolved_risk([]))


class Main(unittest.TestCase):
    def run_main(self, argv):
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = pac.main(argv)
        return code, buf.getvalue()

    def make_repo(self, tmp, text):
        workflows = os.path.join(tmp, ".github", "workflows")
        os.makedirs(workflows)
        with open(os.path.join(workflows, "ci.yml"), "w", encoding="utf-8") as handle:
            handle.write(text)

    def test_clean_repo_exits_zero_even_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, f"steps:\n  - uses: actions/checkout@{SHA}\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("already pinned", out)

    def test_mutable_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "steps:\n  - uses: actions/checkout@v4\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("mutable reference(s) found", out)

    def test_mutable_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "steps:\n  - uses: actions/checkout@v4\n")
            code, out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)

    def test_clean_repo_with_fail_on_risk_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, f"steps:\n  - uses: actions/checkout@{SHA}\n")
            code, out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 0)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "steps:\n  - uses: actions/checkout@v4\n")
            code, out = self.run_main([tmp, "--format", "json"])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertEqual(len(data), 1)
            self.assertEqual(
                set(data[0]),
                {"file", "line", "action", "ref", "classification", "remediation"},
            )
            self.assertEqual(data[0]["classification"], "mutable")
            self.assertEqual(data[0]["ref"], "v4")

    def test_json_output_pinned_finding_has_no_remediation_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, f"steps:\n  - uses: actions/checkout@{SHA}\n")
            code, out = self.run_main([tmp, "--format", "json"])
            data = json.loads(out)
            self.assertNotIn("remediation", data[0])

    def test_no_workflows_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("No .github/workflows", out)

    def test_default_path_is_current_directory(self):
        # Smoke check: invoking with no path argument does not raise.
        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            try:
                os.chdir(tmp)
                code, out = self.run_main([])
                self.assertEqual(code, 0)
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
