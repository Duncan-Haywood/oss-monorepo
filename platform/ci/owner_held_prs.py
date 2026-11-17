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
    python3 platform/ci/owner_held_prs.py --redteam  # which open red-team entries a held PR fixes
    python3 platform/ci/owner_held_prs.py --friction --days 7  # gated files runs complain about, and their held PRs

`--redteam` exists because on 2026-11-15 three red-team runs each re-checked all
12 entries `prompts/redteam.py open` lists, by hand, and found every one already
fixed in a PR waiting on the owner (doc_friction in their run records). It
matches each entry to held PRs by the PRs it names and the file and identifier
names it mentions (check_x.py, current_approvers) found in a PR's added lines,
and flags entries with no held PR, which are the ones a red-team run can fix.

`--friction` exists because most doc friction lands on owner-gated files: on
2026-11-17, 16 of the 25 files `promptctl.py measure` ranked top were under
`prompts/`, `CLAUDE.md` or `.github/`, and the fix for one of them often
already exists. The creative track prompt still says to pick a shelf from
`git log`, which a shallow clone cannot answer. Runs kept reporting that
through 2026-11-17, two days after `creative_due.py` (PR #16136) answered it
in a tool the prompt does not name. It ranks the owned files by distinct
sessions that reported friction on them in the last `--days`, and lists the
held PRs that change each one. A file with reports and no held PR is a fix
nobody has opened. A file with several is one review that would silence the
most runs.

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
import re
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
            # what the PR adds to its owned files, for --redteam matching (not printed)
            "added": " ".join(b for f in owned for b in added_blocks(f.get("patch") or "")),
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
    lines += ["", "The open PRs no gate holds, which any agent may land: python3 platform/ci/orphan_prs.py"]
    return "\n".join(lines) + "\n"


# --redteam: which open red-team entries already have a fix waiting on the owner.
# Names in an entry's text that point at code: files (check_x.py, framerate.mjs),
# identifiers with an underscore (current_approvers) and PR refs (#15945).
_FILE = re.compile(r"[A-Za-z0-9_.-]+\.(?:py|mjs|js|yml|yaml|json)\b")
_IDENT = re.compile(r"\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b")
# Workflow and record keywords many held PRs add, so they identify nothing.
_GENERIC = {"pull_request", "workflow_dispatch", "pull_request_target", "patched_in", "doc_friction"}
_PR_REF = re.compile(r"(?:PR |#)(\d{3,6})\b")


def entry_tokens(entry: dict) -> list[str]:
    """The distinctive names an open red-team entry mentions, minus the file it is
    filed under (a wiring entry filed under portfolio-validate.yml would otherwise
    match every PR that edits that workflow). A compound file stem (check_x) counts
    too, since a workflow list may add the check without its extension."""
    text = entry.get("issue") or ""
    own = Path(entry.get("file") or "").name
    own_stem = own.rsplit(".", 1)[0] if own else ""
    out: list[str] = []
    for name in _FILE.findall(text):
        stem = name.rsplit(".", 1)[0]
        if name == own or stem == own_stem:
            continue
        out.append(name)
        if "_" in stem or "-" in stem:  # a bare stem ("report") matches too much
            out.append(stem)
    for ident in _IDENT.findall(text):
        if ident != own_stem and ident not in _GENERIC:
            out.append(ident)
    return list(dict.fromkeys(t for t in out if len(t) >= 6))


def match_redteam(entries: list[dict], rows: list[dict]) -> list[dict]:
    """Each open entry with the held PRs that carry its fix: a PR the entry names
    (#n), or one whose title or added lines contain a name the entry mentions.
    Best match (most names) first."""
    by_number = {r["number"]: r for r in rows}
    out = []
    for e in entries:
        tokens = entry_tokens(e)
        named = [int(n) for n in _PR_REF.findall(e.get("issue") or "") if int(n) in by_number]
        hits = []
        for r in rows:
            hay = r["title"] + " " + r.get("added", "")
            found = [t for t in tokens if t in hay]
            if r["number"] in named or found:
                hits.append({"number": r["number"], "names": found, "named": r["number"] in named,
                             "on_main": bool(r["on_main"]) and set(r["on_main"]) == set(r["owned"])})
        hits.sort(key=lambda h: (-h["named"], -len(h["names"]), h["number"]))
        out.append({**e, "held_in": hits})
    return out


def render_redteam(matched: list[dict]) -> str:
    if not matched:
        return "No open red-team entries.\n"
    held_n = sum(1 for m in matched if m["held_in"])
    lines = [f"{len(matched)} open red-team entries (prompts/redteam.py open); "
             f"{held_n} have a fix waiting on the owner in a held PR, "
             f"{len(matched) - held_n} have none and are a red-team run's to fix.", ""]
    for m in matched:
        head = f"- {m['record']} #{m['index']}  {m['file']}"
        if not m["held_in"]:
            lines.append(f"{head}\n    NO HELD PR: fix it (redteam prompt, step 0)")
            continue
        prs = []
        for h in m["held_in"][:3]:
            why = "named in the entry" if h["named"] else ", ".join(h["names"][:3])
            prs.append(f"#{h['number']} ({why}{'; already on main' if h['on_main'] else ''})")
        more = f" +{len(m['held_in']) - 3}" if len(m["held_in"]) > 3 else ""
        lines.append(f"{head}\n    held in {', '.join(prs)}{more}")
    lines += ["", "A held match is a candidate: read the PR before skipping its entry. Once the owner "
                  "merges it, set patched: true and patched_in on the entry."]
    return "\n".join(lines) + "\n"


def load_redteam_open() -> list[dict]:
    """prompts/redteam.py's open list, read without changing that (owner-gated) file."""
    import importlib.util
    path = cpg.REPO_ROOT / "prompts" / "redteam.py"
    spec = importlib.util.spec_from_file_location("redteam", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["redteam"] = mod  # its dataclasses look their module up
    spec.loader.exec_module(mod)
    runs = sorted((cpg.REPO_ROOT / "prompts" / "runs").glob("*.json"))
    return mod.open_defects([(p.name, json.loads(p.read_text())) for p in runs])


def friction_by_owned_file(entries, rules, today: dt.date, days: int) -> list[dict]:
    """Owned files ranked by distinct sessions reporting friction on them within `days`.

    `entries` are friction_rank.load() tuples (date, session, file, issue, when)."""
    since = (today - dt.timedelta(days=days)).isoformat()
    by: dict[str, dict] = {}
    for date, session, file, issue, when in entries:
        if date <= since or not cpg.owners_for(file, rules):
            continue
        row = by.setdefault(file, {"file": file, "sessions": set(), "latest": ("", "")})
        row["sessions"].add(session)
        if when >= row["latest"][0]:
            row["latest"] = (when, issue)
    out = [{"file": r["file"], "sessions": len(r["sessions"]), "latest_when": r["latest"][0],
            "latest": r["latest"][1]} for r in by.values()]
    out.sort(key=lambda r: (-r["sessions"], r["file"]))
    return out


def attach_held(ranked: list[dict], rows: list[dict]) -> list[dict]:
    """Add `prs`: the held PRs whose owned files include each ranked file."""
    for r in ranked:
        r["prs"] = [h["number"] for h in rows if r["file"] in h["owned"]]
    return ranked


def render_friction(ranked: list[dict], days: int, top: int = 25) -> str:
    if not ranked:
        return f"No doc friction on owner-gated files in the last {days} day(s).\n"
    lines = [f"Owner-gated files by doc friction, last {days} day(s) (distinct sessions), "
             "with the held PRs that change each:", "",
             "| sessions | file | held PRs | latest report |", "|---|---|---|---|"]
    for r in ranked[:top]:
        prs = ", ".join(f"#{n}" for n in r["prs"]) or "none open"
        text = r["latest"].replace("|", "/").replace("\n", " ")
        text = text if len(text) <= 140 else text[:139] + "…"
        lines.append(f"| {r['sessions']} | `{r['file']}` | {prs} | {r['latest_when'][:10]}: {text} |")
    none = sum(1 for r in ranked if not r["prs"])
    lines += ["", f"{len(ranked)} owned file(s) drew friction; {none} have no held PR "
              "(read the reports with `promptctl.py measure --section 'doc friction'`; some are by design)."]
    if len(ranked) > top:
        lines.append(f"(+{len(ranked) - top} more not shown)")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true", help="print rows as JSON")
    ap.add_argument("--grep", help="keep PRs whose title or owned files contain this text")
    ap.add_argument("--redteam", action="store_true",
                    help="match each open red-team entry to the held PR that carries its fix")
    ap.add_argument("--friction", action="store_true",
                    help="rank owned files by recent doc friction, with the held PRs that change each")
    ap.add_argument("--days", type=int, default=7, help="with --friction: how far back to count (default 7)")
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
    if args.redteam:
        matched = match_redteam(load_redteam_open(), rows)
        print(json.dumps(matched, indent=2) if args.json else render_redteam(matched), end="\n" if args.json else "")
        return 0
    if args.friction:
        import friction_rank
        ranked = attach_held(friction_by_owned_file(friction_rank.load(), rules,
                                                    dt.datetime.now(dt.timezone.utc).date(), args.days), rows)
        print(json.dumps(ranked, indent=2) if args.json else render_friction(ranked, args.days), end="\n" if args.json else "")
        return 0
    for r in rows:
        r.pop("added", None)
    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        print(render(rows, dt.datetime.now(dt.timezone.utc)), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
