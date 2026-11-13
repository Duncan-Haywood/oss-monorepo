import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import check


class UntrustedContextPaths(unittest.TestCase):
    def test_title_is_untrusted(self):
        self.assertEqual(
            check.untrusted_context_paths("${{ github.event.pull_request.title }}"),
            ["github.event.pull_request.title"],
        )

    def test_body_is_untrusted(self):
        self.assertEqual(
            check.untrusted_context_paths("${{ github.event.issue.body }}"),
            ["github.event.issue.body"],
        )

    def test_head_ref_bare_is_untrusted(self):
        self.assertEqual(check.untrusted_context_paths("${{ github.head_ref }}"), ["github.head_ref"])

    def test_number_is_not_untrusted(self):
        self.assertEqual(check.untrusted_context_paths("${{ github.event.pull_request.number }}"), [])

    def test_full_name_is_not_untrusted(self):
        self.assertEqual(check.untrusted_context_paths("${{ github.event.repository.full_name }}"), [])

    def test_finds_path_embedded_in_a_function_call(self):
        self.assertEqual(
            check.untrusted_context_paths("${{ format('hello {0}', github.event.pull_request.title) }}"),
            ["github.event.pull_request.title"],
        )

    def test_multiple_paths_in_one_expression(self):
        self.assertEqual(
            check.untrusted_context_paths(
                "${{ github.event.pull_request.title }}-${{ github.event.pull_request.number }}"
            ),
            ["github.event.pull_request.title"],
        )

    def test_label_name_is_untrusted(self):
        self.assertEqual(
            check.untrusted_context_paths("${{ github.event.pull_request.head.label }}"),
            ["github.event.pull_request.head.label"],
        )


class HasUntrustedCheckoutRef(unittest.TestCase):
    def test_pr_head_sha_is_untrusted(self):
        self.assertTrue(check.has_untrusted_checkout_ref("${{ github.event.pull_request.head.sha }}"))

    def test_pr_head_ref_is_untrusted(self):
        self.assertTrue(check.has_untrusted_checkout_ref("${{ github.event.pull_request.head.ref }}"))

    def test_bare_head_ref_is_untrusted(self):
        self.assertTrue(check.has_untrusted_checkout_ref("${{ github.head_ref }}"))

    def test_workflow_run_head_sha_is_untrusted(self):
        self.assertTrue(check.has_untrusted_checkout_ref("${{ github.event.workflow_run.head_sha }}"))

    def test_default_branch_ref_is_not_untrusted(self):
        self.assertFalse(check.has_untrusted_checkout_ref("main"))

    def test_base_ref_is_not_untrusted(self):
        self.assertFalse(check.has_untrusted_checkout_ref("${{ github.event.pull_request.base.ref }}"))

    # Red-team 2026-11-13: the PR's merge and head refs check out the fork's code just as head.sha does.
    def test_pull_merge_and_head_refs_are_untrusted(self):
        for ref in (
            "refs/pull/${{ github.event.pull_request.number }}/merge",
            "refs/pull/${{ github.event.number }}/head",
            "${{ format('refs/pull/{0}/merge', github.event.pull_request.number) }}",
            "refs/pull/${{ github.event.workflow_run.pull_requests[0].number }}/head",
            "${{ github.event.pull_request.merge_commit_sha }}",
            "${{ github.event.workflow_run.head_commit.id }}",
        ):
            with self.subTest(ref=ref):
                self.assertTrue(check.has_untrusted_checkout_ref(ref))

    def test_refs_heads_is_not_untrusted(self):
        self.assertFalse(check.has_untrusted_checkout_ref("refs/heads/main"))


class BrowserParity(unittest.TestCase):
    """The page runs classify.mjs, the CLI runs check.py: both must flag the same checkout refs."""

    REFS = [
        "${{ github.event.pull_request.head.sha }}", "${{ github.head_ref }}",
        "refs/pull/${{ github.event.pull_request.number }}/merge", "${{ github.event.pull_request.merge_commit_sha }}",
        "${{ github.event.workflow_run.head_commit.id }}", "${{ github.event.workflow_run.head_branch }}",
        "main", "refs/heads/main", "${{ github.event.pull_request.base.ref }}", "${{ github.sha }}",
    ]

    def test_classify_mjs_agrees_with_check_py(self):
        import shutil
        if not shutil.which("node"):
            self.skipTest("node not installed")
        here = Path(__file__).parent
        script = (
            "import(process.argv[1]).then(m => console.log(JSON.stringify("
            "JSON.parse(process.argv[2]).map(r => m.hasUntrustedCheckoutRef(r)))))"
        )
        out = subprocess.run(
            ["node", "-e", script, (here / "classify.mjs").as_uri(), json.dumps(self.REFS)],
            capture_output=True, text=True, check=True,
        ).stdout
        self.assertEqual(json.loads(out), [check.has_untrusted_checkout_ref(r) for r in self.REFS])


