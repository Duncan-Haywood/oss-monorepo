"""Census of headline types and a check of the keyword rule.  python experiments/run.py > experiments/results.txt"""
import sys
from collections import Counter
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from swe_nullrate import LABELS, read_tsv, sample, keyword_flag, discloses, wilson, binary_scores  # noqa: E402

rows = read_tsv(HERE.parent / "data" / "summaries.tsv")[1:]
text = {r[0]: r[3] for r in rows}
title = {r[0]: r[2] for r in rows}
theme = {r[0]: r[1] for r in rows}
labels = dict(tuple(r) for r in read_tsv(HERE.parent / "data" / "labels.tsv")[1:])
SEED, K = 20261019, 80
assert sorted(labels) == sorted(sample(text, K, SEED)), "labels.tsv is not the seeded sample"

N = len(text)
print(f"summaries {N}; hand-labelled simple random sample {K} (seed {SEED}, sorted slugs)")
c = Counter(labels.values())
print("\nA. hand-labelled headline type, with Wilson 95% intervals (share of all summaries)")
for lab in LABELS:
    lo, hi = wilson(c[lab], K)
    print(f"  {lab:12s} {c[lab]:3d}/{K}  {c[lab]/K:5.1%}  [{lo:.1%}, {hi:.1%}]")
neg = c["negative"] + c["mixed"]
lo, hi = wilson(neg, K)
print(f"  negative or mixed {neg}/{K}  {neg/K:.1%}  [{lo:.1%}, {hi:.1%}]")
tested = K - c["descriptive"]
lo, hi = wilson(neg, tested)
print(f"  among the {tested} that test a claim against an alternative (not descriptive): negative or mixed {neg}/{tested} = {neg/tested:.1%}  [{lo:.1%}, {hi:.1%}]")
lo, hi = wilson(c["negative"], tested)
print(f"  clearly negative only {c['negative']}/{tested} = {c['negative']/tested:.1%}  [{lo:.1%}, {hi:.1%}]")

print("\nB. keyword rule vs hand label (rule says negative-or-mixed)")
pairs = [(labels[s] in ("negative", "mixed"), keyword_flag(text[s])) for s in sorted(labels)]
sc = binary_scores(pairs)
print(f"  tp {sc['tp']} fp {sc['fp']} fn {sc['fn']} tn {sc['tn']}; precision {sc['precision']:.2f}, recall {sc['recall']:.2f}")
for lab in LABELS:
    sub = [keyword_flag(text[s]) for s in labels if labels[s] == lab]
    print(f"  rule fires on {sum(sub):2d}/{len(sub):2d} hand-labelled {lab}")

print("\nC. keyword rule on every summary (not hand-checked; see README for how far to trust it)")
fl = [s for s in text if keyword_flag(text[s])]
lo, hi = wilson(len(fl), N)
print(f"  fires on {len(fl)}/{N} = {len(fl)/N:.1%}  [{lo:.1%}, {hi:.1%}]")
by = Counter(theme[s] for s in text)
fb = Counter(theme[s] for s in fl)
print("  by theme (themes with >= 20 projects), rule share:")
for t, n in sorted(by.items(), key=lambda x: -x[1]):
    if n >= 20:
        print(f"    {t:12s} {fb[t]:3d}/{n:3d} = {fb[t]/n:5.1%}")

print("\nD. limitation disclosure (stylised, preliminary, assumed, ...) in the summary")
d = sum(1 for s in text if discloses(text[s]))
lo, hi = wilson(d, N)
print(f"  {d}/{N} = {d/N:.1%}  [{lo:.1%}, {hi:.1%}]")
dl = sum(1 for s in labels if discloses(text[s]))
print(f"  in the hand-labelled sample: {dl}/{K}")
