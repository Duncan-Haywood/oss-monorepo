"""`platform/pages/publish-branch.sh` writes a branch GitHub can serve directly.

That branch is the one delivery route in this repository that is downstream of
neither an Actions runner nor the k3s cluster, so it is the route that still
works on a day like 2026-09-04 when both of those were down at once. The
things worth pinning are therefore the ones that would make it *unsafe* to run
rather than the ones that make it pretty:

* it refuses without the typed confirmation, because it force-writes a branch;
* it never touches the working tree, the index, or the checked-out branch, so
  a session can run it mid-task on a dirty tree;
* the commit it writes is an orphan carrying `.nojekyll`, because Pages runs a
  branch through Jekyll otherwise and Jekyll silently drops `_`-prefixed paths;
* it does not push unless asked, so staging an artifact and publishing it stay
  two separate decisions -- the second one is the owner's.

The real `build.mjs` is not exercised here. It takes about ninety seconds and
`platform/pages`'s own 884 tests already cover what it emits; what this file
needs is the shell around it, so `node` is stubbed. That also keeps the test
honest about which half it is testing.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "platform" / "pages" / "publish-branch.sh"

# What the stub `node` writes in place of a built site. Two files and a
# subdirectory is enough to prove the tree was committed recursively.
STUB_BUILD = """#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  build.mjs)
    out=""
    for arg in "$@"; do
      case "$arg" in --out=*) out="${arg#--out=}" ;; esac
    done
    [ -n "$out" ] || { echo "stub: no --out" >&2; exit 1; }
    if [ -n "${STUB_ENV_OUT:-}" ]; then
      printf '%s' "${PAGES_BASE_URL:-}" > "$STUB_ENV_OUT"
    fi
    mkdir -p "$out/tools/example"
    echo '<!doctype html><title>home</title>' > "$out/index.html"
    echo '<!doctype html><title>tool</title>' > "$out/tools/example/index.html"
    ;;
  check.mjs) echo "stub: looks publishable" ;;
  */deploy/build.mjs)
    # The self-deploy page (platform/deploy/), built after check.mjs.
    for arg in "$@"; do
      case "$arg" in --out=*) mkdir -p "${arg#--out=}" ;; esac
    done
    ;;
  */devlog/build.mjs)
    # The development analyses (platform/devlog/), built after check.mjs.
    for arg in "$@"; do
      case "$arg" in --out=*) mkdir -p "${arg#--out=}" ;; esac
    done
    ;;
  */indexnow.mjs)
    echo "stub: indexnow $*"
    exit "${STUB_INDEXNOW_EXIT:-0}"
    ;;
  *) echo "stub: unexpected $1" >&2; exit 1 ;;
