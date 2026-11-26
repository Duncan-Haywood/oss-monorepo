#!/usr/bin/env python3
"""Check and fix a drizzle-kit migration number another run took first.

Parallel ventures runs on one private-monorepo app each generate the next
migration, `0070_x.sql`, and the second to merge collides: same number, plus a
conflict in `migrations/meta/_journal.json` and an add/add on `0070_snapshot.json`.
Renaming the file does not fix it, since drizzle's snapshot chain and journal
then disagree. About twenty run records from 2026-11-25..26 hit this and worked
out the same recipe by hand: take main's `migrations/` as it stands, drop your own
migration, and run `drizzle-kit generate` again on the merged schema.

    python3 platform/ci/migration_regen.py apps/payapps            # check (exit 1 on a clash)
    git merge origin/main                                          # conflicts in migrations/meta are expected
    python3 platform/ci/migration_regen.py apps/payapps --fix      # regenerate as the next number

Paths are relative to --repo (default /home/user/private-monorepo). The check
fetches `origin/main` (skip with --no-fetch) and compares the migrations your
branch adds with the ones main has: a clash is a number main already uses, or one
at or below main's newest.

--fix works during a merge with conflicts or after one. It saves your migration
SQL to a backup folder, sets `migrations/` to exactly main's, runs
`pnpm exec drizzle-kit generate --name <your migration's name>` in the app
(--generate-cmd overrides it), stages `migrations/`, and diffs the new SQL against
the old: drizzle only writes what the schema implies, so a hand-written backfill or
edited default shows up there and must be added back by hand. Resolve conflicts
outside `migrations/` (schema files) before --fix, since generate reads them.

Exit codes: 0 ok (or fixed), 1 a clash (check) or the SQL changed (fix: read
the diff), 2 usage, git or generate error.
"""
from __future__ import annotations

import argparse
import difflib
import re
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

NUM = re.compile(r"^(\d{4})_(.+)\.sql$")


def git(repo: Path, *args: str, check: bool = True) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def base_files(repo: Path, base: str, mig: str) -> list[str]:
    """File names directly under `mig` in the base tree."""
    out = git(repo, "ls-tree", "--name-only", f"{base}:{mig}", check=False)
    return [n for n in out.splitlines() if n.endswith(".sql")]


def work_files(repo: Path, mig: str) -> list[str]:
    d = repo / mig
    return sorted(p.name for p in d.glob("*.sql")) if d.is_dir() else []


def numbered(names: list[str]) -> dict[str, str]:
    """{file: number} for drizzle-style NNNN_name.sql files."""
    return {n: m.group(1) for n in names if (m := NUM.match(n))}


def analyse(repo: Path, app: str, base: str) -> dict:
    mig = f"{app.rstrip('/')}/migrations"
    if not (repo / mig).is_dir():
        raise RuntimeError(f"{repo / mig} is not a directory (is {app} a drizzle app?)")
    theirs = numbered(base_files(repo, base, mig))
    mine_all = numbered(work_files(repo, mig))
    ours = {n: num for n, num in mine_all.items() if n not in theirs}
    top = max(theirs.values(), default="0000")
    used = set(theirs.values())
    clashes = sorted(n for n, num in ours.items() if num in used or num <= top)
    return {"mig": mig, "theirs": theirs, "ours": ours, "top": top, "clashes": clashes}


def check(info: dict, base: str) -> int:
    ours, top = info["ours"], info["top"]
    if not ours:
        print(f"ok: your branch adds no migration under {info['mig']} ({base} is at {top}).")
        return 0
    if not info["clashes"]:
        print(f"ok: {', '.join(sorted(ours))} follow {base}'s newest ({top}).")
        return 0
    for n in info["clashes"]:
        same = [t for t, num in info["theirs"].items() if num == info["ours"][n]]
        print(f"CLASH: your {n}; {base} has {', '.join(same) or 'a newer ' + top}"
              f" (newest {top}).")
    print("Merge main (conflicts in migrations/meta are expected), resolve the rest, then\n"
          "run this again with --fix.")
    return 1


