#!/usr/bin/env python3
"""Renumber a branch's drizzle migrations after main took the same number.

Several runs build one app in the same hour (payapps: 70 migrations by
2026-11-26), and each `drizzle-kit generate` takes the next free number on its
own branch. Whoever merges second collides: two `0071_*.sql` files, a
`meta/_journal.json` conflict, and a snapshot chain that forks. Seven doc-friction
reports on 2026-11-25/26 (cloud-session.md) did the same three-round fix by
hand: drop your migration, its snapshot and journal entry, take main's meta,
and generate again. This script does that recipe.

    cd /home/user/private-monorepo
    python3 /home/user/oss-monorepo/platform/ci/migration_rebase.py apps/payapps          # check (exit 1 on a collision)
    git fetch --depth=50 origin main && git merge origin/main                            # resolve schema conflicts by hand;
    python3 /home/user/oss-monorepo/platform/ci/migration_rebase.py apps/payapps --fix    # migrations/meta conflicts are fixed here

Check (the default) compares the app's migrations with `--base` (origin/main):
exit 0 when the branch adds none or they number after main's last, 1 on a
collision. `--fix` needs main already merged (or the merge in progress, with only
migrations/meta files still conflicted), so the schema it generates from holds
main's tables too: generating before the merge would emit DROPs for them. It
backs your SQL up under `.git/migration-rebase/`, deletes it, restores
`migrations/meta` from main, runs `drizzle-kit generate --name <your first
migration's name>`, and says whether the new SQL matches the old (a hand-edited
or `--custom` migration does not come back: copy it from the backup).
Several of your migrations come back as one; give `--name` to pick its name.
"""
import argparse, os, re, shutil, subprocess, sys, time

NUM = re.compile(r"^(\d{4})_(.+)\.sql$")


def git(repo, *args, check=True):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"migration_rebase: git {' '.join(args)} failed: {r.stderr.strip()}")
    return r


def out_dir(app):
    """The `out:` of the app's drizzle config (default ./migrations)."""
    for name in ("drizzle.config.ts", "drizzle.config.js", "drizzle.config.mjs"):
        p = os.path.join(app, name)
        if os.path.exists(p):
            m = re.search(r"""\bout\s*:\s*["']([^"']+)["']""", open(p).read())
            if m:
                return os.path.normpath(m.group(1))
    return "migrations"


def numbered(names):
    return {n: int(NUM.match(n).group(1)) for n in names if NUM.match(n)}


def state(repo, rel_mig, base):
    """(base_sql, work_sql, own): {file: number} for the base ref and the working tree,
    and the sorted files the branch adds."""
    ls = git(repo, "ls-tree", "--name-only", f"{base}:{rel_mig}", check=False)
    if ls.returncode:
        raise SystemExit(f"migration_rebase: {base} has no {rel_mig} ({ls.stderr.strip()}); "
                         "fetch it first: git fetch --depth=50 origin main")
    base_sql = numbered(ls.stdout.split())
    work_sql = numbered(os.listdir(os.path.join(repo, rel_mig)))
    own = sorted(set(work_sql) - set(base_sql))
    return base_sql, work_sql, own


def collisions(base_sql, work_sql, own):
    top = max(base_sql.values(), default=-1)
    return [f for f in own if work_sql[f] <= top], top


def merged(repo, base):
    """'merged', 'merging' (MERGE_HEAD is base), or None."""
    if git(repo, "merge-base", "--is-ancestor", base, "HEAD", check=False).returncode == 0:
        return "merged"
    mh = git(repo, "rev-parse", "-q", "--verify", "MERGE_HEAD", check=False).stdout.strip()
    if mh and mh == git(repo, "rev-parse", base).stdout.strip():
        return "merging"
    return None


def norm(sql):
    return re.sub(r"\s+", " ", sql.replace("--> statement-breakpoint", "")).strip()


