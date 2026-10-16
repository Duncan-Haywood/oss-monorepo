#!/usr/bin/env python3
"""Keep everything in oss-research-monorepo that git history alone does not carry.

    python3 platform/ci/research_archive.py branches [--push]   # copy every upstream branch here
    python3 platform/ci/research_archive.py bundle <dir>        # every branch in one git bundle
    python3 platform/ci/research_archive.py export <dir>        # pull requests, reviews, issues as JSON
    python3 platform/ci/research_archive.py ready [--meta <dir>] [--record <dir>]
    python3 platform/ci/research_archive.py status              # the last recorded verdict, no API

Upstream `main` was merged into this repository with its full history
(research/, #6832 and the mirror syncs after it). Deleting the upstream
repository would still lose three things, and this tool keeps each one here:

- **Branches.** Every upstream branch `<name>` becomes the branch
  `archive/research/<name>` in this repository, at the same commit. A pull
  request head that no upstream branch contains (its branch was deleted after
  a squash merge) becomes `archive/research-pull/<number>`. Archive branches
  are only ever created or moved, never deleted, so a branch upstream deletes
  stays here. GitHub refuses a workflow's token any branch whose tree would
  add or change a file under `.github/workflows/`, and most upstream branches
  carry upstream's `pages.yml`, so `bundle` also writes every one of them,
  under the same names, to `branches.bundle` (1.4 MB on 2026-10-16: the
  history they share with `main` is already here). Restore them all with
  `git fetch branches.bundle 'refs/archive-bundle/*:refs/heads/*'`.
- **Pull requests, reviews and issues.** `export` writes each one, with its
  body, comments, reviews and review threads, to `pulls/<n>.json` and
  `issues/<n>.json`, plus an `INDEX.md` to browse them. The scheduled workflow
  (`.github/workflows/research-archive.yml`) commits that directory to the
  branch `archive/research-meta`.
- **Proof.** `ready` exits 0 only when deleting upstream would lose nothing
  this tool can keep: upstream `main` in this repository's history, every
  branch archived at its current tip, every pull request and issue exported
  at its latest update, and none still open. `--record` writes the verdict as
  `READY.json` and `READY.md`; `status` reads it back from the meta branch.

What no tool can carry, and `ready` lists every time: stars, watchers and
forks, the old Pages URL (the homepage is built here at `/research/`), and
links to upstream pull requests from elsewhere on the web.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


OWNER, NAME = "Duncan-Haywood", "oss-research-monorepo"
UPSTREAM_URL = f"https://github.com/{OWNER}/{NAME}"
BRANCH_PREFIX = "archive/research/"
PULL_PREFIX = "archive/research-pull/"
META_BRANCH = "archive/research-meta"
FETCH_NS = "refs/archive-upstream/"
PUSH_BATCH = 100
GRAPHQL = "https://api.github.com/graphql"
NOT_CARRIED = (
    "stars, watchers and forks",
    "the old Pages URL (the homepage is built here at /research/)",
    "links to upstream pull requests from outside these two repositories",
)


class ArchiveError(RuntimeError):
    pass


def git(root: Path, *args: str, check: bool = True) -> str:
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    proc = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, env=env)
    if check and proc.returncode != 0:
        raise ArchiveError(f"git {' '.join(args)}: {proc.stderr.strip()}")
    return proc.stdout


# ---------------------------------------------------------------- branches

def ls_remote(root: Path, remote: str, *patterns: str) -> dict[str, str]:
    """ref -> sha as the remote advertises them."""
    out = git(root, "ls-remote", remote, *patterns)
    refs = {}
    for line in out.splitlines():
        sha, _, ref = line.partition("\t")
        refs[ref] = sha
    return refs


def upstream_refs(root: Path, upstream: str) -> tuple[dict[str, str], dict[int, str]]:
    """(branch name -> sha, pull number -> head sha) upstream."""
    refs = ls_remote(root, upstream, "refs/heads/*", "refs/pull/*/head")
    heads, pulls = {}, {}
    for ref, sha in refs.items():
        if ref.startswith("refs/heads/"):
            heads[ref[len("refs/heads/"):]] = sha
        elif ref.startswith("refs/pull/") and ref.endswith("/head"):
            number = ref[len("refs/pull/"):-len("/head")]
            if number.isdigit():
                pulls[int(number)] = sha
    return heads, pulls


def archived_refs(root: Path, origin: str) -> dict[str, str]:
    """archive branch name -> sha here."""
    refs = ls_remote(root, origin, f"refs/heads/{BRANCH_PREFIX}*", f"refs/heads/{PULL_PREFIX}*")
    return {ref[len("refs/heads/"):]: sha for ref, sha in refs.items()}


def fetch_upstream(root: Path, upstream: str) -> None:
    git(root, "fetch", "-q", "--no-tags", upstream,
        f"+refs/heads/*:{FETCH_NS}heads/*", f"+refs/pull/*/head:{FETCH_NS}pull/*")


def plan(heads: dict[str, str], pulls: dict[int, str],
         reachable: Callable[[str], bool]) -> dict[str, str]:
    """archive branch -> sha that should exist here.

    `reachable(sha)` says whether some upstream branch already contains a
    pull request's head; only the heads no branch contains get a branch.
    """
    want = {BRANCH_PREFIX + name: sha for name, sha in heads.items()}
    for number, sha in sorted(pulls.items()):
        if not reachable(sha):
            want[f"{PULL_PREFIX}{number}"] = sha
    return want


def branch_commits(root: Path, heads: dict[str, str]) -> set[str]:
    """Every commit reachable from the fetched upstream branches."""
    if not heads:
        return set()
    out = git(root, "rev-list", *sorted(set(heads.values())))
    return set(out.split())


def missing(want: dict[str, str], have: dict[str, str]) -> dict[str, str]:
    return {b: sha for b, sha in want.items() if have.get(b) != sha}


def push(root: Path, origin: str, updates: dict[str, str]) -> None:
    """Create or move archive branches. Never deletes one.

    A ref GitHub refuses (a tree that would add a workflow file) does not stop
    the others: the push is not atomic, and the bundle keeps what is refused.
    """
    items = sorted(updates.items())
    for i in range(0, len(items), PUSH_BATCH):
        specs = [f"+{sha}:refs/heads/{branch}" for branch, sha in items[i:i + PUSH_BATCH]]
        git(root, "push", "-q", origin, *specs, check=False)


def archive_branches(root: Path, upstream: str, origin: str,
                     do_push: bool) -> tuple[dict[str, str], dict[str, str]]:
    """Fetch upstream; return (every archive ref wanted, those not pushed here as branches)."""
    heads, pulls = upstream_refs(root, upstream)
    fetch_upstream(root, upstream)
    contained = branch_commits(root, heads)
    want = plan(heads, pulls, contained.__contains__)
    todo = missing(want, archived_refs(root, origin))
    if do_push and todo:
        push(root, origin, todo)
        todo = missing(want, archived_refs(root, origin))
    return want, todo


BUNDLE = "branches.bundle"
BUNDLE_INDEX = "branches.json"
BUNDLE_NS = "refs/archive-bundle/"


def write_bundle(root: Path, out: Path, want: dict[str, str], up_main: str) -> int:
    """Write every wanted ref to out/branches.bundle; return how many it holds.

    Commits upstream main already has are left out (they are in this
    repository's history), so a ref whose tip main contains is listed in
    branches.json but not in the bundle.
    """
    out.mkdir(parents=True, exist_ok=True)
    stdin = "".join(f"update {BUNDLE_NS}{b} {sha}\n" for b, sha in sorted(want.items()))
    subprocess.run(["git", "update-ref", "--stdin"], cwd=root, input=stdin, text=True, check=True)
    try:
        outside = [b for b, sha in sorted(want.items()) if not is_ancestor(root, sha, up_main)]
        (out / BUNDLE).unlink(missing_ok=True)
        if outside:
            git(root, "bundle", "create", "-q", str(out / BUNDLE),
                *[BUNDLE_NS + b for b in outside], "--not", up_main)
        dump(out / BUNDLE_INDEX, {"upstream_main": up_main, "refs": want,
                                  "restore": f"git fetch {BUNDLE} '{BUNDLE_NS}*:refs/heads/*'"})
        return len(outside)
    finally:
        stdin = "".join(f"delete {BUNDLE_NS}{b}\n" for b in want)
        subprocess.run(["git", "update-ref", "--stdin"], cwd=root, input=stdin, text=True, check=True)


def bundled(root: Path, meta: Path | None) -> dict[str, str]:
    """archive ref -> sha the meta directory's bundle can restore, after `git bundle verify`."""
    if meta is None or not (meta / BUNDLE_INDEX).is_file():
        return {}
    index = json.loads((meta / BUNDLE_INDEX).read_text())
    out = {b: sha for b, sha in index["refs"].items() if is_ancestor(root, sha, "HEAD")}
    if (meta / BUNDLE).is_file():
        git(root, "bundle", "verify", "-q", str(meta / BUNDLE))
        for line in git(root, "bundle", "list-heads", str(meta / BUNDLE)).splitlines():
            sha, _, ref = line.partition(" ")
            if ref.startswith(BUNDLE_NS):
                out[ref[len(BUNDLE_NS):]] = sha
    return out


# ------------------------------------------------------------------ export

PR_FIELDS = """
  id number title body state isDraft url createdAt updatedAt closedAt mergedAt
  author { login } baseRefName headRefName headRefOid baseRefOid
  mergeCommit { oid }
  labels(first: 50) { nodes { name } }
  comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { %(comment)s } }
  reviews(first: 50) { pageInfo { hasNextPage endCursor } nodes { %(review)s } }
  reviewThreads(first: 50) { pageInfo { hasNextPage endCursor } nodes { %(thread)s } }
"""
ISSUE_FIELDS = """
  id number title body state stateReason url createdAt updatedAt closedAt
  author { login }
  labels(first: 50) { nodes { name } }
  comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { %(comment)s } }
"""
COMMENT = "author { login } body createdAt updatedAt url"
REVIEW = "author { login } state body submittedAt url commit { oid }"
REVIEW_COMMENT = "author { login } body createdAt updatedAt url path line originalLine diffHunk"
THREAD = ("id isResolved isOutdated path line "
          "comments(first: 50) { pageInfo { hasNextPage endCursor } nodes { %s } }" % REVIEW_COMMENT)
NODE_FIELDS = {"comment": COMMENT, "review": REVIEW, "thread": THREAD}
# connection -> (type it hangs off, node fields), for draining pages past the first.
CONNECTIONS = {
    ("PullRequest", "comments"): COMMENT,
    ("PullRequest", "reviews"): REVIEW,
    ("PullRequest", "reviewThreads"): THREAD,
    ("Issue", "comments"): COMMENT,
    ("PullRequestReviewThread", "comments"): REVIEW_COMMENT,
}
PAGE = {"pullRequests": 20, "issues": 50}
REPO_FIELDS = ("description homepageUrl createdAt pushedAt stargazerCount forkCount "
               "isArchived repositoryTopics(first: 20) { nodes { topic { name } } }")


Query = Callable[[str, dict[str, Any]], dict[str, Any]]


def github_query(token: str) -> Query:
    def run(query: str, variables: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps({"query": query, "variables": variables}).encode()
        req = urllib.request.Request(GRAPHQL, data=body, headers={
            "Authorization": f"bearer {token}", "Content-Type": "application/json",
            "User-Agent": "oss-monorepo-research-archive"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = json.load(resp)
        except urllib.error.URLError as exc:
            raise ArchiveError(f"GitHub GraphQL: {exc}") from exc
        if payload.get("errors"):
            raise ArchiveError(f"GraphQL: {payload['errors']}")
        return payload["data"]
    return run


def drain(query: Query, node: dict[str, Any], typename: str) -> None:
    """Fetch every page past the first of each connection on `node`, in place."""
    for (owner_type, field), fields in CONNECTIONS.items():
        if owner_type != typename or field not in node:
            continue
        conn = node[field]
        while conn["pageInfo"]["hasNextPage"]:
            q = ("query($id: ID!, $after: String) { node(id: $id) { ... on %s { "
                 "%s(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { %s } } } } }"
                 % (owner_type, field, fields))
            page = query(q, {"id": node["id"], "after": conn["pageInfo"]["endCursor"]})["node"][field]
            conn["nodes"].extend(page["nodes"])
            conn["pageInfo"] = page["pageInfo"]
        if field == "reviewThreads":
            for thread in conn["nodes"]:
                drain(query, thread, "PullRequestReviewThread")


def flatten(node: Any) -> Any:
    """{nodes: [...], pageInfo} -> [...], recursively, once every page is in."""
    if isinstance(node, dict):
        if "nodes" in node and set(node) <= {"nodes", "pageInfo"}:
            return [flatten(n) for n in node["nodes"]]
        return {k: flatten(v) for k, v in node.items() if k != "id"}
    if isinstance(node, list):
        return [flatten(n) for n in node]
    return node


def fetch_all(query: Query, kind: str, owner: str = OWNER, name: str = NAME) -> list[dict[str, Any]]:
    """Every pull request or issue upstream, with every comment, review and thread."""
    fields = (PR_FIELDS if kind == "pullRequests" else ISSUE_FIELDS) % NODE_FIELDS
    typename = "PullRequest" if kind == "pullRequests" else "Issue"
    q = ("query($owner: String!, $name: String!, $after: String) { repository(owner: $owner, name: $name) { "
         "%s(first: %d, after: $after, orderBy: {field: CREATED_AT, direction: ASC}) { "
         "pageInfo { hasNextPage endCursor } nodes { %s } } } }" % (kind, PAGE[kind], fields))
    out, after = [], None
    while True:
        conn = query(q, {"owner": owner, "name": name, "after": after})["repository"][kind]
        for node in conn["nodes"]:
            drain(query, node, typename)
            out.append(flatten(node))
        if not conn["pageInfo"]["hasNextPage"]:
            return out
        after = conn["pageInfo"]["endCursor"]


def fetch_index(query: Query, kind: str, owner: str = OWNER, name: str = NAME) -> dict[int, dict[str, str]]:
    """number -> {updatedAt, state} for every pull request or issue: the cheap listing `ready` compares."""
    q = ("query($owner: String!, $name: String!, $after: String) { repository(owner: $owner, name: $name) { "
         "%s(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { number updatedAt state } } } }"
         % kind)
    out, after = {}, None
    while True:
        conn = query(q, {"owner": owner, "name": name, "after": after})["repository"][kind]
        for n in conn["nodes"]:
            out[n["number"]] = {"updatedAt": n["updatedAt"], "state": n["state"]}
        if not conn["pageInfo"]["hasNextPage"]:
            return out
        after = conn["pageInfo"]["endCursor"]


def dump(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n")


def cell(text: str) -> str:
    return (text or "").replace("|", "\\|").replace("\n", " ")


def write_export(out: Path, repo: dict[str, Any], pulls: list[dict[str, Any]],
                 issues: list[dict[str, Any]], archived: dict[str, str]) -> None:
    for sub in ("pulls", "issues"):
        for old in (out / sub).glob("*.json") if (out / sub).is_dir() else ():
            old.unlink()
    dump(out / "repo.json", repo)
    for pr in pulls:
        dump(out / "pulls" / f"{pr['number']}.json", pr)
    for issue in issues:
        dump(out / "issues" / f"{issue['number']}.json", issue)

    lines = [f"# {OWNER}/{NAME}, archived", "",
             f"Every pull request and issue from <https://github.com/{OWNER}/{NAME}>, with "
             "comments, reviews and review threads, as JSON. Written by "
             "`platform/ci/research_archive.py export` on `main`; `READY.md` says whether the "
             "upstream repository can be deleted without losing anything here.", "",
             f"Upstream branch `<name>` is the branch `{BRANCH_PREFIX}<name>` in this repository. "
             f"A pull request head no branch contains is `{PULL_PREFIX}<number>`.", "",
             f"## Pull requests ({len(pulls)})", "",
             "| # | State | Title | Head | Data |", "|---|---|---|---|---|"]
    for pr in sorted(pulls, key=lambda p: -p["number"]):
        n = pr["number"]
        state = "MERGED" if pr.get("mergedAt") else pr["state"]
        branch = BRANCH_PREFIX + pr["headRefName"]
        if archived.get(branch) != pr["headRefOid"]:
            branch = f"{PULL_PREFIX}{n}" if f"{PULL_PREFIX}{n}" in archived else ""
        head = f"`{branch}`" if branch else f"`{pr['headRefOid'][:12]}`"
        lines.append(f"| {n} | {state} | {cell(pr['title'])} | {head} | [json](pulls/{n}.json) |")
    lines += ["", f"## Issues ({len(issues)})", ""]
    if issues:
        lines += ["| # | State | Title | Data |", "|---|---|---|---|"]
        lines += [f"| {i['number']} | {i['state']} | {cell(i['title'])} | [json](issues/{i['number']}.json) |"
                  for i in sorted(issues, key=lambda i: -i["number"])]
    else:
        lines.append("None.")
    (out / "INDEX.md").write_text("\n".join(lines) + "\n")


def export(query: Query, out: Path, archived: dict[str, str]) -> tuple[int, int]:
    repo = query("query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { %s } }"
                 % REPO_FIELDS, {"owner": OWNER, "name": NAME})["repository"]
    pulls = fetch_all(query, "pullRequests")
    issues = fetch_all(query, "issues")
    write_export(out, flatten(repo), pulls, issues, archived)
    return len(pulls), len(issues)


# ------------------------------------------------------------------- ready

def exported(meta: Path, kind: str) -> dict[int, str]:
    """number -> updatedAt for what the export holds."""
    sub = meta / ("pulls" if kind == "pullRequests" else "issues")
    out = {}
    for path in sub.glob("*.json") if sub.is_dir() else ():
        data = json.loads(path.read_text())
        out[data["number"]] = data["updatedAt"]
    return out


def check_export(listing: dict[int, dict[str, str]], have: dict[int, str], label: str) -> list[str]:
    problems = []
    absent = sorted(set(listing) - set(have))
    stale = sorted(n for n in set(listing) & set(have) if have[n] != listing[n]["updatedAt"])
    if absent:
        problems.append(f"{len(absent)} {label} not exported: {', '.join(map(str, absent[:10]))}")
    if stale:
        problems.append(f"{len(stale)} {label} changed since the export: {', '.join(map(str, stale[:10]))}")
    still_open = sorted(n for n, v in listing.items() if v["state"] == "OPEN")
    if still_open:
        problems.append(f"{len(still_open)} {label} still open upstream: "
                        f"{', '.join('#%d' % n for n in still_open)} (merge, close or move each one)")
    return problems


def is_ancestor(root: Path, a: str, b: str) -> bool:
    return subprocess.run(["git", "merge-base", "--is-ancestor", a, b], cwd=root,
                          capture_output=True).returncode == 0


def main_check(root: Path, up_main: str) -> dict[str, Any]:
    """Upstream main, and so all of its history, is part of this repository's history.

    Content is not compared: research/ was proven a byte-exact copy at each
    mirror sync, and after the cut-over work lands here and the two diverge.
    """
    ok = is_ancestor(root, up_main, "HEAD")
    return {"name": "main history", "ok": ok,
            "detail": f"upstream main {up_main[:12]} is in this repository's history" if ok else
            f"upstream main {up_main[:12]} is not in this repository's history: merge it "
            "(with a merge commit, never a squash) before deleting upstream"}


def ready(root: Path, upstream: str, origin: str, query: Query | None, meta: Path | None) -> list[dict[str, Any]]:
    """Each check as {name, ok, detail}. Ready means every one is ok."""
    checks = []

    want, todo = archive_branches(root, upstream, origin, do_push=False)
    heads, _ = upstream_refs(root, upstream)
    checks.append(main_check(root, heads["main"]))
    in_bundle = bundled(root, meta)
    lost = {b: sha for b, sha in todo.items() if in_bundle.get(b) != sha}
    checks.append({"name": "branches", "ok": not lost,
                   "detail": (f"{len(lost)} neither a branch here nor in {BUNDLE} at their upstream tip, e.g. "
                              f"{', '.join(sorted(lost)[:5])}: run the Research archive workflow") if lost
                   else f"all {len(want)} upstream branches and orphaned pull request heads are kept at "
                        f"their current tips: {len(want) - len(todo)} as archive/ branches here, "
                        f"{len(todo)} only in {BUNDLE} on {META_BRANCH}"})

    if query is None or meta is None:
        checks.append({"name": "pull requests and issues", "ok": False,
                       "detail": "not checked: needs GITHUB_TOKEN and --meta <export dir>"})
    else:
        problems = []
        for kind, label in (("pullRequests", "pull requests"), ("issues", "issues")):
            problems += check_export(fetch_index(query, kind), exported(meta, kind), label)
        checks.append({"name": "pull requests and issues", "ok": not problems,
                       "detail": "; ".join(problems) or
                       f"all {len(exported(meta, 'pullRequests'))} pull requests and "
                       f"{len(exported(meta, 'issues'))} issues exported at their latest update; none open"})
    return checks


def record(out: Path, checks: list[dict[str, Any]], now: str) -> bool:
    ok = all(c["ok"] for c in checks)
    dump(out / "READY.json", {"checked_at": now, "ready": ok, "checks": checks,
                              "not_carried": list(NOT_CARRIED)})
    lines = [f"# Can {NAME} be deleted?", "",
             f"**{'Yes' if ok else 'Not yet'}** (checked {now} by `platform/ci/research_archive.py ready`).", ""]
    lines += [f"- {'✅' if c['ok'] else '❌'} **{c['name']}**: {c['detail']}" for c in checks]
    lines += ["", "Lost on deletion whatever this says, because nothing can copy them:", ""]
    lines += [f"- {item}" for item in NOT_CARRIED]
    (out / "READY.md").write_text("\n".join(lines) + "\n")
    return ok


def status(root: Path, origin: str) -> int:
    git(root, "fetch", "-q", origin, f"+refs/heads/{META_BRANCH}:refs/remotes/origin/{META_BRANCH}")
    data = json.loads(git(root, "show", f"refs/remotes/origin/{META_BRANCH}:READY.json"))
    print(f"{'READY' if data['ready'] else 'NOT READY'} to delete {OWNER}/{NAME} "
          f"(checked {data['checked_at']})")
    for c in data["checks"]:
        print(f"  {'ok  ' if c['ok'] else 'FAIL'} {c['name']}: {c['detail']}")
    return 0 if data["ready"] else 1


# -------------------------------------------------------------------- main

def token_query() -> Query | None:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    return github_query(token) if token else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--upstream", default=UPSTREAM_URL)
    parser.add_argument("--origin", default="origin")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("branches", help="archive every upstream branch here")
    p.add_argument("--push", action="store_true", help="push what is missing (otherwise list it)")
    p = sub.add_parser("bundle", help="write every upstream branch to <dir>/branches.bundle")
    p.add_argument("out", type=Path)
    p = sub.add_parser("export", help="write pull requests, reviews and issues as JSON")
    p.add_argument("out", type=Path)
    p = sub.add_parser("ready", help="exit 0 only if deleting upstream would lose nothing keepable")
    p.add_argument("--meta", type=Path, help="the export directory to compare")
    p.add_argument("--record", type=Path, help="write READY.json and READY.md here")
    sub.add_parser("status", help="print the verdict last recorded on the meta branch")
    args = parser.parse_args(argv)
    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    try:
        if args.cmd == "branches":
            want, todo = archive_branches(root, args.upstream, args.origin, args.push)
            for branch, sha in sorted(todo.items()):
                print(f"not a branch here: {branch} {sha[:12]}")
            print(f"{len(want) - len(todo)} of {len(want)} archive refs are branches here"
                  + ("; `bundle` keeps the rest" if todo else ""))
            return 0
        if args.cmd == "bundle":
            heads, _ = upstream_refs(root, args.upstream)
            want, _ = archive_branches(root, args.upstream, args.origin, do_push=False)
            n = write_bundle(root, args.out, want, heads["main"])
            print(f"bundled {n} of {len(want)} archive refs to {args.out / BUNDLE} "
                  f"(the other {len(want) - n} are already in main's history)")
            return 0
        if args.cmd == "export":
            query = token_query()
            if query is None:
                raise ArchiveError("export needs GITHUB_TOKEN (GraphQL has no anonymous access)")
            n_pr, n_issue = export(query, args.out, archived_refs(root, args.origin))
            print(f"exported {n_pr} pull requests and {n_issue} issues to {args.out}")
            return 0
        if args.cmd == "status":
            return status(root, args.origin)
        checks = ready(root, args.upstream, args.origin, token_query(), args.meta)
    except ArchiveError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    ok = all(c["ok"] for c in checks)
    if args.record:
        record(args.record, checks, now)
    print(f"{'READY' if ok else 'NOT READY'} to delete {OWNER}/{NAME}")
    for c in checks:
        print(f"  {'ok  ' if c['ok'] else 'FAIL'} {c['name']}: {c['detail']}")
    print("Lost whatever this says: " + "; ".join(NOT_CARRIED))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