def fix(repo: Path, app: str, base: str, info: dict, generate_cmd: str | None) -> int:
    mig = info["mig"]
    ours = sorted(info["ours"])
    if not ours:
        print(f"nothing to do: your branch adds no migration under {mig}.")
        return 0
    unmerged = [p for p in git(repo, "diff", "--name-only", "--diff-filter=U").split()
                if not p.startswith(mig + "/")]
    if unmerged:
        print("Resolve these conflicts first (generate reads the schema):\n  " + "\n  ".join(unmerged))
        return 2
    backup = Path(tempfile.mkdtemp(prefix="migration-regen-"))
    old_sql = ""
    for n in ours:
        text = (repo / mig / n).read_text()
        (backup / n).write_text(text)
        old_sql += text
    name = NUM.match(ours[-1]).group(2)
    # migrations/ becomes exactly main's: its journal and snapshots, none of ours.
    git(repo, "rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", mig)
    for p in (repo / mig).rglob("*"):
        if p.is_file():
            p.unlink()
    git(repo, "checkout", base, "--", mig)
    cmd = (generate_cmd or "pnpm exec drizzle-kit generate --name {name}").replace("{name}", shlex.quote(name))
    print(f"saved {', '.join(ours)} to {backup}; running `{cmd}` in {app}")
    r = subprocess.run(cmd, shell=True, cwd=repo / app)
    if r.returncode != 0:
        print(f"generate failed (exit {r.returncode}); your SQL is in {backup}. "
              f"`git checkout {base} -- {mig}` leaves migrations/ as main's.")
        return 2
    git(repo, "add", "-A", "--", mig)
    new = sorted(set(work_files(repo, mig)) - set(info["theirs"]))
    if not new:
        print("generate wrote no migration: main already has your schema change? "
              f"Your old SQL is in {backup}.")
        return 1
    new_sql = "".join((repo / mig / n).read_text() for n in new)
    print(f"regenerated as {', '.join(new)} after {base}'s {info['top']}; staged {mig}.")
    if new_sql.split() == old_sql.split():
        print("SQL unchanged apart from the number.")
        return 0
    sys.stdout.writelines(difflib.unified_diff(
        old_sql.splitlines(True), new_sql.splitlines(True),
        fromfile="your old migration", tofile="regenerated"))
    print("\nThe SQL differs: add back any hand-written statements (a backfill, an edited\n"
          "default) from the old file, or check the difference is main's own change.")
    return 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("app", help="app folder relative to --repo, e.g. apps/payapps")
    ap.add_argument("--repo", default="/home/user/private-monorepo")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--no-fetch", action="store_true", help="do not fetch the base first")
    ap.add_argument("--fix", action="store_true", help="regenerate your migration as the next number")
    ap.add_argument("--generate-cmd", help="command run in the app folder; {name} becomes your migration's name")
    a = ap.parse_args(argv)
    repo = Path(a.repo).resolve()
    try:
        if not a.no_fetch and a.base.startswith("origin/"):
            t = time.time()
            r = subprocess.run(["git", "-C", str(repo), "fetch", "-q", "--depth=50", "origin",
                                f"{a.base[len('origin/'):]}:refs/remotes/{a.base}"],
                               capture_output=True, text=True)
            if r.returncode != 0:
                print(f"fetch failed ({r.stderr.strip()[:200]}); comparing with the {a.base} you have",
                      file=sys.stderr)
            elif time.time() - t > 20:
                print(f"(fetched {a.base} in {time.time() - t:.0f} s)", file=sys.stderr)
        info = analyse(repo, a.app, a.base)
        if a.fix:
            return fix(repo, a.app.rstrip("/"), a.base, info, a.generate_cmd)
        return check(info, a.base)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