def fix(repo, app, rel_mig, base, own, name, generate):
    how = merged(repo, base)
    if not how:
        print(f"migration_rebase: merge {base} first (git merge {base}) and resolve the schema conflicts; "
              "generating before the merge would drop main's new tables. Then run --fix again.", file=sys.stderr)
        return 2
    unmerged = git(repo, "diff", "--name-only", "--diff-filter=U").stdout.split()
    meta = rel_mig + "/meta/"
    left = [p for p in unmerged if not p.startswith(meta)]
    if left:
        print("migration_rebase: resolve these conflicts first (only migrations/meta is fixed here): "
              + ", ".join(left), file=sys.stderr)
        return 2
    mig = os.path.join(repo, rel_mig)
    backup = os.path.join(git(repo, "rev-parse", "--absolute-git-dir").stdout.strip(),
                          "migration-rebase", time.strftime("%Y%m%dT%H%M%S"))
    os.makedirs(backup, exist_ok=True)
    old = []
    for f in own:
        shutil.copy2(os.path.join(mig, f), backup)
        old.append(open(os.path.join(mig, f)).read())
        os.remove(os.path.join(mig, f))
    base_meta = set(git(repo, "ls-tree", "--name-only", f"{base}:{rel_mig}/meta").stdout.split())
    for f in os.listdir(os.path.join(mig, "meta")):
        if f not in base_meta:
            shutil.copy2(os.path.join(mig, "meta", f), backup)
            os.remove(os.path.join(mig, "meta", f))
    git(repo, "checkout", base, "--", rel_mig + "/meta")
    name = name or NUM.match(own[0]).group(2)
    print(f"migration_rebase: backed up {len(own)} migration(s) to {backup}; restored {rel_mig}/meta from {base}; "
          f"generating {name!r}", file=sys.stderr)
    r = subprocess.run(generate + ["--name", name], cwd=app)
    if r.returncode:
        print(f"migration_rebase: generate failed (exit {r.returncode}); your SQL is in {backup}", file=sys.stderr)
        return 1
    after = numbered(os.listdir(mig))
    new = sorted(f for f in after if f not in numbered(git(repo, "ls-tree", "--name-only", f"{base}:{rel_mig}").stdout.split()))
    if not new:
        print(f"migration_rebase: drizzle-kit found no schema change, so your migration was hand-written "
              f"(--custom) or main already has it: copy it back from {backup} with the next number "
              f"(drizzle-kit generate --custom --name {name}, then paste)", file=sys.stderr)
        return 1
    same = norm("".join(open(os.path.join(mig, f)).read() for f in new)) == norm("".join(old))
    print(f"migration_rebase: now {', '.join(new)}"
          + ("; same SQL as before." if same else
             f"; the SQL differs from your old migration(s): compare with {backup} (hand edits come back by hand)."))
    print(f"next: git add {rel_mig} && git commit (and check the app's other per-migration files, "
          "e.g. a POLICY_VERSION bump, against main)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("app", help="the app directory (with drizzle.config.ts), e.g. apps/payapps")
    ap.add_argument("--base", default="origin/main", help="ref the migrations must follow (default origin/main)")
    ap.add_argument("--fix", action="store_true", help="drop your migrations, take base's meta, generate again")
    ap.add_argument("--name", help="name for the regenerated migration (default: your first one's)")
    ap.add_argument("--generate", default=None,
                    help="generate command (default: the app's node_modules/.bin/drizzle-kit generate)")
    a = ap.parse_args(argv)
    app = os.path.abspath(a.app)
    repo = git(app, "rev-parse", "--show-toplevel").stdout.strip()
    rel_mig = os.path.relpath(os.path.join(app, out_dir(app)), repo)
    if not os.path.isdir(os.path.join(repo, rel_mig)):
        ap.error(f"{rel_mig} does not exist")
    base_sql, work_sql, own = state(repo, rel_mig, a.base)
    hit, top = collisions(base_sql, work_sql, own)
    if not own:
        print(f"migration_rebase: this branch adds no migration to {rel_mig}")
        return 0
    if not hit:
        print(f"migration_rebase: ok, {', '.join(own)} number after {a.base}'s last ({top:04d})")
        return 0
    print(f"migration_rebase: collision: {', '.join(hit)} but {a.base} already runs to {top:04d}"
          + ("" if a.fix else f"; merge {a.base}, then run again with --fix"))
    if not a.fix:
        return 1
    bin_ = os.path.join(app, "node_modules", ".bin", "drizzle-kit")
    generate = a.generate.split() if a.generate else ([bin_, "generate"] if os.path.exists(bin_)
                                                       else ["pnpm", "exec", "drizzle-kit", "generate"])
    return fix(repo, app, rel_mig, a.base, own, a.name, generate)


if __name__ == "__main__":
    sys.exit(main())
