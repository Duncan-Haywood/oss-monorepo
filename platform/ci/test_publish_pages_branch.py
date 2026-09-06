"""The workflow that keeps the `gh-pages` snapshot in step with `main`.

`.github/workflows/publish-pages-branch.yml` exists because the branch Pages
route has no self-refresh: `platform/pages/publish-branch.sh` writes a
committed artifact, and nothing rebuilt it when `main` moved. The snapshot was
found stale on 2026-09-06 (built from 1afe50c5 while `main` was at 565cc635),
which -- if the owner has pointed Settings -> Pages at `gh-pages / (root)` --
is the live site silently lagging `main` with nothing turning red.

These tests pin the parts of that workflow whose breakage would be *quiet*.
`validate_workflows.py` already covers the generic invariants (parseable,
explicit permissions, unique name, no `vars.GITHUB_*`, a timeout); everything
here is specific to this workflow, and each case is a failure mode that would
otherwise present as a green run that published nothing or published late.
"""

from __future__ import annotations

import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "publish-pages-branch.yml"
SCRIPT = "./platform/pages/publish-branch.sh"


def load() -> dict:
    return yaml.safe_load(WORKFLOW.read_text())


def _norm(value) -> str | None:
    """Collapse an `if:` value to a comparable string, as publish_surface does."""
    if value is None:
        return None
    return " ".join(str(value).split())


