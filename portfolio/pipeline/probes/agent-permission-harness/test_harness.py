#!/usr/bin/env python3
"""Tests for the agent permission harness.

Two layers, and the second is the one that matters over time:

  * fixture tests, which pin each rule's behaviour on a synthetic repository —
    including the negative cases, because a rule that fires on everything is
    worth less than no rule at all; and
  * `TestHeadlineNumbersAgainstThisRepo`, which asserts the findings this
    probe's README leads with directly against `.github/workflows` in this
    checkout. The README's claims are measurements of a live surface, and a
    workflow edit that changes them should fail here rather than leave a
    document quietly describing a repository that no longer exists.

Standard library only; no network.
"""

from __future__ import annotations

import json
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

import harness
from harness import (
    Finding,
    _delimited_span,
    _expand_prompt_path,
    analyse,
    effective_write_scopes,
    find_prompt_files,
    is_agent_step,
    load_with_lines,
    parse_workflow,
    payload_writer_set,
    render_markdown,
    summarise,
    writer_set_broader,
)

REPO_ROOT = Path(__file__).resolve().parents[4]


def build_repo(tmp: Path, workflows: dict[str, str], files: dict[str, str] | None = None) -> Path:
    """Materialise a synthetic repository and return its root."""
    wf_dir = tmp / ".github" / "workflows"
    wf_dir.mkdir(parents=True)
    for name, body in workflows.items():
        (wf_dir / name).write_text(textwrap.dedent(body).lstrip("\n"))
    for rel, body in (files or {}).items():
        path = tmp / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(body).lstrip("\n"))
    return tmp


class RepoCase(unittest.TestCase):
    """Base class giving each test a throwaway repository."""

    def run_rules(self, workflows: dict[str, str], files: dict[str, str] | None = None):
        with tempfile.TemporaryDirectory() as raw:
            root = build_repo(Path(raw), workflows, files)
            return analyse(root)

    def rules_fired(self, findings) -> set[str]:
        return {f.rule for f in findings}


# --------------------------------------------------------------------------
# Loader
# --------------------------------------------------------------------------

class TestLoadWithLines(unittest.TestCase):
    def test_records_line_for_nested_paths(self):
        text = textwrap.dedent(
            """
            name: demo
            jobs:
              build:
                steps:
                  - run: echo hi
            """
        ).lstrip("\n")
        data, lines = load_with_lines(text)
        self.assertEqual(data["jobs"]["build"]["steps"][0]["run"], "echo hi")
        # The job's own line, not the line of its first field.
        self.assertEqual(lines[("jobs", "build")], 3)
        self.assertEqual(lines[("jobs", "build", "steps", 0, "run")], 5)

    def test_block_scalar_is_reported_at_its_key_not_its_first_content_line(self):
        text = "jobs:\n  build:\n    steps:\n      - run: |\n          echo hi\n"
        _, lines = load_with_lines(text)
        self.assertEqual(lines[("jobs", "build", "steps", 0, "run")], 4)

    def test_empty_document_is_not_an_error(self):
        data, lines = load_with_lines("")
        self.assertIsNone(data)
        self.assertEqual(lines, {})

    def test_keys_are_kept_as_written_so_bare_on_stays_a_string(self):
        # YAML 1.1 resolves a bare `on:` to True, which is the classic way a
        # workflow parser ends up believing a file has no triggers. This loader
        # keeps raw key text specifically so that cannot happen.
        data, _ = load_with_lines("on: push\n")
        self.assertIn("on", data)
        self.assertNotIn(True, data)

    def test_scalar_values_are_still_resolved(self):
        data, _ = load_with_lines("timeout: 120\nenabled: true\n")
        self.assertEqual(data["timeout"], 120)
        self.assertIs(data["enabled"], True)


# --------------------------------------------------------------------------
# Privilege and writer-set model
# --------------------------------------------------------------------------

