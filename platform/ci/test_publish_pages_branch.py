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


class FetchesARewrittenServingBranch(unittest.TestCase):
    """The publisher must be able to re-read a branch it rewrote itself.

    `publish-branch.sh` reads the serving branch before publishing, so a custom
    domain set in Settings -> Pages is carried forward rather than silently
    dropped. It fetches that branch first, and refuses to publish when the fetch
    fails.

    The catch is that every publish writes `gh-pages` as a fresh *orphan*
    commit, so the remote ref is never a fast-forward of whatever a previous
    fetch left in `refs/remotes/origin/gh-pages`. An unforced refspec is
    rejected as non-fast-forward, the guard reads that as "cannot read the
    branch", and publishing stops -- which happened on 2026-09-06 and blocked
    the deploy until the tracking ref was force-updated by hand.

    CI never saw it, and that is the reason this test exists: `actions/checkout`
    fetches one branch, so no tracking ref is present there and the plain fetch
    always succeeds. It fails only in a long-lived clone, which is where every
    by-hand publish happens -- and the by-hand publish is the *only* route to
    the live site while Actions runners are starved.
    """

    def test_the_serving_branch_refspec_is_forced(self) -> None:
        script = (ROOT / "platform" / "pages" / "publish-branch.sh").read_text()
        # assertTrue rather than assertIn: the latter prints the whole script on
        # failure, which buries the one line that matters.
        self.assertTrue(
            '"+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"' in script,
            "the serving-branch fetch must be forced; an orphan republish is "
            "never a fast-forward",
        )
        self.assertFalse(
            'origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"' in script,
            "found the unforced refspec, which is rejected on the second "
            "publish from any clone that has fetched the branch once",
        )

    def test_git_really_rejects_the_unforced_refspec(self) -> None:
        """The premise above, measured rather than asserted.

        Without this, the test above pins a string whose reason nobody can
        check. This builds the exact situation -- a branch replaced by an
        unrelated orphan commit, and a stale tracking ref -- and shows the plain
        refspec failing and the forced one succeeding.
        """
        import subprocess
        import tempfile

        def git(repo, *args, check=True):
            return subprocess.run(
                ["git", "-C", str(repo), *args],
                capture_output=True, text=True, check=check,
            )

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            remote, clone = tmp / "remote", tmp / "clone"
            remote.mkdir()
            git(remote, "init", "-q", "-b", "main")
            git(remote, "config", "user.email", "t@example.invalid")
            git(remote, "config", "user.name", "t")
            (remote / "f").write_text("1")
            git(remote, "add", "f")
            git(remote, "commit", "-q", "-m", "one")
            # The serving branch, as an orphan -- the shape publish-branch.sh writes.
            git(remote, "checkout", "-q", "--orphan", "gh-pages")
            (remote / "index.html").write_text("v1")
            git(remote, "add", "index.html")
            git(remote, "commit", "-q", "-m", "publish 1")
            git(remote, "checkout", "-q", "main")

            subprocess.run(
                ["git", "clone", "-q", str(remote), str(clone)],
                capture_output=True, text=True, check=True,
            )
            git(clone, "fetch", "-q", "origin",
                "refs/heads/gh-pages:refs/remotes/origin/gh-pages")

            # Republish: a second orphan, unrelated to the first.
            git(remote, "checkout", "-q", "--orphan", "gh-pages-2")
            (remote / "index.html").write_text("v2")
            git(remote, "add", "index.html")
            git(remote, "commit", "-q", "-m", "publish 2")
            git(remote, "branch", "-q", "-D", "gh-pages")
            git(remote, "branch", "-q", "-m", "gh-pages")
            git(remote, "checkout", "-q", "main")

            plain = git(clone, "fetch", "-q", "origin",
                        "refs/heads/gh-pages:refs/remotes/origin/gh-pages",
                        check=False)
            self.assertNotEqual(
                plain.returncode, 0,
                "expected the unforced refspec to be rejected as "
                "non-fast-forward -- if this ever passes, the bug this guards "
                "against has changed shape",
            )
            forced = git(clone, "fetch", "-q", "origin",
                         "+refs/heads/gh-pages:refs/remotes/origin/gh-pages",
                         check=False)
            self.assertEqual(
                forced.returncode, 0,
                f"the forced refspec must succeed; got: {forced.stderr}",
            )


