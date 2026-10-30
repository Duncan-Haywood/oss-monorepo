#!/usr/bin/env python3
"""List blog posts in docs/posts/ that are near-copies of each other.

Posts are written by many overlapping runs. Two posts that share most of their
word 5-grams tell a reader (and a search engine) the same thing twice, and the
`slug_dupe.py` check only compares titles. This compares bodies: front matter
and code fences are dropped, text is lower-cased, and each post becomes the set
of its word 5-grams. A pair is reported when the share of the smaller post's
5-grams found in the other (containment) reaches `--min` (default 0.25).

    python3 platform/ci/post_similarity.py [--root DIR] [--min 0.25] [--fail]

Exit 0 unless `--fail` is given and a pair is reported.
"""
import argparse
import re
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
N = 5


def body(text):
    text = re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S)
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"\]\([^)]*\)", "]", text)
    return text.lower()


def shingles(text, n=N):
    words = re.findall(r"[a-z0-9']+", body(text))
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


def containment(a, b):
    small = min(len(a), len(b))
    return len(a & b) / small if small else 0.0


def similar_pairs(texts, threshold=0.5):
    sh = {name: shingles(t) for name, t in texts.items()}
    sh = {k: v for k, v in sh.items() if v}
    out = []
    for x, y in combinations(sorted(sh), 2):
        c = containment(sh[x], sh[y])
        if c >= threshold:
            out.append((c, x, y))
    return sorted(out, reverse=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--min", type=float, default=0.25)
    ap.add_argument("--fail", action="store_true")
    args = ap.parse_args(argv)
    posts = Path(args.root) / "docs" / "posts"
    texts = {p.name: p.read_text(encoding="utf-8") for p in sorted(posts.glob("*.md"))}
    pairs = similar_pairs(texts, args.min)
    for c, x, y in pairs:
        print(f"{c:.2f}  {x}  |  {y}")
    print(f"{len(pairs)} pair(s) at or above {args.min} among {len(texts)} posts")
    return 1 if pairs and args.fail else 0


if __name__ == "__main__":
    sys.exit(main())
