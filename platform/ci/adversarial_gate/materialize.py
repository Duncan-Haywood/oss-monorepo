#!/usr/bin/env python3
"""Fetch a pull request into the base checkout as data, never as code.

priv-security-gate.yml runs on `pull_request_target`, so its checkout is the
base branch and its scripts are main's. This fetches the PR's head commit and
the base commit into refs (anonymous fetch: the job keeps no credentials),
finds the merge base (deepening a shallow clone as needed), and adds two
detached worktrees under --dest: `head` and `base`. Nothing in them is ever
executed; the gate and the scanners read them as files.

Git hooks are switched off (core.hooksPath=/dev/null), as are filters and
external diff drivers in the later reads, so a planted .gitattributes or hook
cannot run anything. Writes `env` (MERGE_BASE=..., HEAD_SHA=...) and
`changed.txt` (paths the PR adds or modifies) under --dest.

    python3 -I platform/ci/adversarial_gate/materialize.py --base SHA --head SHA [--pr N] --dest DIR
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

SHA = re.compile(r"^[0-9a-f]{40}$")


def git(*args: str, cwd: Path, check: bool = True) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_TERMINAL_PROMPT="0", GIT_CONFIG_NOSYSTEM="1", GIT_LFS_SKIP_SMUDGE="1")
    res = subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.quotepath=off", *args],
        cwd=cwd, capture_output=True, text=True, env=env, check=False,
    )
    if check and res.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout.strip()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--base", required=True, help="base commit (the PR's base SHA, or the push's `before`)")
    ap.add_argument("--head", required=True, help="head commit to judge")
    ap.add_argument("--pr", type=int, help="PR number, to fetch refs/pull/N/head when the SHA alone is not advertised")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--dest", required=True)
    args = ap.parse_args(argv)
    for name in ("base", "head"):
        if not SHA.match(getattr(args, name)):
            raise SystemExit(f"--{name} must be a full 40-character SHA")
    repo, dest = Path(args.repo).resolve(), Path(args.dest).resolve()
    dest.mkdir(parents=True, exist_ok=True)

    refs = [f"+{args.base}:refs/gate/base", f"+{args.head}:refs/gate/head"]
    git("fetch", "--no-tags", "--filter=blob:none", "--depth=50", "origin", *refs, cwd=repo, check=False)
    if not git("rev-parse", "--verify", "--quiet", "refs/gate/head", cwd=repo, check=False):
        if not args.pr:
            raise SystemExit("could not fetch the head commit")
        refs = [f"+{args.base}:refs/gate/base", f"+refs/pull/{args.pr}/head:refs/gate/head"]
        git("fetch", "--no-tags", "--filter=blob:none", "--depth=50", "origin", *refs, cwd=repo)
    if git("rev-parse", "refs/gate/head", cwd=repo) != args.head:
        raise SystemExit(f"the PR moved: its head is no longer {args.head}; the run for the newer commit decides")

    merge_base = ""
    for _ in range(12):
        merge_base = git("merge-base", "refs/gate/base", "refs/gate/head", cwd=repo, check=False)
        if merge_base:
            break
        git("fetch", "--no-tags", "--filter=blob:none", "--deepen=200", "origin", *refs, cwd=repo, check=False)
    if not merge_base:
        raise SystemExit("no merge base within the fetched history; rebase the PR on main")

    for name, rev in (("head", args.head), ("base", merge_base)):
        tree = dest / name
        if tree.exists():
            git("worktree", "remove", "--force", str(tree), cwd=repo, check=False)
        git("worktree", "add", "--detach", str(tree), rev, cwd=repo)

    changed = git("diff", "--no-ext-diff", "--no-textconv", "--name-only", "--diff-filter=ACMRT", "-z", merge_base, args.head, cwd=repo)
    (dest / "changed.txt").write_text("".join(p + "\n" for p in changed.split("\0") if p), encoding="utf-8")
    (dest / "env").write_text(f"MERGE_BASE={merge_base}\nHEAD_SHA={args.head}\n", encoding="utf-8")
    print(f"merge base {merge_base}; head {args.head}; {len([p for p in changed.split(chr(0)) if p])} changed file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
