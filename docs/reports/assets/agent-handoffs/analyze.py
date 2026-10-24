"""Handoff friction: what agent runs here say goes wrong in text other agents left them.

Reads every run record's `doc_friction` list (prompts/runs/*.json), themes each
entry with research/swe-friction's keyword rules, and compares those themes with
a hand-coded random sample (sample_coded.csv). Standard library only.

    python3 docs/reports/assets/agent-handoffs/analyze.py            # prints results
    python3 docs/reports/assets/agent-handoffs/analyze.py --sample   # draws a fresh seeded sample to code
"""
import collections, csv, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "research", "swe-friction", "src"))
from swe_friction.friction import extract, theme_of, wilson  # noqa: E402

SEED, N = 20261020, 60
# Hand-coding scheme: what kind of handoff failure the entry describes.
CODES = {
    "stale": "text was true once, not now (counts, status, 'still open', renamed paths)",
    "case-missing": "text is silent on the situation the reader was in (what to do when X fails, 403, conflict)",
    "contradiction": "two instructions, or an instruction and a tool, disagree",
    "wrong": "text or tool output was wrong when written, or misleads",
    "cost": "following it costs too much: slow, timeout, too long to read, laborious manual steps",
    "environment": "the reader's machine differs from the writer's (missing package, shallow clone, no network)",
    "ranking": "a tool's recommendation did not fit the brief or the reader's judgement",
    "none": "no friction, or praise",
}


def rows():
    r, runs = extract(os.path.join(ROOT, "prompts", "runs"))
    return r, runs


def sample(r):
    rng = random.Random(SEED)
    return rng.sample(r, N)


def main():
    r, runs = rows()
    if "--sample" in sys.argv:
        w = csv.writer(sys.stdout)
        w.writerow(["i", "file", "issue"])
        for i, x in enumerate(sample(r)):
            w.writerow([i, x["file"], x["issue"]])
        return
    n_runs = len(runs)
    with_any = sum(1 for x in runs if x["n"])
    lo, hi = wilson(with_any, n_runs)
    dates = sorted(x["date"] for x in runs)
    print(f"run records (dated): {n_runs}, {dates[0]} to {dates[-1]}")
    print(f"runs listing >=1 friction entry: {with_any} ({with_any / n_runs:.0%}, Wilson {lo:.0%}-{hi:.0%})")
    print(f"friction entries: {len(r)} over {len({x['file'] for x in r})} files")
    md = sum(1 for x in r if x["file"].endswith(".md"))
    print(f"entries naming a Markdown document (text written for agents): {md} ({md / len(r):.0%})")
    print("\nkeyword themes (swe-friction rules, first match wins):")
    for k, v in collections.Counter(theme_of(x["issue"]) for x in r).most_common():
        print(f"  {k:20s} {v:5d} {v / len(r):5.1%}")
    path = os.path.join(HERE, "sample_coded.csv")
    if not os.path.exists(path):
        return
    coded = list(csv.DictReader(open(path)))
    # The sample was drawn on 2026-10-20 from 1,232 entries. Later records change
    # what the seed draws, so check the coded entries still exist rather than re-drawing.
    issues = {x["issue"] for x in r}
    missing = [c["i"] for c in coded if c["issue"] not in issues]
    assert len(coded) == N and not missing, f"coded entries no longer in prompts/runs: {missing}"
    unknown = {c["code"] for c in coded} - set(CODES)
    assert not unknown, f"unknown codes {unknown}"
    print(f"\nhand-coded sample: {N} entries, seed {SEED}, one coder")
    cnt = collections.Counter(c["code"] for c in coded)
    for k in CODES:
        v = cnt.get(k, 0)
        lo, hi = wilson(v, N)
        print(f"  {k:14s} {v:3d} {v / N:5.0%}  (Wilson {lo:.0%}-{hi:.0%})  {CODES[k]}")
    other = [c for c in coded if theme_of(c["issue"]) == "other"]
    print(f"\nsample entries the keyword rules left as 'other': {len(other)} of {N}; "
          f"hand codes for them: {dict(collections.Counter(c['code'] for c in other).most_common())}")


if __name__ == "__main__":
    main()
