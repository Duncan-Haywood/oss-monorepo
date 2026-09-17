#!/usr/bin/env python3
"""Fail if a branch removes a live venture from the served catalogue.

Why this exists
---------------
Measured 2026-09-07. PR #3740 was opened by an unattended agent two minutes
after #3727 merged, and it deleted #3727's entire venture:

    .github/workflows/pinned-actions-check-ci.yml | 47 ------
    infra/OWNER_CHECKLIST.md                      |  4 +-
    platform/ci/publish-surface.yaml              |  3 ---
    portfolio/ledger/2026-09.yaml                 | 99 ------
    portfolio/scoring/venture-scores.yaml         | 57 ------
    ventures/pinned-actions-check/*               | ~1600 lines

plus the whole `pinned-actions-check` tree -- a 263-line checker, 620 lines of
passing tests, a landing page and a guide page. Nothing signalled a rollback:
the commit message was the generic `[agent] find something worth doing`, and
the brief it answered (#3738) asked for a *new* venture.

The cause is mechanical and will recur. The commit's parent was #3727's merge
commit but its *tree* predated it -- a working tree captured before #3727
landed, committed onto the new tip. `regen.mjs` then faithfully re-rendered
every generated artifact for a catalogue of 197 tools instead of 198, which is
why the diff read `+84 -1985` across 833 files. With up to four sessions inside
a 15-minute window here (`portfolio/ledger/session_gate.py`), a branch whose
tree is older than its parent is the ordinary case, not the exotic one.

What makes this dangerous rather than merely wrong is how it reads. A revert
arrives as *deletions of code plus insertions of prose*, and the insertions are
counter decrements in generated files:

    branch  <p><a href="/">All 197 tools</a> - ...
    base    <p><a href="/">All 198 tools</a> - ...

Skim the diff and it looks like a regeneration. `supersede_check.py` does flag
the shape (STALE DRAFT / RENAME SUSPECTED), but only when a human thinks to run
it against a PR number -- and this repository already records three separate
occasions where the thing that found a defect was "a session that happened to
look" rather than anything that asks. Every existing guard was green on #3740:
tests only assert about files that are *present*, so deleting a venture and its
tests together removes the assertions along with the product.

What is checked
---------------
Two registries, compared between a base ref and a head:

1.  `ventures/<slug>/VENTURE.yaml` -- what makes a venture routable at all
    (`portfolio/pipeline/README.md`).
2.  `platform/pages/launched.json` -- the served catalogue. Its 198 entries are
    the "198 tools" every generated surface counts, so a slug leaving it is a
    tool leaving the front door.

A slug present in the base and absent in the head fails the check.

This deliberately asserts about *disappearance*, not about counts going down.
A count is a summary and it can be wrong in both directions; a named slug that
was routable and now is not is a fact with a name attached, which is what the
failure message needs in order to be actionable.

Deliberate removals still pass, two ways:

*   `ventures/<slug>/RETIRED.md` in the head. Retiring a shipped product is
    rare and should leave a reviewable artifact saying why -- a file in the
    diff does that where a flag in a CI invocation does not.
*   An exact rename. If the removed `VENTURE.yaml` blob is byte-identical to
    one that appears under a new slug, that is a directory move and not a
    withdrawal, so it passes and is reported as a rename.

Anything else needs `--allow <slug>`, which exists for the case the two rules
above do not cover (a slug rename that also edits `VENTURE.yaml`) and which
forces the removal to be typed out on purpose.

Run it locally the same way CI does:

    python3 platform/ci/check_venture_regression.py

Before a push, that compares your working tree against `origin/main`. In CI it
runs against the PR head. Exit 0 clean, 1 on a regression, 2 if it could not
run -- a shallow clone has no `origin/main` to compare against, and "nothing
ran" must never read as a pass.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

VENTURES_DIR = "ventures"
VENTURE_MANIFEST = "VENTURE.yaml"
LAUNCHED_JSON = "platform/pages/launched.json"
RETIRED_MARKER = "RETIRED.md"

EXIT_OK = 0
EXIT_REGRESSION = 1
EXIT_UNRUN = 2


class Unrun(Exception):
    """The check could not be performed. Never reported as a pass."""


def _git(*args: str) -> str:
    result = subprocess.run(
        ("git", *args),
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise Unrun(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def _ref_exists(ref: str) -> bool:
    return (
        subprocess.run(
            ("git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"),
            cwd=REPO_ROOT,
            capture_output=True,
        ).returncode
        == 0
    )


def _ancestry(head: str, base: str) -> str:
    """Is `head` strictly behind `base`? -> "behind" | "diverged" | "unknown".

    This is the one case where every "removal" this checker finds is an
    artifact rather than a finding: if the base contains your head's whole
    history plus more, a venture the base gained after your checkout is simply
    absent from your tree, and reads here as a disappearance.

    "unknown" is not a rounding of "diverged", and the difference is the whole
    reason this returns three values instead of a bool. A **shallow** clone --
    which is what a web session gets, and therefore the ordinary environment
    for `run_workflow_locally.py --tree` -- has grafted commits with no
    recorded parents, so `--is-ancestor` cannot prove ancestry and exits
    nonzero for "no" and "cannot tell" alike. A bool would collapse those,
    and this guard would then be correct and permanently inert in the one
    environment it was written for: the "a guard nobody runs is worth less
    than no guard" defect CLAUDE.md records five times over.
    """
    try:
        head_sha = _git("rev-parse", f"{head}^{{commit}}").strip()
        base_sha = _git("rev-parse", f"{base}^{{commit}}").strip()
    except Unrun:
        return "unknown"
    if head_sha == base_sha:
        return "diverged"  # identical: nothing to explain away
    # `--is-ancestor` answers with its exit status, so it cannot go through
    # `_git`, which treats a nonzero status as a failure to run at all.
    if (
        subprocess.run(
            ("git", "merge-base", "--is-ancestor", head_sha, base_sha),
            cwd=REPO_ROOT,
            capture_output=True,
        ).returncode
        == 0
    ):
        return "behind"
    # Nonzero means either a genuine divergence or an unanswerable question.
    # A missing merge base in a shallow clone is the latter.
    merge_base = subprocess.run(
        ("git", "merge-base", head_sha, base_sha),
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if merge_base.returncode != 0 or not merge_base.stdout.strip():
        return "unknown"
    return "diverged"


def ventures_at_ref(ref: str) -> dict[str, str]:
    """Map slug -> VENTURE.yaml blob hash, as of `ref`."""
    out = _git("ls-tree", "-r", ref, "--", f"{VENTURES_DIR}/")
    ventures: dict[str, str] = {}
    for line in out.splitlines():
        # "<mode> <type> <object>\t<path>"
        meta, _, path = line.partition("\t")
        parts = path.split("/")
        if len(parts) != 3 or parts[2] != VENTURE_MANIFEST:
            continue
        ventures[parts[1]] = meta.split()[2]
    return ventures


def ventures_in_worktree() -> dict[str, str]:
    """Same map, read from the working tree rather than from a ref."""
    ventures: dict[str, str] = {}
    for manifest in sorted((REPO_ROOT / VENTURES_DIR).glob(f"*/{VENTURE_MANIFEST}")):
        blob = _git("hash-object", "--", str(manifest)).strip()
        ventures[manifest.parent.name] = blob
    return ventures


def _read_at_ref(ref: str, path: str) -> str | None:
    result = subprocess.run(
        ("git", "show", f"{ref}:{path}"),
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    return result.stdout if result.returncode == 0 else None


def _parse_launched(raw: str | None, where: str) -> set[str]:
    if raw is None:
        return set()
    try:
        return set(json.loads(raw).get("launched", {}))
    except (json.JSONDecodeError, AttributeError) as exc:
        raise Unrun(f"{LAUNCHED_JSON} at {where} is not readable JSON: {exc}") from exc


def launched_at_ref(ref: str) -> set[str]:
    return _parse_launched(_read_at_ref(ref, LAUNCHED_JSON), ref)


def launched_in_worktree() -> set[str]:
    path = REPO_ROOT / LAUNCHED_JSON
    raw = path.read_text() if path.exists() else None
    return _parse_launched(raw, "the working tree")


def retired_at_head(slug: str, head: str | None) -> bool:
    """True if the head declares this venture deliberately retired."""
    marker = f"{VENTURES_DIR}/{slug}/{RETIRED_MARKER}"
    if head is None:
        return (REPO_ROOT / marker).exists()
    return _read_at_ref(head, marker) is not None


def find_regressions(base: str, head: str | None, allowed: set[str]) -> tuple[list[dict], list[dict]]:
    """Return (regressions, renames).

    `head=None` means the working tree, which is what a pre-push run wants.
    """
    base_ventures = ventures_at_ref(base)
    head_ventures = ventures_in_worktree() if head is None else ventures_at_ref(head)

    base_launched = launched_at_ref(base)
    head_launched = launched_in_worktree() if head is None else launched_at_ref(head)

    if not base_ventures and not base_launched:
        raise Unrun(
            f"{base} carries no ventures and no {LAUNCHED_JSON}. That is not a "
            "catalogue to compare against -- check the base ref."
        )

    # A blob that moved to a new slug is a rename, not a withdrawal.
    appeared = {
        blob: slug
        for slug, blob in head_ventures.items()
        if slug not in base_ventures
    }

    regressions: list[dict] = []
    renames: list[dict] = []

    for slug in sorted(set(base_ventures) | base_launched):
        gone_manifest = slug in base_ventures and slug not in head_ventures
        gone_launched = slug in base_launched and slug not in head_launched
        if not (gone_manifest or gone_launched):
            continue

        if gone_manifest and base_ventures[slug] in appeared:
            renames.append({"slug": slug, "to": appeared[base_ventures[slug]]})
            continue

        if slug in allowed:
            continue
        if retired_at_head(slug, head):
            continue

        lost = []
        if gone_manifest:
            lost.append(f"{VENTURES_DIR}/{slug}/{VENTURE_MANIFEST}")
        if gone_launched:
            lost.append(f"{LAUNCHED_JSON} entry")
        regressions.append({"slug": slug, "lost": lost})

    return regressions, renames


def report(
    regressions: list[dict],
    renames: list[dict],
    base: str,
    head: str | None,
    ancestry: str = "diverged",
) -> None:
    where = "the working tree" if head is None else head
    print(f"Venture regression check -- {where} against {base}\n")

    for rename in renames:
        print(f"  rename   {rename['slug']} -> {rename['to']}  (identical manifest; not a removal)")
    if renames:
        print()

    if not regressions:
        print("  No live venture disappears. OK.")
        return

    plural = "venture" if len(regressions) == 1 else "ventures"
    print(f"  {len(regressions)} live {plural} removed by this change:\n")
    for item in regressions:
        print(f"    {item['slug']}")
        for lost in item["lost"]:
            print(f"      - loses {lost}")
    if ancestry == "unknown":
        print(
            "\n  CANNOT TELL WHETHER YOUR TREE IS SIMPLY BEHIND THE BASE.\n"
            "  This clone is shallow (or the two share no recorded history), so\n"
            "  `git merge-base --is-ancestor` cannot answer it. If your checkout\n"
            "  predates the base -- the ordinary case when `main` moves during a\n"
            f"  ~20-minute `--tree` sweep -- then the {plural} above never\n"
            "  disappeared: the base gained it after you checked out.\n"
            "  Settle it with:\n"
            "      git fetch --unshallow && git fetch origin main\n"
            "  then re-run. Until then this stays exit 1 rather than passing,\n"
            "  because an unproven removal is not a proven safe one."
        )
    print(
        "\n  A venture in the base is a product a stranger can open today. If this\n"
        "  removal is not deliberate, your tree is older than its parent commit:\n"
        "    git fetch origin main && git merge origin/main\n"
        "    node platform/marketing/regen.mjs\n"
        "  and re-check. That is the shape PR #3740 had -- see this file's docstring.\n"
        "\n  If it IS deliberate, say so in the diff:\n"
        f"    ventures/<slug>/{RETIRED_MARKER}   (preferred -- reviewable, and explains why)\n"
        "    --allow <slug>                    (for a rename that also edits VENTURE.yaml)"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--base",
        default="origin/main",
        help="ref the change is measured against (default: origin/main)",
    )
    parser.add_argument(
        "--head",
        default=None,
        help="ref to check (default: the working tree)",
    )
    parser.add_argument(
        "--allow",
        action="append",
        default=[],
        metavar="SLUG",
        help="permit this slug to disappear; repeatable",
    )
    args = parser.parse_args(argv)

    try:
        if not _ref_exists(args.base):
            raise Unrun(
                f"base ref {args.base!r} does not exist here. A shallow or filtered\n"
                "clone often lacks it -- run:  git fetch origin main"
            )
        if args.head is not None and not _ref_exists(args.head):
            raise Unrun(f"head ref {args.head!r} does not exist here.")
        regressions, renames = find_regressions(args.base, args.head, set(args.allow))
        ancestry = _ancestry(args.head or "HEAD", args.base) if regressions else "diverged"
        if ancestry == "behind":
            raise Unrun(
                f"every removal below is an artifact: {args.head or 'HEAD'} is an\n"
                f"ancestor of {args.base}, so your checkout is strictly BEHIND the\n"
                "base rather than removing anything from it. A venture the base\n"
                "gained after you checked out reads here as one you deleted.\n"
                "\n"
                "  would have reported: "
                + ", ".join(item["slug"] for item in regressions)
                + "\n\n"
                "Re-run after:  git fetch origin main && git merge origin/main"
            )
    except Unrun as exc:
        print(f"UNRUN: {exc}", file=sys.stderr)
        print(
            "This check did not run, which is not the same as passing.",
            file=sys.stderr,
        )
        return EXIT_UNRUN

    report(regressions, renames, args.base, args.head, ancestry=ancestry)
    return EXIT_REGRESSION if regressions else EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