class TestPrivilegeModel(unittest.TestCase):
    def test_write_scopes_extracted_from_a_permissions_block(self):
        self.assertEqual(
            effective_write_scopes({"contents": "write", "issues": "read"}), ["contents"]
        )

    def test_read_only_block_yields_no_write_scopes(self):
        self.assertEqual(effective_write_scopes({"contents": "read"}), [])

    def test_absent_permissions_reports_the_repository_default(self):
        self.assertEqual(effective_write_scopes(None), ["<repository-default>"])

    def test_write_all_shorthand(self):
        self.assertEqual(effective_write_scopes("write-all"), ["<all-scopes>"])
        self.assertEqual(effective_write_scopes("read-all"), [])

    def test_writer_sets_are_ordered_widest_last(self):
        self.assertTrue(writer_set_broader("ANY_USER", "REPO_WRITE"))
        self.assertTrue(writer_set_broader("REPO_WRITE", "LITERAL"))
        self.assertFalse(writer_set_broader("LITERAL", "ANY_USER"))
        self.assertFalse(writer_set_broader("REPO_WRITE", "REPO_WRITE"))

    def test_payload_writer_set_follows_the_trigger(self):
        with tempfile.TemporaryDirectory() as raw:
            root = build_repo(
                Path(raw),
                {
                    "dispatch.yml": "on: workflow_dispatch\njobs: {}\n",
                    "target.yml": "on: pull_request_target\njobs: {}\n",
                    "cron.yml": "on:\n  schedule:\n    - cron: '0 * * * *'\njobs: {}\n",
                },
            )
            got = {
                path.name: payload_writer_set(parse_workflow(path, root))
                for path in sorted((root / ".github" / "workflows").glob("*.yml"))
            }
        self.assertEqual(got["dispatch.yml"], "DISPATCHER")
        self.assertEqual(got["target.yml"], "ANY_USER")
        self.assertEqual(got["cron.yml"], "LITERAL")


class TestAgentStepDetection(unittest.TestCase):
    def test_known_agent_action_is_detected(self):
        self.assertTrue(is_agent_step({"uses": "anomalyco/opencode/github@abc"}))

    def test_prompt_input_is_detected_regardless_of_action(self):
        self.assertTrue(is_agent_step({"uses": "some/runner@v1", "with": {"prompt": "hi"}}))

    def test_ordinary_step_is_not_an_agent(self):
        self.assertFalse(is_agent_step({"uses": "actions/checkout@v4"}))
        self.assertFalse(is_agent_step({"run": "npm test"}))


# --------------------------------------------------------------------------
# R1 — missing referenced script
# --------------------------------------------------------------------------

class TestMissingReferencedScript(RepoCase):
    WORKFLOW = """
        name: agent
        on: workflow_dispatch
        permissions:
          contents: write
        jobs:
          run:
            steps:
              - run: |
                  chmod +x .github/scripts/prepare.sh 2>/dev/null || true
                  if [[ -f .github/scripts/prepare.sh ]]; then
                    .github/scripts/prepare.sh
                  fi
        """

    def test_fires_when_the_script_is_absent(self):
        findings = self.run_rules({"a.yml": self.WORKFLOW})
        hits = [f for f in findings if f.rule == "R1-missing-referenced-script"]
        self.assertEqual(len(hits), 1, "one finding per distinct missing path")
        self.assertIn("prepare.sh", hits[0].summary)
        self.assertIn("silent", hits[0].detail)
        self.assertEqual(hits[0].severity, "defect")

    def test_silent_when_the_script_exists(self):
        findings = self.run_rules(
            {"a.yml": self.WORKFLOW},
            {".github/scripts/prepare.sh": "#!/bin/sh\necho hi\n"},
        )
        self.assertNotIn("R1-missing-referenced-script", self.rules_fired(findings))

    def test_unguarded_reference_is_described_as_a_failure_not_a_silence(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: agent
                    on: push
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - run: scripts/build.py
                """
            }
        )
        hits = [f for f in findings if f.rule == "R1-missing-referenced-script"]
        self.assertEqual(len(hits), 1)
        self.assertIn("fails when it is reached", hits[0].detail)

    def test_reports_each_missing_path_once_not_once_per_mention(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: agent
                    on: push
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - run: |
                              scripts/one.sh
                              scripts/one.sh --again
                              scripts/two.sh
                """
            }
        )
        hits = [f for f in findings if f.rule == "R1-missing-referenced-script"]
        self.assertEqual(len(hits), 2)


