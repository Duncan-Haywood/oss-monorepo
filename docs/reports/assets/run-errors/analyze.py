"""Classify the `errors` entries agents recorded in prompts/runs/*.json.

    python3 docs/reports/assets/run-errors/analyze.py > docs/reports/assets/run-errors/results.txt

Stdlib only. Keyword rules, multi-label: an entry can land in several classes,
and one that matches none is "unclassified". The rules are crude on purpose,
so a reader can see exactly what was counted; the seeded sample at the end is
for checking them by eye.
"""
import collections
import glob
import json
import math
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]

CLASSES = [
    ("parallel collision", r"duplicat|collision|supersed|parallel|concurrent|another (run|session|pr)|same time|already (landed|merged|open)|landed first|overlap"),
    ("environment or tooling", r"not (pre)?installed|no module|pip |pytest|python3\.\d|command not found|no torch|missing (tool|binary|dependency)|not available|version|npm (ci|install)|playwright|chromium|disk|no space|installable|not importable|container"),
    ("network or access", r"\b40[13]\b|blocked|proxy|unauthenticated|rate.?limit|not fetchable|download|fetch|egress|permission denied|auth"),
    ("timeout or hang", r"time.?out|timed out|\bhung\b|\bhang|killed|took \d+ ?min|exceeded \d+ ?min|too slow|long.running|oversubscri"),
    ("CI or tests red after push", r"\bci\b.*(red|fail)|tests? fail|failed \d+ tests?|went red|check\w* failed|red (on|from)|validate"),
    ("self-inflicted edit slip", r"accidental|slip|wrong (file|job|line|branch|path)|spliced|deleted an?|typo|killed my own|forgot|overwr|clobber|stray|committed .* by mistake|gitlink"),
    ("base moved or conflict", r"conflict|main (moved|was)|rebase|merge.base|stale|force.updated|behind main"),
    ("own bug caught before merge", r"\bbugs?\b|fixed before commit|caught (by|in)|initially wrong|first (run|try|version|attempt)|broke|crash"),
    ("method or measurement", r"saturat|leak|bias|metric|fitness|wrong (result|number|baseline)|artifact|overfit|rerun|seed"),
]


# Narrow traps that recur often enough to name, counted separately.
TRAPS = [
    ("a kill or wait loop matched the agent's own process", r"pkill|pgrep|matched its own|my own shell|own process"),
    ("wrong Python interpreter or missing package", r"python3\.\d+|/usr/bin/python3|pyenv|importable under|on path lacked|lacked numpy|pip .*under"),
    ("a full test suite or sweep outran its timeout", r"(suite|sweep|run).{0,40}(exceeded|timed out|timeout)|exceeded \d+ ?s\b"),
    ("work duplicated a parallel run's", r"duplicat|supersed|landed first|claimed \d+ min"),
    ("a repo-wide check went red from main, not the diff", r"(red|failed) (on|from) main|from main, not|main's own"),
]


def wilson(k, n, z=1.96):
    if not n:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - r) / d, (c + r) / d)


def text(entry):
    if isinstance(entry, dict):
        return " ".join(str(v) for v in entry.values())
    return str(entry)


def main():
    records = []
    for path in sorted(glob.glob(str(ROOT / "prompts/runs/*.json"))):
        try:
            records.append(json.loads(Path(path).read_text()))
        except (OSError, ValueError):
            continue
    entries = [text(e) for r in records for e in (r.get("errors") or [])]
    with_errors = sum(1 for r in records if r.get("errors"))
    dates = sorted(str(r.get("date")) for r in records if r.get("date"))
    print(f"records: {len(records)} ({dates[0]} to {dates[-1]})")
    lo, hi = wilson(with_errors, len(records))
    print(f"records with at least one error: {with_errors} ({with_errors / len(records):.0%}, Wilson 95% {lo:.0%}-{hi:.0%})")
    print(f"error entries: {len(entries)}\n")
    counts = collections.Counter()
    unclassified = []
    for e in entries:
        hits = [name for name, rx in CLASSES if re.search(rx, e, re.I)]
        counts.update(hits)
        if not hits:
            unclassified.append(e)
    print("class | entries | share of entries")
    for name, _ in sorted(CLASSES, key=lambda c: -counts[c[0]]):
        print(f"{name} | {counts[name]} | {counts[name] / len(entries):.0%}")
    print(f"unclassified | {len(unclassified)} | {len(unclassified) / len(entries):.0%}")
    env = [rx for name, rx in CLASSES if name in ("environment or tooling", "timeout or hang", "network or access")]
    n_env = sum(1 for e in entries if any(re.search(rx, e, re.I) for rx in env))
    print(f"\nenvironment, timeout or network (any of the three): {n_env} ({n_env / len(entries):.0%})")
    print("\nnamed traps | entries")
    for name, rx in TRAPS:
        print(f"{name} | {sum(1 for e in entries if re.search(rx, e, re.I))}")
    rng = random.Random(20261021)
    print("\nseeded sample of 20 entries (seed 20261021), with classes:")
    for e in rng.sample(entries, min(20, len(entries))):
        hits = [name for name, rx in CLASSES if re.search(rx, e, re.I)] or ["unclassified"]
        print(f"- [{', '.join(hits)}] {e[:160]}")


if __name__ == "__main__":
    main()
