#!/usr/bin/env python3
"""Keep research/ an exact, history-preserving mirror of oss-research-monorepo.

    python3 research/_mirror/mirror.py sync     # merge upstream history, copy its content
    python3 research/_mirror/mirror.py check    # prove research/ matches upstream exactly
    python3 research/_mirror/mirror.py ack <upstream path>   # after porting an adapted file

The research portfolio was folded into this repository with its full history
(#6832), and work still lands in the original repository until its routines
are pointed here. The goal is that the two are mirrors, so one can be deleted.
"Mirror" means two things, and `check` tests both:

- **History.** The upstream commit last synced is an ancestor of this
  repository's HEAD, so every upstream commit is here. Upstream projects
  already live at research/<slug>/, so `git log -- research/<slug>` shows them.
- **Content.** Every upstream file is here, byte for byte and with the same
  mode, under the mapping below, and nothing else is in the mirrored area.

A handful of upstream files cannot be copied as they are, because they
describe the old repository (its root README, its CLAUDE.md, its brief, its
homepage build and Pages workflow). Each has one of three treatments:
DERIVED files are regenerated from upstream by a fixed rule; the run log is
CONVERTED into one record per run for prompts/; ADAPTED files are maintained
by hand here, and the upstream version each adaptation corresponds to is
pinned by blob hash in state.json, so `check` fails the moment upstream
changes one until someone ports the change and runs `ack`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

UPSTREAM_URL = "https://github.com/Duncan-Haywood/oss-research-monorepo"
UPSTREAM_REF = "refs/remotes/research/main"
STATE = "research/_mirror/state.json"

# Upstream files copied byte for byte, by exact path or by directory prefix.
EXACT = {
    "LICENSE": "research/LICENSE",
    ".gitignore": "research/.gitignore",
    "PROJECTS.md": "research/PROJECTS.md",
    ".github/FUNDING.yml": ".github/FUNDING.yml",
}
EXACT_PREFIX = {
    "research/": "research/",
    "site/": "research/_homepage/",
}
# Regenerated from upstream by derive_readme().
DERIVED = {"README.md": "research/README.md"}
# Converted into one prompts/runs/*.json record per line by convert_runs().
RUNS = "prompts/runs.jsonl"
RUNS_DIR = "prompts/runs"
RUNS_SOURCE = "oss-research-monorepo prompts/runs.jsonl"
# Maintained by hand here; state.json pins the upstream blob each corresponds to.
ADAPTED = {
    "CLAUDE.md": "research/CLAUDE.md",
    "prompt.md": "prompts/research/prompt-0.md",
    "site/build.py": "research/_homepage/build.py",
    "site/template.html": "research/_homepage/template.html",
    ".github/workflows/pages.yml": ".github/workflows/research-ci.yml",
}
# Under research/ but belonging to this repository, not to the mirror.
LOCAL_ONLY_PREFIXES = ("research/_mirror/",)


class MirrorError(Exception):
    pass


def git(root: Path, *args: str, input: bytes | None = None, check: bool = True) -> bytes:
    proc = subprocess.run(["git", *args], cwd=root, input=input, capture_output=True)
    if check and proc.returncode != 0:
        raise MirrorError(f"git {' '.join(args)} failed: {proc.stderr.decode().strip()}")
    return proc.stdout


def local_path(upstream: str) -> str | None:
    """Where an exactly mirrored upstream file lives here, or None."""
    if upstream in EXACT:
        return EXACT[upstream]
    if upstream in ADAPTED or upstream in DERIVED or upstream == RUNS:
        return None
    for src, dst in EXACT_PREFIX.items():
        if upstream.startswith(src):
            return dst + upstream[len(src):]
    return None


def is_mapped(upstream: str) -> bool:
    return (local_path(upstream) is not None or upstream in ADAPTED
            or upstream in DERIVED or upstream == RUNS)


def mirrored_area(local: str) -> bool:
    """Local paths whose every file must come from upstream."""
    if local.startswith(LOCAL_ONLY_PREFIXES):
        return False
    if local in DERIVED.values() or local in ADAPTED.values():
        return False
    return local.startswith("research/")


def upstream_tree(root: Path, commit: str) -> dict[str, tuple[str, str]]:
    """{path: (mode, blob)} for every file in an upstream commit."""
    out = git(root, "ls-tree", "-r", "-z", commit).decode()
    tree = {}
    for entry in filter(None, out.split("\0")):
        meta, path = entry.split("\t", 1)
        mode, kind, sha = meta.split()
        if kind == "blob":
            tree[path] = (mode, sha)
    return tree


def local_index(root: Path) -> dict[str, tuple[str, str]]:
    """{path: (mode, blob)} for every file in this repository's index."""
    out = git(root, "ls-files", "-s", "-z").decode()
    index = {}
    for entry in filter(None, out.split("\0")):
        meta, path = entry.split("\t", 1)
        mode, sha, _stage = meta.split()
        index[path] = (mode, sha)
    return index


