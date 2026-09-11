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
        self.assertTrue(
            "--is-shallow-repository" in script and "fetch --quiet --unshallow" in script,
            "the checkout `publish-pages-branch.yml` hands this script is "
            "shallow (actions/checkout's default fetch-depth is 1), so "
            "$published_from's ancestry is not present until this unshallows "
            "-- without it, cat-file/merge-base below can only ever fail to "
            "find what they are looking for, and the guard is silently inert",
        )

    def test_the_guard_still_fires_from_a_shallow_checkout(self) -> None:
        """The gap the unshallow step above exists to close, measured directly.

        `test_git_and_the_message_really_identify_a_backwards_publish` proves
        the two primitives work in a repo that already has full history. That
        is not what `publish-pages-branch.yml` hands this script:
        `actions/checkout@v4` with no `fetch-depth` override fetches exactly
        one commit -- the run's own trigger SHA -- and nothing else. This
        reproduces that shape (a fresh repo whose only object is the trigger
        commit, fetched by exact SHA the way `actions/checkout` does it, not
        by cloning a branch tip) and shows `cat-file -e $published_from`
        fails on it before the fix's unshallow step, and that unshallowing
        first -- exactly what the script now does -- makes both primitives
        work as `test_git_and_the_message_really_identify_a_backwards_publish`
        already showed they do given full history.
        """
        import subprocess
        import tempfile

        def git(repo, *args, check=True):
            return subprocess.run(
                ["git", "-C", str(repo), *args],
                capture_output=True, text=True, check=check,
            )

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            remote = tmp_path / "remote.git"
            work = tmp_path / "work"
            git(tmp_path, "init", "-q", "--bare", str(remote))
            git(tmp_path, "clone", "-q", str(remote), str(work))
            git(work, "config", "user.email", "t@example.invalid")
            git(work, "config", "user.name", "t")
            (work / "f").write_text("1")
            git(work, "add", "f")
            git(work, "commit", "-q", "-m", "older main")
            older = git(work, "rev-parse", "HEAD").stdout.strip()
            (work / "f").write_text("2")
            git(work, "add", "f")
            git(work, "commit", "-q", "-m", "newer main")
            newer = git(work, "rev-parse", "HEAD").stdout.strip()
            git(work, "push", "-q", "origin", "HEAD:main")

            # A fresh, empty repo that fetches only `older` at depth 1 by its
            # exact SHA -- what actions/checkout does for a workflow triggered
            # on an earlier push that has not yet finished by the time a
            # later push's run publishes `newer` (the 2026-09-06 race).
            ci = tmp_path / "ci"
            ci.mkdir()
            git(ci, "init", "-q")
            git(ci, "remote", "add", "origin", f"file://{remote}")
            git(ci, "fetch", "-q", "--depth=1", "origin", older)
            git(ci, "checkout", "-q", "FETCH_HEAD")
            self.assertEqual(git(ci, "rev-parse", "HEAD").stdout.strip(), older)
            self.assertEqual(
                git(ci, "rev-parse", "--is-shallow-repository").stdout.strip(), "true",
            )

            # Before unshallowing: `newer` (what $published_from would read
            # from the live branch's commit message) is not an object this
            # checkout has ever fetched, so cat-file cannot find it -- the bug.
            before = git(ci, "cat-file", "-e", f"{newer}^{{commit}}", check=False)
            self.assertNotEqual(
                before.returncode, 0,
                "a depth-1 checkout of `older` must not already have `newer` "
                "-- if it does, this fixture no longer reproduces the gap",
            )

            # The fix: unshallow when shallow, then the same two primitives
            # the guard runs.
            git(ci, "fetch", "--quiet", "--unshallow", "origin")
            after = git(ci, "cat-file", "-e", f"{newer}^{{commit}}", check=False)
            self.assertEqual(
                after.returncode, 0,
                "unshallowing must make $published_from's object reachable",
            )
            backwards = git(ci, "merge-base", "--is-ancestor", older, newer, check=False)
            self.assertEqual(
                backwards.returncode, 0,
                "with full history restored, the ordinary ancestry check "
                "must correctly classify `older` as behind `newer`",
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


class RefusesToPublishAnUnmergedSource(unittest.TestCase):
    """The live site must be traceable to a reviewed commit on `main`.

    `publish-branch.sh` publishes whatever HEAD is, and every guard that
    existed before this one asked *which* main commit was being published --
    never whether it was a main commit at all. A session sitting on its own
    feature branch, which is the ordinary state of a session here, therefore
    shipped unreviewed work to the live catalogue by running the same command
    the docs give for a routine refresh, and nothing turned red.

    Measured 2026-09-07: `gh-pages` was serving a snapshot whose recorded
    source commit `077c0998` existed nowhere in the repository -- not on
    `main`, not on any branch, not as any object. That is what a publish from
    a branch looks like once the branch is squash-merged (this repo squash-
    merges, so the original sha is gone) or deleted. Two costs, and the second
    is the one that hid the first: the live site cannot be traced back to
    anything reviewable, and the backwards guard *fails open* on it, because
    `cat-file -e` cannot resolve a commit that no longer exists and the whole
    `&&` chain short-circuits into the push it exists to stop.
    """

    def test_the_push_is_gated_on_head_being_on_main(self) -> None:
        script = (ROOT / "platform" / "pages" / "publish-branch.sh").read_text()
        self.assertTrue(
            'merge-base --is-ancestor "$source_sha" "$main_tip"' in script,
            "the publish must refuse when HEAD is not contained in origin/main",
        )
        self.assertTrue(
            "refusing to publish a commit that is not on origin/main" in script,
            "the refusal must say what it is refusing, not just exit",
        )
        self.assertTrue(
            "ALLOW_UNMERGED_SOURCE:-" in script,
            "a deliberate publish of unmerged work must stay possible without "
            "editing the script",
        )

    def test_the_gate_is_inside_the_push_branch_only(self) -> None:
        """Building a branch to look at it must stay unguarded.

        Previewing a change is the normal way to check it, and only the push
        reaches users -- a guard that also blocked `PUSH` unset would push
        sessions toward publishing in order to see their own work.
        """
        script = (ROOT / "platform" / "pages" / "publish-branch.sh").read_text()
        push_block = script.split("if [ \"${PUSH:-}\" = '1' ]; then", 1)
        self.assertEqual(len(push_block), 2, "the PUSH gate's shape has changed")
        self.assertNotIn(
            "refusing to publish a commit that is not on origin/main", push_block[0],
            "the unmerged-source guard must sit inside the PUSH branch, so a "
            "preview build never trips it",
        )

    def test_an_unresolvable_published_commit_is_reported_not_swallowed(self) -> None:
        """The other half: "cannot tell" must not be silent.

        With the gate above in place this repairs itself -- publishing from
        `main` is the fix for a branch serving an untraceable snapshot, so the
        script proceeds rather than blocking the repair. What it must not do
        is proceed *silently*, which is how the original went unnoticed.
        """
        script = (ROOT / "platform" / "pages" / "publish-branch.sh").read_text()
        self.assertTrue(
            "not a commit in this repository" in script,
            "an unresolvable $published_from must be reported to the operator",
        )
        self.assertTrue(
            '! git -C "$repo_root" cat-file -e "${published_from}^{commit}"' in script,
            "the report must be driven by the same resolution the backwards "
            "guard uses, so the two cannot disagree about what is resolvable",
        )

    def test_git_really_classifies_a_branch_head_as_not_on_main(self) -> None:
        """The primitive, against real git rather than a substring.

        Reproduces the measured shape: a commit on a feature branch, then the
        same work squash-merged to `main` so the branch's own sha is no longer
        an ancestor of anything on `main` -- which is what makes the published
        sha untraceable afterwards.
        """
        import subprocess
        import tempfile

        def git(repo, *args, check=True):
            return subprocess.run(
                ["git", "-C", str(repo), *args],
                capture_output=True, text=True, check=check,
            )

        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()
            git(repo, "init", "-q")
            git(repo, "config", "user.email", "t@example.invalid")
            git(repo, "config", "user.name", "t")
            (repo / "f").write_text("base")
            git(repo, "add", "f")
            git(repo, "commit", "-q", "-m", "base")
            base = git(repo, "rev-parse", "HEAD").stdout.strip()
            # `git init` names the first branch from the user's own
            # `init.defaultBranch`, which is `master` on some machines and
            # `main` on others -- read it rather than assuming either.
            default_branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()

            git(repo, "checkout", "-q", "-b", "feature")
            (repo / "f").write_text("feature work")
            git(repo, "add", "f")
            git(repo, "commit", "-q", "-m", "feature work")
            branch_head = git(repo, "rev-parse", "HEAD").stdout.strip()

            # Squash-merge, the way this repository lands every PR: `main`
            # gains the content under a brand-new sha and the branch's own
            # commit is not in its ancestry.
            git(repo, "checkout", "-q", default_branch)
            git(repo, "merge", "-q", "--squash", "feature")
            git(repo, "commit", "-q", "-m", "feature work (#1)")
            main_tip = git(repo, "rev-parse", "HEAD").stdout.strip()

            self.assertNotEqual(branch_head, main_tip)
            on_main = git(
                repo, "merge-base", "--is-ancestor", branch_head, main_tip, check=False
            )
            self.assertNotEqual(
                on_main.returncode, 0,
                "a squash-merged branch head must read as not-on-main -- if it "
                "did not, the guard would let the measured case through",
            )
            merged = git(
                repo, "merge-base", "--is-ancestor", base, main_tip, check=False
            )
            self.assertEqual(
                merged.returncode, 0,
                "an ordinary main commit must still publish without tripping "
                "the guard",
            )


class AnnouncingThePublishedSnapshot(unittest.TestCase):
    """`publish-branch.sh` announces to IndexNow; the workflow no longer does.

    The announcement used to live only in this workflow's own `Notify IndexNow`
    step. That step needs an Actions runner, runners have been starved since
    2026-09-04, and so every publish that actually reached the live site in
    that window was a by-hand `publish-branch.sh` run -- which had no such
    step and announced nothing, silently. `platform/marketing/README.md`
    covered the gap in prose ("Run it after any publish-branch.sh that
    actually pushes"), which is the mitigation this repository has three times
    recorded as insufficient.

    It matters on this origin specifically: `pages_state.py`'s `indexing` row
    measured that sitemap auto-discovery cannot happen from a project-Pages
    subpath, so IndexNow is the only page-enumeration route the catalogue has.

    These cases pin the three ways that fix could quietly come undone.
    """

    SHELL = ROOT / "platform" / "pages" / "publish-branch.sh"
    FUNCTION = "announce_to_indexnow"

    def setUp(self) -> None:
        self.assertTrue(self.SHELL.is_file(), f"{self.SHELL} is missing")
        self.source = self.SHELL.read_text()

    def _function_body(self) -> str:
        """The function's own text, so it can be run without the whole script.

        Extracted rather than sourced because the script is top-to-bottom under
        `set -euo pipefail` and would try to publish. If the function is
        renamed this returns nothing and every case below fails by name, which
        is the intended way for a rename to surface.
        """
        start = self.source.find(f"{self.FUNCTION}() {{")
        self.assertNotEqual(
            start, -1, f"{self.FUNCTION} is not defined in {self.SHELL.name}"
        )
        end = self.source.find("\n}\n", start)
        self.assertNotEqual(end, -1, f"{self.FUNCTION} has no closing brace")
        return self.source[start : end + 3]

    def _run_function(self, node_exit: int, env: dict | None = None):
        """Run the function alone, with a stub `node` that exits how we choose."""
        import subprocess
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            stub = bin_dir / "node"
            stub.write_text(f"#!/bin/sh\nexit {node_exit}\n")
            stub.chmod(0o755)

            harness = (
                "set -euo pipefail\n"
                'say() { printf "%s\\n" "$*"; }\n'
                f'repo_root="{tmp_path}"\n'
                # The two globals the real script sets before this point.
                # `BRANCH` in particular is load-bearing: the announcement
                # passes `--ref "$BRANCH"`, so a non-default serving branch is
                # announced from its own ref rather than from `gh-pages`.
                'BRANCH="${BRANCH:-gh-pages}"\n'
                f"{self._function_body()}\n"
                # `|| echo` rather than a bare call: under `set -e` a non-zero
                # return would end the harness, and "did it return 0?" is
                # precisely what the deploy-must-not-fail case asserts.
                f"{self.FUNCTION} || echo RETURNED_NONZERO\n"
            )
            run_env = {
                "PATH": f"{bin_dir}:/usr/bin:/bin",
                **(env or {}),
            }
            return subprocess.run(
                ["bash", "-c", harness],
                capture_output=True,
                text=True,
                env=run_env,
            )

    def test_the_push_branch_announces_the_snapshot(self) -> None:
        """The call sits on the pushed path, and only there."""
        self.assertIn(
            self.FUNCTION + "\n",
            self.source,
            f"{self.SHELL.name} defines {self.FUNCTION} but never calls it",
        )
        pushed = self.source.find('say "pushed"')
        not_pushed = self.source.find("not pushed (set PUSH=1 to push)")
        self.assertNotEqual(pushed, -1)
        self.assertNotEqual(not_pushed, -1)
        call = self.source.find(f"  {self.FUNCTION}\n", pushed)
        self.assertNotEqual(call, -1, "the announcement is not on the pushed path")
        self.assertLess(
            call,
            not_pushed,
            "the announcement must sit inside the PUSH=1 branch -- announcing a "
            "snapshot that was built and verified but never pushed tells the "
            "engines about content that is not live",
        )

    def test_the_workflow_announces_when_the_script_cannot(self) -> None:
        """Exactly one announce path is reachable per configuration.

        Corrected 2026-09-11. This case used to assert the workflow never
        submits directly, on the reasoning that both of its steps go through
        `publish-branch.sh` and a second copy would double-submit. The
        de-duplication was right; the coverage claim inside it was not, and the
        difference is the whole finding.

        Folding the announcement into the script's PUSH=1 branch made it
        reachable only on a run that *pushes*, and on this repository's real
        configuration no such run exists. `vars.PAGES_BRANCH_PUBLISH` is not
        `true` -- read from evidence, since a workflow cannot print a variable:
        every commit on `gh-pages` is authored `CI <ci@example.com>`, an agent
        session's identity, and none by `github-actions[bot]`. So the runner
        route resolves to the PUSH=0 step and never reaches the announcement,
        while the by-hand route that does reach it runs in a sandbox whose
        egress proxy 403s `api.indexnow.org` and exits `EXIT_NO_EGRESS` every
        time.

        Between them those two routes covered every publish and announced none
        of them: the route with egress never reached the call, and the route
        that reached the call had no egress. Verified against run history --
        every `Publish Pages branch` run since IndexNow landed in #4366 came
        back `runner_id: 0` in 3-5s.

        So the invariant is not "the workflow never submits". It is that the
        two paths are exact complements: never both (a double-submit), and
        never neither (a silently unannounced catalogue, which is what was
        actually shipping).
        """
        doc = load()
        steps = doc["jobs"]["publish"]["steps"]

        direct = [
            s
            for s in steps
            if "indexnow" in str(s.get("run", "")) and "--submit" in str(s.get("run", ""))
        ]
        self.assertEqual(
            len(direct),
            1,
            "expected exactly one step that submits to IndexNow directly; the "
            "script's own announce covers only the PUSH=1 path, which this "
            "repository's configuration never takes",
        )

        pushing = [
            s
            for s in steps
            if SCRIPT in str(s.get("run", ""))
            and str(s.get("env", {}).get("PUSH", "")).strip() == "1"
        ]
        self.assertEqual(len(pushing), 1, f"expected one {SCRIPT} step with PUSH=1")

        push_gate = _norm(pushing[0].get("if"))
        announce_gate = _norm(direct[0].get("if"))
        self.assertIsNotNone(
            announce_gate,
            "an ungated announce would double-submit whenever the script also "
            "announces -- it must be the complement of the publish gate",
        )

        # The complement, spelled as the negation of the same comparison rather
        # than merely "some other condition": anything looser reopens one of
        # the two failures above.
        self.assertEqual(
            push_gate,
            "vars.PAGES_BRANCH_PUBLISH == 'true'",
            "the publish gate moved; the announce complement below is written "
            "against this exact expression",
        )
        self.assertEqual(
            announce_gate,
            "vars.PAGES_BRANCH_PUBLISH != 'true'",
            "the direct announce must run exactly when the script's own "
            "announce cannot, so that precisely one of them fires",
        )

    def test_the_direct_announce_reads_the_live_snapshot(self) -> None:
        """It announces what is served, not what this run happened to build.

        On the path that reaches it the run did *not* push, so "what this run
        built" is not live and must not be announced. `gh-pages` is the serving
        branch, and both `indexnow.mjs --ref` and `published-base-url.mjs` read
        it as a *local* git ref (`git show gh-pages:...`) -- which
        `actions/checkout` does not provide, since it fetches only the pushed
        ref. Without the fetch the origin degrades to `assumed-default`, which
        `publishedBaseUrl` itself flags as "NOT a reading".
        """
        doc = load()
        step = next(
            s
            for s in doc["jobs"]["publish"]["steps"]
            if "indexnow" in str(s.get("run", "")) and "--submit" in str(s.get("run", ""))
        )
        run = str(step["run"])
        self.assertIn(
            "--ref gh-pages",
            run,
            "the direct announce must name the serving branch explicitly",
        )
        self.assertIn(
            "gh-pages:gh-pages",
            run,
            "the serving branch must be fetched as a local ref, or both the "
            "catalog read and the origin reading fall back to a guess",
        )

    def test_the_direct_announce_tolerates_no_egress_but_not_a_refusal(self) -> None:
        """The same distinction the script makes, for the same reason.

        `EXIT_NO_EGRESS` means the request never left the runner: nothing was
        submitted and nothing broke, so it must not fail a merge. Any other
        non-zero status means IndexNow saw the request and refused it -- an
        invalid or unpublished key file, which would silently cost every future
        submission and so must stay loud.
        """
        doc = load()
        step = next(
            s
            for s in doc["jobs"]["publish"]["steps"]
            if "indexnow" in str(s.get("run", "")) and "--submit" in str(s.get("run", ""))
        )
        run = str(step["run"])
        self.assertIn(
            "EXIT_NO_EGRESS",
            run,
            "the no-egress exit code must be handled by name, not by a bare "
            "`|| true` that would swallow a genuine refusal too",
        )
        self.assertRegex(
            run,
            r"exit\s+\"?\$\{?status",
            "a genuine refusal must propagate rather than be reported and "
            "passed over",
        )

    def test_a_host_without_egress_does_not_fail_the_publish(self) -> None:
        """Exit 3 (EXIT_NO_EGRESS) reports; it never fails a live deploy."""
        result = self._run_function(node_exit=3)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("RETURNED_NONZERO", result.stdout)
        combined = result.stdout + result.stderr
        self.assertIn("no egress", combined)
        self.assertIn(
            "the site is already published",
            combined,
            "a reader must not mistake a missed notification for a failed deploy",
        )

    def test_a_no_egress_result_is_distinguishable_from_a_real_rejection(self) -> None:
        """The two failures must not read alike.

        `gitops/tests/test_publish_branch.py` pins the shared "did not go
        through -- not fatal" wording, and both branches carry it. What must
        differ is *why*: exit 3 means the request never left the machine (the
        expected outcome from an agent sandbox), and any other exit means
        IndexNow saw the request and refused it -- a real defect in the payload
        or the published key file. Reporting them identically is what teaches a
        reader to ignore the line.
        """
        no_egress = self._run_function(node_exit=3).stdout
        rejected = self._run_function(node_exit=1).stdout
        self.assertIn("no egress", no_egress)
        self.assertNotIn("no egress", rejected)

    def test_any_other_failure_is_reported_and_still_does_not_fail(self) -> None:
        result = self._run_function(node_exit=1)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("RETURNED_NONZERO", result.stdout)
        self.assertIn("did not go through", result.stdout + result.stderr)

    def test_a_successful_submission_says_so(self) -> None:
        result = self._run_function(node_exit=0)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("IndexNow notified", result.stdout)

    def test_it_can_be_switched_off_without_editing_the_script(self) -> None:
        """INDEXNOW=0, for a rollback you deliberately do not announce."""
        result = self._run_function(node_exit=0, env={"INDEXNOW": "0"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("skipped (INDEXNOW=0)", result.stdout)


if __name__ == "__main__":
    unittest.main()
