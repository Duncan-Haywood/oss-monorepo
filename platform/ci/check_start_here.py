#!/usr/bin/env python3
"""Fail if the "Start here" blog series in docs/posts/ has lost a link.

The series is one hub post (`*-start-here.md`) and one guide per kind of
reader, each tagged `start-here`. A guide the hub does not link is found only
by search, and a guide that does not link back strands its reader, so runs
adding guides in batches (16 on 2026-10-29, 15 on 2026-10-30) need a check,
not a habit. Checks:

- every post tagged `start-here` other than the hub is linked from the hub;
- every such guide links back to the hub;
- every relative `.md` link in a series post points to a post that exists.

    python3 platform/ci/check_start_here.py [--root DIR]   # exit 1 on a problem
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HUB_SUFFIX = "-start-here.md"
LINK = re.compile(r"\]\(([^)#\s]+\.md)(?:#[^)]*)?\)")


def tags(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return []
    for line in m.group(1).splitlines():
        if line.startswith("tags:"):
            return [t.strip().strip("\"'") for t in line[5:].strip().strip("[]").split(",") if t.strip()]
    return []


def problems(posts):
    """`posts` maps filename -> text; returns a list of problem strings."""
    series = {n: t for n, t in posts.items() if "start-here" in tags(t)}
    hubs = sorted(n for n in series if n.endswith(HUB_SUFFIX) and n[11:] == "start-here.md")
    if not series:
        return []
    if len(hubs) != 1:
        return [f"expected one hub post named <date>{HUB_SUFFIX} tagged start-here, found {len(hubs)}"]
    hub = hubs[0]
    hub_links = set(LINK.findall(series[hub]))
    out = []
    for name in sorted(series):
        text = series[name]
        if name != hub:
            if name not in hub_links:
                out.append(f"{name}: not linked from the hub {hub}")
            if hub not in LINK.findall(text):
                out.append(f"{name}: does not link back to the hub {hub}")
        for target in sorted(set(LINK.findall(text))):
            if "/" not in target and target not in posts:
                out.append(f"{name}: links to {target}, which is not in docs/posts/")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    posts = {p.name: p.read_text(encoding="utf-8") for p in sorted((args.root / "docs/posts").glob("*.md"))}
    found = problems(posts)
    for line in found:
        print(line)
    if found:
        print(f"{len(found)} problem(s) in the Start here series")
        return 1
    n = sum(1 for t in posts.values() if "start-here" in tags(t))
    print(f"ok: {n} Start here posts, all linked both ways")
    return 0


if __name__ == "__main__":
    sys.exit(main())