def has_commit(root: Path, sha: str) -> bool:
    return subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], cwd=root,
                          capture_output=True).returncode == 0


def is_ancestor(root: Path, a: str, b: str) -> bool:
    return subprocess.run(["git", "merge-base", "--is-ancestor", a, b], cwd=root,
                          capture_output=True).returncode == 0


def blob(root: Path, sha: str) -> bytes:
    return git(root, "cat-file", "blob", sha)


def load_state(root: Path) -> dict[str, Any]:
    path = root / STATE
    if not path.exists():
        raise MirrorError(f"{STATE} is missing")
    return json.loads(path.read_text())


def save_state(root: Path, state: dict[str, Any]) -> None:
    (root / STATE).write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def derive_readme(upstream_text: str, local_text: str) -> str:
    """This repository's header, then upstream's project bullets with links made relative."""
    def first_bullet(lines: list[str]) -> int:
        for i, line in enumerate(lines):
            if line.startswith("- [`research/"):
                return i
        return len(lines)

    up = upstream_text.splitlines(keepends=True)
    loc = local_text.splitlines(keepends=True)
    body = "".join(up[first_bullet(up):]).replace("](research/", "](")
    return "".join(loc[:first_bullet(loc)]) + body


def run_name(rec: dict[str, Any], used: set[str]) -> str:
    session = str(rec.get("session") or "session").rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", session).strip("-") or "session"
    base = f"{rec.get('date')}-{slug}"
    name, n = f"{base}.json", 2
    while name in used:
        name, n = f"{base}-{n}.json", n + 1
    used.add(name)
    return name


def convert_runs(text: str) -> dict[str, dict[str, Any]]:
    """Upstream run-log lines as prompts/runs records, keyed by file name."""
    records, used = {}, set()
    for line in text.splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        out = dict(rec)
        pv = rec.get("prompt_version")
        if isinstance(pv, str) and pv.rsplit("/", 1)[-1].isdigit():
            # Some upstream runs wrote the trailer ("research/1"); promptctl wants the integer.
            out["prompt_version"] = int(pv.rsplit("/", 1)[-1])
        # What check() compares: the fields upstream wrote, plus the two set here.
        out["_upstream_keys"] = sorted(set(rec) | {"track", "source"})
        out.setdefault("track", "research")
        out.setdefault("doc_friction", [])
        out.setdefault("errors", [])
        out.setdefault("integrity_issues", [])
        out.setdefault("date", None)
        out.setdefault("goal", None)
        out.setdefault("corrections", [])
        out["source"] = RUNS_SOURCE
        records[run_name(rec, used)] = out
    return records


def upstream_runs(root: Path, commit: str, tree: dict[str, tuple[str, str]]) -> dict[str, dict]:
    if RUNS not in tree:
        return {}
    return convert_runs(blob(root, tree[RUNS][1]).decode())


# --------------------------------------------------------------------------
# check