# --------------------------------------------------------------------------
# R2 — static output delimiter
# --------------------------------------------------------------------------

class TestStaticOutputDelimiter(RepoCase):
    def _wf(self, body: str) -> dict:
        """A one-step workflow whose `run:` block is exactly `body`.

        Built by string concatenation rather than an f-string inside a dedent:
        the script bodies here are themselves indentation-sensitive, and letting
        dedent see them once made three of these tests silently assert against a
        run block that had lost its structure.
        """
        script = textwrap.indent(textwrap.dedent(body).strip("\n"), " " * 12)
        return {
            "a.yml": (
                "name: demo\n"
                "on: push\n"
                "permissions:\n"
                "  contents: read\n"
                "jobs:\n"
                "  run:\n"
                "    steps:\n"
                "      - run: |\n" + script + "\n"
            )
        }

    def test_the_fixture_builder_produces_the_script_verbatim(self):
        # If this breaks, every negative test in this class passes for the wrong
        # reason, so it is asserted rather than assumed.
        with tempfile.TemporaryDirectory() as raw:
            root = build_repo(Path(raw), self._wf("echo one\necho two\n"))
            wf = parse_workflow(root / ".github" / "workflows" / "a.yml", root)
            self.assertEqual(wf.jobs[0].steps[0]["run"], "echo one\necho two\n")

    def test_fires_on_file_content_behind_a_fixed_delimiter(self):
        findings = self.run_rules(
            self._wf(
                """
                {
                  echo "body<<PROMPT_EOF"
                  cat "$PROMPT_PATH"
                  echo "PROMPT_EOF"
                } >> "$GITHUB_OUTPUT"
                """
            )
        )
        hits = [f for f in findings if f.rule == "R2-static-output-delimiter"]
        self.assertEqual(len(hits), 1)
        self.assertIn("PROMPT_EOF", hits[0].summary)

    def test_silent_when_the_delimited_content_is_literal(self):
        findings = self.run_rules(
            self._wf(
                """
                SOMEVAR=1
                {
                  echo "body<<EOF"
                  echo "a fixed line"
                  echo "EOF"
                } >> "$GITHUB_OUTPUT"
                """
            )
        )
        self.assertNotIn("R2-static-output-delimiter", self.rules_fired(findings))

    def test_silent_when_the_delimiter_is_generated_per_run(self):
        findings = self.run_rules(
            self._wf(
                """
                DELIM="EOF_${RANDOM}"
                {
                  echo "body<<${DELIM}"
                  cat file.txt
                  echo "${DELIM}"
                } >> "$GITHUB_OUTPUT"
                """
            )
        )
        self.assertNotIn("R2-static-output-delimiter", self.rules_fired(findings))

    def test_silent_when_nothing_is_written_to_a_workflow_variable_file(self):
        findings = self.run_rules(
            self._wf(
                """
                cat <<EOF > /tmp/elsewhere
                $CONTENT
                EOF
                """
            )
        )
        self.assertNotIn("R2-static-output-delimiter", self.rules_fired(findings))


class TestDelimitedSpan(unittest.TestCase):
    def test_span_excludes_the_delimiter_lines_themselves(self):
        run = 'echo "body<<E"\ncat f\necho "E"\ntail -1 "$OTHER"\n'
        self.assertEqual(_delimited_span(run, "E"), "cat f")

    def test_unclosed_delimiter_returns_none(self):
        self.assertIsNone(_delimited_span('echo "body<<E"\ncat f\n', "E"))

    def test_bare_heredoc_terminator_closes_the_span(self):
        self.assertEqual(_delimited_span("cmd <<E\n$X\nE\n", "E"), "$X")


