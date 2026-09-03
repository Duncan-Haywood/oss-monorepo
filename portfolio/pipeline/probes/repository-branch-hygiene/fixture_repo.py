"""Builds a synthetic git repository exercising the scenarios PR #829's real
sweep found: merged, closed-unmerged, reopened, moved-tip, shared-ref, fork,
and protected-branch refs. Every commit uses a fixed author/date so the
resulting SHAs -- and therefore the whole fixture -- are reproducible.

Nothing here touches this repository or the network. `build()` returns the
path to a fresh temporary repo plus an oracle describing the expected
classification of each ref, so tests can assert the scanner's output
against ground truth rather than against itself.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

_ENV_BASE = {
    "GIT_AUTHOR_NAME": "fixture",
    "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
    "GIT_COMMITTER_NAME": "fixture",
    "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
}


@dataclass(frozen=True)
class Fixture:
    repo: Path
    protected: set[str]
    recorded_tips: dict[str, str]
    expected: dict[str, str]
    fork_remote_dir: Path


def _run(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    full_env = dict(_ENV_BASE)
    if env:
        full_env.update(env)
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        env={**_inherited_path(), **full_env},
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout.strip()


def _inherited_path() -> dict[str, str]:
    import os

    return {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}


def _commit(repo: Path, message: str, filename: str, content: str, date: str) -> str:
    (repo / filename).write_text(content, encoding="utf-8")
    _run(repo, "add", filename)
    _run(
        repo,
        "commit",
        "-m",
        message,
        env={"GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date},
    )
    return _run(repo, "rev-parse", "HEAD")


def build(base_dir: Path | None = None) -> Fixture:
    root = Path(base_dir) if base_dir else Path(tempfile.mkdtemp(prefix="branch-hygiene-fixture-"))
    repo = root / "repo"
    repo.mkdir(parents=True)
    _run(repo, "init", "-q", "-b", "main")
    _run(repo, "config", "commit.gpgsign", "false")

    main_c1 = _commit(repo, "initial", "README.md", "hello\n", "2024-01-01T00:00:00")
    _commit(repo, "second", "README.md", "hello world\n", "2024-01-02T00:00:00")

    _run(repo, "branch", "develop")
    develop_tip = _commit(repo, "develop work", "develop.txt", "wip\n", "2024-01-03T00:00:00")
    _run(repo, "checkout", "main")

    _run(repo, "branch", "merged-feature")
    _run(repo, "checkout", "merged-feature")
    _commit(repo, "feature commit 1", "feature.txt", "a\n", "2024-01-04T00:00:00")
    feature_tip = _commit(repo, "feature commit 2", "feature.txt", "a\nb\n", "2024-01-05T00:00:00")
    _run(repo, "checkout", "main")
    _run(repo, "merge", "--no-ff", "-m", "merge feature", "merged-feature",
         env={"GIT_AUTHOR_DATE": "2024-01-06T00:00:00", "GIT_COMMITTER_DATE": "2024-01-06T00:00:00"})

    _run(repo, "branch", "closed-unmerged", "main")
    _run(repo, "checkout", "closed-unmerged")
    closed_tip = _commit(repo, "abandoned work", "abandoned.txt", "orphan\n", "2024-01-07T00:00:00")
    _run(repo, "checkout", "main")

    _run(repo, "branch", "reopened-branch", "main")
    _run(repo, "checkout", "reopened-branch")
    reopened_first = _commit(repo, "reopened work v1", "reopened.txt", "v1\n", "2024-01-08T00:00:00")
    reopened_tip = _commit(repo, "reopened work v2, after close", "reopened.txt", "v1\nv2\n", "2024-01-09T00:00:00")
    _run(repo, "checkout", "main")

    _run(repo, "branch", "shared-primary", "main")
    _run(repo, "checkout", "shared-primary")
    shared_sha = _commit(repo, "shared work, pushed under two names", "shared.txt", "s\n", "2024-01-06T12:00:00")
    _run(repo, "checkout", "main")
    _run(repo, "branch", "shared-alias", "shared-primary")

    _run(repo, "branch", "uncertain-ghost", "main")
    _run(repo, "checkout", "uncertain-ghost")
    _commit(repo, "ghost work", "ghost.txt", "boo\n", "2024-01-10T00:00:00")
    _run(repo, "checkout", "main")

    fork_remote_dir = root / "fork-remote"
    fork_remote_dir.mkdir()
    _run(fork_remote_dir, "init", "-q", "-b", "main")
    _run(fork_remote_dir, "config", "commit.gpgsign", "false")
    _commit(fork_remote_dir, "fork initial", "README.md", "hello\n", "2024-01-01T00:00:00")
    _commit(fork_remote_dir, "fork second", "README.md", "hello world\n", "2024-01-02T00:00:00")
    _run(fork_remote_dir, "checkout", "-b", "feature-y")
    fork_tip = _commit(fork_remote_dir, "fork-only feature", "fork.txt", "external\n", "2024-01-11T00:00:00")
    _run(fork_remote_dir, "checkout", "main")
    _run(repo, "remote", "add", "fork", str(fork_remote_dir))
    _run(repo, "fetch", "-q", "fork", "feature-y:refs/remotes/fork/feature-y")

    protected = {"main", "develop"}
    recorded_tips = {
        "closed-unmerged": closed_tip,
        "reopened-branch": reopened_first,
        "uncertain-ghost": "0" * 40,
    }
    expected = {
        "main": "protected",
        "develop": "protected",
        "merged-feature": "duplicate",
        "closed-unmerged": "unique",
        "reopened-branch": "moved",
        "shared-primary": "shared",
        "shared-alias": "shared",
        "uncertain-ghost": "uncertain",
        "feature-y": "unique",
    }

    return Fixture(
        repo=repo,
        protected=protected,
        recorded_tips=recorded_tips,
        expected=expected,
        fork_remote_dir=fork_remote_dir,
    )