class RefusesToPublishBackwards(unittest.TestCase):
    """A concurrent publish must not silently revert the live site.

    Every run of `publish-branch.sh` force-pushes a fresh orphan commit, and
    that was read as safe because the branch holds no authored work. It does
    not lose authored work. It does lose *shipped product*: the branch is the
    live site, so a force-push built from an older `main` than the one already
    published takes whatever landed in between off the site, and nothing turns
    red. `pages_state.py` afterwards reports `stale`, which reads as "nobody
    has published yet" rather than "somebody undid a publish" -- the two are
    indistinguishable from the report alone.

    Measured 2026-09-06, and noticed only because the session that lost the
    push happened to re-read the branch a minute later. Two sessions
    overlapped: one published `433a68bf` (a merge that had just landed), and a
    concurrent session still holding `14494ea1` published a second later,
    taking the newly shipped venture off the live site. `session_gate.py`
    reports up to four distinct sessions inside a 15-minute window in this
    repository, so the overlap is the ordinary case and not a freak race.
    """

    def test_the_push_is_gated_on_the_remote_not_being_ahead(self) -> None:
        script = (ROOT / "platform" / "pages" / "publish-branch.sh").read_text()
        # assertTrue rather than assertIn, as above: assertIn prints the whole
        # script and buries the line that matters.
        self.assertTrue(
            'merge-base --is-ancestor "$source_sha" "$published_from"' in script,
            "the publish must refuse when the branch already serves a snapshot "
            "built from a commit that has ours as an ancestor",
        )
        self.assertTrue(
            "refusing to publish backwards" in script,
            "the refusal must say what it is refusing, not just exit",
        )
        self.assertTrue(
            'ALLOW_REGRESSION:-' in script,
            "a deliberate rollback must stay possible without editing the script",
        )
        self.assertTrue(
            "Publish site built from" in script,
            "the guard reads the source commit out of the remote tip's own "
            "message, which is the same string the publish writes",
        )

    def test_git_and_the_message_really_identify_a_backwards_publish(self) -> None:
        """The premise above, measured rather than asserted.

        Builds the exact 2026-09-06 situation -- a serving branch published
        from a newer commit than the one a second session is holding -- and
        shows that the two primitives the guard uses (read the sha out of the
        commit message, then `merge-base --is-ancestor`) classify it, and do
        not fire on the ordinary forward publish.
        """
        import re
        import subprocess
        import tempfile

        def git(repo, *args, check=True):
            return subprocess.run(
                ["git", "-C", str(repo), *args],
                capture_output=True, text=True, check=check,
            )

        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            git(repo, "init", "-q", "-b", "main")
            git(repo, "config", "user.email", "t@example.invalid")
            git(repo, "config", "user.name", "t")
            (repo / "f").write_text("1")
            git(repo, "add", "f")
            git(repo, "commit", "-q", "-m", "older main")
            older = git(repo, "rev-parse", "HEAD").stdout.strip()
            (repo / "f").write_text("2")
            git(repo, "add", "f")
            git(repo, "commit", "-q", "-m", "newer main")
            newer = git(repo, "rev-parse", "HEAD").stdout.strip()

            # The serving branch, as the publish writes it: an orphan commit
            # whose message names the commit the site was built from.
            git(repo, "checkout", "-q", "--orphan", "gh-pages")
            (repo / "index.html").write_text("v1")
            git(repo, "add", "index.html")
            git(repo, "commit", "-q", "-m", f"Publish site built from {newer}\n\nGenerated by publish-branch.sh.")
            tip = git(repo, "rev-parse", "HEAD").stdout.strip()
            git(repo, "checkout", "-q", "main")

            message = git(repo, "show", "-s", "--format=%B", tip).stdout
            found = re.search(r"^Publish site built from ([0-9a-f]{7,40})", message, re.M)
            self.assertIsNotNone(found, "the source sha must be readable back out of the message")
            published_from = found.group(1)
            self.assertEqual(published_from, newer)

            backwards = git(
                repo, "merge-base", "--is-ancestor", older, published_from, check=False
            )
            self.assertEqual(
                backwards.returncode, 0,
                "publishing `older` over a branch built from `newer` must be "
                "detected as backwards",
            )
            forward = git(
                repo, "merge-base", "--is-ancestor", newer, older, check=False
            )
            self.assertNotEqual(
                forward.returncode, 0,
                "an ordinary forward publish must not trip the guard",
            )


if __name__ == "__main__":
    unittest.main()
