#!/usr/bin/env python3
"""Report how many blog posts land per day, and what they are about.

The owner asked for the posts-per-day number to go up (CLAUDE.md, "Every run
ships something useful"), but nothing printed that number from the tree. This
reads the date prefix of each file in docs/posts/ (and docs/agent-posts/) and
the `tags` front matter, and prints a per-day table plus the most common tags.

    python3 platform/ci/post_rate.py [--root DIR] [--days N] [--tags K]
"""
import argparse
import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def tags_of(text):
    m = re.match(r"---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if not m:
        return []
    t = re.search(r"^tags:\s*\[(.*?)\]", m.group(1), re.M)
    return [x.strip().strip("\"'") for x in t.group(1).split(",") if x.strip()] if t else []


def collect(root):
    """Return (per-day Counter of posts, tag Counter)."""
    days, tags = collections.Counter(), collections.Counter()
    for sub in ("docs/posts", "docs/agent-posts"):
        for p in sorted((root / sub).glob("*.md")):
            d = re.match(r"\d{4}-\d{2}-\d{2}", p.name)
            if not d:
                continue
            days[d.group(0)] += 1
            tags.update(tags_of(p.read_text(errors="ignore")))
    return days, tags


def report(days, tags, last=14, top=8):
    lines = ["date        posts"]
    for d in sorted(days)[max(len(days) - last, 0):]:
        lines.append(f"{d}  {days[d]:5d}  {'#' * min(days[d], 60)}")
    lines.append(f"total {sum(days.values())} posts over {len(days)} days with at least one")
    lines.append("top tags: " + ", ".join(f"{t} ({n})" for t, n in tags.most_common(top)))
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--tags", type=int, default=8)
    a = ap.parse_args(argv)
    days, tags = collect(a.root)
    if not days:
        print("no posts found", file=sys.stderr)
        return 1
    print(report(days, tags, a.days, a.tags))
    return 0


if __name__ == "__main__":
    sys.exit(main())
