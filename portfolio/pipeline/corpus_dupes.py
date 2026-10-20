#!/usr/bin/env python3
"""Find near-duplicate pairs *among the ventures already on main*.

    python3 portfolio/pipeline/corpus_dupes.py [--top 30] [--min 0.6] [--json]

`duplicate_check.py` screens a new idea against the corpus. This does the
other direction: it scores every venture against every other, so a session
doing "depth over count" work can see which families are crowded and which
pairs are candidates to merge into one product with two entry points.

Symmetric TF-IDF cosine over each venture's name plus description, reusing
`duplicate_check`'s tokenizer and loader. Lexical overlap, not meaning: a
high score is a pair worth reading, never a verdict, and a low one clears
nothing. Product lines are skipped (they belong to their host venture).
Exit 0 always; this is a report, not a gate.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import duplicate_check as dc  # noqa: E402


def vectors(items: list[dc.Item]) -> list[dict[str, float]]:
    """L2-normalised TF-IDF vectors (unigrams plus bigrams, bigrams down-weighted)."""
    docs = []
    for item in items:
        words = dc.tokenize(item.text)
        feats = Counter(words)
        for a, b in dc.bigrams(words):
            feats[f"{a}_{b}"] += 0.5
        docs.append(feats)
    df: Counter = Counter()
    for d in docs:
        df.update(d.keys())
    n = len(docs)
    out = []
    for d in docs:
        v = {t: (1 + math.log(c)) * (math.log((n + 1) / (df[t] + 1)) + 1) for t, c in d.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        out.append({t: x / norm for t, x in v.items()})
    return out


def pairs(items: list[dc.Item], vecs: list[dict[str, float]], minimum: float) -> list[tuple[float, str, str]]:
    # Inverted index keeps this near-linear: only venture pairs sharing a term are scored.
    index: dict[str, list[int]] = {}
    for i, v in enumerate(vecs):
        for t in v:
            index.setdefault(t, []).append(i)
    scores: dict[tuple[int, int], float] = {}
    for t, ids in index.items():
        if len(ids) > 60:  # generic vocabulary adds noise and cost, not signal
            continue
        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                key = (ids[x], ids[y])
                scores[key] = scores.get(key, 0.0) + vecs[ids[x]][t] * vecs[ids[y]][t]
    found = [(s, items[i].label, items[j].label) for (i, j), s in scores.items() if s >= minimum]
    found.sort(reverse=True)
    return found


def clusters(found: list[tuple[float, str, str]]) -> list[list[str]]:
    parent: dict[str, str] = {}

    def find(a: str) -> str:
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for _, a, b in found:
        parent[find(a)] = find(b)
    groups: dict[str, list[str]] = {}
    for a in list(parent):
        groups.setdefault(find(a), []).append(a)
    return sorted((sorted(g) for g in groups.values()), key=lambda g: (-len(g), g[0]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--top", type=int, default=30)
    ap.add_argument("--min", type=float, default=0.6, dest="minimum")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    items = [i for i in dc.load_ventures() if i.source == "venture"]
    found = pairs(items, vectors(items), args.minimum)
    groups = clusters(found)
    if args.json:
        print(json.dumps({"ventures": len(items), "pairs": [[round(s, 3), a, b] for s, a, b in found],
                          "clusters": groups}, indent=1))
        return 0
    print(f"{len(items)} ventures, {len(found)} pairs scoring >= {args.minimum}, {len(groups)} clusters\n")
    for s, a, b in found[: args.top]:
        print(f"{s:.2f}  {a}  <->  {b}")
    print("\nLargest clusters:")
    for g in groups[:10]:
        print(f"  {len(g):>3}  {', '.join(g[:6])}{' ...' if len(g) > 6 else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
