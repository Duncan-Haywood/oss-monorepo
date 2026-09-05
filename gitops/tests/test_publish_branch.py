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
    mkdir -p "$out/tools/example"
    echo '<!doctype html><title>home</title>' > "$out/index.html"
    echo '<!doctype html><title>tool</title>' > "$out/tools/example/index.html"
    ;;
  check.mjs) echo "stub: looks publishable" ;;
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


def test_names_the_owner_switch_rather_than_flipping_it(sandbox: Path):
    result = run(sandbox)
    # Publishing under the portfolio's public name is the owner's call. The
    # script stages and stops, and has to say so, or the next session reads a
    # written branch as a live site.
    assert "Deploy from a branch" in result.stdout
    assert "not pushed" in result.stdout