class StripQuotes(unittest.TestCase):
    def test_strips_matching_quotes_only(self):
        self.assertEqual(check.strip_quotes('"ab"'), "ab")
        self.assertEqual(check.strip_quotes("'ab'"), "ab")
        self.assertEqual(check.strip_quotes('""'), "")
        self.assertEqual(check.strip_quotes("'ab\""), "'ab\"")
        self.assertEqual(check.strip_quotes("ab"), "ab")
        self.assertEqual(check.strip_quotes('"'), '"')

    def test_quoted_ref_is_reported_unquoted(self):
        wf = ScanTextPwnRequest.UNTRUSTED_WORKFLOW.replace(
            "ref: ${{ github.event.pull_request.head.sha }}", "ref: \"${{ github.event.pull_request.head.sha }}\""
        )
        pwn = [f for f in check.scan_text(wf) if f["type"] == check.PWN_REQUEST_CHECKOUT]
        self.assertEqual(pwn[0]["detail"], "${{ github.event.pull_request.head.sha }}")


class ScanTextPwnRequest(unittest.TestCase):
    UNTRUSTED_WORKFLOW = """\
name: pr
on:
  pull_request_target:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: npm test
"""

    def test_flags_untrusted_checkout_ref_under_pull_request_target(self):
        findings = check.scan_text(self.UNTRUSTED_WORKFLOW)
        pwn = [f for f in findings if f["type"] == check.PWN_REQUEST_CHECKOUT]
        self.assertEqual(len(pwn), 1)
        self.assertEqual(pwn[0]["line"], 10)
        self.assertIn("head.sha", pwn[0]["detail"])

    def test_workflow_run_trigger_also_flags(self):
        text = self.UNTRUSTED_WORKFLOW.replace("pull_request_target:", "workflow_run:\n    workflows: [ci]")
        text = text.replace("github.event.pull_request.head.sha", "github.event.workflow_run.head_sha")
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.PWN_REQUEST_CHECKOUT]), 1)

    def test_same_checkout_under_plain_pull_request_is_not_flagged(self):
        text = self.UNTRUSTED_WORKFLOW.replace("pull_request_target:", "pull_request:")
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.PWN_REQUEST_CHECKOUT], [])

    def test_checkout_with_no_ref_is_not_flagged(self):
        text = """\
on:
  pull_request_target:
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: npm test
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.PWN_REQUEST_CHECKOUT], [])

    def test_checkout_with_safe_ref_is_not_flagged(self):
        text = self.UNTRUSTED_WORKFLOW.replace(
            "ref: ${{ github.event.pull_request.head.sha }}", "ref: main"
        )
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.PWN_REQUEST_CHECKOUT], [])

    def test_ref_belonging_to_a_later_unrelated_step_is_not_attributed_to_checkout(self):
        text = """\
on:
  pull_request_target:
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - uses: some/other-action@v1
        with:
          ref: ${{ github.event.pull_request.head.sha }}
"""
        findings = check.scan_text(text)
        # Not flagged: the `ref:` belongs to a *different* step (a new `- `
        # at the same indent ends the checkout step's `with:` tracking), and
        # this checker's whole premise is "actions/checkout given an
        # untrusted ref" -- some/other-action doing something with a PR SHA
        # isn't the documented pwn-request shape. Proves the indent-based
        # step tracking doesn't leak past the step it belongs to.
        self.assertEqual([f for f in findings if f["type"] == check.PWN_REQUEST_CHECKOUT], [])


class ScanTextScriptInjection(unittest.TestCase):
    def test_single_line_run_with_untrusted_title_is_flagged(self):
        text = """\
on: pull_request
jobs:
  build:
    steps:
      - run: echo "${{ github.event.pull_request.title }}"
"""
        findings = check.scan_text(text)
        injected = [f for f in findings if f["type"] == check.SCRIPT_INJECTION]
        self.assertEqual(len(injected), 1)
        self.assertEqual(injected[0]["line"], 5)

    def test_block_scalar_run_is_scanned_line_by_line(self):
        text = """\
on: issue_comment
jobs:
  build:
    steps:
      - run: |
          echo "start"
          echo "${{ github.event.comment.body }}"
          echo "done"
"""
        findings = check.scan_text(text)
        injected = [f for f in findings if f["type"] == check.SCRIPT_INJECTION]
        self.assertEqual(len(injected), 1)
        self.assertEqual(injected[0]["line"], 7)

    def test_block_scalar_ends_at_dedent_not_at_next_run(self):
        text = """\
on: pull_request
jobs:
  build:
    steps:
      - run: |
          echo "safe"
      - run: echo "${{ github.event.pull_request.title }}"
"""
        findings = check.scan_text(text)
        injected = [f for f in findings if f["type"] == check.SCRIPT_INJECTION]
        self.assertEqual(len(injected), 1)
        self.assertEqual(injected[0]["line"], 7)

    def test_number_interpolation_is_not_flagged(self):
        text = """\
on: pull_request
jobs:
  build:
    steps:
      - run: echo "${{ github.event.pull_request.number }}"
