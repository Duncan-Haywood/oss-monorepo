import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import check


def workflow_with_step(step_yaml):
    return (
        "name: ci\n"
        "on: push\n"
        "jobs:\n"
        "  build:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - uses: actions/checkout@v4\n"
        + step_yaml
    )


class TransformedSecret(unittest.TestCase):
    def test_base64_of_inline_secret_flagged(self):
        text = workflow_with_step(
            "      - run: echo \"${{ secrets.API_KEY }}\" | base64\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], check.TRANSFORMED_SECRET)
        self.assertEqual(findings[0]["line"], 8)

    def test_base64_of_env_sourced_secret_flagged(self):
        text = workflow_with_step(
            "      - env:\n"
            "          TOKEN: ${{ secrets.API_KEY }}\n"
            "        run: echo \"$TOKEN\" | base64 -w0\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], check.TRANSFORMED_SECRET)

    def test_substring_expansion_of_secret_flagged(self):
        text = workflow_with_step(
            "      - env:\n"
            "          TOKEN: ${{ secrets.API_KEY }}\n"
            "        run: echo \"prefix=${TOKEN:0:8}\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], check.TRANSFORMED_SECRET)

    def test_openssl_of_secret_flagged(self):
        text = workflow_with_step(
            "      - run: echo -n \"${{ secrets.TOKEN }}\" | openssl base64\n"
        )
        findings = check.scan_text(text)
        self.assertTrue(any(f["type"] == check.TRANSFORMED_SECRET for f in findings))

    def test_transform_of_non_secret_value_not_flagged(self):
        text = workflow_with_step(
            "      - run: echo \"$BUILD_ID\" | base64\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_secret_used_without_transform_not_flagged(self):
        # GitHub already masks this in the raw log; not this tool's job.
        text = workflow_with_step(
            "      - run: echo \"${{ secrets.API_KEY }}\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_env_var_name_that_is_a_substring_of_another_not_confused(self):
        text = workflow_with_step(
            "      - env:\n"
            "          TOKEN: ${{ secrets.API_KEY }}\n"
            "          TOKEN_EXTRA: not-a-secret\n"
            "        run: echo \"$TOKEN_EXTRA\" | base64\n"
        )
        findings = check.scan_text(text)
        # TOKEN_EXTRA is not itself secret-derived; only exact-name $TOKEN is.
        self.assertEqual(findings, [])


class UnmaskedEnvExport(unittest.TestCase):
    def test_inline_secret_to_github_env_without_mask_flagged(self):
        text = workflow_with_step(
            "      - run: echo \"TOKEN=${{ secrets.API_KEY }}\" >> \"$GITHUB_ENV\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], check.UNMASKED_ENV_EXPORT)
        self.assertIn("GITHUB_ENV", findings[0]["detail"])

    def test_env_sourced_secret_to_github_output_without_mask_flagged(self):
        text = workflow_with_step(
            "      - env:\n"
            "          TOKEN: ${{ secrets.API_KEY }}\n"
            "        run: |\n"
            "          echo \"token=$TOKEN\" >> \"$GITHUB_OUTPUT\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], check.UNMASKED_ENV_EXPORT)

    def test_masked_export_not_flagged(self):
        text = workflow_with_step(
            "      - env:\n"
            "          TOKEN: ${{ secrets.API_KEY }}\n"
            "        run: |\n"
            "          echo \"::add-mask::$TOKEN\"\n"
            "          echo \"token=$TOKEN\" >> \"$GITHUB_OUTPUT\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_non_secret_export_not_flagged(self):
        text = workflow_with_step(
            "      - run: echo \"BUILD_ID=$RANDOM\" >> \"$GITHUB_ENV\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_github_state_target_recognised(self):
        text = workflow_with_step(
            "      - run: echo \"secret=${{ secrets.API_KEY }}\" >> \"$GITHUB_STATE\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertIn("GITHUB_STATE", findings[0]["detail"])


class StepScoping(unittest.TestCase):
    def test_secret_env_from_one_step_does_not_leak_into_next_step(self):
        text = workflow_with_step(
            "      - env:\n"
            "          TOKEN: ${{ secrets.API_KEY }}\n"
            "        run: echo hello\n"
            "      - run: echo \"$TOKEN\" | base64\n"
        )
        findings = check.scan_text(text)
        # $TOKEN in the second step is not known secret-derived there.
        self.assertEqual(findings, [])

    def test_two_independent_steps_each_flagged(self):
        text = workflow_with_step(
            "      - run: echo \"${{ secrets.A }}\" | base64\n"
            "      - run: echo \"${{ secrets.B }}\" | base64\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 2)

    def test_add_mask_in_one_step_does_not_suppress_a_later_step(self):
        text = workflow_with_step(
            "      - env:\n"
            "          A: ${{ secrets.A }}\n"
            "        run: |\n"
            "          echo \"::add-mask::$A\"\n"
            "          echo \"a=$A\" >> \"$GITHUB_ENV\"\n"
            "      - env:\n"
            "          B: ${{ secrets.B }}\n"
            "        run: echo \"b=$B\" >> \"$GITHUB_ENV\"\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertIn("b=$B", findings[0]["detail"])


class DiscoveryAndCli(unittest.TestCase):
    def test_discover_workflow_files_sorted(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "b.yml").write_text("name: b\n")
            (wf_dir / "a.yaml").write_text("name: a\n")
            files = check.discover_workflow_files(tmp)
            self.assertEqual([f.name for f in files], ["a.yaml", "b.yml"])

    def test_no_workflows_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.discover_workflow_files(tmp), [])

    def test_render_text_no_findings_names_scanned_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text(workflow_with_step("      - run: echo hi\n"))
            out = check.render_text(check.scan_path(tmp), tmp)
            self.assertIn("no findings", out)

    def test_render_text_no_workflow_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = check.render_text([], tmp)
            self.assertIn("No .github/workflows", out)

    def test_fail_on_risk_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text(
                workflow_with_step("      - run: echo \"${{ secrets.A }}\" | base64\n")
            )
            script = str(Path(__file__).parent / "check.py")
            result = subprocess.run(
                [sys.executable, script, tmp, "--fail-on-risk"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 2)

    def test_clean_repo_exits_zero_even_without_fail_on_risk_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text(workflow_with_step("      - run: echo hi\n"))
            script = str(Path(__file__).parent / "check.py")
            result = subprocess.run(
                [sys.executable, script, tmp, "--fail-on-risk"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0)

    def test_json_output_is_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text(
                workflow_with_step("      - run: echo \"${{ secrets.A }}\" | base64\n")
            )
            script = str(Path(__file__).parent / "check.py")
            result = subprocess.run(
                [sys.executable, script, tmp, "--format", "json"],
                capture_output=True,
                text=True,
            )
            data = json.loads(result.stdout)
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["type"], check.TRANSFORMED_SECRET)

    def test_sarif_output_has_both_rules_and_a_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text(
                workflow_with_step(
                    "      - run: echo \"${{ secrets.A }}\" | base64\n"
                )
            )
            script = str(Path(__file__).parent / "check.py")
            result = subprocess.run(
                [sys.executable, script, tmp, "--format", "sarif"],
                capture_output=True,
                text=True,
            )
            sarif = json.loads(result.stdout)
            rules = sarif["runs"][0]["tool"]["driver"]["rules"]
            self.assertEqual({r["id"] for r in rules}, check.RISK_CLASSIFICATIONS)
            self.assertEqual(len(sarif["runs"][0]["results"]), 1)

    def test_has_risk(self):
        self.assertFalse(check.has_risk([]))
        self.assertTrue(check.has_risk([{"type": check.TRANSFORMED_SECRET}]))
        self.assertFalse(check.has_risk([{"type": "something-else"}]))


if __name__ == "__main__":
    unittest.main()
