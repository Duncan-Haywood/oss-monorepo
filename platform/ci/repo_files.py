#!/usr/bin/env python3
"""List the repository's files the way a pull request's CI will see them.

The tree checks (`check_*.py`) used to list files with a bare `git ls-files`,
which names tracked files only. In CI that is every file in the commit, but in
a session a new file is untracked until it is committed, so a local pass of
`unwired_checks.py` or `run_workflow_locally.py --for-changes` skipped exactly
the files the change added. PR #17568 (2026-11-19) went red in CI on a U+FEFF
in a new test file (check_hidden_unicode.py) and JSONC corpus files under a
`.json` name (check_json_valid.py), both of which the local sweep had passed.

`ls_files` adds untracked, non-ignored files outside Actions, so a local run
judges the change as it will be committed. On Actions it stays tracked-only,
so files a job's earlier steps write cannot turn a check red.

    from repo_files import ls_files
    ls_files(root, "*.json", "*.webmanifest")   # -> ["a/b.json", ...]
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def include_untracked() -> bool:
    """True outside GitHub Actions (or when REPO_FILES_UNTRACKED=1 forces it)."""
    forced = os.environ.get("REPO_FILES_UNTRACKED")
    if forced is not None:
        return forced == "1"
    return os.environ.get("GITHUB_ACTIONS") != "true"


def ls_files(root: str | Path, *pathspecs: str, untracked: bool | None = None) -> list[str]:
    """Repo-relative paths git tracks, plus untracked non-ignored ones locally.

    Raises subprocess.CalledProcessError or OSError like `git ls-files` with
    check=True, so callers keep their fallbacks.
    """
    if untracked is None:
        untracked = include_untracked()
    cmd = ["git", "ls-files", "-z"]
    if untracked:
        cmd += ["--cached", "--others", "--exclude-standard"]
    if pathspecs:
        cmd += ["--", *pathspecs]
    out = subprocess.run(cmd, cwd=str(root), capture_output=True, check=True).stdout
    seen: dict[str, None] = {}
    for name in out.decode("utf-8", "surrogateescape").split("\0"):
        if name:
            seen.setdefault(name, None)
    return list(seen)