"""
        self.assertEqual(check.scan_text(text), [])

    def test_env_indirection_is_the_safe_pattern_and_is_not_flagged(self):
        # The recommended mitigation: assign the untrusted value to an env
        # var (not a run: line, so out of scope for this scanner) and
        # reference it as a shell variable inside run: -- no raw expression
        # ever reaches the shell script text, so nothing here should fire.
        text = """\
on: pull_request
jobs:
  build:
    steps:
      - env:
          TITLE: ${{ github.event.pull_request.title }}
        run: echo "$TITLE"
"""
        self.assertEqual(check.scan_text(text), [])

    def test_flags_regardless_of_trigger_type(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - run: echo "${{ github.event.head_commit.message }}"
"""
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.SCRIPT_INJECTION]), 1)


class DiscoverAndScanPath(unittest.TestCase):
    def test_finds_yml_and_yaml_under_dot_github_workflows(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp) / ".github" / "workflows"
            workflows.mkdir(parents=True)
            (workflows / "a.yml").write_text("on: push\n")
            (workflows / "b.yaml").write_text("on: push\n")
            (workflows / "notes.txt").write_text("ignore me\n")
            files = check.discover_workflow_files(tmp)
            self.assertEqual([p.name for p in files], ["a.yml", "b.yaml"])

    def test_missing_workflows_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.discover_workflow_files(tmp), [])

    def test_scans_every_workflow_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp) / ".github" / "workflows"
            workflows.mkdir(parents=True)
            (workflows / "a.yml").write_text(
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/checkout@v4\n        with:\n"
                "          ref: ${{ github.event.pull_request.head.sha }}\n"
            )
            (workflows / "b.yml").write_text("on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n")
            findings = check.scan_path(tmp)
            self.assertEqual(len(findings), 1)


class Main(unittest.TestCase):
    def _write_repo(self, tmp, workflow_text):
        workflows = Path(tmp) / ".github" / "workflows"
        workflows.mkdir(parents=True)
        (workflows / "ci.yml").write_text(workflow_text)

    def test_clean_repo_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(tmp, "on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n")
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 0)

    def test_risky_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/checkout@v4\n        with:\n"
                "          ref: ${{ github.event.pull_request.head.sha }}\n",
            )
            self.assertEqual(check.main([tmp]), 0)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/checkout@v4\n        with:\n"
                "          ref: ${{ github.event.pull_request.head.sha }}\n",
            )
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 2)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/checkout@v4\n        with:\n"
                "          ref: ${{ github.event.pull_request.head.sha }}\n",
            )
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "json"],
                capture_output=True,
                text=True,
                check=True,
            )
            data = json.loads(result.stdout)
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["type"], "pwn-request-checkout")

    def test_text_output_lists_each_kind_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/checkout@v4\n        with:\n"
                "          ref: ${{ github.event.pull_request.head.sha }}\n"
                "      - run: echo ${{ github.event.pull_request.title }}\n",
            )
            out = check.render_text(check.scan_path(Path(tmp)), Path(tmp))
            self.assertIn("pwn-request-checkout\n     ref: ${{ github.event.pull_request.head.sha }}", out)
            self.assertIn("script-injection\n     expr: github.event.pull_request.title", out)
            self.assertEqual(out.count("pwn-request-checkout\n"), 1)
            self.assertEqual(out.count("script-injection\n"), 1)
            self.assertIn("1 pwn-request-checkout finding(s), 1 script-injection finding(s).", out)

    def test_no_workflows_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.main([tmp]), 0)

    def test_sarif_output_is_valid_and_uploadable(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/checkout@v4\n        with:\n"
                "          ref: ${{ github.event.pull_request.head.sha }}\n"
                "      - run: echo \"${{ github.event.pull_request.title }}\"\n",
            )
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "sarif"],
                capture_output=True,
                text=True,
                check=True,
            )
            sarif = json.loads(result.stdout)
            self.assertEqual(sarif["version"], "2.1.0")
            run = sarif["runs"][0]
            rule_ids = {rule["id"] for rule in run["tool"]["driver"]["rules"]}
            self.assertEqual(rule_ids, check.RISK_CLASSIFICATIONS)
            self.assertEqual(len(run["results"]), 2)
            for result_entry in run["results"]:
                self.assertIn(result_entry["ruleId"], rule_ids)
                # A path rooted at the scanned directory (an OS-specific
                # absolute path here) must come out relative, or Code
                # Scanning silently drops the result rather than annotating
                # the file github/codeql-action/upload-sarif was pointed at.
                uri = result_entry["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
                self.assertFalse(uri.startswith("/"), uri)
                self.assertFalse(uri.startswith("./"), uri)
                self.assertTrue(uri.startswith(".github/workflows/"), uri)

    def test_sarif_output_with_no_findings_is_still_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(tmp, "on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "sarif"],
                capture_output=True,
                text=True,
                check=True,
            )
            sarif = json.loads(result.stdout)
            self.assertEqual(sarif["runs"][0]["results"], [])


if __name__ == "__main__":
    unittest.main()
