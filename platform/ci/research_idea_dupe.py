#!/usr/bin/env python3
"""Is this research idea already a project on origin/main?

`research/` holds 500+ directories, so a slug check misses an idea filed under
another name (prompts/research/prompt-1.md step 3). This greps the one-line
description of every project in research/README.md, plus the directory names,
on origin/main. It reads only git, so it works in a shallow clone.

  python3 platform/ci/research_idea_dupe.py <keyword> [<keyword> ...] [--ref origin/main]

Keywords match case-insensitively as substrings. Projects are ranked by how
many distinct keywords they hit. Exit 1: at least one project hits every
keyword (extend it instead). Exit 0: none does; partial hits are still listed
as neighbours to read. Open PRs and fresh branches still need their own look.
"""
import argparse
import re
import subprocess
import sys

BULLET = re.compile(r"^- \[`research/([^`]+)`\][^—]*—\s*(.*)$")


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def projects(ref):
    """Return {slug: description} from research/README.md, plus bare directory names."""
    found = {}
    for line in git("show", f"{ref}:research/README.md").splitlines():
        m = BULLET.match(line)
        if m:
            found[m.group(1)] = m.group(2)
    for name in git("ls-tree", "-d", "--name-only", ref, "research/").splitlines():
        found.setdefault(name.removeprefix("research/"), "")
    return found


def search(keywords, found):
    """Return [(hits, slug, description)] for projects hitting any keyword, best first."""
    kws = [k.lower() for k in keywords]
    rows = []
    for slug, desc in found.items():
        hay = f"{slug} {desc}".lower()
        hits = sum(k in hay for k in kws)
        if hits:
            rows.append((hits, slug, desc))
    return sorted(rows, key=lambda r: (-r[0], r[1]))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("keywords", nargs="+")
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--limit", type=int, default=12)
    a = ap.parse_args(argv)
    found = projects(a.ref)
    if not found:
        print(f"could not read research/ at {a.ref}; run `git fetch origin main` first", file=sys.stderr)
        return 2
    rows = search(a.keywords, found)
    full = [r for r in rows if r[0] == len(a.keywords)]
    for hits, slug, desc in rows[:a.limit]:
        print(f"{hits}/{len(a.keywords)}  research/{slug}  {desc[:150]}")
    if full:
        print(f"\nTAKEN? {len(full)} project(s) hit every keyword: extend one instead of starting another.")
        return 1
    print(f"\nno project hits all {len(a.keywords)} keywords ({len(found)} projects checked at {a.ref}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