class PublishPagesBranchWorkflow(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.is_file(), f"{WORKFLOW} is missing")
        self.doc = load()
        jobs = self.doc["jobs"]
        self.assertEqual(list(jobs), ["publish"], "expected exactly one job")
        self.job = jobs["publish"]
        self.steps = self.job["steps"]

    def _script_steps(self) -> list[tuple[int, dict]]:
        return [
            (i, s)
            for i, s in enumerate(self.steps)
            if SCRIPT in str(s.get("run", ""))
        ]

    def _publish_step_index(self) -> int:
        steps = self._script_steps()
        self.assertTrue(steps, f"no step invokes {SCRIPT}")
        return steps[0][0]

    def _step_with_push(self, value: str) -> dict:
        for _, step in self._script_steps():
            if str(step.get("env", {}).get("PUSH", "")).strip() == value:
                return step
        self.fail(f"no {SCRIPT} step with PUSH={value!r}")

    def test_configures_a_committer_identity_before_building(self) -> None:
        """`git commit-tree` refuses to run without one.

        `publish-branch.sh` builds its commit with plumbing (`write-tree` then
        `commit-tree`), and `actions/checkout` sets no user identity. Without
        an explicit `git config`, the script dies with "Author identity
        unknown" -- but only *after* a full ~2000-file build and the whole
        `check.mjs` crawl, so a two-line omission costs the entire job before
        it reports. Verified directly: `git commit-tree` with no identity in
        scope exits non-zero with that message.
        """
        publish_at = self._publish_step_index()
        config_at = None
        for i, step in enumerate(self.steps):
            run = str(step.get("run", ""))
            if "git config user.name" in run and "git config user.email" in run:
                config_at = i
                break
        self.assertIsNotNone(
            config_at,
            "no step configures git user.name and user.email; "
            "publish-branch.sh's commit-tree call will fail after a full build",
        )
        self.assertLess(
            config_at,
            publish_at,
            "the committer identity must be configured before the publish step",
        )

    def test_push_is_gated_on_an_owner_set_variable(self) -> None:
        """Ships switched off, per CLAUDE.md's "Automation" rule.

        The rule is that an unattended workflow must not push commits without
        owner approval. The gate is what makes that true, so a change that
        drops the `if:` from the pushing step would quietly convert this into
        exactly the kind of workflow that rule forbids.
        """
        pushing = self._step_with_push("1")
        self.assertEqual(
            _norm(pushing.get("if")),
            "vars.PAGES_BRANCH_PUBLISH == 'true'",
            "the pushing step must be gated on the owner-set variable",
        )

    def test_the_gate_is_an_if_not_an_env_expression(self) -> None:
        """`publish_surface.py` can only see `if:` gates.

        That tool answers "what does a merge to `main` publish?" from job- and
        step-level `if:` conditions. A publish gated inside an `env:`
        expression reads to it as *ungated*, so this workflow would be
        classified `live` -- a false claim, in the one place the repository
        looks to decide whether a merge goes live, that every merge publishes
        the site unconditionally. This was the shape of the first draft.
        """
        for _, step in self._script_steps():
            push = str(step.get("env", {}).get("PUSH", "")).strip()
            self.assertIn(
                push,
                {"0", "1"},
                "PUSH must be a literal 0 or 1; an expression hides the gate "
                "from publish_surface.py",
            )
            self.assertIsNotNone(
                step.get("if"), "each publish-branch.sh step needs an if: gate"
            )

    def test_exactly_one_build_runs_either_way(self) -> None:
        """The two script steps must be mutually exclusive.

        Both invocations build the whole site and run `check.mjs` over the
        artifact. Gates that can both be true would do that twice on every
        merge, for no gain, on an account whose Actions minutes are metered.
        """
        gates = {_norm(s.get("if")) for _, s in self._script_steps()}
        self.assertEqual(
            gates,
            {
                "vars.PAGES_BRANCH_PUBLISH == 'true'",
                "vars.PAGES_BRANCH_PUBLISH != 'true'",
            },
            "expected exactly one publishing and one verifying step, "
            "gated on complementary conditions",
        )

    def test_the_gate_variable_is_not_github_prefixed(self) -> None:
        """`portfolio-pages.yml` shipped this exact bug once.

        GitHub reserves the `GITHUB_` prefix and refuses to create a
        configuration variable carrying it, so such a gate reads as unset
        forever and the job is *skipped* -- which is a successful run. Nothing
        turns red; the publish simply never happens.
        """
        text = WORKFLOW.read_text()
        self.assertNotIn("vars.GITHUB_", text)
        self.assertNotIn("PAGES_BRANCH_PUBLISH".join(["vars.GITHUB_", ""]), text)

    def test_the_site_is_verified_even_when_publishing_is_off(self) -> None:
        """`check.mjs` must still run on a repository with the gate unset.

        It runs against the *built artifact*, so a dead link or a stale
        canonical introduced by the copy step is only visible there. If the
        only script step were the publishing one, a repository with
        publishing off would never check its own site, and the first run
        after the owner flips the variable would be the first time anything
        looked at the output.
        """
        verifying = self._step_with_push("0")
        self.assertEqual(_norm(verifying.get("if")), "vars.PAGES_BRANCH_PUBLISH != 'true'")

    def test_both_steps_pass_the_confirm_token(self) -> None:
        """The script refuses to run without it -- and it is also the marker
        `publish_surface.py` uses to tell a real invocation from a step that
        merely names the file (the `shellcheck` step in
        `hetzner-gitops-ci.yml` passes this same path to a linter). Dropping
        it here would make the step both a no-op and invisible to that tool.
        """
        for _, step in self._script_steps():
            self.assertEqual(step.get("env", {}).get("CONFIRM"), "publish-pages-branch")

    def test_concurrent_runs_do_not_cancel_each_other(self) -> None:
        """Cancelling would leave the branch behind `main` with a green check.

        Every run force-pushes the same branch, so overlapping merges must
        serialise. `cancel-in-progress: true` would drop the newer merge's run
        -- publishing the older tree and reporting success, which is precisely
        the stale-snapshot failure this workflow exists to prevent.
        """
        concurrency = self.doc["concurrency"]
        self.assertFalse(
            concurrency.get("cancel-in-progress", False),
            "cancel-in-progress must be false",
        )
        self.assertNotIn(
            "github.ref",
            str(concurrency["group"]),
            "the group must be repository-wide, not per-ref: "
            "all runs contend for the same branch",
        )

    def test_it_can_actually_push(self) -> None:
        """`contents: write` is what the force-push needs.

        A least-privilege sweep that narrowed this to `contents: read` would
        not fail until the push step, after the build -- and only on the
        repository where publishing is switched on.
        """
        self.assertEqual(self.doc["permissions"]["contents"], "write")

    def test_it_triggers_on_the_inputs_the_site_is_built_from(self) -> None:
        """A path filter that misses a build input is a stale snapshot.

        `build.mjs` reads `ventures/` and `platform/pages/`. If it ever grows
        another source directory, this test is the thing that should fail.
        """
        # `on` is truthy-parsed by YAML 1.1 as the boolean True.
        on = self.doc.get("on", self.doc.get(True))
        paths = on["push"]["paths"]
        for required in ("ventures/**", "platform/pages/**"):
            self.assertIn(required, paths)
        self.assertEqual(on["push"]["branches"], ["main"])
        self.assertIn("workflow_dispatch", on)


if __name__ == "__main__":
    unittest.main()