esac
"""


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    """A throwaway repository with the real script and a stub `node`."""
    repo = tmp_path / "repo"
    (repo / "platform" / "pages").mkdir(parents=True)
    shutil.copy(SCRIPT, repo / "platform" / "pages" / "publish-branch.sh")
    (repo / "platform" / "pages" / "publish-branch.sh").chmod(0o755)

    _git(repo.parent, "init", "-q", "-b", "main", str(repo))
    _git(repo, "config", "user.email", "test@example.invalid")
    _git(repo, "config", "user.name", "Test")
    (repo / "README.md").write_text("source of truth\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "initial")

    stub_dir = tmp_path / "stub-bin"
    stub_dir.mkdir()
    node = stub_dir / "node"
    node.write_text(STUB_BUILD)
    node.chmod(0o755)
    return repo


def run(repo: Path, *, confirm: str | None = "publish-pages-branch", expect: int = 0, **env_extra: str):
    env = dict(os.environ)
    env["PATH"] = f"{repo.parent / 'stub-bin'}{os.pathsep}{env['PATH']}"
    env.pop("CONFIRM", None)
    if confirm is not None:
        env["CONFIRM"] = confirm
    env.update(env_extra)
    result = subprocess.run(
        ["bash", str(repo / "platform" / "pages" / "publish-branch.sh")],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == expect, f"exit {result.returncode}\n{result.stdout}\n{result.stderr}"
    return result


def test_refuses_without_confirmation(sandbox: Path):
    result = run(sandbox, confirm=None, expect=1)
    assert "CONFIRM=publish-pages-branch" in result.stderr
    # Nothing was written: the guard has to come before the build, or a
    # refusal still costs ninety seconds and a scratch directory.
    assert "gh-pages" not in _git(sandbox, "branch", "--list", "gh-pages")


def test_refuses_a_wrong_confirmation(sandbox: Path):
    run(sandbox, confirm="yes", expect=1)
    assert _git(sandbox, "branch", "--list", "gh-pages") == ""


def test_writes_an_orphan_commit_with_the_built_tree(sandbox: Path):
    run(sandbox)
    assert _git(sandbox, "rev-parse", "--verify", "gh-pages")
    # Orphan: no parents. Each run replaces the snapshot rather than growing a
    # history nobody reads, which keeps the artifact out of every clone.
    assert _git(sandbox, "rev-list", "--count", "gh-pages") == "1"
    listing = _git(sandbox, "ls-tree", "-r", "gh-pages", "--name-only").split("\n")
    assert "index.html" in listing
    assert "tools/example/index.html" in listing


def test_commits_nojekyll(sandbox: Path):
    run(sandbox)
    # Without this GitHub Pages runs the branch through Jekyll, which drops
    # underscore-prefixed paths with no error -- a missing page, not a failure.
    assert ".nojekyll" in _git(sandbox, "ls-tree", "gh-pages", "--name-only")


def test_leaves_the_working_tree_and_branch_alone(sandbox: Path):
    dirty = sandbox / "uncommitted.txt"
    dirty.write_text("work in progress\n")
    before_head = _git(sandbox, "rev-parse", "HEAD")
    before_branch = _git(sandbox, "rev-parse", "--abbrev-ref", "HEAD")

    run(sandbox)

    assert _git(sandbox, "rev-parse", "HEAD") == before_head
    assert _git(sandbox, "rev-parse", "--abbrev-ref", "HEAD") == before_branch
    assert dirty.read_text() == "work in progress\n"
    # The scratch index must not have leaked into the real one: an `add -A`
    # against the build output would otherwise stage a deletion of every
    # source file in the repository.
    assert _git(sandbox, "status", "--porcelain") == "?? uncommitted.txt"


def test_records_the_source_commit_in_the_message(sandbox: Path):
    source = _git(sandbox, "rev-parse", "HEAD")
    run(sandbox)
    message = _git(sandbox, "log", "-1", "--format=%B", "gh-pages")
    # Which revision of `main` a served snapshot came from is the first thing
    # anyone asks when the site looks stale.
    assert source in message


def test_does_not_push_unless_asked(sandbox: Path):
    # No remote is configured, so a push would fail loudly rather than
    # silently succeeding -- the assertion is that the run stays green.
    run(sandbox)
    assert _git(sandbox, "remote") == ""


def test_writes_the_branch_without_publishing_it(sandbox: Path):
    """The script stages and stops; it never enables Pages.

    This used to also assert the closing text said "Deploy from a branch",
    pinning a *fixed* sentence that told every reader the owner still had to
    flip a Settings dropdown. That sentence was true when written and stopped
    being true when Pages became branch-sourced -- so the test was actively
    holding a stale claim in place, and the assertion looked like a safety
    property while doing it. Measured 2026-09-06: GitHub's managed builder
    runs on `gh-pages` and succeeds.

    What is worth pinning is the behaviour that has not changed -- nothing is
    pushed without PUSH=1 -- and that the script does not *assert* a serving
    state it cannot observe. `pages_state.py` owns that reading now, and the
    sandbox has no token, so the script must degrade to saying it does not
    know rather than falling back to the old guess.
    """
    # Token cleared explicitly rather than relying on the sandbox happening to
    # lack one: with a real GH_TOKEN in the ambient environment this test would
    # otherwise exercise the measured path and fail for a reason that has
    # nothing to do with what it is checking.
    result = run(sandbox, GH_TOKEN="", GITHUB_TOKEN="")
    assert "not pushed" in result.stdout
    assert "unknown from here" in result.stdout + result.stderr
    assert "Staged, not served" not in result.stdout


# --- The custom domain ------------------------------------------------------
#
# GitHub stores Settings -> Pages -> Custom domain as a `CNAME` file *on the
# serving branch* and reads it back from there on every deploy. Every run of
# this script force-pushes an orphan tree, so a run that does not carry that
# file forward unsets the domain -- silently, with a green workflow and a
# "pushed" line. These pin the three cases that keeps apart.


def _cname_on_branch(repo: Path) -> str | None:
    listing = _git(repo, "ls-tree", "gh-pages", "--name-only").split("\n")
    if "CNAME" not in listing:
        return None
    return _git(repo, "show", "gh-pages:CNAME").strip()


def test_publishes_no_cname_when_there_is_no_custom_domain(sandbox: Path):
    run(sandbox)
    # A project-Pages site must not carry one: an empty or stray CNAME fails
    # the site over to a domain that does not resolve.
    assert _cname_on_branch(sandbox) is None


def test_writes_the_custom_domain_when_asked(sandbox: Path):
    run(sandbox, PAGES_CNAME="marisstella.dev")
    assert _cname_on_branch(sandbox) == "marisstella.dev"


def test_carries_an_existing_custom_domain_forward(sandbox: Path):
    """The regression this file exists for.

    A second run is the *automated* case -- `publish-pages-branch.yml` on every
    merge to `main` -- so this dropping the file would unset the owner's domain
    minutes after they set it, repeatedly, with nothing turning red.
    """
    run(sandbox, PAGES_CNAME="marisstella.dev")
    run(sandbox)  # no PAGES_CNAME: the branch is the source of truth
    assert _cname_on_branch(sandbox) == "marisstella.dev"


def test_an_empty_pages_cname_removes_the_domain(sandbox: Path):
    # Removing has to be something you type. `unset` means carry forward, so
    # the empty string is the only way out -- which is what stops a removal
    # from ever being an omission.
    run(sandbox, PAGES_CNAME="marisstella.dev")
    run(sandbox, PAGES_CNAME="")
    assert _cname_on_branch(sandbox) is None


def test_the_custom_domain_sets_the_base_url(sandbox: Path):
    """Canonicals, `sitemap.xml` and the feed are absolute.

    Built against the project Pages URL and served from the custom domain,
    every page tells a crawler the real address is a different origin -- the
    site de-indexes itself in favour of a URL that may serve nothing.
    """
    log = sandbox.parent / "base-url.txt"
    run(sandbox, PAGES_CNAME="marisstella.dev", STUB_ENV_OUT=str(log))
    assert log.read_text() == "https://marisstella.dev/"


def test_an_explicit_base_url_still_wins(sandbox: Path):
    log = sandbox.parent / "base-url.txt"
    run(
        sandbox,
        PAGES_CNAME="marisstella.dev",
        PAGES_BASE_URL="https://staging.example.com/",
        STUB_ENV_OUT=str(log),
    )
    assert log.read_text() == "https://staging.example.com/"


def test_no_custom_domain_leaves_the_base_url_to_build_mjs(sandbox: Path):
    log = sandbox.parent / "base-url.txt"
    run(sandbox, STUB_ENV_OUT=str(log))
    # Empty, not the github.io URL: the default belongs to `build.mjs`'s
    # DEFAULT_BASE_URL, and restating it here would be a second copy to drift.
    assert log.read_text() == ""


def test_refuses_a_cname_that_is_not_a_bare_hostname(sandbox: Path):
    # A CNAME GitHub cannot parse is worse than none -- it fails the domain
    # over with no error, which is the failure mode this whole area has.
    for bad in ("https://marisstella.dev/", "marisstella.dev/tools", "localhost"):
        result = run(sandbox, PAGES_CNAME=bad, expect=1)
        assert "custom domain" in result.stderr, bad
        assert _git(sandbox, "branch", "--list", "gh-pages") == "", bad


# --- Notifying IndexNow on an actual publish --------------------------------
#
# `.github/workflows/publish-pages-branch.yml` already does this after its own
# push, but only when a runner picks the workflow up -- and this script is the
# route sessions use precisely when runners are starved, which has been the
# only kind of publish landing for days at a time. These pin that the step
# only fires on a real push (never on a staged-but-unpushed build) and that a
# failed or unreachable submission never turns a successful publish into a
# script failure -- the site is already live once the force-push above
# returns.


@pytest.fixture
def sandbox_with_remote(sandbox: Path, tmp_path: Path) -> Path:
    """The `sandbox` fixture plus a real `origin` a PUSH=1 run can reach.

    `publish-branch.sh` fetches `origin/main` before pushing, to refuse
    publishing a commit that is not reachable from it -- so `PUSH=1` needs a
    remote that actually has `main`, not just an `origin` name.
    """
    bare = tmp_path / "origin.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True)
    _git(sandbox, "remote", "add", "origin", str(bare))
    _git(sandbox, "push", "-q", "origin", "HEAD:main")
    return sandbox


def test_a_staged_but_unpushed_build_never_touches_indexnow(sandbox: Path):
    result = run(sandbox)
    assert "indexnow" not in (result.stdout + result.stderr).lower()


def test_a_real_push_notifies_indexnow(sandbox_with_remote: Path):
    result = run(sandbox_with_remote, PUSH="1")
    assert "Notifying IndexNow" in result.stdout
    assert "IndexNow notified" in result.stdout
    # The branch just written, not a stale checkout -- `--ref gh-pages` reads
    # back what this same run committed and pushed.
    assert "--ref gh-pages" in result.stdout


def test_a_failed_indexnow_submission_does_not_fail_the_publish(sandbox_with_remote: Path):
    # The push already succeeded by the time this step runs; a network hiccup
    # notifying search engines must not read as "the publish failed" -- that
    # would send a session chasing a site that is, in fact, already live.
    result = run(sandbox_with_remote, PUSH="1", STUB_INDEXNOW_EXIT="1")
    assert result.returncode == 0
    assert "did not go through -- not fatal" in result.stdout
    # And the push itself is still reported as having happened.
    assert "pushed" in result.stdout
