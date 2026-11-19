#!/usr/bin/env python3
"""Check this branch's blog posts and agent reports in one call.

    python3 platform/ci/check_posts.py                       # posts this branch adds or edits
    python3 platform/ci/check_posts.py docs/posts/NEW.md     # just these
    python3 platform/ci/check_posts.py --fix                 # respell their tags the house way, then check

Most pull requests carry a post, and a post meets three checkers that runs
had to find one by one: `check_post_frontmatter.py` (title, description and
tag limits, dates, duplicate titles; reports' `kind` too),
`check_post_links.py` (relative links that point at nothing) and
`post_similarity.py` (a body that repeats another post's). Two run records
asked for a single command (2026-11-16, 2026-11-17: "a guessed check_posts.py
does not exist") and seven more ran the three by hand from 2026-11-10 on.
This is that command: the first two fail it, the near-copy list is printed
for you to judge (exit 0 unless `--strict`), since a series post may share
its frame with its siblings on purpose.

With no arguments it takes the docs/posts/ and docs/reports/ files that differ
from origin/main (committed, staged, unstaged or untracked); on main, or with
nothing changed, it checks nothing and exits 0. About 3 s for one post.
When that list is implausibly long (origin/main older than the branch's
start, common in a fresh cloud clone) it refreshes origin/main once with
`fetch_ref.py main` and lists again; `--no-fetch` skips that.
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import check_post_frontmatter  # noqa: E402
import check_post_links  # noqa: E402
import post_similarity  # noqa: E402

DIRS = ("docs/posts", "docs/reports")
STALE_HINT_AT = 8  # a branch adds a post and a report or two, rarely more


def _git(*args, root=ROOT):
    done = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    return done.stdout.splitlines() if done.returncode == 0 else None


def changed_files(root=ROOT, git=_git):
    """Markdown files under docs/posts and docs/reports this branch adds or edits."""
    base = git("merge-base", "HEAD", "origin/main", root=root)
    # A shallow clone may not reach the merge base: compare trees with
    # origin/main directly, which lists the same added files.
    ref = base[0] if base else "origin/main"
    names = set()
    for args in (("diff", "--name-only", "--diff-filter=AM", ref, "--", *DIRS),
                 ("diff", "--name-only", "--diff-filter=AM", "HEAD", "--", *DIRS),
                 ("ls-files", "--others", "--exclude-standard", "--", *DIRS)):
        names.update(git(*args, root=root) or [])
    return sorted(n for n in names if n.endswith(".md") and (Path(root) / n).is_file())


def run(files, root=ROOT, strict=False, out=print, fix=False):
    if not files:
        out("check_posts: no post or report differs from origin/main; nothing to check")
        return 0
    paths = [str(Path(root) / f) if not Path(f).is_absolute() else f for f in files]
    missing = [p for p in paths if not Path(p).is_file()]
    if missing:
        for p in missing:
            out(f"check_posts: no such file: {p}")
        return 2
    posts = [p for p in paths if Path(p).resolve().parent.name == "posts"]
    bad = 0

    out(f"== front matter ({len(paths)} file(s))")
    # --fix goes to the front-matter checker, whose tag-spelling failure says
    # "`--fix <post>` respells ..."; reached through this command, that hint
    # met "unrecognized arguments: --fix" (run record, 2026-11-18).
    if check_post_frontmatter.main(["--root", str(root), *(["--fix"] if fix else []), *paths]) != 0:
        bad += 1

    if posts:
        out("== relative links")
        broken = check_post_links.broken_in(posts)
        for path, target in broken:
            out(f"{Path(path).name}: broken link {target}")
        out(f"{len(broken)} broken relative link(s)")
        bad += bool(broken)

        out("== near-copies of other posts (judge these; a series may share its frame)")
        args = ["--root", str(root), *posts] + (["--fail"] if strict else [])
        if post_similarity.main(args) != 0:
            bad += 1

    out("check_posts: " + ("FAILED, see above" if bad else f"ok, {len(paths)} file(s)"))
    return 1 if bad else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="*", help="posts or reports to check (default: the ones this branch changes)")
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--strict", action="store_true", help="fail on a near-copy too")
    ap.add_argument("--fix", action="store_true",
                    help="respell the checked posts' tags the way other posts spell them, then check")
    ap.add_argument("--no-fetch", action="store_true",
                    help="do not refresh a stale origin/main (network) before listing")
    args = ap.parse_args(argv)
    if not (Path(args.root) / "docs" / "posts").is_dir():
        # A wrong --root must not pass as "nothing changed" (test_checks_refuse_empty_root.py).
        print(f"check_posts: no docs/posts under {args.root}: is --root the repository?")
        return 2
    files = args.files or changed_files(Path(args.root))
    if not args.files and len(files) > STALE_HINT_AT and not args.no_fetch:
        files = refresh_and_relist(Path(args.root), len(files))
    if not args.files and len(files) > STALE_HINT_AT:
        # A run that merged a newer main than its clone's origin/main saw 64
        # files here for its one post (run record, 2026-11-17).
        print(f"check_posts: {len(files)} files differ from origin/main; if this branch adds fewer, "
              f"origin/main is stale: `{FETCH_HINT}` and rerun, or name the post")
    return run(files, root=Path(args.root), strict=args.strict, fix=args.fix)


# The harness's clone can hold an origin/main older than the commit the
# session branch starts from: in session 2026-11-19 (process) origin/main was
# #17125 while HEAD was main's tip #17633, so a branch with no post at all
# listed 531 "changed" posts and checked them all (a 2026-11-19 run record
# saw 405 and had to name its post by hand). fetch_ref.py refreshes main
# without cutting history; the old hint's `git fetch --depth=1` cuts a
# deepened clone back to one commit (fetch_ref.py, "Why").
FETCH_HINT = "python3 platform/ci/fetch_ref.py main"


def refresh_and_relist(root, before, fetch=None, relist=None, out=print):
    """Refresh origin/main once and list the changed files again."""
    relist = relist or changed_files
    if fetch is None:
        import fetch_ref

        def fetch():
            return fetch_ref.fetch_ref("main", cwd=root, out=sys.stderr)
    try:
        rc = fetch()
    except Exception as e:  # noqa: BLE001  offline or no git: keep the old list
        out(f"check_posts: could not refresh origin/main ({e}); listing against the old one")
        return relist(root)
    files = relist(root)
    if rc == 1:
        out("check_posts: refreshing origin/main failed; listing against the old one")
    else:
        out(f"check_posts: {before} files differed from a stale origin/main; refreshed it, now {len(files)}")
    return files


if __name__ == "__main__":
    sys.exit(main())