# --------------------------------------------------------------------------
# R3 — untrusted expression spliced into a shell script
# --------------------------------------------------------------------------

class TestUntrustedExpressionInRun(RepoCase):
    def test_fires_when_attacker_text_is_spliced_into_a_run_body(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: issue_comment
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - run: echo "${{ github.event.comment.body }}"
                """
            }
        )
        hits = [f for f in findings if f.rule == "R3-untrusted-expression-in-run"]
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].input_writer_set, "ANY_USER")
        self.assertTrue(hits[0].observable_by_replay)

    def test_silent_when_the_value_is_passed_through_env(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: issue_comment
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - env:
                              BODY: ${{ github.event.comment.body }}
                            run: echo "$BODY"
                """
            }
        )
        self.assertNotIn("R3-untrusted-expression-in-run", self.rules_fired(findings))

    def test_silent_on_a_trusted_context(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: push
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - run: echo "${{ github.sha }}"
                """
            }
        )
        self.assertNotIn("R3-untrusted-expression-in-run", self.rules_fired(findings))


# --------------------------------------------------------------------------
# R4 — unpinned third-party action in a privileged job
# --------------------------------------------------------------------------

class TestUnpinnedThirdPartyAction(RepoCase):
    def _wf(self, uses: str, extra: str = "", permissions: str = "contents: read") -> dict:
        """A one-step workflow using `uses`, with `extra` as sibling step keys."""
        # A step's sibling keys align with `uses`, which the `- ` puts at
        # column 8. Ten spaces makes the file unparseable, and analyse() skips
        # unparseable files by design — so the bug shows up as a rule that
        # simply never fires. Hence the fixture-builder test below.
        tail = textwrap.indent(textwrap.dedent(extra).strip("\n"), " " * 8) + "\n" if extra else ""
        return {
            "a.yml": (
                "name: demo\n"
                "on: push\n"
                "permissions:\n"
                f"  {permissions}\n"
                "jobs:\n"
                "  run:\n"
                "    steps:\n"
                f"      - uses: {uses}\n" + tail
            )
        }

    def test_the_fixture_builder_attaches_extra_keys_to_the_step(self):
        with tempfile.TemporaryDirectory() as raw:
            root = build_repo(
                Path(raw), self._wf("some/action@v1", "with:\n  token: ${{ secrets.T }}")
            )
            wf = parse_workflow(root / ".github" / "workflows" / "a.yml", root)
            step = wf.jobs[0].steps[0]
            self.assertEqual(step["uses"], "some/action@v1")
            self.assertEqual(step["with"], {"token": "${{ secrets.T }}"})

    def test_fires_on_a_tag_pinned_third_party_action_holding_a_secret(self):
        findings = self.run_rules(
            self._wf("amondnet/vercel-action@v25", "with:\n  vercel-token: ${{ secrets.VERCEL_TOKEN }}")
        )
        hits = [f for f in findings if f.rule == "R4-unpinned-third-party-action"]
        self.assertEqual(len(hits), 1)
        self.assertIn("VERCEL_TOKEN", hits[0].detail)

    def test_silent_on_a_sha_pinned_third_party_action(self):
        findings = self.run_rules(
            self._wf(
                "anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2",
                "with:\n  token: ${{ secrets.T }}",
            )
        )
        self.assertNotIn("R4-unpinned-third-party-action", self.rules_fired(findings))

    def test_silent_on_a_first_party_action(self):
        findings = self.run_rules(self._wf("actions/checkout@v4", "with:\n  token: ${{ secrets.T }}"))
        self.assertNotIn("R4-unpinned-third-party-action", self.rules_fired(findings))

    def test_silent_when_the_job_holds_neither_secret_nor_write_scope(self):
        findings = self.run_rules(self._wf("pnpm/action-setup@v4"))
        self.assertNotIn("R4-unpinned-third-party-action", self.rules_fired(findings))

    def test_fires_without_a_secret_when_the_job_holds_a_write_scope(self):
        findings = self.run_rules(self._wf("pnpm/action-setup@v4", permissions="contents: write"))
        hits = [f for f in findings if f.rule == "R4-unpinned-third-party-action"]
        self.assertEqual(len(hits), 1)
        self.assertIn("contents", hits[0].detail)


# --------------------------------------------------------------------------
# R5 / R6 — posture rules
# --------------------------------------------------------------------------

class TestPermissionPosture(RepoCase):
    def test_job_without_its_own_block_inherits_and_is_reported(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: push
                    permissions:
                      contents: write
                    jobs:
                      needs-it:
                        permissions:
                          contents: write
                        steps:
                          - run: git push
                      does-not:
                        steps:
                          - run: echo hi
                """
            }
        )
        hits = [f for f in findings if f.rule == "R5-inherited-write-permission"]
        self.assertEqual([f.job for f in hits], ["does-not"])
        self.assertEqual(hits[0].severity, "posture")

    def test_silent_when_the_file_level_floor_is_read_only(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: push
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - run: echo hi
                """
            }
        )
        self.assertNotIn("R5-inherited-write-permission", self.rules_fired(findings))

    def test_agent_write_scope_is_recorded_as_the_privilege_baseline(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: workflow_dispatch
                    permissions:
                      contents: write
                    jobs:
                      run:
                        steps:
                          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
                            with:
                              prompt: hello
                """
            }
        )
        hits = [f for f in findings if f.rule == "R6-agent-holds-write-scope"]
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].severity, "posture")
        self.assertEqual(hits[0].input_writer_set, "LITERAL")

    def test_agent_without_a_write_scope_is_not_reported(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: demo
                    on: workflow_dispatch
                    permissions:
                      contents: read
                    jobs:
                      run:
                        steps:
                          - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
                            with:
                              prompt: hello
                """
            }
        )
        self.assertNotIn("R6-agent-holds-write-scope", self.rules_fired(findings))


# --------------------------------------------------------------------------
# R7 — the agent instruction closure
# --------------------------------------------------------------------------

class TestPromptPathExpansion(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        for rel in [
            "CLAUDE.md",
            "ventures/alpha/VENTURE.yaml",
            "ventures/alpha/AGENTS.md",
            "ventures/beta/VENTURE.yaml",
            "ventures/beta/nested/VENTURE.yaml",
            "node_modules/pkg/AGENTS.md",
        ]:
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("x")

    def tearDown(self):
        self._tmp.cleanup()

    def test_explicit_path_resolves_to_itself(self):
        self.assertEqual(_expand_prompt_path("CLAUDE.md", self.root), ["CLAUDE.md"])

    def test_star_does_not_cross_a_directory_separator(self):
        # The regression this guards: fnmatch's `*` matches `/`, so the nested
        # ventures/beta/nested/VENTURE.yaml would be swept in and every closure
        # count would be inflated.
        got = _expand_prompt_path("ventures/*/VENTURE.yaml", self.root)
        self.assertEqual(got, ["ventures/alpha/VENTURE.yaml", "ventures/beta/VENTURE.yaml"])

    def test_placeholder_is_normalised_to_a_glob(self):
        got = _expand_prompt_path("ventures/<name>/VENTURE.yaml", self.root)
        self.assertEqual(got, ["ventures/alpha/VENTURE.yaml", "ventures/beta/VENTURE.yaml"])

    def test_bare_filename_resolves_to_every_copy_in_the_tree(self):
        self.assertEqual(_expand_prompt_path("AGENTS.md", self.root), ["ventures/alpha/AGENTS.md"])

    def test_vendored_trees_are_pruned(self):
        self.assertNotIn("node_modules/pkg/AGENTS.md", _expand_prompt_path("AGENTS.md", self.root))

    def test_unknown_path_resolves_to_nothing(self):
        self.assertEqual(_expand_prompt_path("does/not/exist.md", self.root), [])


class TestAgentInstructionClosure(RepoCase):
    WORKFLOW = """
        name: agent
        on: workflow_dispatch
        permissions:
          contents: write
        jobs:
          run:
            steps:
              - run: cat .github/prompts/work.md
              - uses: anomalyco/opencode/github@e5cc278dec9294a627a7b05f47ce6a564408c1a2
                with:
                  prompt: ${{ steps.p.outputs.body }}
        """
    PROMPT = """
        Read `CLAUDE.md` first, then each venture's `AGENTS.md`
        and `ventures/<name>/VENTURE.yaml`.
        """

    def test_closure_counts_the_files_the_prompt_directs_reads_of(self):
        findings = self.run_rules(
            {"a.yml": self.WORKFLOW},
            {
                ".github/prompts/work.md": self.PROMPT,
                "CLAUDE.md": "x",
                "ventures/alpha/AGENTS.md": "x",
                "ventures/alpha/VENTURE.yaml": "x",
                "ventures/beta/VENTURE.yaml": "x",
            },
        )
        hits = [f for f in findings if f.rule == "R7-agent-instruction-closure"]
        self.assertEqual(len(hits), 1)
        self.assertIn("4 repository files", hits[0].summary)
        self.assertEqual(hits[0].input_writer_set, "REPO_WRITE")
        self.assertFalse(
            hits[0].observable_by_replay,
            "this is the finding attack replay cannot reach; the flag is the claim",
        )

    def test_silent_when_the_workflow_runs_no_agent(self):
        findings = self.run_rules(
            {
                "a.yml": """
                    name: not-an-agent
                    on: push
                    permissions:
                      contents: write
                    jobs:
                      run:
                        steps:
                          - run: cat .github/prompts/work.md
                """
            },
            {".github/prompts/work.md": self.PROMPT, "CLAUDE.md": "x"},
        )
        self.assertNotIn("R7-agent-instruction-closure", self.rules_fired(findings))

    def test_prompt_file_discovery_requires_the_file_to_exist(self):
        with tempfile.TemporaryDirectory() as raw:
            root = build_repo(Path(raw), {"a.yml": self.WORKFLOW})
            wf = parse_workflow(root / ".github" / "workflows" / "a.yml", root)
            self.assertEqual(find_prompt_files(wf, root), [])


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

class TestReporting(unittest.TestCase):
    def _finding(self, rule="R1-missing-referenced-script", severity="defect", replay=False):
        return Finding(
            rule=rule,
            severity=severity,
            workflow="a.yml",
            job="run",
            line=3,
            summary="s",
            detail="d",
            input_writer_set="REPO_WRITE",
            privilege="token:contents",
            observable_by_replay=replay,
        )

    def test_summary_splits_defects_from_posture(self):
        summary = summarise([self._finding(), self._finding(rule="R5-inherited-write-permission", severity="posture")])
        self.assertEqual(summary["defects"], 1)
        self.assertEqual(summary["posture"], 1)
        self.assertEqual(summary["total"], 2)

    def test_every_finding_is_statically_decidable_by_construction(self):
        summary = summarise([self._finding(), self._finding(replay=True)])
        self.assertEqual(summary["decidable_statically"], summary["total"])
        self.assertEqual(summary["replay_only"], 0)
        self.assertEqual(summary["observable_by_attack_replay"], 1)

    def test_rules_that_found_nothing_are_reported_as_zero_rows(self):
        findings = [self._finding()]
        summary = summarise(findings)
        self.assertIn("R3-untrusted-expression-in-run", summary["silent_rules"])
        rendered = render_markdown(findings, summary)
        self.assertIn("| 0 |", rendered)
        self.assertIn("The zero rows are results too.", rendered)

    def test_every_rule_has_a_title(self):
        rule_ids = {
            f"R{n}" for n in range(1, 8)
        }
        titled = {r.split("-")[0] for r in harness.RULE_TITLES}
        self.assertEqual(titled, rule_ids)


# --------------------------------------------------------------------------
# The live surface
# --------------------------------------------------------------------------

class TestHeadlineNumbersAgainstThisRepo(unittest.TestCase):
    """Assert this probe's README claims against the real .github/workflows.

    These fail loudly when someone changes a workflow, which is the intent: the
    README states counts, and a count in a document nobody re-derives is how
    the rest of this pipeline accumulated stale claims.
    """

    @classmethod
    def setUpClass(cls):
        cls.findings = analyse(REPO_ROOT)
        cls.summary = summarise(cls.findings)
        cls.by_rule = cls.summary["by_rule"]

    def test_the_canonical_injection_class_finds_nothing_here(self):
        # The headline result. If this ever fires, the README's argument about
        # R7 being the interesting rule needs rewriting, not just the number.
        self.assertNotIn("R3-untrusted-expression-in-run", self.by_rule)
        self.assertIn("R3-untrusted-expression-in-run", self.summary["silent_rules"])

    def test_nothing_found_here_requires_a_running_agent(self):
        self.assertEqual(self.summary["replay_only"], 0)
        self.assertEqual(self.summary["decidable_statically"], self.summary["total"])

    def test_the_agent_workflow_is_the_only_one_running_an_agent(self):
        agent_workflows = {
            f.workflow for f in self.findings if f.rule == "R6-agent-holds-write-scope"
        }
        self.assertEqual(agent_workflows, {".github/workflows/opencode-high-throughput.yml"})

    def test_the_agent_prompt_script_is_still_absent(self):
        hits = [f for f in self.findings if f.rule == "R1-missing-referenced-script"]
        self.assertEqual(len(hits), 1)
        self.assertIn("prepare-agent-prompt.sh", hits[0].summary)
        self.assertIn("silent", hits[0].detail)

    def test_the_prompt_output_delimiter_is_still_fixed(self):
        hits = [f for f in self.findings if f.rule == "R2-static-output-delimiter"]
        self.assertEqual(len(hits), 1)
        self.assertIn("PROMPT_EOF", hits[0].summary)

    def test_the_instruction_closure_is_larger_than_the_prompt(self):
        hits = [f for f in self.findings if f.rule == "R7-agent-instruction-closure"]
        self.assertEqual(len(hits), 1)
        # The exact count moves with every venture added, so the assertion is on
        # the claim the README actually makes -- that the closure is an order of
        # magnitude larger than the one prompt file handed to the agent.
        count = int(hits[0].summary.split()[4])
        self.assertGreaterEqual(count, 10)
        self.assertIn("CLAUDE.md", hits[0].detail)

    def test_third_party_actions_receiving_secrets_are_unpinned(self):
        hits = [f for f in self.findings if f.rule == "R4-unpinned-third-party-action"]
        self.assertGreaterEqual(len(hits), 1)
        # The agent action itself is SHA-pinned, so the repository already holds
        # the rule; the finding is that it is applied inconsistently.
        self.assertFalse(
            any("opencode" in f.summary for f in hits),
            "the agent action is pinned; if this fires, the inconsistency claim is stale",
        )

    def test_the_report_is_byte_identical_across_runs(self):
        # Regression: the closure attributed each resolved file to whichever
        # prompt spec reached it first, iterating a set — so the R7 detail text
        # differed between runs under hash randomisation and the committed
        # results file could never be reproduced. Two analyses in one process
        # share a hash seed, so this compares against a subprocess with its own.
        import os
        import subprocess

        first = render_markdown(self.findings, self.summary)
        env = dict(os.environ, PYTHONHASHSEED="1")
        second = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "harness.py")],
            capture_output=True, text=True, env=env, check=True,
        ).stdout
        self.assertEqual(first.strip(), second.strip())

    def test_json_output_is_serialisable(self):
        payload = json.dumps({"summary": self.summary, "findings": [f.__dict__ for f in self.findings]})
        self.assertIn("R7-agent-instruction-closure", payload)


if __name__ == "__main__":
    unittest.main()
