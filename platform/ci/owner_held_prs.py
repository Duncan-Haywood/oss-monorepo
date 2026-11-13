#!/usr/bin/env python3
"""List the open pull requests that wait on the owner, oldest first.

Why this exists
---------------
A PR that touches a path in `.github/CODEOWNERS` (agent instructions, prompts,
hooks, CI) waits for the owner's approval (CLAUDE.md, "Ship without review
ceremony"). Agents open such PRs every day and then move on, so they pile up
with no single list: on 2026-11-13 three `prompts: review` PRs from 2026-10-31
and 2026-11-01 were still open, and `promptctl.review_claimed()` counted them as
a live claim, so the review track did not run for 2,691 runs. The redteam
open-items list was nine held workflow edits. The owner had no way to see what
was waiting, and agents had no way to see that their fix was already
waiting, so they opened duplicates.

This prints one queue:

  * each same-repo open PR that touches an owned path, oldest first, with its
    age and the owned files it changes;
  * **same file, several PRs**: owned files that two or more held PRs change.
    Review those together, since merging one usually makes the others stale
    or conflicted (on 2026-11-13, four PRs changed ventures-tests.yml for
    one backlog item);
  * **already on main**: PRs whose owned changes main already carries, as the
    same file or with every added line already present. On 2026-11-13 three
    PRs for the prompt.md step 0 wording (#12885, #12939, #12975) were still
    open after the fix had landed. This reads `origin/main` from the local
    clone, so fetch main first;
  * **mixed** PRs: ones that also change unowned files, whose product or docs
    work is held up by the owner gate (keep control-plane edits in their
    own small PR).

Fork PRs are skipped: they are never merged here (CLAUDE.md, "Public
repository").

    python3 platform/ci/owner_held_prs.py            # markdown table
    python3 platform/ci/owner_held_prs.py --json     # for scripts
    python3 platform/ci/owner_held_prs.py --grep promptctl   # is my fix already held?

It reads the GitHub REST API with GITHUB_TOKEN when set, and without a token
otherwise. A cloud session's proxy authenticates the request, so it needs no
token there. It makes one request per PR page and one per open PR, sixteen at a time. Exit 0 with
the list, or 2 when GitHub cannot be read.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import control_plane_guard as cpg  # noqa: E402

API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
REPO = os.environ.get("GITHUB_REPOSITORY", "duncan-haywood/oss-monorepo")


def get(path: str):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(f"{API}{path}", headers=headers), timeout=30) as r:
        return json.load(r)


def pages(path: str, limit: int = 30) -> list:
    out: list = []
    sep = "&" if "?" in path else "?"
    for page in range(1, limit + 1):
        batch = get(f"{path}{sep}per_page=100&page={page}")
        out += batch
        if len(batch) < 100:
            break
    return out


def is_fork(pr: dict) -> bool:
    head = (pr.get("head") or {}).get("repo") or {}
    base = (pr.get("base") or {}).get("repo") or {}
    return not head or head.get("full_name") != base.get("full_name")


def added_blocks(patch: str) -> list[str]:
    """Each run of consecutive added lines in a unified diff, joined with its
    whitespace collapsed, so a fix that landed with different line wrapping
    still matches. Blank-only runs are dropped."""
    blocks, run = [], []
    for line in patch.splitlines() + [""]:
        if line.startswith("+") and not line.startswith("+++"):
            run.append(line[1:])
            continue
        text = " ".join(" ".join(run).split())
        if text:
            blocks.append(text)
        run = []
    return blocks


def change_on_main(f: dict, main) -> bool:
    """True when main already carries this file change: the same blob, or a
    patch whose every block of added lines appears in main's copy, whitespace
    collapsed (the same fix landed by another PR, with other lines changed
    since). A removal or a patch the API leaves out (very large diffs) never
    counts."""
    if f.get("status") == "removed":
        return False
    if f.get("sha") and f["sha"] == main.blob(f["filename"]):
        return True
    blocks = added_blocks(f.get("patch") or "")
    text = main.text(f["filename"])
    if not blocks or text is None:
        return False
    flat = " ".join(text.split())
    return all(b in flat for b in blocks)


class NoMain:
    """A main that knows nothing (tests, or a clone without origin/main)."""
    def blob(self, path):
        return None

    def text(self, path):
        return None


def held(prs: list[dict], files_of, rules, main=NoMain()) -> list[dict]:
    """The same-repo PRs touching an owned path, oldest first.

    `files_of(number)` returns the PR's changed files as the API lists them
    (dicts with `filename`, `sha`, `status`, `patch`). An owned file whose
    change main already carries is listed in `on_main` (see change_on_main)."""
    same = [pr for pr in prs if not is_fork(pr)]
    with ThreadPoolExecutor(max_workers=16) as pool:
        listed = list(pool.map(lambda pr: files_of(pr["number"]), same))
    rows = []
    for pr, files in zip(same, listed):
        owned = [f for f in files if cpg.owners_for(f["filename"], rules)]
        if not owned:
            continue
        on_main = sorted(f["filename"] for f in owned if change_on_main(f, main))
        rows.append({
            "number": pr["number"],
            "title": pr.get("title", ""),
            "created_at": pr.get("created_at", ""),
            "draft": bool(pr.get("draft")),
            "owned": sorted(f["filename"] for f in owned),
            "on_main": on_main,
            "unowned": len(files) - len(owned),
        })
    rows.sort(key=lambda r: (r["created_at"], r["number"]))
    return rows


def shared_files(rows: list[dict]) -> list[tuple[str, list[int]]]:
    """Each owned file that two or more held PRs change, with those PRs (oldest
    first), most-contended file first."""
    by_file: dict[str, list[int]] = {}
    for r in rows:
        for f in r["owned"]:
            by_file.setdefault(f, []).append(r["number"])
    shared = [(f, ns) for f, ns in by_file.items() if len(ns) > 1]
    return sorted(shared, key=lambda x: (-len(x[1]), x[0]))


class GitMain:
    """origin/main as the local clone has it: blob ids from one `git ls-tree`,
    file text from `git show` on demand. Knows nothing when the ref is missing."""

    def __init__(self, ref: str = "origin/main"):
        import subprocess
        self.ref, self.run = ref, subprocess.run
        done = self.run(["git", "ls-tree", "-r", ref], cwd=cpg.REPO_ROOT, capture_output=True, text=True)
        self.blobs = {}
        for line in done.stdout.splitlines() if done.returncode == 0 else []:
            meta, _, path = line.partition("\t")
            parts = meta.split()
            if len(parts) == 3 and parts[1] == "blob":
                self.blobs[path] = parts[2]
        self.texts: dict[str, str | None] = {}

    def blob(self, path):
        return self.blobs.get(path)

    def text(self, path):
        if path not in self.texts:
            done = self.run(["git", "show", f"{self.ref}:{path}"], cwd=cpg.REPO_ROOT, capture_output=True)
            self.texts[path] = done.stdout.decode("utf-8", "replace") if done.returncode == 0 else None
        return self.texts[path]


def age_days(created_at: str, now: dt.datetime) -> int:
    try:
        t = dt.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return 0
    return max(0, (now - t).days)


def render(rows: list[dict], now: dt.datetime) -> str:
    if not rows:
        return "No open same-repo PR touches a CODEOWNERS path: nothing waits on the owner.\n"
    lines = [f"{len(rows)} open PR(s) wait on the owner (touch a CODEOWNERS path), oldest first.", "",
             "| PR | age | title | owned files | also unowned |", "|---|---|---|---|---|"]
    for r in rows:
        files = ", ".join(f"`{f}`" for f in r["owned"][:3])
        if len(r["owned"]) > 3:
            files += f" +{len(r['owned']) - 3}"
        title = r["title"].replace("|", "/")
        if r["draft"]:
            title = "(draft) " + title
        lines.append(f"| #{r['number']} | {age_days(r['created_at'], now)}d | {title} | {files} | "
                     f"{r['unowned'] or ''} |")
    landed = [r for r in rows if r["on_main"] and set(r["on_main"]) == set(r["owned"])]
    if landed:
        lines += ["", "Already on main: main carries every owned change in these PRs (same file, or every block of "
                      "added lines already present), so likely nothing is left for the owner to approve there; "
                      "check the diff, then close it or land only its unowned part: "
                  + ", ".join(f"#{r['number']}" for r in landed)]
    shared = shared_files(rows)
    if shared:
        lines += ["", "Same file, several PRs (review together: merging one usually stales or conflicts the rest):"]
        lines += [f"- `{f}`: " + ", ".join(f"#{n}" for n in ns) for f, ns in shared]
    mixed = [r for r in rows if r["unowned"]]
    if mixed:
        lines += ["", f"Mixed: {len(mixed)} PR(s) also change unowned files, which wait with them "
                      "(split control-plane edits into their own PR): "
                  + ", ".join(f"#{r['number']}" for r in mixed)]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true", help="print rows as JSON")
    ap.add_argument("--grep", help="keep PRs whose title or owned files contain this text")
    args = ap.parse_args(argv)
    rules = cpg.parse_codeowners(cpg.CODEOWNERS.read_text())
    try:
        prs = pages(f"/repos/{REPO}/pulls?state=open")
        rows = held(prs, lambda n: pages(f"/repos/{REPO}/pulls/{n}/files", limit=30), rules,
                    GitMain())
    except Exception as e:  # network, proxy, rate limit
        print(f"owner_held_prs: could not read GitHub ({e}); search open PRs by hand", file=sys.stderr)
        return 2
    if args.grep:
        g = args.grep.lower()
        rows = [r for r in rows if g in r["title"].lower() or any(g in f.lower() for f in r["owned"])]
    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        print(render(rows, dt.datetime.now(dt.timezone.utc)), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