def check(root: Path, upstream_ref: str | None = UPSTREAM_REF, allow_behind: bool = False) -> list[str]:
    state = load_state(root)
    base = state["upstream_commit"]
    if not has_commit(root, base):
        return [f"upstream commit {base} is not in this clone; fetch history "
                f"(`git fetch --unshallow origin main`) or run sync"]
    problems: list[str] = []

    # History: the synced upstream commit is part of this repository's history.
    merging = git(root, "rev-parse", "-q", "--verify", "MERGE_HEAD", check=False).decode().strip()
    if not (is_ancestor(root, base, "HEAD") or merging == base):
        problems.append(f"history: upstream {base[:12]} is not an ancestor of HEAD")

    up = upstream_tree(root, base)
    here = local_index(root)

    # Content: exact copies.
    expected_local = set()
    for path, (mode, sha) in sorted(up.items()):
        if not is_mapped(path):
            problems.append(f"unmapped upstream file {path}: add it to a mapping in mirror.py")
            continue
        dst = local_path(path)
        if dst is None:
            continue
        expected_local.add(dst)
        if dst not in here:
            problems.append(f"missing: {dst} (upstream {path})")
        elif here[dst] != (mode, sha):
            problems.append(f"differs: {dst} is not byte-identical to upstream {path}")
    for path in sorted(here):
        if mirrored_area(path) and path not in expected_local:
            problems.append(f"extra: {path} is not in upstream; mirrored files must come from there")

    # Derived README.
    for src, dst in DERIVED.items():
        if src in up and dst in here:
            want = derive_readme(blob(root, up[src][1]).decode(), blob(root, here[dst][1]).decode())
            if blob(root, here[dst][1]).decode() != want:
                problems.append(f"differs: {dst} is not the README derived from upstream {src}; run sync")
        elif src in up:
            problems.append(f"missing: {dst} (derived from upstream {src})")

    # Converted run log.
    for name, rec in upstream_runs(root, base, up).items():
        path = f"{RUNS_DIR}/{name}"
        if path not in here:
            problems.append(f"missing: {path} (run record from upstream {RUNS})")
            continue
        local = json.loads(blob(root, here[path][1]))
        corrected = {c.get("field") for c in local.get("corrections") or []}
        for key in rec["_upstream_keys"]:
            value = rec[key]
            if key not in corrected and local.get(key) != value:
                problems.append(f"differs: {path} field {key!r} changed without a corrections entry")

    # Adapted files: pinned to the upstream version they were adapted from.
    pinned = state.get("adapted", {})
    for src, dst in ADAPTED.items():
        if src in up and pinned.get(src) != up[src][1]:
            problems.append(f"adapted: upstream {src} changed since {dst} was adapted from it; "
                            f"port the change, then `mirror.py ack {src}` "
                            f"(diff: git diff {pinned.get(src, '<none>')[:12]} {up[src][1][:12]})")

    # Current: nothing newer upstream.
    if upstream_ref and not allow_behind:
        head = git(root, "rev-parse", "--verify", "-q", upstream_ref, check=False).decode().strip()
        if head and head != base:
            behind = git(root, "rev-list", "--count", f"{base}..{head}", check=False).decode().strip()
            problems.append(f"behind: upstream has {behind or 'new'} commit(s) since {base[:12]}; run sync")
    return problems


# --------------------------------------------------------------------------
# sync


def sync(root: Path, ref: str = UPSTREAM_REF, fetch: bool = True) -> list[str]:
    """Merge upstream history and copy its content. Returns the hand-port to-do list."""
    if git(root, "status", "--porcelain").strip():
        raise MirrorError("working tree is not clean; commit or stash first")
    if fetch:
        git(root, "fetch", "-q", UPSTREAM_URL, f"main:{ref}")
    head = git(root, "rev-parse", ref).decode().strip()
    state = load_state(root)

    if not is_ancestor(root, head, "HEAD"):
        git(root, "merge", "-s", "ours", "--no-commit", "--allow-unrelated-histories", head)

    up = upstream_tree(root, head)
    here = local_index(root)
    expected, changed = set(), []
    for path, (mode, sha) in up.items():
        dst = local_path(path)
        if dst is None:
            continue
        expected.add(dst)
        if here.get(dst) != (mode, sha):
            changed.append(f"{mode} {sha}\t{dst}")
    stale = sorted(p for p in here if mirrored_area(p) and p not in expected)
    # Mode 0 removes an entry, so one --index-info call both writes and deletes.
    entries = changed + [f"0 {'0' * 40}\t{p}" for p in stale]
    if entries:
        git(root, "update-index", "--index-info", input=("\n".join(entries) + "\n").encode())

    for src, dst in DERIVED.items():
        if src in up:
            current = (root / dst).read_text() if (root / dst).exists() else ""
            (root / dst).write_text(derive_readme(blob(root, up[src][1]).decode(), current))
            git(root, "add", "--", dst)

    added = []
    for name, rec in upstream_runs(root, head, up).items():
        path = root / RUNS_DIR / name
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            rec = {k: v for k, v in rec.items() if k != "_upstream_keys"}
            path.write_text(json.dumps(rec, indent=2) + "\n")
            added.append(f"{RUNS_DIR}/{name}")
    if added:
        git(root, "add", "--", *added)

    todo = []
    for src, dst in ADAPTED.items():
        if src in up and state.get("adapted", {}).get(src) != up[src][1]:
            todo.append(f"{src} -> {dst}: git diff {state.get('adapted', {}).get(src, '<none>')} {up[src][1]}")
    unmapped = sorted(p for p in up if not is_mapped(p))
    todo += [f"unmapped upstream file {p}: decide where it lives and add it to mirror.py" for p in unmapped]

    state["upstream_commit"] = head
    save_state(root, state)
    git(root, "add", "--", STATE)
    # Bring the working tree in line with the index for every path touched.
    touched = sorted(expected)
    if touched:
        git(root, "checkout-index", "-f", "-q", "-z", "--stdin",
            input="\0".join(touched).encode() + b"\0")
    for path in stale:
        try:
            (root / path).unlink()
        except FileNotFoundError:
            pass
    return todo


def ack(root: Path, upstream_path: str) -> str:
    if upstream_path not in ADAPTED:
        raise MirrorError(f"{upstream_path} is not an adapted file; adapted: {', '.join(ADAPTED)}")
    state = load_state(root)
    up = upstream_tree(root, state["upstream_commit"])
    if upstream_path not in up:
        raise MirrorError(f"upstream {state['upstream_commit'][:12]} has no {upstream_path}")
    state.setdefault("adapted", {})[upstream_path] = up[upstream_path][1]
    save_state(root, state)
    return up[upstream_path][1]


def repo_root() -> Path:
    out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                         cwd=Path(__file__).resolve().parent)
    return Path(out.stdout.decode().strip())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("sync", help="merge upstream history and copy its content")
    p.add_argument("--no-fetch", action="store_true", help=f"use {UPSTREAM_REF} as it is")
    p = sub.add_parser("check", help="prove research/ mirrors upstream exactly")
    p.add_argument("--allow-behind", action="store_true",
                   help="do not fail when upstream has commits not synced yet")
    p = sub.add_parser("ack", help="record that an adapted file is ported from current upstream")
    p.add_argument("path", choices=sorted(ADAPTED))
    args = parser.parse_args(argv)
    root = repo_root()
    try:
        if args.cmd == "sync":
            todo = sync(root, fetch=not args.no_fetch)
            state = load_state(root)
            print(f"synced to upstream {state['upstream_commit'][:12]}; the merge is staged, not committed")
            for item in todo:
                print(f"  port by hand: {item}")
            if todo:
                print("Then run `mirror.py ack <path>` for each, and `mirror.py check`.")
            return 0
        if args.cmd == "ack":
            print(f"pinned {args.path} to upstream blob {ack(root, args.path)[:12]}")
            return 0
        problems = check(root, allow_behind=args.allow_behind)
    except MirrorError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    for problem in problems:
        print(problem)
    if problems:
        print(f"research/ is NOT a mirror of upstream: {len(problems)} problem(s)")
        return 1
    state = load_state(root)
    print(f"ok: research/ mirrors upstream {state['upstream_commit'][:12]} exactly "
          f"(history and content; {len(ADAPTED)} adapted files pinned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
